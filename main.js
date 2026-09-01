import { canvas, ctx } from "./canvas.js";
import { Creature } from "./creature.js";
import { Food } from "./food.js";
import {
    renderCreatures,
    renderSimInfo,
    renderFoodInfo,
    initSpeedControl,
    initSimControls,
} from "./ui.js";

// fejlesztői réteg: rács + látótávolság + mozgásirány
const DEBUG = true;
const GRID_SIZE = 100;

function drawGrid() {
    ctx.beginPath();
    for (let x = GRID_SIZE; x < canvas.width; x += GRID_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = GRID_SIZE; y < canvas.height; y += GRID_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
}

// fix szín minden casthoz (spawn-sorrend szerint, HSL hue)
const CAST_HUES = [
    0, // #1 - piros
    40, // #2 - narancs
    130, // #3 - zöld
    205, // #4 - kék
    280, // #5 - lila
];

const creatures = [];
for (let i = 0; i < 5; i++) {
    const x = 20 + Math.random() * (canvas.width - 40);
    const y = 20 + Math.random() * (canvas.height - 40);

    const creature = new Creature(i + 1, x, y);
    creature.randomizeTraits();
    creature.hue = CAST_HUES[i % CAST_HUES.length];
    creatures.push(creature);
}

const foods = [];
for (let i = 0; i < 16; i++) {
    const food = new Food(i + 1, 0, 0);
    food.respawn();
    foods.push(food);
}

// --- fix időlépés ---
// a szimuláció mindig 60 lépést számol másodpercenként, függetlenül attól,
// hány képkockát rajzol a böngésző (60 Hz, 144 Hz, háttérben lassuló tab...)
const TICKS_PER_SECOND = 60;
const MS_PER_TICK = 1000 / TICKS_PER_SECOND;
const MAX_CATCHUP_MS = 250; // ennél nagyobb kihagyást nem próbál behozni
const MAX_STEPS_PER_FRAME = 200; // vészfék, hogy egy frame ne akadjon be

let tick = 0;
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
        step();
        render();
    },
});

// kattintással kijelölhető egy lény (a canvas CSS-ben átméretezett, ezért a skálázás)
canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    let hit = null;
    for (const creature of creatures) {
        const dx = creature.x - x;
        const dy = creature.y - y;
        if (Math.sqrt(dx * dx + dy * dy) <= creature.size + 4) {
            hit = creature;
        }
    }
    selectedId = hit ? hit.id : null;
});

// DevTools-ból piszkálható: sim.creatures[0].energy = 5, sim.selected, ...
window.sim = {
    creatures,
    foods,
    get selected() {
        return creatures.find((creature) => creature.id === selectedId) ?? null;
    },
};

// egy szimulációs lépés: minden, ami a világ állapotát változtatja
function step() {
    tick++;

    for (const creature of creatures) {
        creature.update(foods);
    }

    // a lerágott kaja új helyen, tele bukkan fel újra
    for (const food of foods) {
        if (food.depleted) {
            food.respawn();
        }
    }

    // egyik lény se lóghasson bele a másikba
    for (let i = 0; i < creatures.length; i++) {
        creatures[i].separate(creatures.slice(i + 1));
    }
}

// kirajzolás: csak olvassa a világ állapotát, nem módosítja
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (DEBUG) {
        drawGrid();
    }

    for (const food of foods) {
        food.draw();
    }

    for (const creature of creatures) {
        if (DEBUG && creature.alive) {
            creature.drawDebug();
        }
        creature.draw();
    }

    // kijelölt lény gyűrűje
    const selected = creatures.find((creature) => creature.id === selectedId);
    if (selected) {
        ctx.beginPath();
        ctx.arc(selected.x, selected.y, selected.size + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    renderCreatures(creatures);
    renderSimInfo(creatures, foods, tick);
    renderFoodInfo(foods);
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
            step();
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
