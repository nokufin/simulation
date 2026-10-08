import { test } from "node:test";
import assert from "node:assert/strict";
import { pickCreatureAt, Selection, PICK_TOLERANCE } from "../selection.js";
import { describeCreature, populationSummary } from "../inspector.js";
import { reproductionStatus } from "../reproduction.js";
import { drawWorld } from "../render.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, run, snapshot } from "./helpers.js";

const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });

// --- találat ---

test("a lényen belüli kattintás azt a lényt adja, a tűrésen kívüli semmit", () => {
    const world = makeWorld();
    const creature = addCreature(world, 100, 100); // size 10

    assert.equal(pickCreatureAt(world.creatures, 105, 100), creature);
    assert.equal(pickCreatureAt(world.creatures, 100 + 10 + PICK_TOLERANCE, 100), creature);
    assert.equal(pickCreatureAt(world.creatures, 100 + 10 + PICK_TOLERANCE + 0.5, 100), null);
});

test("a találat a lény tényleges méretével számol", () => {
    const world = makeWorld();
    const big = addCreature(world, 300, 300, { genes: { size: 20 } });
    addCreature(world, 600, 300, { genes: { size: 5 } });

    assert.equal(pickCreatureAt(world.creatures, 322, 300), big);
    assert.equal(pickCreatureAt(world.creatures, 622, 300), null);
});

test("üres helyre kattintva nincs találat", () => {
    const world = makeWorld();
    addCreature(world, 100, 100);
    assert.equal(pickCreatureAt(world.creatures, 700, 400), null);
});

test("átfedésnél a középpontjához közelebbi lény nyer", () => {
    const world = makeWorld();
    const a = addCreature(world, 100, 100);
    const b = addCreature(world, 112, 100);

    assert.equal(pickCreatureAt(world.creatures, 109, 100), b);
    assert.equal(pickCreatureAt(world.creatures, 103, 100), a);
});

test("egyenlő távolságnál a később rajzolt (fölül látszó) lény nyer, sorrendtől függően determinisztikusan", () => {
    const world = makeWorld();
    const a = addCreature(world, 100, 100);
    const b = addCreature(world, 110, 100);

    assert.equal(pickCreatureAt([a, b], 105, 100), b);
    assert.equal(pickCreatureAt([b, a], 105, 100), a);
});

test("az élő lény előnyt kap a holttesttel szemben, akkor is, ha az közelebb van", () => {
    const world = makeWorld();
    const corpse = addCreature(world, 100, 100);
    corpse.die("test");
    const living = addCreature(world, 108, 100);

    assert.equal(pickCreatureAt(world.creatures, 100, 100), living);
});

test("a holttest is kijelölhető, ha nincs ott élő lény", () => {
    const world = makeWorld();
    const corpse = addCreature(world, 100, 100);
    corpse.die("test");

    assert.equal(pickCreatureAt(world.creatures, 100, 100), corpse);
});

// --- kijelölés állapota ---

test("kijelölés, váltás másik lényre és a kijelölés megszüntetése", () => {
    const world = makeWorld();
    const a = addCreature(world, 100, 100);
    const b = addCreature(world, 500, 300);
    const selection = new Selection();

    assert.equal(selection.status(world), "none");

    selection.select(a);
    assert.equal(selection.creature, a);
    assert.equal(selection.status(world), "alive");

    selection.select(b);
    assert.equal(selection.creature, b);

    selection.clear();
    assert.equal(selection.creature, null);
    assert.equal(selection.status(world), "none");
});

test("a kijelölés követi a lényt: mozgás után is ugyanaz a példány, az aktuális helyével", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);
    const selection = new Selection();
    selection.select(creature);

    run(world, 100);

    assert.equal(selection.creature, creature);
    assert.notDeepEqual([creature.x, creature.y], [640, 300]);
    assert.equal(pickCreatureAt(world.creatures, creature.x, creature.y), creature);
});

test("a kijelölt lény halála után dead, a holttest eltűnése után removed, az adatai megmaradnak", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { energy: 0, health: 0.5 });
    const selection = new Selection();
    selection.select(creature);

    run(world, 3);
    assert.equal(selection.status(world), "dead");
    assert.equal(creature.causeOfDeath, "starvation");

    run(world, 600);
    assert.equal(selection.status(world), "removed");
    assert.equal(selection.creature, creature, "a referencia elveszett");
    assert.equal(selection.creature.deathTick, 3);
});

// --- a megfigyelés nem hat a szimulációra ---

test("a kijelölés, a panel adatai és a gyűrű rajzolása nem változtat a futáson", () => {
    const observed = createDefaultWorld(31);
    const plain = createDefaultWorld(31);
    const selection = new Selection();

    for (let t = 0; t < 6000; t++) {
        observed.step();
        plain.step();

        // minden tick-ben kijelöl, leír, összesít és rajzol
        const target = observed.creatures[t % observed.creatures.length];
        if (target) {
            const hit = pickCreatureAt(observed.creatures, target.x, target.y);
            if (hit) selection.select(hit);
        }
        if (selection.creature) {
            const status = selection.status(observed);
            describeCreature(selection.creature, observed, status);
            reproductionStatus(selection.creature, observed);
        }
        populationSummary(observed);
        drawWorld(fakeCtx, observed, { debug: true, selected: selection.creature });
    }

    assert.equal(snapshot(observed), snapshot(plain));
    assert.ok(observed.births > 0, "a futásban nem volt születés");
});
