// Belépési pont: világ létrehozása, fix időlépéses fő ciklus, felhasználói vezérlés.

import { canvas, ctx } from "./canvas.js";
import { WORLD_CONFIG } from "./config.js";
import { createDefaultWorld } from "./scenario.js";
import { randomSeed } from "./rng.js";
import { drawWorld } from "./render.js";
import {
    Selection,
    pickCreatureAt,
    aliveCreatureById,
    applySelectionClick,
    SELECTION_FULL_MESSAGE,
} from "./selection.js";
import { ExplorerModel, bestMatch } from "./explorer.js";
import { describeSelection, populationSummary } from "./inspector.js";
import {
    renderSelectionPanel,
    initInspector,
    showSelectionNotice,
    renderExplorer,
    initExplorer,
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
const selection = new Selection();

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

// kattintással kijelölhető egy lény (a canvas CSS-ben átméretezett, ezért a skálázás).
// Ctrl (macOS-en Cmd) + kattintás: hozzáadás / eltávolítás, legfeljebb 5 lényig.
// Üres helyre kattintva a kijelölés megmarad; megszüntetni Esc-kel vagy a gombbal lehet.
canvas.addEventListener("click", (event) => {
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;

    const hit = pickCreatureAt(world.creatures, x, y);
    if (hit) selectCreature(hit, event.ctrlKey || event.metaKey);
});

// az egyetlen közös kijelölés módosítása: a térkép és a lénylista is ezt hívja
function selectCreature(creature, additive = false) {
    const result = applySelectionClick(selection, creature, additive);
    if (result === "full") showSelectionNotice(SELECTION_FULL_MESSAGE);
    render(true);
}

initInspector({
    onRemove: (id) => {
        selection.removeById(id);
        render(true);
    },
});

function deselect() {
    selection.clear();
    render(true);
}

document.getElementById("deselectBtn").addEventListener("click", deselect);
window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") deselect();
});

// --- Creature Explorer (bal oldali lista) ---
const explorer = new ExplorerModel();
const EXPLORER_STORAGE_KEY = "creature-sim:explorer-collapsed";

function loadExplorerCollapsed() {
    try {
        return localStorage.getItem(EXPLORER_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

let explorerCollapsed = loadExplorerCollapsed();

// az összecsukott fajcsoportok is megmaradnak újratöltés után
const GROUPS_STORAGE_KEY = "creature-sim:explorer-groups";
let savedGroups = "[]";
try {
    savedGroups = localStorage.getItem(GROUPS_STORAGE_KEY) ?? "[]";
    explorer.setCollapsedGroups(JSON.parse(savedGroups));
} catch {
    savedGroups = "[]";
}

// a modell maga is kinyithat csoportot (új kijelölésnél), ezért frissítés után mentünk
function saveCollapsedGroups() {
    const current = JSON.stringify([...explorer.collapsed].sort());
    if (current === savedGroups) return;
    savedGroups = current;
    try {
        localStorage.setItem(GROUPS_STORAGE_KEY, current);
    } catch {
        // a beállítás megjegyzése csak kényelmi funkció
    }
}

initExplorer(
    {
        onSelect: (id, additive) => {
            const creature = aliveCreatureById(world.creatures, id);
            if (creature) selectCreature(creature, additive);
        },
        onToggleGroup: (key) => {
            explorer.toggleGroup(key);
            render(true);
        },
        onQuery: (text) => {
            explorer.setQuery(text);
            render(true);
        },
        onSearchEnter: () => {
            const match = bestMatch(explorer.entries, explorer.query);
            const creature = match ? aliveCreatureById(world.creatures, match.id) : null;
            if (creature) selectCreature(creature);
        },
        onNavigate: (delta) => {
            const id = explorer.neighbourId(delta);
            const creature = id === null ? null : aliveCreatureById(world.creatures, id);
            if (creature) selectCreature(creature);
        },
        onToggle: (collapsed) => {
            explorerCollapsed = collapsed;
            try {
                localStorage.setItem(EXPLORER_STORAGE_KEY, collapsed ? "1" : "0");
            } catch {
                // a beállítás megjegyzése csak kényelmi funkció
            }
            // összecsukva nem frissül; kinyitáskor teljes újraépítés
            explorer.needsReset = true;
            render(true);
        },
    },
    explorerCollapsed,
);

// DevTools-ból piszkálható: sim.world.creatures[0].energy = 5, sim.selected, ...
window.sim = {
    world,
    selection,
    // a kijelölt lények, kiválasztási sorrendben
    get selected() {
        return selection.creatures;
    },
};

// a panelek ritkábban frissülnek, mint a canvas (és csak változáskor nyúlnak a DOM-hoz)
const PANEL_INTERVAL_MS = 125;
let lastPanelUpdate = -Infinity;

function render(forcePanels = false) {
    // a világból már kikerült holttestnek nincs mit jelölni a térképen; a helye üres marad,
    // hogy a gyűrűk sorszáma egyezzen az összehasonlító táblázat oszlopaival
    const rings = selection.creatures.map((creature) =>
        selection.statusOf(creature, world) === "removed" ? null : creature,
    );
    drawWorld(ctx, world, { debug: DEBUG, selected: rings });

    const now = performance.now();
    if (forcePanels || now - lastPanelUpdate >= PANEL_INTERVAL_MS) {
        lastPanelUpdate = now;
        renderSelectionPanel(describeSelection(selection, world));
        if (!explorerCollapsed) {
            renderExplorer(explorer.update(world, selection));
            saveCollapsedGroups();
        }
        renderSimInfo(world);
        renderPopulation(populationSummary(world), world.history);
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
