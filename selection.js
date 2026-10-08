// Lénykijelölés: találat keresése egy pontra és a kijelölt példány nyilvántartása.
// Csak olvassa a világot, sosem módosítja, és nem használ véletlent: a szimulációra nincs hatása.

// ennyi px ráhagyás a lény sugarán túl, hogy kis lényt is el lehessen találni
export const PICK_TOLERANCE = 4;

// a (x, y) pontra eső lény, a tényleges testmérettel számolva. Átfedésnél:
//   1. az élő lény előnyt kap a holttesttel szemben
//   2. a középpontjához közelebbi nyer
//   3. egyenlő távolságnál a később rajzolt (a tömbben hátrébb lévő, fölül látszó) nyer
export function pickCreatureAt(creatures, x, y, tolerance = PICK_TOLERANCE) {
    let best = null;
    let bestDistance = Infinity;

    for (const creature of creatures) {
        const distance = Math.hypot(creature.x - x, creature.y - y);
        if (distance > creature.genes.size + tolerance) continue;

        const better =
            best === null ||
            (creature.alive && !best.alive) ||
            (creature.alive === best.alive && distance <= bestDistance);

        if (better) {
            best = creature;
            bestDistance = distance;
        }
    }

    return best;
}

// az élő lény id alapján (a listás kijelöléshez); halott vagy nem létező id-re null
export function aliveCreatureById(creatures, id) {
    for (const creature of creatures) {
        if (creature.id === id) return creature.alive ? creature : null;
    }
    return null;
}

// egyszerre legfeljebb ennyi lény jelölhető ki (a halottak is beleszámítanak)
export const MAX_SELECTION = 5;

// A kijelölt példányokra mutató referenciákat tartja meg (nem az id-ket), kiválasztási
// sorrendben, így egy lény halála és a holttest eltűnése után is megmaradnak a legutolsó
// adatai a megjelenítéshez. Ez az egyetlen közös kijelölési állapot: a térkép, a lista
// és az alsó panel is ezt olvassa és módosítja.
export class Selection {
    constructor(max = MAX_SELECTION) {
        this.max = max;
        this.items = [];
    }

    // a kijelölt lények kiválasztási sorrendben (másolat, kívülről nem módosítható)
    get creatures() {
        return [...this.items];
    }

    get size() {
        return this.items.length;
    }

    get isFull() {
        return this.items.length >= this.max;
    }

    has(creature) {
        return this.items.includes(creature);
    }

    // sima kattintás: csak ez az egy lény legyen kijelölve
    select(creature) {
        this.items = creature ? [creature] : [];
    }

    // Ctrl + kattintás: hozzáadás, vagy ha már kijelölt, eltávolítás.
    // Eredmény: "added" | "removed" | "full" (elérte a korlátot, nem adta hozzá)
    toggle(creature) {
        if (this.has(creature)) {
            this.remove(creature);
            return "removed";
        }
        if (this.isFull) return "full";
        this.items.push(creature);
        return "added";
    }

    remove(creature) {
        this.items = this.items.filter((item) => item !== creature);
    }

    // id alapján (a panel címkéinek eltávolító gombjához); a halott példány is törölhető
    removeById(id) {
        this.items = this.items.filter((item) => item.id !== id);
    }

    clear() {
        this.items = [];
    }

    // egy kijelölt példány állapota: "alive" | "dead" | "removed" (a holttest már nincs a világban)
    statusOf(creature, world) {
        if (!world.creatures.includes(creature)) return "removed";
        return creature.alive ? "alive" : "dead";
    }

    // --- egy kijelölésre szabott, korábbi API (változatlan jelentéssel) ---

    // az utoljára kijelölt lény (egy kijelölésnél: az egyetlen), vagy null
    get creature() {
        return this.items.at(-1) ?? null;
    }

    // az utoljára kijelölt lény állapota, vagy "none"
    status(world) {
        const creature = this.creature;
        return creature ? this.statusOf(creature, world) : "none";
    }
}

// Egy kattintás hatása a közös kijelölésre; a térkép és a lénylista is ezt hívja.
//   additive = false (sima kattintás): csak ez a lény lesz kijelölve → "selected"
//   additive = true (Ctrl / Cmd + kattintás): hozzáadás → "added", ha már kijelölt → "removed",
//   ha elérte a korlátot → "full" (nem változik semmi)
export function applySelectionClick(selection, creature, additive) {
    if (!creature) return "none";
    if (!additive) {
        selection.select(creature);
        return "selected";
    }
    return selection.toggle(creature);
}

export const SELECTION_FULL_MESSAGE = `Legfeljebb ${MAX_SELECTION} lény jelölhető ki egyszerre.`;
