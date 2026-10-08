// Megfigyelő: a kijelölt lény és a populáció adatai megjeleníthető formában.
// Tiszta függvények: csak olvasnak, nem ismerik a DOM-ot, így Node-ban tesztelhetők.

import { WORLD_CONFIG } from "./config.js";
import { reproductionStatus } from "./reproduction.js";
import { getSpecies } from "./species.js";

const deg = (rad) => `${Math.round((rad * 180) / Math.PI)}°`;
const pct = (value) => `${Math.round(value * 100)}%`;
const ticks = (n) => `${Math.round(n)} tick (~${(n / WORLD_CONFIG.ticksPerSecond).toFixed(1)} s)`;
const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

const ACTIVITIES = {
    wandering: "bóklászik",
    seeking: "kaját keres",
    eating: "eszik",
    exhausted: "kimerült, nem mozdul",
    dead: "—",
};

const CAUSES = {
    starvation: "éhezés",
    old_age: "öregség",
};

const STRATEGIES = {
    asexual: "ivartalan",
};

// a génmodell mezői felirattal és mértékegységgel, ebben a sorrendben.
// Ami itt nem szerepel, az is megjelenik a saját nevével (lásd describeGenes).
const GENE_FORMATS = {
    size: ["Testméret (sugár)", (v) => `${v.toFixed(1)} px`],
    maxSpeed: ["Max. sebesség", (v) => `${v.toFixed(2)} px/tick`],
    visionRange: ["Látótáv", (v) => `${Math.round(v)} px`],
    fieldOfView: ["Látószög", deg],
    turnRate: ["Fordulási sebesség", (v) => `${v.toFixed(3)} rad/tick (${deg(v)})`],
    metabolicRate: ["Anyagcsere-szorzó", (v) => v.toFixed(3)],
    eatingSpeed: ["Táplálkozási sebesség", (v) => `${v} energia/tick`],
    maxEnergy: ["Max. energia", (v) => String(v)],
    maxHealth: ["Max. életerő", (v) => String(v)],
    maxAge: ["Max. életkor (utána leépül)", ticks],
    hungerThreshold: ["Éhségküszöb", pct],
    maturityAge: ["Ivarérettségi kor", ticks],
    reproductionThreshold: ["Szaporodási energiaküszöb", pct],
    reproductionCooldown: ["Szaporodási várakozási idő", ticks],
    offspringEnergy: ["Utód induló energiája", (v) => String(v)],
    reproductionStrategy: ["Szaporodási mód", (v) => STRATEGIES[v] ?? v],
    hue: ["Szín (árnyalat)", (v) => `${Math.round(v)}°`],
};

function describeGenes(genes) {
    const rows = [];
    for (const [name, [label, format]] of Object.entries(GENE_FORMATS)) {
        if (name in genes) rows.push({ key: name, label, value: format(genes[name]) });
    }
    for (const [name, value] of Object.entries(genes)) {
        if (name in GENE_FORMATS) continue;
        const text = typeof value === "number" ? String(Number(value.toFixed(3))) : String(value);
        rows.push({ key: name, label: name, value: text });
    }
    return rows;
}

// a lény saját színe, és ha van faja, mennyivel tér el a faj színétől (−180..+180°)
function colorText(hue, speciesHue) {
    const own = `${Math.round(hue)}°`;
    if (speciesHue === null) return own;
    const drift = ((((hue - speciesHue) % 360) + 540) % 360) - 180;
    const rounded = Math.round(drift);
    if (rounded === 0) return `${own} (a faj színe)`;
    return `${own} (fajszíntől ${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}°)`;
}

function blockerText(blocker) {
    switch (blocker.code) {
        case "dead":
            return "halott";
        case "immature":
            return "még nem ivarérett";
        case "cooldown":
            return `várakozási idő (${Math.round(blocker.ticks)} tick)`;
        case "energy":
            return `kevés energia (még ${Math.ceil(blocker.needed)} kell)`;
        case "population":
            return `populációs korlát (${blocker.limit})`;
        default:
            return blocker.code;
    }
}

function nextChance(status, creature) {
    if (!creature.alive) return "—";
    if (status.canReproduce) return "most (a következő tick-ben)";

    const needsEnergy = status.blockers.some((b) => b.code === "energy");
    const onlyPopulation = status.blockers.every((b) => b.code === "population");

    if (onlyPopulation) return "ha a populáció a korlát alá csökken";
    if (status.waitTicks > 0) {
        return `legalább ${ticks(status.waitTicks)}${needsEnergy ? ", és elég energia kell" : ""}`;
    }
    return `ha eléri a ${Math.ceil(status.energyThreshold)} energiát`;
}

