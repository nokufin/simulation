// Az alap kezdőállapot: ugyanezt használja az app és a tesztek is.

import { WORLD_CONFIG } from "./config.js";
import { World } from "./world.js";
import { randomGenes } from "./genetics.js";

// fix szín minden casthoz (spawn-sorrend szerint, HSL hue)
const CAST_HUES = [
    0, // #1 - piros
    40, // #2 - narancs
    130, // #3 - zöld
    205, // #4 - kék
    280, // #5 - lila
];

// a config egyes mezői felülírhatók, pl. createDefaultWorld(seed, { initialCreatures: 20 });
// a világszintű beállítások (maxPopulation, mutationRate, ...) a World-höz kerülnek
export function createDefaultWorld(seed, overrides = {}) {
    const config = { ...WORLD_CONFIG, ...overrides };
    const world = new World(config.width, config.height, seed, overrides);

    for (let i = 0; i < config.initialCreatures; i++) {
        const genes = randomGenes(world.rng);
        genes.hue = CAST_HUES[i % CAST_HUES.length];
        world.spawnCreature(genes);
    }

    world.spawnFood(config.initialFood);
    return world;
}
