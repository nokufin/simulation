import { canvas, ctx } from "./canvas.js";

export class Creature {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;

        this.directionX = 1;
        this.directionY = 1;

        // genetika (később öröklődik + mutálódik)
        this.generation = 0;
        this.parentId = null;

        // mozgás
        this.maxSpeed = 1;
        this.speed = this.maxSpeed;
        this.turnRate = 0.1;

        // anyagcsere / életciklus
        this.age = 0;
        this.maxAge = 10000;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxEnergy = 150;
        this.energy = this.maxEnergy;
        this.metabolicRate = 0.25;

        // érzékelés
        this.size = 10;
        this.visionRange = 150;
        this.fieldOfView = Math.PI;

        // táplálkozás
        this.foodValue = 50;
        this.eatingDuration = 80;
        this.eatingTimer = 0;
        this.eatingFood = null;

        // szaporodás
        this.reproductionThreshold = 120;
        this.reproductionCost = 60;
        this.reproductionCooldown = 0;

        // viselkedés
        this.diet = "herbivore";
        this.hue = 30;
        this.state = "moving";
        this.alive = true;
        this.fadeAlpha = 1;
    }

    randomizeTraits() {
        const rand = (min, max) => min + Math.random() * (max - min);

        // egyedi testfelépítés: nagyobb/kisebb, gyorsabb/lassabb, közel/távol látó
        this.maxSpeed = rand(0.6, 1.6);
        this.speed = this.maxSpeed;
        this.size = rand(7, 14);
        this.visionRange = rand(90, 210);
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

        if (this.alive) {
            ctx.fillStyle = `hsl(${this.hue}, 70%, 55%)`;
            ctx.strokeStyle = `hsl(${this.hue}, 70%, 28%)`;
            ctx.globalAlpha = 1;
        } else {
            this.fadeAlpha = Math.max(this.fadeAlpha - 0.01, 0.5);
            ctx.fillStyle = "gray";
            ctx.strokeStyle = "rgb(60, 60, 60)";
            ctx.globalAlpha = this.fadeAlpha;
        }

        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // fejlesztői réteg: látótávolság + mozgásirány
    drawDebug() {
        // látótávolság
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.visionRange, 0, Math.PI * 2);
        ctx.strokeStyle = `hsl(${this.hue}, 70%, 55%)`;
        ctx.lineWidth = 1;
        ctx.stroke();

        // mozgásirány
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(
            this.x + this.directionX * this.size * 2,
            this.y + this.directionY * this.size * 2,
        );
        ctx.strokeStyle = `hsl(${this.hue}, 70%, 70%)`;
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    move() {
        this.x += this.directionX * this.speed;
        this.y += this.directionY * this.speed;
        this.checkEnergy();
        this.checkCanvasCollision();
    }

    checkEnergy() {
        // nagyobb / gyorsabb testtel "drágább" az anyagcsere
        const cost =
            this.metabolicRate * (this.maxSpeed / 2) * (this.size / 20);

        if (this.energy > 0) {
            this.energy = Math.max(this.energy - cost, 0);
            this.speed = this.maxSpeed;
        } else {
            this.state = "rest";
            this.speed = 0;
        }
    }

    checkHealth() {
        if (this.state === "rest") {
            this.health -= 0.2;
        }

        // öregkori leépülés
        this.age++;
        if (this.age > this.maxAge) {
            this.health -= 0.2;
        }

        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            this.state = "dead";
        }
    }

    checkCanvasCollision() {
        // bal
        if (this.x - this.size < 0) {
            this.x = this.size;
            this.directionX *= -1;
        }

        // jobb
        if (this.x + this.size > canvas.width) {
            this.x = canvas.width - this.size;
            this.directionX *= -1;
        }

        // felső
        if (this.y - this.size < 0) {
            this.y = this.size;
            this.directionY *= -1;
        }

        // alsó
        if (this.y + this.size > canvas.height) {
            this.y = canvas.height - this.size;
            this.directionY *= -1;
        }
    }

    eat() {
        if (!this.eatingFood) return;

        // ennyit szeretne falni ebben a tick-ben...
        const want = this.foodValue / this.eatingDuration;
        // ...de csak annyit kap, amennyi az adott kajából épp jut
        const got = this.eatingFood.bite(want);

        this.energy = Math.min(this.energy + got, this.maxEnergy);
    }

    findNearestFood(foods) {
        let nearest = null;
        let nearestDistance = Infinity;

        for (const food of foods) {
            const dx = food.x - this.x;
            const dy = food.y - this.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance < nearestDistance) {
                nearest = food;
                nearestDistance = distance;
            }
        }

        return { food: nearest, distance: nearestDistance };
    }

    checkFoodCollision(foods) {
        const { food, distance } = this.findNearestFood(foods);
        if (!food) return;

        if (distance <= this.size + food.size) {
            // nem eszik azonnal tovább: megáll és eszik egy ideig
            this.state = "eating";
            this.eatingTimer = this.eatingDuration;
            this.eatingFood = food;
            this.speed = 0;
        }
    }

    searchFood(foods) {
        const { food, distance } = this.findNearestFood(foods);
        if (!food) return;

        if (distance <= this.visionRange) {
            this.directionX = (food.x - this.x) / distance;
            this.directionY = (food.y - this.y) / distance;
            this.state = "searching";
        }
    }

    getCardHTML() {
        const color = `hsl(${this.hue}, 70%, 55%)`;
        const pct = (value, max) =>
            Math.max(0, Math.min(100, (value / max) * 100));

        const meter = (label, value, max, mod) => `
            <div class="ccard__stat-row">
                <span>${label}</span>
                <span>${Math.round(value)} / ${max}</span>
            </div>
            <div class="ccard__meter">
                <span class="ccard__meter-fill ccard__meter-fill--${mod}" style="width:${pct(value, max)}%"></span>
            </div>`;

        return `
            <div class="ccard${this.alive ? "" : " ccard--dead"}" style="--c:${color}">
                <div class="ccard__head">
                    <span class="ccard__id">#${this.id}</span>
                    <span class="ccard__gen">gen ${this.generation}</span>
                    <span class="ccard__state">${this.alive ? this.state : "dead"}</span>
                </div>
                ${meter("hp", this.health, this.maxHealth, "hp")}
                ${meter("en", this.energy, this.maxEnergy, "en")}
                <div class="ccard__traits">
                    <span>spd ${this.maxSpeed.toFixed(2)}</span>
                    <span>sz ${this.size.toFixed(1)}</span>
                    <span>vis ${Math.round(this.visionRange)}</span>
                    <span>age ${this.age}</span>
                </div>
            </div>`;
    }

    separate(others) {
        for (const other of others) {
            if (other === this) continue;

            const dx = other.x - this.x;
            const dy = other.y - this.y;
            let distance = Math.sqrt(dx * dx + dy * dy);
            const minDistance = this.size + other.size;

            if (distance === 0) distance = 0.01;

            if (distance < minDistance) {
                const overlap = (minDistance - distance) / 2;
                const nx = dx / distance;
                const ny = dy / distance;

                this.x -= nx * overlap;
                this.y -= ny * overlap;
                other.x += nx * overlap;
                other.y += ny * overlap;
            }
        }

        // ne tolódjon ki a pályáról
        this.x = Math.min(Math.max(this.x, this.size), canvas.width - this.size);
        this.y = Math.min(Math.max(this.y, this.size), canvas.height - this.size);
    }

    update(foods) {
        if (!this.alive) return;

        if (this.reproductionCooldown > 0) {
            this.reproductionCooldown--;
        }

        if (this.state === "eating") {
            this.eat();
            this.eatingTimer--;

            const foodGone = !this.eatingFood || this.eatingFood.depleted;
            if (this.eatingTimer <= 0 || foodGone) {
                this.eatingFood = null;
                this.state = "moving";
            }

            this.checkHealth();
            return;
        }

        this.searchFood(foods);
        this.checkFoodCollision(foods);
        this.move();
        this.checkHealth();
    }
}
