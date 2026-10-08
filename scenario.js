// Az alap kezdőállapot: ugyanezt használja az app és a tesztek is.

import { WORLD_CONFIG } from "./config.js";
import { World } from "./world.js";
import { randomGenes } from "./genetics.js";
import { SPECIES } from "./species.js";

// a config egyes mezői felülírhatók, pl. createDefaultWorld(seed, { initialCreatures: 20 });
// a világszintű beállítások (maxPopulation, mutationRate, ...) a World-höz kerülnek
export function createDefaultWorld(seed, overrides = {}) {
    const config = { ...WORLD_CONFIG, ...overrides };
    const world = new World(config.width, config.height, seed, overrides);

    // az alapítók sorban kapják a fajokat (piros, narancs, zöld, kék, lila, majd újra),
    // és egyéni színük a faj színéből indul
    for (let i = 0; i < config.initialCreatures; i++) {
        const species = SPECIES[i % SPECIES.length];
        const genes = randomGenes(world.rng);
        genes.hue = species.hue;
        world.spawnCreature(genes, species.id);
    }

    world.spawnFood(config.initialFood);
    return world;
}
