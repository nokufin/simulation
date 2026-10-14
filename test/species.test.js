import { test } from "node:test";
import assert from "node:assert/strict";
import { SPECIES, UNKNOWN_SPECIES, getSpecies } from "../species.js";
import { createDefaultWorld } from "../scenario.js";
import { World } from "../world.js";
import { randomGenes } from "../genetics.js";
import { describeCreature } from "../inspector.js";
import { WORLD_CONFIG } from "../config.js";
import { Terrain } from "../terrain.js";
import { HABITAT_PROFILES } from "../habitat.js";
import { makeWorld, addReadyParent, run, snapshot } from "./helpers.js";

test("a 6 faj: egyedi kulcs, név, szín és induló élőhely", () => {
    assert.deepEqual(
        SPECIES.map((s) => [s.id, s.name, s.hue, s.habitat]),
        [
            ["red", "Piros", 0, "land"],
            ["blue", "Kék", 205, "water"],
            ["green", "Zöld", 130, "land"],
            ["yellow", "Citromsárga", 55, "land"],
            ["purple", "Lila", 280, "water"],
            ["black", "Fekete (AI)", 0, "land"],
        ],
    );
    assert.equal(new Set(SPECIES.map((s) => s.id)).size, 6);
    assert.ok(Object.isFrozen(SPECIES) && SPECIES.every(Object.isFrozen));
});

test("ismeretlen fajkulcsra a faj nélküli csoport jön vissza", () => {
    assert.equal(getSpecies("blue").name, "Kék");
    assert.equal(getSpecies(null), UNKNOWN_SPECIES);
    assert.equal(getSpecies("dragon"), UNKNOWN_SPECIES);
});

test("az alapítók sorban kapják a fajokat, egyéni színük a faj színe", () => {
    const world = createDefaultWorld(1, { initialCreatures: 12 });

    const repeating = SPECIES.filter((s) => !s.solitary);
    world.creatures.forEach((creature, i) => {
        const species = i < SPECIES.length ? SPECIES[i] : repeating[(i - SPECIES.length) % repeating.length];
        assert.equal(creature.speciesId, species.id, `#${creature.id}`);
        assert.equal(creature.genes.hue, species.hue);
    });
});

test("az utód örökli a szülő faját", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 640, 300, { speciesId: "blue" });

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    assert.equal(child.speciesId, "blue");
});

test("a faj akkor is öröklődik, ha minden gén (a szín is) mutálódik", () => {
    const world = makeWorld(3, { mutationRate: 1, mutationStrength: 0.5 });
    const parent = addReadyParent(world, 640, 300, { speciesId: "green", genes: { hue: 130 } });

    world.step();

    const child = world.creatures.find((c) => c.parentId === parent.id);
    assert.notEqual(child.genes.hue, 130, "a szín nem mutálódott, a teszt nem bizonyít");
    assert.equal(child.speciesId, "green");
});

test("hosszú futásban minden lénynek van faja, és mindegyik a szülője faját hordozza", () => {
    const world = createDefaultWorld(9);
    const speciesOf = new Map(world.creatures.map((c) => [c.id, c.speciesId]));
    let checked = 0;

    for (let t = 0; t < 20000; t++) {
        world.step();
        for (const creature of world.creatures) {
            if (speciesOf.has(creature.id)) continue;
            assert.ok(SPECIES.some((s) => s.id === creature.speciesId), `#${creature.id} faj nélkül`);
            assert.equal(creature.speciesId, speciesOf.get(creature.parentId), `#${creature.id}`);
            speciesOf.set(creature.id, creature.speciesId);
            checked++;
        }
    }
    assert.ok(checked > 20, `kevés születés: ${checked}`);
});

test("a fajmező bevezetése nem változtat a futáson (azonos seed → azonos eredmény, mint faj nélkül)", () => {
    // a magányos (fekete AI) faj szándékosan másképp él (nem szaporodik), ezért nélküle
    const ordinary = SPECIES.filter((s) => !s.solitary);
    const withSpecies = createDefaultWorld(21, { species: ordinary.map((s) => s.id) });

    // ugyanaz a (terepes) kezdés, csak a lények fajmezője nélkül
    const terrain = Terrain.generate(WORLD_CONFIG.width, WORLD_CONFIG.height, 21, {
        cellSize: WORLD_CONFIG.terrainCellSize,
        waterFraction: WORLD_CONFIG.waterFraction,
    });
    const without = new World(WORLD_CONFIG.width, WORLD_CONFIG.height, 21, { terrain });
    for (let i = 0; i < WORLD_CONFIG.initialCreatures; i++) {
        const kind = ordinary[i % ordinary.length];
        const genes = { ...randomGenes(without.rng), ...HABITAT_PROFILES[kind.habitat] };
        genes.hue = kind.hue;
        without.spawnCreature(genes);
    }
    without.spawnFood(WORLD_CONFIG.initialLandFood, "land");
    without.spawnFood(WORLD_CONFIG.initialWaterFood, "water");

    run(withSpecies, 15000);
    run(without, 15000);

    const strip = (world) => snapshot(world).replace(/"speciesId":(null|"[a-z]+"),/g, "");
    assert.equal(strip(withSpecies), strip(without));
    assert.ok(withSpecies.births > 0);
});

test("a megfigyelő panel mutatja a fajt a színével", () => {
    const world = makeWorld();
    const creature = addReadyParent(world, 640, 300, { speciesId: "purple" });

    const identity = describeCreature(creature, world).sections.find((s) => s.key === "identity");
    const row = identity.rows.find((r) => r.key === "species");
    assert.equal(row.value, "Lila");
    assert.equal(row.swatch, 280);
});
