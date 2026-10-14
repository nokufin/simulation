// Lény: tisztán szimulációs logika, nem rajzol és nem ismeri a DOM-ot.
// Minden tick: érzékel (sense) → dönt (think) → cselekszik (act).
// Az AI-faj lényeinél a döntést egy külső "szándék" (aiIntent) is irányíthatja: ezt a böngészőben
// az ai-brain.js tölti ki egy nyelvi modell válaszából. A lény maga csak követi (szinkron,
// véletlen nélkül), így a szándékkövetés is tesztelhető és determinisztikus.
// Véletlent csak a világ seedelt rng-jéből használ, így a futás visszajátszható.

import { defaultGenes } from "./genetics.js";
import { getStrategy } from "./reproduction.js";
import { mobilityOn } from "./habitat.js";

// a gének a genetics.js-ben vannak; innen is elérhetők a régebbi importok miatt
export { defaultGenes, randomGenes } from "./genetics.js";

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

// ennyi éhség alatt jóllakottnak számít, és abbahagyja az evést
const SATIATED = 0.02;

// ha keresés közben ennyi tick alatt sem jut közelebb a célponthoz, feladja...
const STALL_TICKS = 90;
// ...és ennyi ideig nem választja újra ugyanazt a kaját
const IGNORE_TICKS = 900;
// akadálykerüléskor a választott fordulási oldalt ennyi tick-ig megtartja (nem remeg)
const AVOID_SIDE_TICKS = 45;
// ha mozogni próbál, de ennyi tick alatt alig jut előre (pl. egy mozdulatlan társ zárja el
// a keskeny átjárót, és a szétlökés mindig visszatolja), elfordul, mint egy akadálytól
const BLOCKED_TICKS = 30;
// kerüléskor ennyi px-ig méri, merre nyílik a terep
const OPEN_LOOKAHEAD = 120;
// AI-felfedezéskor a pálya szélétől ennyire állva a szándék véget ér (nem tapad a falra)
const EXPLORE_EDGE_MARGIN = 30;

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
        this.speciesId = null; // a species.js egyik faja; az utód a szülőtől örökli
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

        // navigáció a terepen
        this.ignoredFoods = new Map(); // kaja id → { spawn, until }: elérhetetlennek bizonyult célpontok
        this.seekBestDistance = Infinity; // keresés közben a célponthoz eddig elért legkisebb távolság
        this.seekStall = 0; // ennyi tick óta nem jutott közelebb
        this.avoidSide = 0; // akadálykerüléskor: +1 balra, -1 jobbra, 0 = nincs kiválasztva
        this.avoidTimer = 0;
        this.lastX = x; // az előző lépés kiindulópontja (a tényleges haladás méréséhez)
        this.lastY = y;
        this.blockedTicks = 0; // ennyi tick óta próbál mozogni, de alig halad

        // AI-szándék (csak az AI-fajnál, lásd ai-brain.js): { action, until, reason, ... } vagy null.
        // action: "seek" (foodId, foodSpawn) | "explore" (heading) | "rest"
        this.aiIntent = null;
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
        this.think(world);
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

    // --- érzékelés: csak azt látja, ami látótávon és látószögön belül van, és csak olyan
    // kaját vesz számba, amely a saját bejárható terepén van ---
    sense(world) {
        const { visionRange, fieldOfView } = this.genes;
        this.seenFoods = [];

        for (const food of world.foods) {
            if (!world.isFoodAvailable(food)) continue;
            if (!world.canOccupy(this.genes, food.x, food.y)) continue;

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
    think(world) {
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

        // az AI legutóbbi, még érvényes döntése felülírja a beépített döntést
        if (this.aiIntent && this.followIntent(world)) return;

        if (this.hunger < this.genes.hungerThreshold) {
            this.state = "wandering";
            this.target = null;
            return;
        }

        // a korábbi célpont mellett kitart, ha még megvan (akkor is, ha épp nem nézi),
        // hacsak nem bizonyult elérhetetlennek
        if (this.isTargetValid() && world?.terrain.hasWater && this.isStalled(world)) {
            this.ignoreTarget(world);
        }
        if (!this.isTargetValid()) {
            this.setTarget(world ? this.chooseReachableFood(world) : this.nearestSeenFood());
        }

        if (!this.target) {
            this.state = "wandering";
        } else if (this.canReach(this.target)) {
            this.state = "eating";
        } else {
            this.state = "seeking";
        }
    }

    // Az AI-szándék követése. true: a szándék szerint döntött; false: a szándék lejárt vagy
    // értelmét vesztette (ilyenkor törli), és a beépített logika dönt helyette.
    followIntent(world) {
        const intent = this.aiIntent;
        if (!world || world.tick > intent.until) {
            this.aiIntent = null;
            return false;
        }

        switch (intent.action) {
            case "seek": {
                // a választott kaja-példány még ott van, ehető, és a lény terepén van
                const food = world.foods.find((f) => f.id === intent.foodId);
                const valid =
                    food &&
                    food.spawnCount === intent.foodSpawn &&
                    world.isFoodAvailable(food) &&
                    world.canOccupy(this.genes, food.x, food.y);
                if (!valid) break;

                if (this.target !== food) this.setTarget(food);
                if (this.canReach(food)) {
                    // odaért: az evést már a beépített logika viszi végig
                    this.state = "eating";
                    this.aiIntent = null;
                    return true;
                }
                if (world.terrain.hasWater && this.isStalled(world)) {
                    this.ignoreTarget(world);
                    break;
                }
                this.state = "seeking";
                return true;
            }
            case "explore": {
                // ha közben megéhezik és kaját lát, vagy a pálya széléhez ért, a beépített logika
                // veszi át (az új helyzetről a modell újra dönthet)
                const hungryWithFood = this.hunger >= this.genes.hungerThreshold && this.seenFoods.length > 0;
                const aheadX = this.x + Math.cos(intent.heading) * EXPLORE_EDGE_MARGIN;
                const aheadY = this.y + Math.sin(intent.heading) * EXPLORE_EDGE_MARGIN;
                const atEdge = aheadX < 0 || aheadX > world.width || aheadY < 0 || aheadY > world.height;
                if (hungryWithFood || atEdge) break;

                this.state = "exploring";
                this.setTarget(null);
                return true;
            }
            case "rest":
                this.state = "resting";
                this.setTarget(null);
                return true;
        }

        this.aiIntent = null;
        return false;
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
            case "resting":
                // AI-döntés: áll, csak az alapanyagcsere fogy
                this.speed = 0;
                break;
            case "exploring":
                this.headTowards(this.aiIntent.heading);
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

    // AI-felfedezés: a választott irány felé fordul (max turnRate-tel), a bóklászásnál gyorsabban
    headTowards(angle) {
        const { turnRate, maxSpeed } = this.genes;
        this.heading += clamp(angleDiff(angle, this.heading), -turnRate, turnRate);
        this.speed = maxSpeed * 0.8;
    }

    // céltalan bóklászás: kis véletlen kanyarok, energiatakarékos tempó
    wander(rng) {
        this.heading += (rng.next() - 0.5) * this.genes.turnRate;
        this.speed = this.genes.maxSpeed * 0.6;
    }

    // A tervezett sebességet (steerTowards / wander) a terep szerinti mozgékonyság szorozza.
    // Tiltott terepre nem lép: előtte kerülőirányt keres, és ha mégsem tud lépni, áll.
    move(world) {
        if (this.avoidTimer > 0) this.avoidTimer--;
        this.speed *= mobilityOn(this.genes, world.terrain.typeAt(this.x, this.y));

        if (world.terrain.hasWater) {
            // tényleges haladás az előző lépés óta (a szétlökéssel együtt)
            const progress = Math.hypot(this.x - this.lastX, this.y - this.lastY);
            this.blockedTicks = this.speed > 0.05 && progress < this.speed * 0.2 ? this.blockedTicks + 1 : 0;

            if (this.blockedTicks >= BLOCKED_TICKS) {
                this.blockedTicks = 0;
                this.avoidSide = this.avoidSide || 1;
                this.heading += this.avoidSide * (Math.PI / 2);
                this.avoidTimer = AVOID_SIDE_TICKS;
            }
            if (!this.isDirectionClear(world, this.heading)) this.avoidObstacle(world);
        }
        this.lastX = this.x;
        this.lastY = this.y;

        const fromX = this.x;
        const fromY = this.y;
        const nx = this.x + Math.cos(this.heading) * this.speed;
        const ny = this.y + Math.sin(this.heading) * this.speed;
        if (world.canOccupy(this.genes, nx, ny)) {
            this.x = nx;
            this.y = ny;
        } else {
            this.speed = 0;
        }
        this.bounceOffWalls(world);

        // a pálya szélén a visszaszorítás sem vihet tiltott terepre
        if (!world.canOccupy(this.genes, this.x, this.y)) {
            this.x = fromX;
            this.y = fromY;
            this.speed = 0;
        }
    }

    // a haladási irányban kis távolságon belül végig bejárható-e a terep. Sűrűn, a közvetlen
    // lépéstől kezdve vizsgál: átlós partnál a következő lépés egy tiltott cella sarkába
    // csúszhat, miközben a távolabbi pontok szabadok (ettől korábban beragadt a lény)
    isDirectionClear(world, angle) {
        const reach = this.genes.size + 6;
        for (let d = 1; d <= reach; d = d < reach && d + 3 > reach ? reach : d + 3) {
            const x = this.x + Math.cos(angle) * d;
            const y = this.y + Math.sin(angle) * d;
            // a pálya széle nem akadály: azt a visszapattanás kezeli
            if (x < 0 || x > world.width || y < 0 || y > world.height) continue;
            if (!world.canOccupy(this.genes, x, y)) return false;
        }
        return true;
    }

    // kerülőirány: a választott oldalon a szabad irányok közül azt választja, amerre a
    // leghosszabb a szabad út (így zsákutcából, öbölből a nyílt terep felé tart). Az oldalt
    // egy ideig megtartja, így a part mentén nem fordulgat jobbra-balra.
    avoidObstacle(world) {
        const step = Math.PI / 12;
        if (this.avoidTimer <= 0 || this.avoidSide === 0) {
            this.avoidSide = this.closerFreeSide(world, step);
        }

        let best = null;
        let bestLength = 0;
        for (let k = 1; k <= 12; k++) {
            const angle = this.heading + this.avoidSide * k * step;
            if (!this.isDirectionClear(world, angle)) continue;
            const length = this.freeLength(world, angle);
            if (length > bestLength) {
                best = angle;
                bestLength = length;
            }
        }
        if (best !== null) {
            this.heading = best;
            this.avoidTimer = AVOID_SIDE_TICKS;
            return;
        }
        // zsákutca: megfordul, és a másik oldalt próbálja
        this.heading += Math.PI;
        this.avoidSide = -this.avoidSide;
        this.avoidTimer = AVOID_SIDE_TICKS;
    }

    // milyen hosszan szabad az út egy irányban (legfeljebb OPEN_LOOKAHEAD px-ig)
    freeLength(world, angle) {
        const stepLength = world.terrain.cellSize / 2;
        let length = 0;
        while (length < OPEN_LOOKAHEAD) {
            const d = length + stepLength;
            const x = this.x + Math.cos(angle) * d;
            const y = this.y + Math.sin(angle) * d;
            if (x < 0 || x > world.width || y < 0 || y > world.height) break;
            if (!world.canOccupy(this.genes, x, y)) break;
            length = d;
        }
        return length;
    }

    // melyik oldalon van közelebb szabad irány (+1 bal, -1 jobb; döntetlennél bal)
    closerFreeSide(world, step) {
        for (let k = 1; k <= 12; k++) {
            if (this.isDirectionClear(world, this.heading + k * step)) return 1;
            if (this.isDirectionClear(world, this.heading - k * step)) return -1;
        }
        return 1;
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
        if (food !== this.target) {
            this.seekBestDistance = Infinity;
            this.seekStall = 0;
        }
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

    // a legközelebbi olyan látott kaja, amely felé szabad út vezet, és nincs félretéve
    chooseReachableFood(world) {
        const candidates = [...this.seenFoods].sort((a, b) => a.distance - b.distance);
        for (const { food } of candidates) {
            const ignored = this.ignoredFoods.get(food.id);
            if (ignored && ignored.spawn === food.spawnCount && ignored.until > world.tick) continue;
            if (!world.terrain.hasWater || this.hasClearPath(world, food)) return food;
        }
        return null;
    }

    // egyenes vonalban, végig bejárható terepen elérhető-e a kaja
    hasClearPath(world, food) {
        const distance = this.distanceTo(food);
        const steps = Math.ceil(distance / (world.terrain.cellSize / 2));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (!world.canOccupy(this.genes, this.x + (food.x - this.x) * t, this.y + (food.y - this.y) * t)) {
                return false;
            }
        }
        return true;
    }

    // keresés közben: jut-e közelebb a célponthoz
    isStalled(world) {
        if (this.state !== "seeking") return false;
        const distance = this.distanceTo(this.target);
        if (distance < this.seekBestDistance - 0.5) {
            this.seekBestDistance = distance;
            this.seekStall = 0;
            return false;
        }
        this.seekStall++;
        return this.seekStall > STALL_TICKS;
    }

    // a célpont elérhetetlennek bizonyult: egy ideig nem választja újra
    ignoreTarget(world) {
        this.ignoredFoods.set(this.target.id, { spawn: this.target.spawnCount, until: world.tick + IGNORE_TICKS });
        for (const [id, entry] of this.ignoredFoods) {
            if (entry.until <= world.tick) this.ignoredFoods.delete(id);
        }
        this.setTarget(null);
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
