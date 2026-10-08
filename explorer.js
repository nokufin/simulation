// Creature Explorer: az élőlények listájának tartalma fajcsoportokba rendezve, DOM nélkül.
// Nem tárol saját kijelölést: a kijelölt lényt mindig a közös Selection-től kapja.
// Minden frissítéskor csak a változást adja vissza (új és eltűnt sorok, csoportfejlécek),
// hogy a megjelenítés ne építse újra a teljes listát.

import { SPECIES, UNKNOWN_SPECIES } from "./species.js";

// "#42", "42", " # 42 " → "42"; üres → null (minden lény); érvénytelen → false
export function parseIdQuery(text) {
    const cleaned = String(text ?? "").replace(/\s+/g, "").replace(/^#/, "");
    if (cleaned === "") return null;
    return /^\d+$/.test(cleaned) ? cleaned : false;
}

// a csoport kulcsa a DOM-ban és a tárolt állapotban (faj nélküli lényeknél "none")
export const groupKey = (speciesId) => speciesId ?? "none";

// a listába kerülő élőlények id szerint növekvő sorrendben, a kiválasztáshoz szükséges
// alapadatokkal. Az id-re szűrés előtag szerint: "4" → #4, #40–49, #400...
export function explorerEntries(world, query = null) {
    const entries = [];
    if (query === false) return entries; // érvénytelen keresés: nincs találat

    for (const creature of world.creatures) {
        if (!creature.alive) continue;
        if (query !== null && !String(creature.id).startsWith(query)) continue;
        entries.push({
            id: creature.id,
            speciesId: creature.speciesId,
            hue: creature.genes.hue,
            generation: creature.generation,
        });
    }

    // a világ tömbje id szerint rendezett (az utódok növekvő id-vel a végére kerülnek),
    // de a lista ezt nem feltételezi
    entries.sort((a, b) => a.id - b.id);
    return entries;
}

// fajcsoportok a fajok rögzített sorrendjében, a faj nélküliek a végén.
// alive: a faj összes élő egyede; entries: a keresésnek megfelelők közülük
export function groupBySpecies(world, entries) {
    const aliveBySpecies = new Map();
    for (const creature of world.creatures) {
        if (!creature.alive) continue;
        const key = groupKey(creature.speciesId);
        aliveBySpecies.set(key, (aliveBySpecies.get(key) ?? 0) + 1);
    }

    const groups = [...SPECIES, UNKNOWN_SPECIES].map((species) => ({
        key: groupKey(species.id),
        speciesId: species.id,
        name: species.name,
        hue: species.hue,
        alive: aliveBySpecies.get(groupKey(species.id)) ?? 0,
        entries: [],
    }));
    const byKey = new Map(groups.map((group) => [group.key, group]));

    // ismeretlen fajkulcsú lény (ha lenne) is a "faj nélkül" csoportba kerül
    for (const entry of entries) {
        (byKey.get(groupKey(entry.speciesId)) ?? byKey.get("none")).entries.push(entry);
    }
    return groups;
}

// az Enter a keresőben: pontos id-egyezés, különben az első látható találat
export function bestMatch(entries, query) {
    if (!query) return null;
    return entries.find((entry) => String(entry.id) === query) ?? entries[0] ?? null;
}

// a kijelölés bármely formájából a lények tömbje (kiválasztási sorrendben)
function toSelectedList(selected) {
    if (!selected) return [];
    if (Array.isArray(selected)) return selected;
    if (Array.isArray(selected.creatures)) return selected.creatures; // Selection
    return [selected];
}

export class ExplorerModel {
    constructor() {
        this.queryText = "";
        this.query = null;
        this.entries = []; // a keresésnek megfelelő sorok, megjelenítési (fajcsoport) sorrendben
        this.visibleEntries = []; // ebből a nyitott csoportokban lévők (billentyűs léptetéshez)
        this.groups = [];
        this.collapsed = new Set(); // összecsukott fajcsoportok kulcsai (a felhasználó döntése)
        this.selectedIds = []; // a kiemelt sorok (a közös kijelölésből, kiválasztási sorrendben)
        this.selectedId = null; // az utoljára kijelölt, látható lény: ehhez görget és ettől léptet
        this.needsReset = true;
        this.groupsSignature = "";
    }

    setQuery(text) {
        const query = parseIdQuery(text);
        this.queryText = text;
        if (query !== this.query) {
            this.query = query;
            this.needsReset = true;
        }
    }

    toggleGroup(key) {
        if (this.collapsed.has(key)) this.collapsed.delete(key);
        else this.collapsed.add(key);
    }

    setCollapsedGroups(keys) {
        this.collapsed = new Set(keys);
    }

    // a lista frissítése a világ és a közös kijelölés alapján.
    // selected: a közös Selection, a kijelölt lények tömbje, egyetlen lény vagy null.
    // Kiemelt sor csak élő, a keresésnek megfelelő lénynél van.
    update(world, selected) {
        const selectedList = toSelectedList(selected);
        const searching = this.query !== null;
        const groups = groupBySpecies(world, explorerEntries(world, this.query));
        const entries = groups.flatMap((group) => group.entries);

        const previous = this.entries;
        const reset = this.needsReset;
        this.needsReset = false;

        const before = new Set(previous.map((entry) => entry.id));
        const after = new Set(entries.map((entry) => entry.id));
        const added = entries.filter((entry) => !before.has(entry.id));
        const removed = previous.filter((entry) => !after.has(entry.id)).map((entry) => entry.id);

        // egy csoporton belül az új sor a végére kerülhet, ha nagyobb id-jű a csoport
        // megmaradó sorainál; különben (ritkán) a teljes lista újraépítése a biztos
        const keptMax = new Map();
        for (const entry of previous) {
            if (!after.has(entry.id)) continue;
            const key = groupKey(entry.speciesId);
            keptMax.set(key, Math.max(keptMax.get(key) ?? 0, entry.id));
        }
        const appendOnly = added.every((entry) => entry.id > (keptMax.get(groupKey(entry.speciesId)) ?? 0));

        const shown = selectedList.filter((creature) => creature.alive && after.has(creature.id));
        const selectedIds = shown.map((creature) => creature.id);
        const selectedId = selectedIds.at(-1) ?? null;
        const selectionChanged =
            selectedId !== this.selectedId || selectedIds.join(",") !== this.selectedIds.join(",");

        // újonnan kijelölt lény csoportja kinyílik, hogy a sora látsszon
        // (a korábban kijelöltekét a felhasználó közben összecsukhatja)
        const previouslySelected = new Set(this.selectedIds);
        for (const creature of shown) {
            if (!previouslySelected.has(creature.id)) this.collapsed.delete(groupKey(creature.speciesId));
        }

        // a fejlécen jelezzük, hány élő kijelölt egyed van a fajban (összecsukva is)
        const selectedPerGroup = new Map();
        for (const creature of selectedList) {
            if (!creature.alive) continue;
            const key = groupKey(creature.speciesId);
            selectedPerGroup.set(key, (selectedPerGroup.get(key) ?? 0) + 1);
        }

        // kereséskor a találatot tartalmazó csoportok nyitva vannak, az üresek rejtve;
        // keresés nélkül minden faj látszik (a kihaltak is, 0 egyeddel), a faj nélküli
        // csoport csak akkor, ha van tagja
        for (const group of groups) {
            group.matches = group.entries.length;
            group.visible = searching ? group.matches > 0 : group.speciesId !== null || group.alive > 0;
            group.open = group.visible && (searching || !this.collapsed.has(group.key));
            group.selectedCount = selectedPerGroup.get(group.key) ?? 0;
        }

        const signature = groups
            .map((g) => `${g.key}:${g.alive}:${g.matches}:${g.visible}:${g.open}:${g.selectedCount}`)
            .join("|");
        const groupsChanged = signature !== this.groupsSignature;
        this.groupsSignature = signature;

        this.groups = groups;
        this.entries = entries;
        this.visibleEntries = groups.filter((group) => group.open).flatMap((group) => group.entries);
        this.selectedIds = selectedIds;
        this.selectedId = selectedId;

        return {
            reset: reset || !appendOnly,
            entries,
            groups,
            added,
            removed,
            selectedIds,
            selectedId,
            selectionChanged,
            groupsChanged,
            changed: reset || !appendOnly || added.length > 0 || removed.length > 0 || selectionChanged || groupsChanged,
            invalidQuery: this.query === false,
            hasQuery: searching,
        };
    }

    // billentyűzetes lépés a nyitott csoportok sorai között, a megjelenítés sorrendjében
    // (delta: +1 / -1 / ±10, vagy "first" / "last")
    neighbourId(delta) {
        const entries = this.visibleEntries;
        if (entries.length === 0) return null;
        if (delta === "first") return entries[0].id;
        if (delta === "last") return entries.at(-1).id;

        const index = entries.findIndex((entry) => entry.id === this.selectedId);
        if (index === -1) return delta > 0 ? entries[0].id : entries.at(-1).id;
        const next = Math.min(Math.max(index + delta, 0), entries.length - 1);
        return entries[next].id;
    }
}
