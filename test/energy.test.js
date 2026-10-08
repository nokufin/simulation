import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addCreature, addFood, hungryEnergy } from "./helpers.js";

const EPS = 1e-9;

// energiafogyás / tick = metabolicRate × (size / 20) × (0,1 + speed / 2)
const cost = (speed, size = 10, metabolicRate = 0.25) =>
    metabolicRate * (size / 20) * (0.1 + speed / 2);

test("bóklászáskor a képlet szerint fogy az energia", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300);

    world.step();

    assert.ok(Math.abs(creature.energy - (150 - cost(0.6))) < EPS, `energia: ${creature.energy}`);
});

test("kétszer akkora test kétszer annyi energiát éget", () => {
    const world = makeWorld();
    const small = addCreature(world, 300, 300, { genes: { size: 10 } });
    const big = addCreature(world, 900, 300, { genes: { size: 20 } });

    world.step();

    const smallUsed = 150 - small.energy;
    const bigUsed = 150 - big.energy;
    assert.ok(Math.abs(bigUsed - 2 * smallUsed) < EPS);
});

test("a fogyás a tényleges sebességtől függ: egyenesen keresve teljes tempó", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy(), heading: 0 });
    addFood(world, 500, 300); // pont szemben, nincs kanyar

    world.step();

    assert.equal(creature.state, "seeking");
    assert.ok(Math.abs(creature.speed - 1) < EPS);
    assert.ok(Math.abs(creature.energy - (75 - cost(1))) < EPS);
});

test("álló helyzetben (evés közben) csak alapanyagcsere van", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy() });
    addFood(world, 410, 300);

    world.step();

    assert.equal(creature.state, "eating");
    assert.ok(Math.abs(creature.energy - (75 + 0.6 - cost(0))) < EPS);
});

test("0 energiánál kimerül: nem mozdul, és az energia nem megy 0 alá", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: 0 });

    world.step();

    assert.equal(creature.state, "exhausted");
    assert.equal(creature.speed, 0);
    assert.equal(creature.energy, 0);
    assert.equal(creature.x, 400);
    assert.equal(creature.y, 300);
});

test("energiából az éhség: 0 = jóllakott, 1 = üres", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300);
    assert.equal(creature.hunger, 0);
    creature.energy = 75;
    assert.equal(creature.hunger, 0.5);
    creature.energy = 0;
    assert.equal(creature.hunger, 1);
});
