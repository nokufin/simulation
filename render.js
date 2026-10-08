// Kirajzolás: csak olvassa a világ állapotát, sosem módosítja.

const GRID_SIZE = 100;

export function drawWorld(ctx, world, { debug = false, selectedId = null } = {}) {
    ctx.clearRect(0, 0, world.width, world.height);

    if (debug) {
        drawGrid(ctx, world);
    }

    for (const food of world.foods) {
        drawFood(ctx, food);
    }

    for (const creature of world.creatures) {
        if (debug && creature.alive) {
            drawCreatureDebug(ctx, creature);
        }
        drawCreature(ctx, creature);
    }

    // kijelölt lény gyűrűje
    const selected = world.creatures.find((creature) => creature.id === selectedId);
    if (selected) {
        ctx.beginPath();
        ctx.arc(selected.x, selected.y, selected.genes.size + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
    }
}

function drawGrid(ctx, world) {
    ctx.beginPath();
    for (let x = GRID_SIZE; x < world.width; x += GRID_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, world.height);
    }
    for (let y = GRID_SIZE; y < world.height; y += GRID_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(world.width, y);
    }
    ctx.strokeStyle = "rgba(255, 255, 255, 0.07)";
    ctx.lineWidth = 1;
    ctx.stroke();
}

function drawFood(ctx, food) {
    // a sugár a maradék mennyiséggel zsugorodik
    const r = food.size * (0.35 + 0.65 * (food.amount / food.maxAmount));

    ctx.beginPath();
    ctx.arc(food.x, food.y, r, 0, Math.PI * 2);
    ctx.fillStyle = "cyan";
    ctx.strokeStyle = "rgb(0, 110, 120)";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
}

function drawCreature(ctx, creature) {
    const { size, hue } = creature.genes;

    ctx.beginPath();
    ctx.arc(creature.x, creature.y, size, 0, Math.PI * 2);

    if (creature.alive) {
        ctx.fillStyle = `hsl(${hue}, 70%, 55%)`;
        ctx.strokeStyle = `hsl(${hue}, 70%, 28%)`;
    } else {
        ctx.fillStyle = "gray";
        ctx.strokeStyle = "rgb(60, 60, 60)";
        ctx.globalAlpha = creature.fadeAlpha;
    }

    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
}

// fejlesztői réteg: látókúp, mozgásirány, célpont
function drawCreatureDebug(ctx, creature) {
    const { size, hue, visionRange, fieldOfView } = creature.genes;
    const { x, y, heading } = creature;

    // látókúp (látótáv + látószög)
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, visionRange, heading - fieldOfView / 2, heading + fieldOfView / 2);
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 70%, 55%, 0.06)`;
    ctx.strokeStyle = `hsla(${hue}, 70%, 55%, 0.5)`;
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // mozgásirány
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(heading) * size * 2, y + Math.sin(heading) * size * 2);
    ctx.strokeStyle = `hsl(${hue}, 70%, 70%)`;
    ctx.lineWidth = 2;
    ctx.stroke();

    // vonal a kiszemelt kajához
    if (creature.target) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(creature.target.x, creature.target.y);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = `hsla(${hue}, 70%, 70%, 0.6)`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
