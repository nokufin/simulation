import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorld } from "../scenario.js";
import { birthCost } from "../reproduction.js";
import { makeWorld, addCreature, addReadyParent, run, snapshot, WIDTH, HEIGHT } from "./helpers.js";

const EPS = 1e-9;
// bóklászás egy tick alatt (alapgének): 0,25 × 0,5 × (0,1 + 0,3)
const WANDER_COST = 0.05;

// --- feltételek ---

test("ivarérettség előtt nem szaporodik, akkor sem, ha tele van energiával", () => {
    const world = makeWorld();
    addCreature(world, 640, 300, { age: 1990 }); // maturityAge: 2000

    run(world, 5);
    assert.equal(world.births, 0);

    run(world, 10);
    assert.equal(world.births, 1);
});

test("a küszöb alatti energiával nem szaporodik", () => {
    const world = makeWorld();
    addReadyParent(world, 640, 300, { energy: 150 * 0.8 - 1 });

    run(world, 50);
    assert.equal(world.births, 0);
});

test("ha a költség után nem maradna energiája, nem szaporodik", () => {
    const world = makeWorld();
    // alacsony küszöb, de a 80-as költségnél kevesebb energia
    addReadyParent(world, 640, 300, { energy: 70, genes: { reproductionThreshold: 0.1 } });

    run(world, 50);
    assert.equal(world.births, 0);
});

test("két utód között kivárja a várakozási időt", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 640, 300);
    const birthTicks = [];

    for (let t = 0; t < 1600; t++) {
        parent.energy = 150; // folyamatosan jóllakott, csak a várakozási idő korlátoz
        const before = world.births;
        world.step();
        if (world.births > before) birthTicks.push(world.tick);
    }

    // 1. tick: születés, utána 1500 tick szünet, a következő tick-ben újra
    assert.deepEqual(birthTicks, [1, 1502]);
});

// --- az utód ---

test("az utód egyedi azonosítót, szülőazonosítót, generációt és születési tick-et kap", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 640, 300);
    parent.generation = 4;

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    assert.ok(child, "nincs utód");
    assert.equal(child.id, 2);
    assert.equal(child.generation, 5);
    assert.equal(child.birthTick, 1);
    assert.equal(parent.childrenCount, 1);
    assert.equal(world.maxGeneration, 5);
    assert.equal(world.nextCreatureId, 3);
});

test("az utód a szülő génjeit örökli (mutáció nélkül pontosan)", () => {
    const world = makeWorld(1, { mutationRate: 0 });
    const parent = addReadyParent(world, 640, 300, { genes: { size: 12.5, maxSpeed: 1.37, hue: 205 } });

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    assert.deepEqual(child.genes, parent.genes);
    assert.notEqual(child.genes, parent.genes, "közös objektum: a mutáció a szülőt is módosítaná");
});

test("mutációval az utód génjei eltérhetnek, de a határokon belül", () => {
    const world = makeWorld(1, { mutationRate: 1, mutationStrength: 0.1 });
    const parent = addReadyParent(world, 640, 300);

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    assert.notEqual(child.genes.maxSpeed, parent.genes.maxSpeed);
    assert.ok(Math.abs(child.genes.maxSpeed / parent.genes.maxSpeed - 1) <= 0.1 + EPS);
});

test("az utód a szülő mellé, a pályán belülre születik", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 10, 10); // sarokban

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    const s = child.genes.size;
    assert.ok(child.x >= s && child.x <= WIDTH - s && child.y >= s && child.y <= HEIGHT - s);
    assert.ok(parent.distanceTo(child) <= parent.genes.size + child.genes.size + EPS);
});

// --- energiamérleg ---

test("a szülő a teljes költséget fizeti, az utód ennél kevesebbet kap", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 640, 300);

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    const cost = birthCost(parent.genes, 0.75); // 60 / 0,75 = 80
    assert.ok(Math.abs(cost - 80) < EPS);
    assert.ok(Math.abs(parent.energy - (150 - WANDER_COST - cost)) < EPS);
    assert.equal(child.energy, 60);
    // a rendszer összenergiája csökkent
    assert.ok(parent.energy + child.energy < 150 - WANDER_COST);
});

test("1-nél nagyobb hatásfokkal sem termel energiát a szaporodás", () => {
    const world = makeWorld(1, { reproductionEfficiency: 5 });
    const parent = addReadyParent(world, 640, 300);

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    const paid = 150 - WANDER_COST - parent.energy;
    assert.ok(child.energy <= paid + EPS, `kapott ${child.energy}, fizetett ${paid}`);
});

test("a szaporodás nem energiaforrás: kaja nélkül a teljes energia sosem nő", () => {
    const world = makeWorld(5, { mutationRate: 0 });
    for (let i = 0; i < 6; i++) addReadyParent(world, 150 + i * 180, 300);
    const total = () => world.creatures.reduce((sum, c) => sum + (c.alive ? c.energy : 0), 0);

    let previous = total();
    for (let t = 0; t < 4000; t++) {
        world.step();
        const current = total();
        assert.ok(current <= previous + EPS, `${world.tick}. tick: ${previous} → ${current}`);
        previous = current;
    }
    assert.ok(world.births > 0);
});

// --- sorrend ---

