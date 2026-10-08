import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, addFood, run, hungryEnergy, WIDTH, HEIGHT } from "./helpers.js";

const EPS = 1e-9;

test("bóklászáskor minden irányban maxSpeed × 0,6 utat tesz meg tick-enként", () => {
    for (let i = 0; i < 8; i++) {
        const heading = (i * Math.PI) / 4;
        const world = makeWorld();
        const creature = addCreature(world, 640, 300, { heading });

        world.step();

        assert.equal(creature.state, "wandering");
        const moved = Math.hypot(creature.x - 640, creature.y - 300);
        assert.ok(Math.abs(moved - 0.6) < EPS, `irány ${heading}: ${moved}`);
    }
});

test("bóklászás közben tick-enként legfeljebb turnRate / 2-t kanyarodik", () => {
    const world = makeWorld(5);
    const creature = addCreature(world, 640, 300);

    for (let i = 0; i < 200; i++) {
        const before = creature.heading;
        world.step();
        assert.ok(Math.abs(creature.heading - before) <= 0.05 + EPS);
    }
});

test("falnak ütközve visszapattan és a pályán marad", () => {
    const world = makeWorld();
    const creature = addCreature(world, WIDTH - 10.1, 300, { heading: 0 });

    world.step();

    assert.ok(creature.x <= WIDTH - creature.genes.size);
    assert.ok(Math.cos(creature.heading) < 0, "nem fordult vissza");
});

test("hosszú futásban senki nem hagyja el a pályát, és nincs NaN", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const world = createDefaultWorld(seed);
        for (let t = 0; t < 5000; t++) {
            world.step();
            for (const c of world.creatures) {
                const s = c.genes.size;
                assert.ok(Number.isFinite(c.x + c.y + c.heading + c.energy + c.health));
                assert.ok(c.x >= s - EPS && c.x <= world.width - s + EPS, `seed ${seed}, tick ${t}: x=${c.x}`);
                assert.ok(c.y >= s - EPS && c.y <= world.height - s + EPS, `seed ${seed}, tick ${t}: y=${c.y}`);
            }
        }
    }
});

test("éhesen a látott kaja felé indul, közelít, és eléri", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy() });
    const food = addFood(world, 500, 300);

    let distance = creature.distanceTo(food);
    let ticks = 0;
    while (creature.state !== "eating" && ticks < 150) {
        world.step();
        ticks++;
        if (creature.state === "seeking") {
            const next = creature.distanceTo(food);
            assert.ok(next < distance, "keresés közben nem közeledett");
            distance = next;
        }
    }

    assert.equal(creature.state, "eating");
    assert.equal(creature.target, food);
});

test("a cél felé legfeljebb turnRate-tel fordul, éles kanyarban lassít", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy(), heading: 0 });
    // 80°-ra a haladási iránytól, még a 180°-os látószögön belül
    const angle = (80 * Math.PI) / 180;
    addFood(world, 400 + Math.cos(angle) * 100, 300 + Math.sin(angle) * 100);

    world.step();

    assert.equal(creature.state, "seeking");
    assert.ok(Math.abs(creature.heading - 0.1) < EPS, `heading: ${creature.heading}`);
    // cos(80°) ≈ 0,17 < 0,2, ezért a minimum tempóval megy
    assert.ok(Math.abs(creature.speed - 0.2) < EPS, `speed: ${creature.speed}`);
});

test("a látószögén kívüli (mögötte lévő) kaját nem látja", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy(), heading: 0 });
    addFood(world, 300, 300);

    world.step();

    assert.equal(creature.seenFoods.length, 0);
    assert.equal(creature.state, "wandering");
});

test("amihez hozzáér, azt a látószögtől függetlenül érzékeli", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { energy: hungryEnergy(), heading: 0 });
    const food = addFood(world, 388, 300); // mögötte, de a méretek összegén belül

    creature.sense(world);

    assert.deepEqual(creature.seenFoods.map((seen) => seen.food), [food]);
});

test("látótávon túl nem lát, azon belül igen", () => {
    const world = makeWorld();
    const creature = addCreature(world, 400, 300, { heading: 0 });
    const near = addFood(world, 549, 300);
    addFood(world, 400, 300 - 151); // 151 px, de a látószög szélén kívül is
    addFood(world, 551, 300 + 1);

    creature.sense(world);

    assert.deepEqual(creature.seenFoods.map((seen) => seen.food), [near]);
});
