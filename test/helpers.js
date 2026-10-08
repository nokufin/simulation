// Közös segédek a tesztekhez: kézzel összerakott, kis világok pontos helyzetekkel.

import { World } from "../world.js";
import { Creature, defaultGenes } from "../creature.js";
import { Food } from "../food.js";

// a kézzel összerakott tesztvilágok szándékosan fix méretűek (nem a config.js-ből),
// hogy a pálya átméretezése ne törje el a konkrét koordinátákra épülő teszteket
export const WIDTH = 1280;
export const HEIGHT = 600;

export function makeWorld(seed = 1, settings = {}) {
    return new World(WIDTH, HEIGHT, seed, settings);
}

// ivarérett, tele energiájú lény: a következő tick-ben szaporodni fog
export function addReadyParent(world, x, y, options = {}) {
    return addCreature(world, x, y, { age: 5000, ...options });
}

// lény a megadott helyen, alapgénekkel (felülírhatók), opcionális kezdőállapottal
export function addCreature(world, x, y, { genes = {}, heading = 0, ...state } = {}) {
    const creature = new Creature(
        world.nextCreatureId++,
        x,
        y,
        { ...defaultGenes(), ...genes },
        heading,
    );
    Object.assign(creature, state);
    world.creatures.push(creature);
    return creature;
}

// kaja a megadott helyen (nem véletlen helyre, mint a respawn)
export function addFood(world, x, y, amount) {
    const food = new Food(world.foods.length + 1);
    food.x = x;
    food.y = y;
    if (amount !== undefined) food.amount = amount;
    world.foods.push(food);
    return food;
}

export function run(world, ticks) {
    for (let i = 0; i < ticks; i++) world.step();
}

// a világ teljes, összehasonlítható állapota (determinizmus-teszthez)
export function snapshot(world) {
    return JSON.stringify({
        tick: world.tick,
        deaths: world.deaths,
        births: world.births,
        blockedBirths: world.blockedBirths,
        deathCauses: world.deathCauses,
        history: world.history,
        creatures: world.creatures.map((c) => ({
            id: c.id,
            speciesId: c.speciesId,
            generation: c.generation,
            parentId: c.parentId,
            birthTick: c.birthTick,
            childrenCount: c.childrenCount,
            reproductionTimer: c.reproductionTimer,
            x: c.x,
            y: c.y,
            heading: c.heading,
            speed: c.speed,
            energy: c.energy,
            health: c.health,
            age: c.age,
            state: c.state,
            target: c.target ? c.target.id : null,
            genes: c.genes,
            causeOfDeath: c.causeOfDeath,
        })),
        foods: world.foods.map((f) => ({
            id: f.id,
            x: f.x,
            y: f.y,
            amount: f.amount,
            spawnCount: f.spawnCount,
        })),
    });
}

// éhes, de egyébként alap lény energiája (az éhségküszöb felett)
export function hungryEnergy(genes = defaultGenes()) {
    return genes.maxEnergy * 0.5;
}
