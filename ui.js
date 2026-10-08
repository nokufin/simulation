const crtInfo = document.getElementById("creatureInfo");
const simInfo = document.getElementById("simInfo");
const foodInfo = document.getElementById("foodInfo");
const popInfo = document.getElementById("popInfo");
const popChart = document.getElementById("popChart");
const speedBar = document.getElementById("speed");
const pauseBtn = document.getElementById("pauseBtn");
const stepBtn = document.getElementById("stepBtn");

// a gyorsítás gombok bekötése; onChange(újSebesség) hívódik kattintáskor
export function initSpeedControl(onChange) {
    speedBar.addEventListener("click", (event) => {
        const button = event.target.closest("button");
        if (!button) return;

        for (const other of speedBar.children) {
            other.classList.toggle("is-active", other === button);
        }
        onChange(Number(button.dataset.speed));
    });
}

// pause / step gombok; onTogglePause() adja vissza az új (boolean) állapotot
export function initSimControls({ onTogglePause, onStep }) {
    pauseBtn.addEventListener("click", () => {
        const paused = onTogglePause();
        // szünetben a play ikon látszik + kék kiemelés
        pauseBtn.classList.toggle("is-paused", paused);
        pauseBtn.classList.toggle("is-active", paused);
    });
    stepBtn.addEventListener("click", () => {
        onStep();

        // rövid felvillanás, hogy egy gyors kattintás is látsszon
        stepBtn.classList.add("flash");
        setTimeout(() => stepBtn.classList.remove("flash"), 120);
    });
}

// az élők elöl (a legfiatalabbak az elején), a halottak a végén
export function renderCreatures(creatures) {
    const sorted = [...creatures].sort(
        (a, b) => Number(b.alive) - Number(a.alive) || b.id - a.id,
    );
    crtInfo.innerHTML = sorted.map(creatureCardHTML).join("");
}

function creatureCardHTML(creature) {
    const { hue, maxHealth, maxEnergy, maxSpeed, size, visionRange, fieldOfView } =
        creature.genes;
    const color = `hsl(${hue}, 70%, 55%)`;
    const pct = (value, max) => Math.max(0, Math.min(100, (value / max) * 100));

    const meter = (label, value, max, mod) => `
        <div class="ccard__stat-row">
            <span>${label}</span>
            <span>${Math.round(value)} / ${max}</span>
        </div>
        <div class="ccard__meter">
            <span class="ccard__meter-fill ccard__meter-fill--${mod}" style="width:${pct(value, max)}%"></span>
        </div>`;

    // halott lénynél a halál oka látszik az állapot helyén
    const state = creature.alive ? creature.state : creature.causeOfDeath;
    const fovDegrees = Math.round((fieldOfView * 180) / Math.PI);
    const parent = creature.parentId === null ? "founder" : `parent #${creature.parentId}`;
    const lineage = `${parent} · ${creature.childrenCount} children`;

    return `
        <div class="ccard${creature.alive ? "" : " ccard--dead"}" style="--c:${color}">
            <div class="ccard__head">
                <span class="ccard__id">#${creature.id}</span>
                <span class="ccard__gen">gen ${creature.generation}</span>
                <span class="ccard__state">${state}</span>
            </div>
            <div class="ccard__lineage">${lineage}</div>
            ${meter("hp", creature.health, maxHealth, "hp")}
            ${meter("en", creature.energy, maxEnergy, "en")}
            <div class="ccard__traits">
                <span>spd ${maxSpeed.toFixed(2)}</span>
                <span>sz ${size.toFixed(1)}</span>
                <span>vis ${Math.round(visionRange)}</span>
                <span>fov ${fovDegrees}°</span>
                <span>age ${creature.age}</span>
            </div>
        </div>`;
}

export function renderSimInfo(world) {
    const { foods } = world;

    const biomass = Math.round(
        foods.reduce((sum, food) => sum + food.amount, 0),
    );
    const biomassMax = foods.reduce((sum, food) => sum + food.maxAmount, 0);

    const stats = {
        seed: world.seed,
        tick: world.tick,
        alive: world.aliveCount,
        births: world.births,
        deaths: world.deaths,
        gen: world.maxGeneration,
        food: `${biomass} / ${biomassMax}`,
    };

    simInfo.innerHTML = Object.entries(stats)
        .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
        .join("");
}

export function renderFoodInfo(foods) {
    foodInfo.innerHTML = foods
        .map((food) => {
            const pct = (food.amount / food.maxAmount) * 100;
            return `
                <div class="frow">
                    <span class="frow__id">#${food.id}</span>
                    <span class="frow__meter">
                        <span class="frow__meter-fill" style="width:${pct}%"></span>
                    </span>
                    <span class="frow__num">${Math.round(food.amount)} / ${food.maxAmount}</span>
                </div>`;
        })
        .join("");
}

// populáció panel: grafikon (élők + átlagos generáció) és összesítő számok
export function renderPopulation(world) {
    const alive = world.creatures.filter((creature) => creature.alive);
    const avgGen = alive.length
        ? alive.reduce((sum, creature) => sum + creature.generation, 0) / alive.length
        : 0;
    const causes = world.deathCauses;

    const stats = {
        "alive / limit": `${alive.length} / ${world.settings.maxPopulation}`,
        births: world.births,
        "deaths: starvation": causes.starvation ?? 0,
        "deaths: old age": causes.old_age ?? 0,
        "gen now (avg / max)": `${avgGen.toFixed(1)} / ${alive.reduce((max, c) => Math.max(max, c.generation), 0)}`,
        "gen record": world.maxGeneration,
        "births blocked by limit": world.blockedBirths,
    };

    popInfo.innerHTML = Object.entries(stats)
        .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
        .join("");

    drawPopulationChart(world.history);
}

function drawPopulationChart(history) {
    const ctx = popChart.getContext("2d");
    const { width, height } = popChart;
    const pad = 4;
    ctx.clearRect(0, 0, width, height);

    if (history.length < 2) {
        ctx.fillStyle = "rgb(110, 110, 110)";
        ctx.font = "22px system-ui, sans-serif";
        ctx.fillText("collecting data…", 12, height / 2 + 8);
        return;
    }

    // mindkét vonal a saját maximumához skálázva
    const maxAlive = Math.max(10, ...history.map((h) => h.alive));
    const maxGen = Math.max(1, ...history.map((h) => h.avgGeneration));
    const x = (i) => pad + (i / (history.length - 1)) * (width - pad * 2);
    const y = (value, max) => height - pad - (value / max) * (height - pad * 2);

    const line = (key, max, color) => {
        ctx.beginPath();
        history.forEach((h, i) => {
            if (i === 0) ctx.moveTo(x(i), y(h[key], max));
            else ctx.lineTo(x(i), y(h[key], max));
        });
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.stroke();
    };

    line("avgGeneration", maxGen, "rgb(230, 190, 70)");
    line("alive", maxAlive, "rgb(90, 150, 220)");

    // a populáció-skála teteje
    ctx.fillStyle = "rgb(150, 150, 150)";
    ctx.font = "20px system-ui, sans-serif";
    ctx.fillText(String(maxAlive), 8, 24);
}
