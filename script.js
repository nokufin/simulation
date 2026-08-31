const c = document.getElementById("myCanvas");
const ctx = c.getContext("2d");

const crtInfo = document.getElementById("creatureInfo");

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
        this.maxSpeed = 2;
        this.speed = this.maxSpeed;
        this.turnRate = 0.1;

        // anyagcsere / életciklus
        this.age = 0;
        this.maxAge = 3000;
        this.maxHealth = 100;
        this.health = this.maxHealth;
        this.maxEnergy = 150;
        this.energy = this.maxEnergy;
        this.metabolicRate = 0.25;

        // érzékelés
        this.size = 20;
        this.visionRange = 150;
        this.fieldOfView = Math.PI;

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
            ctx.globalAlpha = 1;
        } else {
            this.fadeAlpha = Math.max(this.fadeAlpha - 0.01, 0.5);
            ctx.fillStyle = "gray";
            ctx.globalAlpha = this.fadeAlpha;
        }

        ctx.fill();
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
        this.energy = Math.min(this.energy + 50, this.maxEnergy);
    }

    checkFoodCollision(food) {
        const dx = food.x - this.x;
        const dy = food.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.size + food.size) {
            this.eat();
            food.respawn();
        }
    }

    searchFood(food) {
        const dx = food.x - this.x;
        const dy = food.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance <= this.visionRange) {
            this.directionX = dx / distance;
            this.directionY = dy / distance;
            this.state = "searching";
        }
    }

    getInfo() {
        const lines = [
            `id: ${this.id}`,
            `gen: ${this.generation}`,
            `age: ${this.age} / ${this.maxAge}`,
            `x: ${Math.round(this.x)}, y: ${Math.round(this.y)}`,
            `health: ${Math.round(this.health)} / ${this.maxHealth}`,
            `energy: ${Math.round(this.energy)} / ${this.maxEnergy}`,
            `state: ${this.state}`,
        ];

        return lines.join("\n");
    }

    update() {
        if (this.alive) {
            if (this.reproductionCooldown > 0) {
                this.reproductionCooldown--;
            }

            this.searchFood(food);
            this.checkFoodCollision(food);
            this.move();
            this.checkHealth();
        }

        this.draw();
    }
}

const creature = new Creature(1, 20, 20);

class Food {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 10;
    }

    draw() {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = "cyan";
        ctx.fill();
    }

    respawn() {
        this.x = this.size + Math.random() * (c.width - this.size * 2);
        this.y = this.size + Math.random() * (c.height - this.size * 2);
    }
}

const food = new Food(160, 60);

function gameLoop() {
    ctx.clearRect(0, 0, c.width, c.height);
    food.draw();
    creature.update();

    crtInfo.textContent = creature.getInfo();

    requestAnimationFrame(gameLoop);
}

gameLoop();
