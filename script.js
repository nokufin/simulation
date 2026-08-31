const c = document.getElementById("myCanvas");
const ctx = c.getContext("2d");

const crtInfo = document.getElementById("creatureInfo");
const simInfo = document.getElementById("simInfo");

class Creature {
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
        this.maxAge = 6000;
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
        this.eatingDuration = 60;
        this.eatingTimer = 0;
        this.eatingFood = null;

        // szaporodás
        this.reproductionThreshold = 120;
        this.reproductionCost = 60;
        this.reproductionCooldown = 0;

        // viselkedés
        this.diet = "herbivore";
        this.state = "moving";
        this.alive = true;
        this.fadeAlpha = 1;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);

        if (this.alive) {
            ctx.fillStyle = "orange";
            ctx.strokeStyle = "rgb(140, 70, 0)";
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
        if (this.x + this.size > c.width) {
            this.x = c.width - this.size;
            this.directionX *= -1;
        }

        // felső
        if (this.y - this.size < 0) {
            this.y = this.size;
            this.directionY *= -1;
        }

        // alsó
        if (this.y + this.size > c.height) {
            this.y = c.height - this.size;
            this.directionY *= -1;
        }
    }

    eat() {
        // az étel tápértéke az evés ideje alatt oszlik el
        const gain = this.foodValue / this.eatingDuration;
        this.energy = Math.min(this.energy + gain, this.maxEnergy);
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

    getInfo() {
        const bar = (value, max) => {
            const width = 10;
            const filled = Math.round((Math.max(value, 0) / max) * width);
            return "#".repeat(filled) + "-".repeat(width - filled);
        };

        const lines = [
            `#${this.id}  gen ${this.generation}  ${this.state}`,
            `age  ${this.age} / ${this.maxAge}`,
            `hp   ${bar(this.health, this.maxHealth)} ${Math.round(this.health)}`,
            `en   ${bar(this.energy, this.maxEnergy)} ${Math.round(this.energy)}`,
        ];

        if (!this.alive) {
            lines[0] = `#${this.id}  gen ${this.generation}  dead`;
        }

        return lines.join("\n");
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
        this.x = Math.min(Math.max(this.x, this.size), c.width - this.size);
        this.y = Math.min(Math.max(this.y, this.size), c.height - this.size);
    }

    update(foods) {
        if (!this.alive) return;

        if (this.reproductionCooldown > 0) {
            this.reproductionCooldown--;
        }

        if (this.state === "eating") {
            this.eat();
            this.eatingTimer--;

            if (this.eatingTimer <= 0) {
                if (this.eatingFood) {
                    this.eatingFood.respawn();
                }
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

const creatures = [];
for (let i = 0; i < 5; i++) {
    const x = 20 + Math.random() * (c.width - 40);
    const y = 20 + Math.random() * (c.height - 40);
    creatures.push(new Creature(i + 1, x, y));
}

class Food {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 6;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = "cyan";
        ctx.strokeStyle = "rgb(0, 110, 120)";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }

    respawn() {
        this.x = this.size + Math.random() * (c.width - this.size * 2);
        this.y = this.size + Math.random() * (c.height - this.size * 2);
    }
}

const foods = [];
for (let i = 0; i < 16; i++) {
    const food = new Food(0, 0);
    food.respawn();
    foods.push(food);
}

let tick = 0;

function renderSimInfo() {
    const alive = creatures.filter((creature) => creature.alive);
    const generation = creatures.reduce(
        (max, creature) => Math.max(max, creature.generation),
        0,
    );

    const stats = {
        tick: tick,
        alive: `${alive.length} / ${creatures.length}`,
        gen: generation,
        food: foods.length,
    };

    simInfo.innerHTML = Object.entries(stats)
        .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
        .join("");
}

function gameLoop() {
    tick++;
    ctx.clearRect(0, 0, c.width, c.height);

    for (const food of foods) {
        food.draw();
    }

    for (const creature of creatures) {
        creature.update(foods);
    }

    // egyik lény se lóghasson bele a másikba
    for (let i = 0; i < creatures.length; i++) {
        creatures[i].separate(creatures.slice(i + 1));
    }

    for (const creature of creatures) {
        creature.draw();
    }

    crtInfo.textContent = creatures
        .map((creature) => creature.getInfo())
        .join("\n\n");
    renderSimInfo();

    requestAnimationFrame(gameLoop);
}

gameLoop();
