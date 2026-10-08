import { test } from "node:test";
import assert from "node:assert/strict";
import { describeCreature, populationSummary } from "../inspector.js";
import { reproductionStatus, STRATEGIES } from "../reproduction.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, addReadyParent, run } from "./helpers.js";

// a leírásból egy szekció sorai kulcs → érték formában
function rows(view, sectionKey) {
    const section = view.sections.find((s) => s.key === sectionKey);
    assert.ok(section, `nincs ${sectionKey} szekció`);
    return Object.fromEntries(section.rows.map((row) => [row.key, row.value]));
}

// --- azonosítás és életállapot ---

test("az azonosító adatok a lényből jönnek", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, {
        generation: 3,
        parentId: 7,
        birthTick: 120,
        childrenCount: 2,
    });

    const identity = rows(describeCreature(creature, world), "identity");
    assert.deepEqual(identity, {
        id: `#${creature.id}`,
        species: "Faj nélkül",
        color: "30°",
        generation: "3",
        parent: "#7",
        birthTick: "120",
        children: "2",
    });
});

test("alapító lénynél a szülő helyén ez áll", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);
    assert.equal(rows(describeCreature(creature, world), "identity").parent, "alapító (nincs szülő)");
});

test("az életállapot sorai a pillanatnyi értékeket mutatják", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640.4, 299.6, { health: 80, energy: 75, age: 600, speed: 0.6 });
    creature.state = "seeking";

    const life = rows(describeCreature(creature, world), "life");
    assert.equal(life.status, "ÉL");
    assert.equal(life.activity, "kaját keres");
    assert.equal(life.health, "80.0 / 100");
    assert.equal(life.energy, "75.0 / 150");
    assert.equal(life.hunger, "50%");
    assert.equal(life.age, "600 tick (~10.0 s)");
    assert.equal(life.position, "(640, 300)");
    assert.equal(life.speed, "0.60 px/tick");
    assert.equal("cause" in life, false, "élő lénynél nincs halálok");
});

test("az életerő- és energiacsík kitöltése arányos, és 0–1 közé szorul", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { health: 50, energy: 150 });

    const section = describeCreature(creature, world).sections.find((s) => s.key === "life");
    const meter = (key) => section.rows.find((row) => row.key === key).meter.fill;
    assert.equal(meter("health"), 0.5);
    assert.equal(meter("energy"), 1);
});

// --- gének ---

test("a génmodell minden mezője pontosan egyszer szerepel a panelen", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);

    const section = describeCreature(creature, world).sections.find((s) => s.key === "genes");
    const keys = section.rows.map((row) => row.key);
    assert.deepEqual([...keys].sort(), Object.keys(creature.genes).sort());
});

test("a génértékek helyes formában jelennek meg", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, {
        genes: { size: 12.46, maxSpeed: 1.374, visionRange: 151.6, fieldOfView: Math.PI / 2 },
    });

    const genes = rows(describeCreature(creature, world), "genes");
    assert.equal(genes.size, "12.5 px");
    assert.equal(genes.maxSpeed, "1.37 px/tick");
    assert.equal(genes.visionRange, "152 px");
    assert.equal(genes.fieldOfView, "90°");
    assert.equal(genes.hungerThreshold, "25%");
    assert.equal(genes.maturityAge, "2000 tick (~33.3 s)");
    assert.equal(genes.reproductionThreshold, "80%");
    assert.equal(genes.reproductionCooldown, "1500 tick (~25.0 s)");
    assert.equal(genes.reproductionStrategy, "ivartalan");
    assert.equal(genes.maxAge, "10000 tick (~166.7 s)");
});

test("ismeretlen (később bevezetett) gén is megjelenik a saját nevével, kitalált adat nélkül", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { genes: { camouflage: 0.123456 } });

    const genes = rows(describeCreature(creature, world), "genes");
    assert.equal(genes.camouflage, "0.123");
});

// --- szaporodás ---

test("ivaréretlen lény: nem szaporodhat, látszik mennyi idő van hátra", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { age: 100 });

    const repro = rows(describeCreature(creature, world), "reproduction");
    assert.equal(repro.mature, "nem (még 1900 tick (~31.7 s))");
    assert.equal(repro.canReproduce, "nem");
    assert.equal(repro.blockers, "még nem ivarérett");
    assert.equal(repro.next, "legalább 1900 tick (~31.7 s)");
    assert.equal(repro.cost, "80 / 60");
});

test("szaporodásra kész lény: igen, és a következő tick-ben valóban születik utód", () => {
    const world = makeWorld();
    const creature = addReadyParent(world, 640, 300);

    const repro = rows(describeCreature(creature, world), "reproduction");
    assert.equal(repro.mature, "igen");
    assert.equal(repro.canReproduce, "igen");
    assert.equal(repro.blockers, "nincs");
    assert.equal(repro.next, "most (a következő tick-ben)");

    world.step();
    assert.equal(world.births, 1);
});

