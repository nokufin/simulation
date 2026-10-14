// Világ: a pálya, a lények és a kaják, valamint egy szimulációs lépés.
// Nem rajzol, így böngésző nélkül (pl. Node-ban, tesztből) is futtatható.
// Minden véletlen a seedelt `rng`-ből jön: azonos seed + azonos kezdés = azonos futás.
// A környezet (terep, élelem) a világé; az, hogy egy lény hová léphet, a génjeiből
// és a terepből együtt adódik (habitat.js).

import { WORLD_CONFIG, EVOLUTION_CONFIG, FOOD_CONFIG } from "./config.js";
import { Terrain } from "./terrain.js";
import { canOccupyType } from "./habitat.js";
import { Creature } from "./creature.js";
import { Food } from "./food.js";
import { createRng } from "./rng.js";
import { getStrategy } from "./reproduction.js";

// a populációkorlát miatt elutasított szülő ennyi tick múlva próbálkozhat újra
const BLOCKED_RETRY_DELAY = 60;

export class World {
    // settings: a config.js értékei felülírhatók világonként (pl. tesztben).
    // settings.terrain: a terep (terrain.js); ha nincs megadva, csupa szárazföld
    constructor(width, height, seed = 1, settings = {}) {
        this.width = width;
        this.height = height;
        this.seed = seed >>> 0;
        this.rng = createRng(this.seed);
        const { terrain, ...rest } = settings;
        this.terrain = terrain ?? Terrain.flat(width, height);
        this.settings = {
            maxPopulation: WORLD_CONFIG.maxPopulation,
            historyInterval: WORLD_CONFIG.historyInterval,
            historyLength: WORLD_CONFIG.historyLength,
            ...EVOLUTION_CONFIG,
            ...FOOD_CONFIG,
            ...rest,
        };

        this.tick = 0;
        this.creatures = [];
        this.foods = [];
        this.nextCreatureId = 1;

        // születések: a lények a tick-jükben kérik, a lépés végén teljesülnek
        this.birthQueue = [];

        // statisztika
        this.births = 0;
        this.blockedBirths = 0; // populációkorlát miatt elmaradt születések
        this.deaths = 0;
        this.deathCauses = {}; // ok → darab
        this.maxGeneration = 0; // a valaha elért legmagasabb generáció
        this.history = []; // { tick, alive, births, deaths, maxGeneration, avgGeneration }
    }

    // véletlen pont a pályán, a széltől `margin` távolságra
    randomPoint(margin = 0) {
        return {
            x: this.rng.range(margin, this.width - margin),
            y: this.rng.range(margin, this.height - margin),
        };
    }

    // --- környezet ---

    // a pont a pályán belül van, és a gének szerint a lény ott tartózkodhat
    canOccupy(genes, x, y) {
        if (!(x >= 0 && x <= this.width && y >= 0 && y <= this.height)) return false;
        return canOccupyType(genes, this.terrain.typeAt(x, y));
    }

    // véletlen pont, ahol a lény a génjei szerint életképes; ha a véletlen próbák nem
    // találnak ilyet, az első megfelelő cella közepe (null, ha sehol sem életképes)
    randomAccessiblePoint(genes, margin = 0) {
        for (let attempt = 0; attempt < 200; attempt++) {
            const point = this.randomPoint(margin);
            if (this.canOccupy(genes, point.x, point.y)) return point;
        }
        const { terrain } = this;
        for (let i = 0; i < terrain.types.length; i++) {
            if (!canOccupyType(genes, terrain.types[i])) continue;
            const half = terrain.cellSize / 2;
            const x = Math.min((i % terrain.cols) * terrain.cellSize + half, this.width - margin);
            const y = Math.min(Math.floor(i / terrain.cols) * terrain.cellSize + half, this.height - margin);
            return { x: Math.max(x, margin), y: Math.max(y, margin) };
        }
        return null;
    }

    // a kaja új helye a saját élőhelyén (szárazföld: a parttól beljebb, víz: mély víz)
    randomFoodPoint(habitat) {
        const cells = habitat === "water" ? this.terrain.waterFoodCells : this.terrain.landFoodCells;
        if (cells.length === 0) return this.randomPoint(6);
        const cell = cells[Math.floor(this.rng.next() * cells.length)];
        return this.terrain.pointInCell(cell, this.rng);
    }

    // megéri-e megcélozni a kaját (fokozatos regenerációnál a frissen kinőtt még nem)
    isFoodAvailable(food) {
        return food.isEdible(this.settings.regrowth === "gradual" ? this.settings.minEdible : 0);
    }

    spawnCreature(genes, speciesId = null) {
        const { x, y } = this.randomAccessiblePoint(genes, genes.size) ?? this.randomPoint(genes.size);
        const heading = this.rng.angle();
        const creature = new Creature(this.nextCreatureId++, x, y, genes, heading);
        creature.speciesId = speciesId;
        this.creatures.push(creature);
        return creature;
    }

    spawnFood(count, habitat = "land") {
        for (let i = 0; i < count; i++) {
            const food = new Food(this.foods.length + 1, habitat);
            food.respawn(this);
            this.foods.push(food);
        }
    }

    get aliveCount() {
        let count = 0;
        for (const creature of this.creatures) {
            if (creature.alive) count++;
        }
        return count;
    }

    queueBirth(request) {
        this.birthQueue.push(request);
    }

    step() {
        this.tick++;

        for (const creature of this.creatures) {
            creature.update(this);
        }

        this.recordDeaths();

        this.updateFood();

        this.separateCreatures();
        this.removeFadedCorpses();
        this.processBirths();

        if (this.tick % this.settings.historyInterval === 0) {
            this.recordHistory();
        }
    }

