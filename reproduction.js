// Szaporodási stratégiák. Minden stratégia két lépésből áll:
//   request(creature, world)  - a lény tick-jében: szaporodna-e most? → kérelem vagy null
//   deliver(request, world)   - a világ lépésének végén: újraellenőriz, levonja a költséget,
//                               és visszaadja az utód adatait ({ parents, genes, energy }) vagy null
// A Creature-t nem ismeri: az utódot a világ hozza létre, így nincs körkörös import.
// Új stratégia (pl. ivaros párkeresés + génkeverés, fajonként más szabályok) egy újabb
// bejegyzés a STRATEGIES-ben; a lény a genes.reproductionStrategy alapján választ.

import { mutateGenes } from "./genetics.js";

// a szülő által fizetett energia: mindig több, mint amit az utód kap,
// így a szaporodás sosem termel energiát (a hatásfok legfeljebb 1 lehet)
export function birthCost(genes, efficiency) {
    const safeEfficiency = Math.min(Math.max(efficiency, 0.01), 1);
    return genes.offspringEnergy / safeEfficiency;
}

// a világ beállításaiból a mutateGenes által várt formára
function mutationOf(world) {
    return {
        rate: world.settings.mutationRate,
        strength: world.settings.mutationStrength,
    };
}

function canReproduceAlone(creature, world) {
    const { genes } = creature;
    const cost = birthCost(genes, world.settings.reproductionEfficiency);

    return (
        creature.alive &&
        creature.age >= genes.maturityAge &&
        creature.reproductionTimer === 0 &&
        creature.energy >= genes.maxEnergy * genes.reproductionThreshold &&
        creature.energy > cost // a költség után is maradjon energiája
    );
}

export const STRATEGIES = {
    // ivartalan: egy szülő, az utód a szülő mutált génjeit kapja
    asexual: {
        request(creature, world) {
            return canReproduceAlone(creature, world)
                ? { strategy: "asexual", parents: [creature] }
                : null;
        },

        deliver(request, world) {
            const [parent] = request.parents;
            if (!canReproduceAlone(parent, world)) return null;

            parent.energy -= birthCost(parent.genes, world.settings.reproductionEfficiency);
            parent.reproductionTimer = parent.genes.reproductionCooldown;

            return {
                parents: [parent],
                genes: mutateGenes(parent.genes, world.rng, mutationOf(world)),
                energy: parent.genes.offspringEnergy,
            };
        },
    },
};

export function getStrategy(name) {
    const strategy = STRATEGIES[name];
    if (!strategy) {
        throw new Error(`ismeretlen szaporodási stratégia: ${name}`);
    }
    return strategy;
}
