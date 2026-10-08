// Lény: tisztán szimulációs logika, nem rajzol és nem ismeri a DOM-ot.
// Minden tick: érzékel (sense) → dönt (think) → cselekszik (act).
// Véletlent csak a világ seedelt rng-jéből használ, így a futás visszajátszható.

import { defaultGenes } from "./genetics.js";
import { getStrategy } from "./reproduction.js";

// a gének a genetics.js-ben vannak; innen is elérhetők a régebbi importok miatt
export { defaultGenes, randomGenes } from "./genetics.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// ennyi éhség alatt jóllakottnak számít, és abbahagyja az evést
const SATIATED = 0.02;

// két szög különbsége a [-π, π] tartományban
function angleDiff(a, b) {
    let diff = (a - b) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;
    return diff;
}

export class Creature {
    constructor(id, x, y, genes = defaultGenes(), heading = 0) {
        this.id = id;
        this.genes = genes;

        // származás
        this.generation = 0;
        this.parentId = null;
        this.birthTick = 0;
        this.childrenCount = 0;
        this.reproductionTimer = 0; // ennyi tick múlva szaporodhat újra

        // helyzet és mozgás
        this.x = x;
        this.y = y;
        this.heading = heading; // irány radiánban
        this.speed = 0;

        // életfunkciók
        this.age = 0;
        this.health = genes.maxHealth;
        this.energy = genes.maxEnergy;
        this.alive = true;
        this.causeOfDeath = null;
        this.deathTick = null; // a világ jegyzi be
        this.fadeAlpha = 1; // holttest elhalványulása

        // gondolkodás
        this.state = "wandering"; // wandering | seeking | eating | exhausted | dead
        this.target = null; // a kiszemelt kaja
        this.targetSpawn = 0; // a kaja melyik "élete" (újraszületés után már nem ugyanaz)
        this.seenFoods = []; // az utolsó érzékeléskor látott kaják: { food, distance }
    }

    // 0 = jóllakott, 1 = teljesen üres
    get hunger() {
        return 1 - this.energy / this.genes.maxEnergy;
    }

    update(world) {
        if (!this.alive) {
            this.fadeAlpha = Math.max(this.fadeAlpha - 0.002, 0);
            return;
        }

        this.age++;
        this.sense(world);
        this.think();
        this.act(world);
        this.updateHealth();

        if (this.alive) {
            this.considerReproduction(world);
        }
    }

    // a saját stratégiája dönti el, szaporodna-e most; a születés a lépés végén történik
    considerReproduction(world) {
        if (this.reproductionTimer > 0) {
            this.reproductionTimer--;
            return;
        }

        const request = getStrategy(this.genes.reproductionStrategy).request(this, world);
        if (request) {
            world.queueBirth(request);
        }
    }

    // --- érzékelés: csak azt látja, ami látótávon és látószögön belül van ---
    sense(world) {
        const { visionRange, fieldOfView } = this.genes;
        this.seenFoods = [];

        for (const food of world.foods) {
            if (food.depleted) continue;

            const distance = this.distanceTo(food);
            if (distance > visionRange) continue;

            // amihez hozzáér, azt látószögtől függetlenül érzékeli
            const angle = Math.atan2(food.y - this.y, food.x - this.x);
            const inView =
                Math.abs(angleDiff(angle, this.heading)) <= fieldOfView / 2;

            if (inView || this.canReach(food)) {
                this.seenFoods.push({ food, distance });
            }
        }
    }

    // --- döntés: az állapotot minden tick-ben újraszámolja, így nem ragad be ---
    think() {
        if (this.energy <= 0) {
            this.state = "exhausted";
            this.target = null;
            return;
        }

        // ha már eszik, addig folytatja, amíg jól nem lakik vagy el nem fogy a kaja.
        // nem a pontos maximumig: az alapanyagcsere minden tick-ben elvesz egy kicsit,
        // így sosem érné el, és örökre ott ragadna
        const stillEating =
            this.state === "eating" &&
            this.isTargetValid() &&
            this.canReach(this.target, 3) &&
            this.hunger > SATIATED;
        if (stillEating) return;

        if (this.hunger < this.genes.hungerThreshold) {
            this.state = "wandering";
            this.target = null;
            return;
        }

        // a korábbi célpont mellett kitart, ha még megvan (akkor is, ha épp nem nézi)
        if (!this.isTargetValid()) {
            this.setTarget(this.nearestSeenFood());
        }

        if (!this.target) {
            this.state = "wandering";
        } else if (this.canReach(this.target)) {
            this.state = "eating";
        } else {
            this.state = "seeking";
        }
    }

