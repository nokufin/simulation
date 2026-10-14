// Szaporodási stratégiák. Minden stratégia két lépésből áll:
//   request(creature, world)  - a lény tick-jében: szaporodna-e most? → kérelem vagy null
//   deliver(request, world)   - a világ lépésének végén: újraellenőriz, levonja a költséget,
//                               és visszaadja az utód adatait ({ parents, genes, energy }) vagy null
// A Creature-t nem ismeri: az utódot a világ hozza létre, így nincs körkörös import.
// Új stratégia (pl. ivaros párkeresés + génkeverés, fajonként más szabályok) egy újabb
// bejegyzés a STRATEGIES-ben; a lény a genes.reproductionStrategy alapján választ.

import { mutateGenes } from "./genetics.js";
import { isSolitarySpecies } from "./species.js";

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

// mi akadályozza most az egyedül (ivartalanul) szaporodást; üres lista = szaporodhat.
// Ugyanezt használja a döntés és a megfigyelő panel, így a kettő nem térhet el.
function soloBlockers(creature, world) {
    const { genes } = creature;
    const cost = birthCost(genes, world.settings.reproductionEfficiency);
    const threshold = genes.maxEnergy * genes.reproductionThreshold;
    const blockers = [];

    if (!creature.alive) {
        blockers.push({ code: "dead" });
        return blockers;
    }
    // a magányos faj (a fekete AI) sosem szaporodik
    if (isSolitarySpecies(creature.speciesId)) {
        blockers.push({ code: "species" });
        return blockers;
    }
    if (creature.age < genes.maturityAge) {
        blockers.push({ code: "immature", ticks: genes.maturityAge - creature.age });
    }
    if (creature.reproductionTimer > 0) {
        blockers.push({ code: "cooldown", ticks: creature.reproductionTimer });
    }
    if (creature.energy < threshold) {
        blockers.push({ code: "energy", needed: threshold - creature.energy });
    } else if (creature.energy <= cost) {
        // a költség után is maradjon energiája
        blockers.push({ code: "energy", needed: cost - creature.energy });
    }
    return blockers;
}

function canReproduceAlone(creature, world) {
    return soloBlockers(creature, world).length === 0;
}

export const STRATEGIES = {
    // ivartalan: egy szülő, az utód a szülő mutált génjeit kapja
    asexual: {
        blockers: soloBlockers,

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

// a lény szaporodási helyzete a megfigyelő számára (csak olvas, semmit nem módosít):
// a stratégia saját akadályai + a világ populációs korlátja
export function reproductionStatus(creature, world) {
    const { genes } = creature;
    const blockers = getStrategy(genes.reproductionStrategy).blockers(creature, world);

    if (creature.alive && world.aliveCount >= world.settings.maxPopulation) {
        blockers.push({ code: "population", limit: world.settings.maxPopulation });
    }

    const waitTicks = Math.max(
        0,
        ...blockers.filter((b) => b.ticks !== undefined).map((b) => b.ticks),
    );

    return {
        mature: creature.age >= genes.maturityAge,
        canReproduce: blockers.length === 0,
        blockers,
        // legalább ennyi tick, mire újra szaporodhat (az energia ezen felül számít)
        waitTicks,
        cost: birthCost(genes, world.settings.reproductionEfficiency),
        offspringEnergy: genes.offspringEnergy,
        energyThreshold: genes.maxEnergy * genes.reproductionThreshold,
    };
}

export function getStrategy(name) {
    const strategy = STRATEGIES[name];
    if (!strategy) {
        throw new Error(`ismeretlen szaporodási stratégia: ${name}`);
    }
    return strategy;
}
