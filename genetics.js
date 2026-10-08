// Gének: alapértékek, kezdeti sorsolás és öröklődés mutációval.
// Két külön tartomány van:
//   SPAWN_GENE_RANGES - ebből sorsol a kezdő világ (szűk, "életképes" sáv)
//   GENE_LIMITS       - a mutáció ezen belül mozoghat (tág, az evolúció terepe)

// gének: ami születéskor eldől és öröklődik
export function defaultGenes() {
    return {
        maxSpeed: 1,
        size: 10,
        visionRange: 150,
        fieldOfView: Math.PI, // a teljes látószög (180°)
        turnRate: 0.1, // max fordulás tick-enként (radián)
        metabolicRate: 0.25,
        eatingSpeed: 0.6, // energia / tick evés közben
        hungerThreshold: 0.25, // ennyi éhség felett kezd kaját keresni
        maxAge: 10000,
        maxHealth: 100,
        maxEnergy: 150,
        hue: 30,

        // szaporodás
        reproductionStrategy: "asexual", // a reproduction.js stratégiái közül
        maturityAge: 2000, // ez előtt nem szaporodhat (tick)
        reproductionThreshold: 0.8, // a maxEnergy ennyi része kell a szaporodáshoz
        offspringEnergy: 60, // ennyi energiával indul az utód
        reproductionCooldown: 1500, // két utód között eltelő idő (tick)
    };
}

export const SPAWN_GENE_RANGES = {
    maxSpeed: [0.6, 1.6],
    size: [7, 14],
    visionRange: [90, 210],
    fieldOfView: [Math.PI * 0.6, Math.PI * 1.4],
    hungerThreshold: [0.15, 0.4],
};

// csak az itt felsorolt gének mutálódnak; a többi változatlanul öröklődik
export const GENE_LIMITS = {
    maxSpeed: [0.2, 4],
    size: [3, 30],
    visionRange: [20, 400],
    fieldOfView: [Math.PI * 0.2, Math.PI * 2],
    hungerThreshold: [0.05, 0.9],
};

// a szín nem korlátos, hanem körbefordul; mutációkor legfeljebb ennyit csúszik (fok)
const HUE_DRIFT = 12;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// egyedi testfelépítés: nagyobb/kisebb, gyorsabb/lassabb, közel/távol látó
export function randomGenes(rng) {
    const genes = defaultGenes();
    for (const [name, [min, max]] of Object.entries(SPAWN_GENE_RANGES)) {
        genes[name] = rng.range(min, max);
    }
    return genes;
}

// a szülő génjeinek másolata: minden mutálható gén `rate` eséllyel ±`strength`
// arányban eltér, majd a GENE_LIMITS-be szorul vissza
export function mutateGenes(genes, rng, { rate, strength }) {
    // hiányzó beállítás csendben "nincs mutáció" lenne: inkább azonnal hibát jelez
    if (!Number.isFinite(rate) || !Number.isFinite(strength)) {
        throw new Error(`érvénytelen mutációs beállítás: rate=${rate}, strength=${strength}`);
    }

    const child = { ...genes };

    for (const [name, [min, max]] of Object.entries(GENE_LIMITS)) {
        if (rng.next() < rate) {
            const factor = 1 + rng.range(-strength, strength);
            child[name] = clamp(genes[name] * factor, min, max);
        }
    }

    if (rng.next() < rate) {
        child.hue = (((genes.hue + rng.range(-HUE_DRIFT, HUE_DRIFT)) % 360) + 360) % 360;
    }

    return child;
}
