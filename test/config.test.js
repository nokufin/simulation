import { test } from "node:test";
import assert from "node:assert/strict";
import { WORLD_CONFIG } from "../config.js";
import { createDefaultWorld } from "../scenario.js";

test("az alap világ a config.js szerint épül fel", () => {
    const world = createDefaultWorld(1);

    assert.equal(world.width, WORLD_CONFIG.width);
    assert.equal(world.height, WORLD_CONFIG.height);
    assert.equal(world.creatures.length, WORLD_CONFIG.initialCreatures);
    assert.equal(world.foods.length, WORLD_CONFIG.initialFood);
});

test("a config egyes mezői felülírhatók egy világra", () => {
    const world = createDefaultWorld(1, { width: 400, height: 300, initialCreatures: 12, initialFood: 3 });

    assert.deepEqual([world.width, world.height], [400, 300]);
    assert.equal(world.creatures.length, 12);
    assert.equal(world.foods.length, 3);
    for (const c of world.creatures) {
        assert.ok(c.x >= c.genes.size && c.x <= 400 - c.genes.size);
        assert.ok(c.y >= c.genes.size && c.y <= 300 - c.genes.size);
    }
});

test("a felülírás nem módosítja a közös configot", () => {
    createDefaultWorld(1, { initialCreatures: 99 });
    assert.equal(Object.isFrozen(WORLD_CONFIG), true);
    assert.notEqual(WORLD_CONFIG.initialCreatures, 99);
});
