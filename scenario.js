// Az alap kezdőállapot: ugyanezt használja az app és a tesztek is.

import { WORLD_CONFIG } from "./config.js";
import { World } from "./world.js";
import { Terrain } from "./terrain.js";
import { randomGenes } from "./genetics.js";
import { HABITAT_PROFILES } from "./habitat.js";
import { SPECIES } from "./species.js";

// a config egyes mezői felülírhatók, pl. createDefaultWorld(seed, { initialCreatures: 20 });
// a világszintű beállítások (maxPopulation, mutationRate, regrowth, ...) a World-höz kerülnek.
// species: csak ezekből a fajokból indul (pl. ["blue", "purple"] egy csak vízi világhoz)
export function createDefaultWorld(seed, overrides = {}) {
    const config = { ...WORLD_CONFIG, ...overrides };
    const terrain = Terrain.generate(config.width, config.height, seed, {
        cellSize: config.terrainCellSize,
        waterFraction: config.waterFraction,
    });
    const world = new World(config.width, config.height, seed, { ...overrides, terrain });

    // az alapítók sorban kapják a fajokat: előbb minden faj egyszer (piros, kék, zöld, citromsárga,
    // lila, fekete), utána újra, de a magányos faj (a fekete AI) nélkül, így abból csak egy van.
    // Egyéni színük a faj színe, élőhely-génjeik a faj induló élőhelyének profilja.
    const species = config.species ? SPECIES.filter((s) => config.species.includes(s.id)) : SPECIES;
    const repeating = species.filter((s) => !s.solitary);
    for (let i = 0; i < config.initialCreatures; i++) {
        const kind = i < species.length ? species[i] : repeating[(i - species.length) % repeating.length];
        if (!kind) break; // csak magányos fajból álló világ: egy példány
        const genes = { ...randomGenes(world.rng), ...HABITAT_PROFILES[kind.habitat] };
        genes.hue = kind.hue;
        world.spawnCreature(genes, kind.id);
    }

    world.spawnFood(config.initialLandFood, "land");
    world.spawnFood(config.initialWaterFood, "water");
    return world;
}