// status: a Selection.status() értéke ("alive" | "dead" | "removed")
export function describeCreature(creature, world, status = creature.alive ? "alive" : "dead") {
    const { genes } = creature;
    const repro = reproductionStatus(creature, world);
    const dead = !creature.alive;
    const species = getSpecies(creature.speciesId);

    const life = [
        {
            key: "status",
            label: "Állapot",
            value: dead ? (status === "removed" ? "HALOTT – a holttest már nincs a világban" : "HALOTT") : "ÉL",
        },
        { key: "activity", label: "Tevékenység", value: ACTIVITIES[creature.state] ?? creature.state },
    ];
    if (dead) {
        life.push(
            { key: "cause", label: "Halál oka", value: CAUSES[creature.causeOfDeath] ?? String(creature.causeOfDeath) },
            { key: "deathTick", label: "Halál tickje", value: creature.deathTick === null ? "—" : String(creature.deathTick) },
        );
    }
    life.push(
        {
            key: "health",
            label: "Életerő",
            value: `${creature.health.toFixed(1)} / ${genes.maxHealth}`,
            meter: { kind: "hp", fill: clamp01(creature.health / genes.maxHealth) },
        },
        {
            key: "energy",
            label: "Energia",
            value: `${creature.energy.toFixed(1)} / ${genes.maxEnergy}`,
            meter: { kind: "en", fill: clamp01(creature.energy / genes.maxEnergy) },
        },
        { key: "hunger", label: "Éhség", value: pct(creature.hunger) },
        { key: "age", label: "Életkor", value: ticks(creature.age) },
        { key: "position", label: "Pozíció", value: `(${Math.round(creature.x)}, ${Math.round(creature.y)})` },
        { key: "heading", label: "Irány", value: deg(((creature.heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) },
        { key: "speed", label: "Sebesség", value: `${creature.speed.toFixed(2)} px/tick` },
    );

    const identity = [
        { key: "id", label: "Azonosító", value: `#${creature.id}` },
        { key: "species", label: "Faj", value: species.name, swatch: species.hue, swatchKind: "ring" },
        { key: "color", label: "Egyedi szín", value: colorText(genes.hue, species.hue), swatch: genes.hue, swatchKind: "fill" },
        { key: "generation", label: "Generáció", value: String(creature.generation) },
        { key: "parent", label: "Szülő", value: creature.parentId === null ? "alapító (nincs szülő)" : `#${creature.parentId}` },
        { key: "birthTick", label: "Születési tick", value: String(creature.birthTick) },
        { key: "children", label: "Utódok száma", value: String(creature.childrenCount) },
    ];

    const reproduction = [
        {
            key: "mature",
            label: "Ivarérett",
            value: repro.mature ? "igen" : `nem (még ${ticks(genes.maturityAge - creature.age)})`,
        },
        { key: "canReproduce", label: "Most szaporodhat", value: dead ? "—" : repro.canReproduce ? "igen" : "nem" },
        {
            key: "blockers",
            label: "Akadály",
            value: repro.blockers.length ? repro.blockers.map(blockerText).join(", ") : "nincs",
        },
        { key: "next", label: "Következő lehetőség", value: nextChance(repro, creature) },
        {
            key: "cost",
            label: "Költség / utód energiája",
            value: `${Math.round(repro.cost)} / ${repro.offspringEnergy}`,
        },
        { key: "children", label: "Utódok száma", value: String(creature.childrenCount) },
    ];

    return {
        id: creature.id,
        hue: genes.hue,
        speciesId: creature.speciesId,
        dead,
        removed: status === "removed",
        sections: [
            { key: "identity", title: "Azonosítás", rows: identity },
            { key: "life", title: "Életállapot", rows: life },
            { key: "genes", title: "Gének", rows: describeGenes(genes) },
            { key: "reproduction", title: "Szaporodás", rows: reproduction },
        ],
    };
}

// összesített populációs adatok (egy bejárás, a lények számától lineárisan függ)
export function populationSummary(world) {
    let alive = 0;
    let generationSum = 0;
    let generationMax = 0;
    let size = 0;
    let speed = 0;
    let vision = 0;

    for (const creature of world.creatures) {
        if (!creature.alive) continue;
        alive++;
        generationSum += creature.generation;
        generationMax = Math.max(generationMax, creature.generation);
        size += creature.genes.size;
        speed += creature.genes.maxSpeed;
        vision += creature.genes.visionRange;
    }

    const avg = (sum) => (alive ? sum / alive : 0);
    return {
        alive,
        limit: world.settings.maxPopulation,
        births: world.births,
        deaths: world.deaths,
        starvation: world.deathCauses.starvation ?? 0,
        oldAge: world.deathCauses.old_age ?? 0,
        blockedBirths: world.blockedBirths,
        avgGeneration: avg(generationSum),
        maxGenerationNow: generationMax,
        generationRecord: world.maxGeneration,
        avgSize: avg(size),
        avgSpeed: avg(speed),
        avgVision: avg(vision),
    };
}

// --- összehasonlítás: 2–5 kijelölt lény egy táblázatban ---
// Sorok = tulajdonságok, oszlopok = lények (kiválasztási sorrendben). Minden érték az egyedi
// panel leírásából (describeCreature) jön, így a két nézet nem térhet el egymástól.
// Az eltérő értékű sorokat csak semlegesen jelöljük: nem minden esetben jobb a nagyobb szám.

// [szekciókulcs, sorkulcs] párok a describeCreature szekcióiból
const COMPARE_SECTIONS = [
    {
        key: "identity",
        title: "Azonosítás",
        rows: [["identity", "id"], ["identity", "species"], ["identity", "generation"], ["identity", "parent"], ["life", "age"]],
    },
    {
        key: "life",
        title: "Életállapot",
        rows: [["life", "status"], ["life", "activity"], ["life", "cause"], ["life", "health"], ["life", "energy"], ["life", "hunger"]],
    },
    {
        key: "genes",
        title: "Gének",
        rows: ["size", "maxSpeed", "visionRange", "fieldOfView", "turnRate", "metabolicRate", "maxAge"].map((k) => ["genes", k]),
    },
    {
        key: "reproduction",
        title: "Szaporodás",
        rows: [["reproduction", "mature"], ["reproduction", "canReproduce"], ["reproduction", "blockers"], ["reproduction", "children"]],
    },
    {
        key: "reproductionGenes",
        title: "Szaporodási gének",
        collapsible: true,
        rows: ["maturityAge", "reproductionThreshold", "reproductionCooldown", "offspringEnergy", "reproductionStrategy"].map((k) => ["genes", k]),
    },
    {
        key: "allGenes",
        title: "Összes gén",
        collapsible: true,
        rows: "allGenes", // a génmodell minden mezője, ahogy az egyedi panelen
    },
];

const MISSING = Object.freeze({ value: "—" });

// creatures: a kijelölt lények sorrendben; statuses: a Selection.statusOf() értékei
export function describeComparison(creatures, world, statuses) {
    const views = creatures.map((creature, i) => describeCreature(creature, world, statuses[i]));
    const rowMaps = views.map((view) => {
        const map = new Map();
        for (const section of view.sections) {
            for (const row of section.rows) map.set(`${section.key}.${row.key}`, row);
        }
        return map;
    });
    const anyDead = creatures.some((creature) => !creature.alive);

    const columns = creatures.map((creature, i) => {
        const species = getSpecies(creature.speciesId);
        return {
            id: creature.id,
            number: i + 1,
            hue: creature.genes.hue,
            speciesHue: species.hue,
            speciesName: species.name,
            status: statuses[i],
            dead: !creature.alive,
            removed: statuses[i] === "removed",
        };
    });

    const sections = COMPARE_SECTIONS.map((spec) => {
        let pairs = spec.rows;
        if (pairs === "allGenes") {
            // a génkulcsok uniója, az első lény sorrendjében (ismeretlen gén is megjelenik)
            const keys = [];
            for (const view of views) {
                for (const row of view.sections.find((s) => s.key === "genes").rows) {
                    if (!keys.includes(row.key)) keys.push(row.key);
                }
            }
            pairs = keys.map((key) => ["genes", key]);
        }

        const rows = [];
        for (const [sectionKey, rowKey] of pairs) {
            // a halál oka csak akkor kell, ha van halott a kijelöltek között
            if (rowKey === "cause" && !anyDead) continue;

            const cells = rowMaps.map((map) => {
                const row = map.get(`${sectionKey}.${rowKey}`);
                if (!row) return MISSING;
                return { value: row.value, swatch: row.swatch, swatchKind: row.swatchKind, meter: row.meter };
            });
            const label = rowMaps.map((map) => map.get(`${sectionKey}.${rowKey}`)).find(Boolean)?.label ?? rowKey;
            const differs = new Set(cells.map((cell) => cell.value)).size > 1;
            rows.push({ key: `${sectionKey}.${rowKey}`, label, cells, differs });
        }

        return { key: spec.key, title: spec.title, collapsible: Boolean(spec.collapsible), rows };
    });

    return { columns, sections };
}

// a teljes alsó panel tartalma a kijelölés méretétől függően:
//   0 → null (üres állapot), 1 → egyedi panel, 2–5 → összehasonlítás
export function describeSelection(selection, world) {
    const creatures = selection.creatures;
    if (creatures.length === 0) return null;

    const statuses = creatures.map((creature) => selection.statusOf(creature, world));
    if (creatures.length === 1) {
        return { mode: "single", view: describeCreature(creatures[0], world, statuses[0]) };
    }
    return { mode: "compare", count: creatures.length, max: selection.max, ...describeComparison(creatures, world, statuses) };
}
