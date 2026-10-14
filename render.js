// Kirajzolás: csak olvassa a világ állapotát, sosem módosítja.

import { getSpecies, bodyColor, bodyEdgeColor, speciesColor, accentColor } from "./species.js";
import { LAND, SHALLOW } from "./habitat.js";

// a terep színei: visszafogottak, hogy a fajszínű körvonalak és a kaja jól látsszanak rajtuk
const TERRAIN_COLORS = {
    [LAND]: "rgb(78, 96, 58)",
    [SHALLOW]: "rgb(54, 104, 140)",
    deep: "rgb(30, 64, 104)",
};

// a kaja színe élőhelyenként (szárazföldi: növényzöld, vízi: plankton-cián)
const FOOD_COLORS = {
    land: { fill: "rgb(176, 226, 96)", stroke: "rgb(70, 100, 30)" },
    water: { fill: "rgb(120, 228, 240)", stroke: "rgb(20, 90, 110)" },
};

// a terep kirajzolása (egyszer, egy háttérképre; lásd main.js), cellánként egy téglalap
export function paintTerrain(ctx, terrain) {
    const { cols, rows, cellSize, types } = terrain;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const type = types[r * cols + c];
            ctx.fillStyle = TERRAIN_COLORS[type] ?? TERRAIN_COLORS.deep;
            // +1: a szomszédos cellák közt ne maradjon hajszálrés
            ctx.fillRect(c * cellSize, r * cellSize, cellSize + 1, cellSize + 1);
        }
    }
}

const GRID_SIZE = 100;

// a faj körvonala: a test szélétől ennyire kívül, ilyen vastagon (a test sötét éle választja el)
const SPECIES_RING_GAP = 2;
const SPECIES_RING_WIDTH = 1.5;
// a kijelölőgyűrű sugara a test szélétől: kívül esik a faj körvonalán, köztük hézag marad
const SELECTION_RING_GAP = 8;

// selected: a kijelölt lények (kiválasztási sorrendben; null = nem rajzolandó, de a
// sorszámát megtartja), egyetlen lény vagy null;
// a gyűrűk a pillanatnyi helyüket követik. Több kijelöltnél a gyűrű mellett a sorszám is
// látszik, ugyanaz, mint az összehasonlító táblázat oszlopáé.
// background: a terep előre kirajzolt képe (ha nincs, a canvas CSS-háttere látszik)
export function drawWorld(ctx, world, { debug = false, selected = null, background = null } = {}) {
    ctx.clearRect(0, 0, world.width, world.height);
    if (background) ctx.drawImage(background, 0, 0);

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

    const list = Array.isArray(selected) ? selected : selected ? [selected] : [];
    list.forEach((creature, index) => {
        if (!creature) return;
        drawSelectionRing(ctx, creature);
        if (list.length > 1) drawSelectionNumber(ctx, creature, index + 1);
    });
}

// kis sorszám a gyűrű jobb felső részén, sötét alapon, hogy bármilyen háttéren olvasható legyen
function drawSelectionNumber(ctx, creature, number) {
    const offset = (creature.genes.size + SELECTION_RING_GAP) * Math.SQRT1_2;
    const x = creature.x + offset + 4;
    const y = creature.y - offset - 4;

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(number), x, y + 0.5);
    ctx.restore();
}

// sötét + fehér kettős gyűrű, hogy bármilyen háttéren látsszon; halott lénynél szaggatott
function drawSelectionRing(ctx, creature) {
    const r = creature.genes.size + SELECTION_RING_GAP;

    ctx.save();
    if (!creature.alive) ctx.setLineDash([5, 4]);

    ctx.beginPath();
    ctx.arc(creature.x, creature.y, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.7)";
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
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

    const colors = FOOD_COLORS[food.habitat] ?? FOOD_COLORS.land;
    ctx.beginPath();
    ctx.arc(food.x, food.y, r, 0, Math.PI * 2);
    ctx.fillStyle = colors.fill;
    ctx.strokeStyle = colors.stroke;
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
}

// a test a lény saját (mutálódó) színével, körülötte vékony körvonal a faja eredeti színével
function drawCreature(ctx, creature) {
    const { size, hue } = creature.genes;
    const species = getSpecies(creature.speciesId);

    if (!creature.alive) ctx.globalAlpha = creature.fadeAlpha;

    ctx.beginPath();
    ctx.arc(creature.x, creature.y, size, 0, Math.PI * 2);
    if (creature.alive) {
        ctx.fillStyle = bodyColor(hue, creature.speciesId);
        ctx.strokeStyle = bodyEdgeColor(hue, creature.speciesId);
    } else {
        ctx.fillStyle = "gray";
        ctx.strokeStyle = "rgb(60, 60, 60)";
    }
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // faj nélküli lénynek nincs körvonala
    if (species.hue !== null) {
        ctx.beginPath();
        ctx.arc(creature.x, creature.y, size + SPECIES_RING_GAP, 0, Math.PI * 2);
        ctx.strokeStyle = speciesColor(creature.speciesId);
        ctx.lineWidth = SPECIES_RING_WIDTH;
        ctx.stroke();
    }

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
    ctx.fillStyle = accentColor(hue, creature.speciesId, 0.06);
    ctx.strokeStyle = accentColor(hue, creature.speciesId, 0.5);
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();

    // mozgásirány
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(heading) * size * 2, y + Math.sin(heading) * size * 2);
    ctx.strokeStyle = accentColor(hue, creature.speciesId);
    ctx.lineWidth = 2;
    ctx.stroke();

    // vonal a kiszemelt kajához
    if (creature.target) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(creature.target.x, creature.target.y);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = accentColor(hue, creature.speciesId, 0.6);
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
