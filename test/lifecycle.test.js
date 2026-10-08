import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addCreature, run } from "./helpers.js";

const EPS = 1e-9;

test("az életkor tick-enként eggyel nő", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);
    run(world, 37);
    assert.equal(creature.age, 37);
});

test("maxAge előtt nem sérül az öregségtől, utána leépül és meghal (old_age)", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { genes: { maxAge: 5 }, health: 1 });

    // maxAge-ig nincs leépülés, sőt jóllakottan gyógyul: 1 + 5 × 0,02
    run(world, 5);
    assert.ok(Math.abs(creature.health - 1.1) < EPS);

    let ticks = 5;
    while (creature.alive && ticks < 50) {
        world.step();
        ticks++;
    }

    assert.equal(creature.alive, false);
    assert.equal(creature.causeOfDeath, "old_age");
    // -0,2 öregség + 0,02 gyógyulás = -0,18 / tick → 1,1 életerő 7 tick alatt fogy el
    assert.equal(ticks, 12);
});

test("0 energiánál éhezik: -0,2 életerő / tick, majd meghal (starvation)", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { energy: 0, health: 1 });

    world.step();
    assert.ok(Math.abs(creature.health - 0.8) < EPS);
    assert.equal(creature.state, "exhausted");

    run(world, 10);
    assert.equal(creature.alive, false);
    assert.equal(creature.state, "dead");
    assert.equal(creature.causeOfDeath, "starvation");
});

test("jóllakottan lassan gyógyul (+0,02 / tick), de a maximum fölé nem", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { health: 50 });

    run(world, 10);
    assert.ok(Math.abs(creature.health - 50.2) < EPS);

    creature.health = 99.99;
    run(world, 5);
    assert.equal(creature.health, 100);
});

test("a halott lény nem mozog, nem öregszik, elhalványul, majd kikerül a világból", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);
    creature.die("test");
    const { x, y } = creature;

    run(world, 400);
    assert.equal(world.creatures.includes(creature), true);
    assert.equal(creature.x, x);
    assert.equal(creature.y, y);
    assert.equal(creature.age, 0);
    assert.ok(creature.fadeAlpha > 0 && creature.fadeAlpha < 1);

    run(world, 110);
    assert.equal(world.creatures.includes(creature), false);
    assert.equal(world.deaths, 1);
});

test("a holttestet nem lökdösik az élő lények", () => {
    const world = makeWorld();
    const corpse = addCreature(world, 640, 300);
    corpse.die("test");
    addCreature(world, 645, 300);

    world.step();

    assert.equal(corpse.x, 640);
    assert.equal(corpse.y, 300);
});

test("az egymásba lógó élő lényeket szétlöki", () => {
    const world = makeWorld();
    const a = addCreature(world, 640, 300, { energy: 0 }); // kimerültek: nem mozognak maguktól
    const b = addCreature(world, 645, 300, { energy: 0 });

    world.step();

    assert.ok(a.distanceTo(b) >= a.genes.size + b.genes.size - EPS);
});
