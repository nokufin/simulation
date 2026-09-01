const crtInfo = document.getElementById("creatureInfo");
const simInfo = document.getElementById("simInfo");
const foodInfo = document.getElementById("foodInfo");
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

export function renderCreatures(creatures) {
    crtInfo.innerHTML = creatures
        .map((creature) => creature.getCardHTML())
        .join("");
}

export function renderSimInfo(creatures, foods, tick) {
    const alive = creatures.filter((creature) => creature.alive);
    const generation = creatures.reduce(
        (max, creature) => Math.max(max, creature.generation),
        0,
    );

    const biomass = Math.round(
        foods.reduce((sum, food) => sum + food.amount, 0),
    );
    const biomassMax = foods.reduce((sum, food) => sum + food.maxAmount, 0);

    const stats = {
        tick: tick,
        alive: `${alive.length} / ${creatures.length}`,
        gen: generation,
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
