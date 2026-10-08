import { test } from "node:test";
import assert from "node:assert/strict";
import { Food } from "../food.js";
import { makeWorld, addFood, WIDTH, HEIGHT } from "./helpers.js";

test("egy falat legfeljebb annyit ad, amennyi maradt", () => {
    const food = new Food(1);
    food.amount = 1;

    assert.equal(food.bite(0.6), 0.6);
    assert.ok(Math.abs(food.bite(5) - 0.4) < 1e-12);
    assert.equal(food.bite(5), 0);
    assert.equal(food.depleted, true);
});

test("a világ a lerágott kaját újraszüli: tele, új helyen, a pályán belül", () => {
    const world = makeWorld(11);
    const food = addFood(world, 100, 100, 0);

    world.step();

    assert.equal(food.amount, food.maxAmount);
    assert.equal(food.spawnCount, 1);
    assert.ok(food.x >= food.size && food.x <= WIDTH - food.size);
    assert.ok(food.y >= food.size && food.y <= HEIGHT - food.size);
    assert.notDeepEqual([food.x, food.y], [100, 100]);
});

test("a nem lerágott kaja a helyén marad", () => {
    const world = makeWorld();
    const food = addFood(world, 100, 100, 0.5);

    world.step();

    assert.equal(food.spawnCount, 0);
    assert.deepEqual([food.x, food.y, food.amount], [100, 100, 0.5]);
});

test("az újraszületés helye a seedtől függ, azonos seednél ugyanaz", () => {
    const place = (seed) => {
        const world = makeWorld(seed);
        const food = addFood(world, 0, 0, 0);
        food.respawn(world);
        return [food.x, food.y];
    };

    assert.deepEqual(place(8), place(8));
    assert.notDeepEqual(place(8), place(9));
});
