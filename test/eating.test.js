import { test } from "node:test";
import assert from "node:assert/strict";
import { makeWorld, addCreature, addFood, run, hungryEnergy } from "./helpers.js";

const EPS = 1e-9;

test("éhesen, a kajához érve eszik: amennyit a kaja veszít, annyit nyer", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy() });
    const food = addFood(world, 410, 300);

    world.step();

    assert.equal(creature.state, "eating");
    assert.ok(Math.abs(food.amount - (50 - 0.6)) < EPS);
    const basal = 0.25 * 0.5 * 0.1;
    assert.ok(Math.abs(creature.energy - (75 + 0.6 - basal)) < EPS);
});

test("jóllakottan nem eszik, akkor sem, ha hozzáér a kajához", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300); // tele energia
    const food = addFood(world, 410, 300);

    run(world, 20);

    assert.notEqual(creature.state, "eating");
    assert.equal(food.amount, 50);
});

test("jóllakáskor abbahagyja az evést, nem ragad a kajánál (regresszió)", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: 105 }); // éhség 0,3
    const food = addFood(world, 410, 300);

    let eatingTicks = 0;
    for (let t = 0; t < 300; t++) {
        world.step();
        if (creature.state === "eating") eatingTicks++;
        assert.ok(creature.energy <= creature.genes.maxEnergy + EPS, "túltöltötte magát");
    }

    // 105 → 147 kell a jóllakáshoz (éhség < 0,02): ~70 tick, és utána nem eszik tovább
    assert.ok(eatingTicks > 60 && eatingTicks < 80, `evéssel töltött tick: ${eatingTicks}`);
    assert.ok(food.amount > 0, "az egész kaját megette, pedig jóllakott");
    assert.notEqual(creature.state, "eating");
});

test("ha elfogy a kaja, abbahagyja, és az újraszületett kaját nem eszi messziről", () => {
    const world = makeWorld(3);
    const a = addCreature(world, 400, 300, { energy: 30 });
    const b = addCreature(world, 420, 300, { energy: 30 });
    const food = addFood(world, 410, 310, 2);

    run(world, 5);

    assert.equal(food.spawnCount, 1, "a kaja nem született újra");
    for (let t = 0; t < 50; t++) {
        const amountBefore = food.amount;
        world.step();
        if (food.amount < amountBefore) {
            const eater = [a, b].find((c) => c.state === "eating" && c.target === food);
            assert.ok(eater && eater.canReach(food, 3), "valaki messziről eszi a kaját");
        }
    }
});

test("az újraszületett kaja már nem érvényes célpont, még ugyanott sem", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy() });
    const food = addFood(world, 410, 300);

    creature.setTarget(food);
    assert.equal(creature.isTargetValid(), true);

    food.respawn(world);
    food.x = 410;
    food.y = 300;
    assert.equal(creature.isTargetValid(), false);
});

test("a kiszemelt kaja mellett kitart, ha közben egy közelebbi is feltűnik", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy(), heading: 0 });
    const first = addFood(world, 500, 300);

    world.step();
    assert.equal(creature.target, first);

    addFood(world, creature.x + 40, creature.y + 30);
    world.step();
    assert.equal(creature.target, first);
});