    // a lerágott kaja új helyen bukkan fel: azonnal tele (instant), vagy üresen, és
    // fokozatosan nő vissza (gradual; ilyenkor a részben megevett kaja is visszanő)
    updateFood() {
        const gradual = this.settings.regrowth === "gradual";
        for (const food of this.foods) {
            if (gradual) {
                // csak a leevett kaja kerül új helyre; az üresen kihelyezett helyben nő
                if (food.eatenOut) food.respawn(this, 0);
                else food.grow(this.settings.growthRate);
            } else if (food.depleted) {
                food.respawn(this, food.maxAmount);
            }
        }
    }

    // az ebben a tick-ben meghaltak bejegyzése (a halál pillanatában, nem az eltűnéskor)
    recordDeaths() {
        for (const creature of this.creatures) {
            if (!creature.alive && creature.deathTick === null) {
                creature.deathTick = this.tick;
                this.deaths++;
                const cause = creature.causeOfDeath ?? "unknown";
                this.deathCauses[cause] = (this.deathCauses[cause] ?? 0) + 1;
            }
        }
    }

    // a kérelmek beérkezési sorrendben (= a lények sorrendjében) teljesülnek,
    // így a születések sorrendje determinisztikus
    processBirths() {
        const queue = this.birthQueue;
        this.birthQueue = [];
        let alive = this.aliveCount;

        for (const request of queue) {
            if (alive >= this.settings.maxPopulation) {
                // a szülő nem fizet, és egy kis szünet után újra próbálkozhat
                this.blockedBirths++;
                for (const parent of request.parents) {
                    parent.reproductionTimer = BLOCKED_RETRY_DELAY;
                }
                continue;
            }

            const birth = getStrategy(request.strategy).deliver(request, this);
            if (!birth) continue;

            this.spawnOffspring(birth);
            alive++;
        }
    }

    // az utód az (első) szülő mellé születik, véletlen irányban, olyan helyre, ahol a saját
    // génjei szerint életképes; ha a szülő körül nincs ilyen, a szülő helyére
    spawnOffspring({ parents, genes, energy }) {
        const [parent] = parents;
        const start = this.rng.angle();
        const distance = parent.genes.size + genes.size;
        let x = parent.x;
        let y = parent.y;
        for (let k = 0; k < 8; k++) {
            const angle = start + (k * Math.PI) / 4;
            const cx = Math.min(Math.max(parent.x + Math.cos(angle) * distance, genes.size), this.width - genes.size);
            const cy = Math.min(Math.max(parent.y + Math.sin(angle) * distance, genes.size), this.height - genes.size);
            if (this.canOccupy(genes, cx, cy)) {
                x = cx;
                y = cy;
                break;
            }
        }

        const child = new Creature(this.nextCreatureId++, x, y, genes, this.rng.angle());
        child.energy = Math.min(energy, genes.maxEnergy);
        child.generation = Math.max(...parents.map((p) => p.generation)) + 1;
        child.parentId = parent.id;
        child.speciesId = parent.speciesId; // a faj öröklődik, nem mutálódik
        child.birthTick = this.tick;

        for (const p of parents) p.childrenCount++;
        this.births++;
        this.maxGeneration = Math.max(this.maxGeneration, child.generation);
        this.creatures.push(child);
        return child;
    }

    recordHistory() {
        const alive = this.creatures.filter((creature) => creature.alive);
        const generationSum = alive.reduce((sum, creature) => sum + creature.generation, 0);

        this.history.push({
            tick: this.tick,
            alive: alive.length,
            births: this.births,
            deaths: this.deaths,
            maxGeneration: alive.reduce((max, creature) => Math.max(max, creature.generation), 0),
            avgGeneration: alive.length ? generationSum / alive.length : 0,
        });

        if (this.history.length > this.settings.historyLength) {
            this.history.shift();
        }
    }

    // élő lények ne lógjanak egymásba (a holttesteket nem tologatjuk). A tolás senkit
    // nem lökhet olyan terepre, ahol nem életképes: ilyenkor a lény a helyén marad.
    separateCreatures() {
        const alive = this.creatures.filter((creature) => creature.alive);
        const before = alive.map((creature) => [creature.x, creature.y]);

        for (let i = 0; i < alive.length; i++) {
            for (let j = i + 1; j < alive.length; j++) {
                const a = alive[i];
                const b = alive[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distance = Math.hypot(dx, dy) || 0.01;
                const minDistance = a.genes.size + b.genes.size;

                if (distance < minDistance) {
                    const overlap = (minDistance - distance) / 2;
                    const nx = dx / distance;
                    const ny = dy / distance;
                    a.x -= nx * overlap;
                    a.y -= ny * overlap;
                    b.x += nx * overlap;
                    b.y += ny * overlap;
                }
            }
        }

        // a tolás után se lógjon ki senki a pályáról, és ne kerüljön tiltott terepre
        alive.forEach((creature, i) => {
            const { size } = creature.genes;
            creature.x = Math.min(Math.max(creature.x, size), this.width - size);
            creature.y = Math.min(Math.max(creature.y, size), this.height - size);
            if (!this.canOccupy(creature.genes, creature.x, creature.y)) {
                [creature.x, creature.y] = before[i];
            }
        });
    }

    // a teljesen elhalványult holttestek kikerülnek a világból
    removeFadedCorpses() {
        this.creatures = this.creatures.filter(
            (creature) => creature.alive || creature.fadeAlpha > 0,
        );
    }
}