test("a születés a lépés végén történik: az utód a születése tick-jében nem cselekszik", () => {
    const world = makeWorld();
    addCreature(world, 200, 300);
    const parent = addReadyParent(world, 640, 300);
    addCreature(world, 1000, 300);

    world.step();

    const child = world.creatures.at(-1);
    assert.equal(child.parentId, parent.id, "az utód nem a lista végére került");
    assert.equal(child.age, 0);
    assert.equal(child.speed, 0);
});

test("egyszerre több születés a lények sorrendjében, determinisztikusan történik", () => {
    const world = makeWorld();
    const a = addReadyParent(world, 300, 300);
    const b = addReadyParent(world, 900, 300);

    world.step();

    const children = world.creatures.slice(2);
    assert.deepEqual(children.map((c) => [c.id, c.parentId]), [[3, a.id], [4, b.id]]);
});

// --- populációkorlát ---

test("a populációkorlátnál nincs születés, és a szülő nem fizet", () => {
    const world = makeWorld(1, { maxPopulation: 3 });
    const parents = [300, 640, 980].map((x) => addReadyParent(world, x, 300));

    world.step();

    assert.equal(world.births, 0);
    assert.equal(world.blockedBirths, 3);
    for (const parent of parents) {
        assert.ok(Math.abs(parent.energy - (150 - WANDER_COST)) < EPS, "a szülő fizetett");
    }
});

test("a korlátig engedi a születéseket, a sorrendben elsőket", () => {
    const world = makeWorld(1, { maxPopulation: 4 });
    const [first] = [300, 640, 980].map((x) => addReadyParent(world, x, 300));

    world.step();

    assert.equal(world.births, 1);
    assert.equal(world.blockedBirths, 2);
    assert.equal(world.creatures.at(-1).parentId, first.id);
    assert.equal(world.aliveCount, 4);
});

test("az elutasított szülő nem próbálkozik minden tick-ben", () => {
    const world = makeWorld(1, { maxPopulation: 1 });
    addReadyParent(world, 640, 300);

    run(world, 120);

    // 60 tick-es szünetekkel: az 1. és a 62. tick-ben próbálkozik
    assert.equal(world.blockedBirths, 2);
});

test("a korlátba csak az élők számítanak, a holttestek nem", () => {
    const world = makeWorld(1, { maxPopulation: 2 });
    addCreature(world, 300, 300).die("test");
    addReadyParent(world, 640, 300);

    world.step();

    assert.equal(world.births, 1);
});

// --- kihalás, statisztika ---

test("a populáció kihalhat, és nincs mesterséges utánpótlás", () => {
    const world = createDefaultWorld(3, { initialFood: 0 });

    run(world, 12000);
    assert.equal(world.aliveCount, 0);

    run(world, 3000);
    assert.equal(world.aliveCount, 0);
    assert.equal(world.creatures.length, 0);
    assert.equal(world.deaths, world.births + 5);
});

test("a halál a bekövetkezésekor számít, okkal együtt", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { energy: 0, health: 0.1 });

    world.step();

    assert.equal(world.deaths, 1);
    assert.deepEqual(world.deathCauses, { starvation: 1 });
    assert.equal(creature.deathTick, 1);
    assert.equal(world.creatures.includes(creature), true, "a holttest még látszik");
});

test("a populáció-előzmény a megadott időközönként, korlátos hosszal rögzül", () => {
    const world = makeWorld(1, { historyInterval: 10, historyLength: 5 });
    addCreature(world, 640, 300);

    run(world, 100);

    assert.deepEqual(world.history.map((h) => h.tick), [60, 70, 80, 90, 100]);
    assert.equal(world.history.at(-1).alive, 1);
});

test("ismeretlen szaporodási stratégia azonnal hibát jelez", () => {
    const world = makeWorld();
    addReadyParent(world, 640, 300, { genes: { reproductionStrategy: "sexual" } });
    assert.throws(() => world.step(), /ismeretlen szaporodási stratégia: sexual/);
});

// --- determinizmus születésekkel ---

test("születésekkel és mutációval is azonos seed = azonos futás, több generáción át", () => {
    const a = createDefaultWorld(2024);
    const b = createDefaultWorld(2024);

    for (let t = 1; t <= 20000; t++) {
        a.step();
        b.step();
        if (t % 1000 === 0) assert.equal(snapshot(a), snapshot(b), `eltérés a ${t}. tick-ben`);
    }

    assert.ok(a.births > 10, `kevés születés: ${a.births}`);
    assert.ok(a.maxGeneration >= 3, `kevés generáció: ${a.maxGeneration}`);
});

test("eltérő seednél a születések is eltérnek", () => {
    const a = createDefaultWorld(1);
    const b = createDefaultWorld(2);
    run(a, 8000);
    run(b, 8000);
    assert.notEqual(snapshot(a), snapshot(b));
});

test("az alapbeállításokkal a világban ténylegesen történik mutáció (regresszió)", () => {
    const world = createDefaultWorld(8);
    run(world, 20000);

    const byId = new Map();
    const mutated = [];
    // a még élő/látható szülő–utód párok összevetése
    for (const c of world.creatures) byId.set(c.id, c);
    for (const c of world.creatures) {
        const parent = byId.get(c.parentId);
        if (parent && parent.genes.maxSpeed !== c.genes.maxSpeed) mutated.push(c.id);
    }
    assert.ok(world.births > 20);
    assert.ok(mutated.length > 0, "egyetlen utód génje sem tér el a szülőétől");
});
