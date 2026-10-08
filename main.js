// Belépési pont: világ létrehozása, fix időlépéses fő ciklus, felhasználói vezérlés.

import { canvas, ctx } from "./canvas.js";
import { WORLD_CONFIG } from "./config.js";
import { createDefaultWorld } from "./scenario.js";
import { randomSeed } from "./rng.js";
import { drawWorld } from "./render.js";
import {
    renderCreatures,
    renderSimInfo,
    renderFoodInfo,
    renderPopulation,
    initSpeedControl,
    initSimControls,
} from "./ui.js";

// fejlesztői réteg: rács + látókúp + mozgásirány + célpont
const DEBUG = true;

// seed: ?seed=12345 az URL-ben visszajátssza ugyanazt a futást, enélkül véletlen
const seedParam = new URLSearchParams(location.search).get("seed");
const seed = seedParam !== null && /^\d+$/.test(seedParam) ? Number(seedParam) : randomSeed();
console.log(`seed: ${seed}  (újrajátszás: ?seed=${seed})`);

const world = createDefaultWorld(seed);

// a canvas felbontása és a CSS-beli képarány a configból jön
canvas.width = WORLD_CONFIG.width;
canvas.height = WORLD_CONFIG.height;
document.documentElement.style.setProperty("--world-w", WORLD_CONFIG.width);
document.documentElement.style.setProperty("--world-h", WORLD_CONFIG.height);

// --- fix időlépés ---
// a szimuláció mindig ticksPerSecond lépést számol másodpercenként, függetlenül attól,
// hány képkockát rajzol a böngésző (60 Hz, 144 Hz, háttérben lassuló tab...)
const MS_PER_TICK = 1000 / WORLD_CONFIG.ticksPerSecond;
const MAX_CATCHUP_MS = 250; // ennél nagyobb kihagyást nem próbál behozni
const MAX_STEPS_PER_FRAME = 200; // vészfék, hogy egy frame ne akadjon be

let accumulator = 0;
let lastTime = null;
let speed = 1;
let paused = false;
let selectedId = null;

initSpeedControl((value) => {
    speed = value;
});

initSimControls({
    onTogglePause: () => {
        paused = !paused;
        return paused;
    },
    onStep: () => {
        world.step();
        render(true); // léptetéskor a panelek is azonnal frissüljenek
    },
});

// kattintással kijelölhető egy lény (a canvas CSS-ben átméretezett, ezért a skálázás)
canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    const hit = world.creatures.findLast(
        (creature) => creature.distanceTo({ x, y }) <= creature.genes.size + 4,
    );
    selectedId = hit ? hit.id : null;
});

// DevTools-ból piszkálható: sim.world.creatures[0].energy = 5, sim.selected, ...
window.sim = {
    world,
    get selected() {
        return world.creatures.find((creature) => creature.id === selectedId) ?? null;
    },
};

// a panelek HTML-je drága (sok lénynél sok kártya), ezért ritkábban frissül, mint a canvas
const PANEL_INTERVAL_MS = 125;
let lastPanelUpdate = -Infinity;

function render(forcePanels = false) {
    drawWorld(ctx, world, { debug: DEBUG, selectedId });

    const now = performance.now();
    if (forcePanels || now - lastPanelUpdate >= PANEL_INTERVAL_MS) {
        lastPanelUpdate = now;
        renderCreatures(world.creatures);
        renderSimInfo(world);
        renderPopulation(world);
        renderFoodInfo(world.foods);
    }
}

function frame(now) {
    if (lastTime === null) {
        lastTime = now;
    }

    let elapsed = now - lastTime;
    lastTime = now;

    if (elapsed > MAX_CATCHUP_MS) {
        elapsed = MAX_CATCHUP_MS;
    }

    if (!paused) {
        // a sebesség-szorzó nyújtja a beszámított időt (2× = kétszer annyi lépés)
        accumulator += elapsed * speed;

        let steps = 0;
        while (accumulator >= MS_PER_TICK && steps < MAX_STEPS_PER_FRAME) {
            world.step();
            accumulator -= MS_PER_TICK;
            steps++;
        }

        // ha a vészféket elértük, dobjuk el a maradékot (ne halmozódjon)
        if (steps === MAX_STEPS_PER_FRAME) {
            accumulator = 0;
        }
    } else {
        // szünet alatt ne gyűljön az idő, hogy folytatáskor ne ugorjon
        accumulator = 0;
    }

    render();
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