    // --- cselekvés: a döntés végrehajtása ---
    act(world) {
        switch (this.state) {
            case "exhausted":
                this.speed = 0;
                break;
            case "eating":
                this.speed = 0;
                this.eat();
                break;
            case "seeking":
                this.steerTowards(this.target.x, this.target.y);
                this.move(world);
                break;
            case "wandering":
                this.wander(world.rng);
                this.move(world);
                break;
        }

        this.burnEnergy();
    }

    updateHealth() {
        const { maxHealth, maxAge } = this.genes;

        if (this.energy <= 0) {
            this.damage(0.2, "starvation");
        } else if (this.hunger < 0.3) {
            // jóllakottan lassan gyógyul
            this.health = Math.min(this.health + 0.02, maxHealth);
        }

        // öregkori leépülés
        if (this.age > maxAge) {
            this.damage(0.2, "old_age");
        }
    }

    damage(amount, cause) {
        this.health -= amount;
        if (this.health <= 0) {
            this.die(cause);
        }
    }

    die(cause) {
        this.health = 0;
        this.alive = false;
        this.state = "dead";
        this.causeOfDeath = cause;
        this.speed = 0;
        this.target = null;
    }

    // --- mozgás ---

    // a cél felé fordul (max turnRate-tel), éles kanyarban lassít, hogy ne keringjen a cél körül
    steerTowards(x, y) {
        const { turnRate, maxSpeed } = this.genes;
        const diff = angleDiff(Math.atan2(y - this.y, x - this.x), this.heading);

        this.heading += clamp(diff, -turnRate, turnRate);
        this.speed = maxSpeed * Math.max(0.2, Math.cos(diff));
    }

    // céltalan bóklászás: kis véletlen kanyarok, energiatakarékos tempó
    wander(rng) {
        this.heading += (rng.next() - 0.5) * this.genes.turnRate;
        this.speed = this.genes.maxSpeed * 0.6;
    }

    move(world) {
        this.x += Math.cos(this.heading) * this.speed;
        this.y += Math.sin(this.heading) * this.speed;
        this.bounceOffWalls(world);
    }

    // falról visszapattan: a megfelelő tengely mentén tükrözi az irányt
    bounceOffWalls(world) {
        const { size } = this.genes;

        if (this.x < size || this.x > world.width - size) {
            this.x = clamp(this.x, size, world.width - size);
            this.heading = Math.PI - this.heading;
        }
        if (this.y < size || this.y > world.height - size) {
            this.y = clamp(this.y, size, world.height - size);
            this.heading = -this.heading;
        }
    }

    // nagyobb testnek és gyorsabb mozgásnak több energia kell; álló helyzetben csak alapanyagcsere
    burnEnergy() {
        const { metabolicRate, size } = this.genes;
        const cost = metabolicRate * (size / 20) * (0.1 + this.speed / 2);
        this.energy = Math.max(this.energy - cost, 0);
    }

    // --- táplálkozás ---

    eat() {
        // csak annyit eszik, amennyi még belefér: nem pazarolja a kaját
        const room = this.genes.maxEnergy - this.energy;
        const got = this.target.bite(Math.min(this.genes.eatingSpeed, room));
        this.energy += got;
    }

    setTarget(food) {
        this.target = food;
        this.targetSpawn = food ? food.spawnCount : 0;
    }

    // a célpont még ugyanaz a kaja-példány, nem fogyott el és nem került túl messzire
    isTargetValid() {
        const food = this.target;
        return (
            food !== null &&
            !food.depleted &&
            food.spawnCount === this.targetSpawn &&
            this.distanceTo(food) <= this.genes.visionRange
        );
    }

    nearestSeenFood() {
        let nearest = null;
        for (const seen of this.seenFoods) {
            if (!nearest || seen.distance < nearest.distance) {
                nearest = seen;
            }
        }
        return nearest ? nearest.food : null;
    }

    canReach(food, slack = 0) {
        return this.distanceTo(food) <= this.genes.size + food.size + slack;
    }

    distanceTo(other) {
        return Math.hypot(other.x - this.x, other.y - this.y);
    }
}
