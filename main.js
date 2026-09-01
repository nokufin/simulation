import { canvas, ctx } from "./canvas.js";
import { Creature } from "./creature.js";
import { Food } from "./food.js";
import { renderCreatures, renderSimInfo, renderFoodInfo } from "./ui.js";

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

let tick = 0;

function gameLoop() {
    tick++;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (DEBUG) {
        drawGrid();
    }

    for (const food of foods) {
        food.draw();
    }

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

    for (const creature of creatures) {
        if (DEBUG && creature.alive) {
            creature.drawDebug();
        }
        creature.draw();
    }

    renderCreatures(creatures);
    renderSimInfo(creatures, foods, tick);
    renderFoodInfo(foods);

    requestAnimationFrame(gameLoop);
}

gameLoop();