test("várakozási idő és kevés energia együtt: mindkét akadály és a várakozás látszik", () => {
    const world = makeWorld();
    const creature = addReadyParent(world, 640, 300, { reproductionTimer: 300, energy: 90 });

    const repro = rows(describeCreature(creature, world), "reproduction");
    assert.equal(repro.canReproduce, "nem");
    assert.equal(repro.blockers, "várakozási idő (300 tick), kevés energia (még 30 kell)");
    assert.equal(repro.next, "legalább 300 tick (~5.0 s), és elég energia kell");
});

test("csak kevés energia: a szükséges energiaszint látszik", () => {
    const world = makeWorld();
    const creature = addReadyParent(world, 640, 300, { energy: 100 });

    const repro = rows(describeCreature(creature, world), "reproduction");
    assert.equal(repro.blockers, "kevés energia (még 20 kell)");
    assert.equal(repro.next, "ha eléri a 120 energiát");
});

test("telt populációnál a korlát az akadály", () => {
    const world = makeWorld(1, { maxPopulation: 1 });
    const creature = addReadyParent(world, 640, 300);

    const repro = rows(describeCreature(creature, world), "reproduction");
    assert.equal(repro.canReproduce, "nem");
    assert.equal(repro.blockers, "populációs korlát (1)");
    assert.equal(repro.next, "ha a populáció a korlát alá csökken");
});

test("a panel szaporodási állapota minden döntésnél megegyezik a szimuláció döntésével", () => {
    // a lény döntésének pillanatában (a tick-je közepén) összeveti a döntést a panel adatával
    const strategy = STRATEGIES.asexual;
    const original = strategy.request;
    let decisions = 0;
    let wanted = 0;

    strategy.request = (creature, world) => {
        const request = original(creature, world);
        const individual = reproductionStatus(creature, world).blockers.filter((b) => b.code !== "population");
        assert.equal(request !== null, individual.length === 0, `#${creature.id}, ${world.tick}. tick`);
        decisions++;
        if (request) wanted++;
        return request;
    };

    try {
        run(createDefaultWorld(12), 15000);
    } finally {
        strategy.request = original;
    }

    assert.ok(decisions > 10000 && wanted > 10, `döntések: ${decisions}, szaporodna: ${wanted}`);
});

// --- halott és eltávolított lény ---

test("elpusztult lény: HALOTT, a halál oka és tickje látszik, a szaporodás nem értelmezett", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { energy: 0, health: 0.3 });
    run(world, 2);

    const view = describeCreature(creature, world, "dead");
    const life = rows(view, "life");
    const repro = rows(view, "reproduction");
    assert.equal(view.dead, true);
    assert.equal(life.status, "HALOTT");
    assert.equal(life.cause, "éhezés");
    assert.equal(life.deathTick, "2");
    assert.equal(life.activity, "—");
    assert.equal(repro.canReproduce, "—");
    assert.equal(repro.blockers, "halott");
    assert.equal(repro.next, "—");
});

test("öregségben elpusztult lény halálokának szövege", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { genes: { maxAge: 1 }, health: 0.1 });
    run(world, 3);

    assert.equal(rows(describeCreature(creature, world, "dead"), "life").cause, "öregség");
});

test("a világból már kikerült holttestnél ez egyértelműen látszik", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);
    creature.die("starvation");

    const view = describeCreature(creature, world, "removed");
    assert.equal(view.removed, true);
    assert.equal(rows(view, "life").status, "HALOTT – a holttest már nincs a világban");
});

// --- populáció összesítő ---

test("a populációs összesítő az élőkből számol, a holttesteket kihagyja", () => {
    const world = makeWorld();
    addCreature(world, 100, 100, { generation: 2, genes: { size: 8, maxSpeed: 1, visionRange: 100 } });
    addCreature(world, 300, 100, { generation: 4, genes: { size: 12, maxSpeed: 2, visionRange: 200 } });
    addCreature(world, 500, 100, { generation: 9 }).die("test");

    const summary = populationSummary(world);
    assert.equal(summary.alive, 2);
    assert.equal(summary.avgGeneration, 3);
    assert.equal(summary.maxGenerationNow, 4);
    assert.equal(summary.avgSize, 10);
    assert.equal(summary.avgSpeed, 1.5);
    assert.equal(summary.avgVision, 150);
    assert.equal(summary.limit, world.settings.maxPopulation);
});

test("üres populációnál az átlagok 0-k, nem NaN", () => {
    const summary = populationSummary(makeWorld());
    assert.equal(summary.alive, 0);
    assert.equal(summary.avgSize, 0);
    assert.equal(summary.avgGeneration, 0);
});
