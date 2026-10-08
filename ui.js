import { getSpecies } from "./species.js";

const inspectorBody = document.getElementById("inspectorBody");
const deselectBtn = document.getElementById("deselectBtn");
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

// a megfigyelő panel: egy kijelölt lény részletei, vagy rövid tájékoztatás.
// view: az inspector.js describeCreature() eredménye, vagy null
export function renderInspector(view) {
    deselectBtn.hidden = view === null;

    if (view === null) {
        setHTML(inspectorBody, `<p class="inspector__empty">Kattints egy lényre a részletek megtekintéséhez.</p>`);
        return;
    }

    const classes = ["inspector__grid"];
    if (view.dead) classes.push("is-dead");

    const notice = view.removed
        ? `<p class="inspector__notice">A holttest már kikerült a világból: az utolsó ismert adatok látszanak.</p>`
        : "";

    const sections = view.sections
        .map(
            (section) => `
                <section class="isec isec--${section.key}">
                    <h3 class="isec__title">${section.title}</h3>
                    <dl class="isec__rows">${section.rows.map(rowHTML).join("")}</dl>
                </section>`,
        )
        .join("");

    setHTML(
        inspectorBody,
        `${notice}<div class="${classes.join(" ")}" style="--c:hsl(${view.hue}, 70%, 55%)">${sections}</div>`,
    );
}

function rowHTML(row) {
    return `<div class="isec__row" data-key="${row.key}"><dt>${row.label}</dt><dd>${swatchHTML(row)}${row.value}${meterHTML(row)}</dd></div>`;
}

// színminta: "fill" = a lény saját színe (kitöltött pötty), "ring" = a faj színe (körvonal)
function swatchHTML(row) {
    if (row.swatch === undefined || row.swatch === null) return "";
    if (row.swatchKind === "ring") {
        return `<span class="swatch swatch--ring" style="border-color:hsl(${row.swatch}, 75%, 60%)"></span>`;
    }
    return `<span class="swatch" style="background:hsl(${row.swatch}, 70%, 55%)"></span>`;
}

function meterHTML(row) {
    if (!row.meter) return "";
    return `<span class="meter"><span class="meter__fill meter__fill--${row.meter.kind}" style="width:${(row.meter.fill * 100).toFixed(1)}%"></span></span>`;
}

// csak akkor nyúl a DOM-hoz, ha a tartalom tényleg változott
function setHTML(element, html) {
    if (element.__html !== html) {
        element.__html = html;
        element.innerHTML = html;
    }
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

    setHTML(
        simInfo,
        Object.entries(stats)
            .map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`)
            .join(""),
    );
}

export function renderFoodInfo(foods) {
    setHTML(foodInfo, foods
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
        .join(""));
}

// populáció panel: grafikon (élők + átlagos generáció) és összesítő számok.
// summary: az inspector.js populationSummary() eredménye
export function renderPopulation(summary, history) {
    const stats = {
        "alive / limit": `${summary.alive} / ${summary.limit}`,
        births: summary.births,
        "deaths: starvation": summary.starvation,
        "deaths: old age": summary.oldAge,
        "gen now (avg / max)": `${summary.avgGeneration.toFixed(1)} / ${summary.maxGenerationNow}`,
        "gen record": summary.generationRecord,
        "births blocked by limit": summary.blockedBirths,
        "avg size": summary.avgSize.toFixed(1),
        "avg max speed": summary.avgSpeed.toFixed(2),
        "avg vision": Math.round(summary.avgVision),
    };

    setHTML(
        popInfo,
        Object.entries(stats)
            .map(([key, value]) => `<dt>${key}</dt><dd>${value}</dd>`)
            .join(""),
    );

    // a grafikon csak új minta esetén rajzolódik újra
    const lastTick = history.length ? history.at(-1).tick : 0;
    const chartKey = `${history.length}:${lastTick}`;
    if (popChart.__key !== chartKey) {
        popChart.__key = chartKey;
        drawPopulationChart(history);
    }
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

// --- Creature Explorer: bal oldali lénylista, fajcsoportokba rendezve ---
// A csoportok szerkezete egyszer épül fel; a sorokat egyenként adja hozzá / veszi el
// (nem építi újra a listát). Összecsukott csoport sorai a DOM-ban maradnak, csak rejtve.
// Nem tárol saját kijelölést: a kiemelt sort mindig a közös kijelölésből kapja.

const explorerList = document.getElementById("explorerList");
const explorerSearch = document.getElementById("explorerSearch");
const explorerCount = document.getElementById("explorerCount");
const explorerToggle = document.getElementById("explorerToggle");
const explorerRows = new Map(); // id → <li>
const explorerGroups = new Map(); // csoportkulcs → { root, head, count, chevron, rows }
const highlightedIds = new Set(); // a kiemelt (kijelölt) sorok id-i

const rowDomId = (id) => `explorer-row-${id}`;
const speciesColor = (hue) => (hue === null ? "rgb(120, 120, 120)" : `hsl(${hue}, 70%, 55%)`);

function createExplorerRow(entry) {
    const row = document.createElement("li");
    row.id = rowDomId(entry.id);
    row.className = "exrow";
    row.setAttribute("role", "option");
    row.setAttribute("aria-selected", "false");
    row.dataset.id = String(entry.id);
    // a pötty a lény saját színe, a körvonala a faj színe (mint a térképen)
    const ring = getSpecies(entry.speciesId).hue;
    const ringStyle = ring === null ? "" : `; box-shadow: 0 0 0 1.5px hsl(${ring}, 75%, 60%)`;
    row.innerHTML = `<span class="exrow__dot" style="background:hsl(${entry.hue}, 70%, 55%)${ringStyle}"></span><span class="exrow__id">#${entry.id}</span><span class="exrow__gen">gen ${entry.generation}</span>`;
    return row;
}

// a fajcsoportok váza (fejléc + sorok helye); a csoportok köre rögzített, ezért egyszer épül
function ensureExplorerGroups(groups) {
    if (explorerGroups.size > 0) return;

    const fragment = document.createDocumentFragment();
    for (const group of groups) {
        const root = document.createElement("div");
        root.className = "exgroup";
        root.setAttribute("role", "group");
        root.dataset.key = group.key;

        const head = document.createElement("button");
        head.type = "button";
        head.className = "exgroup__head";
        head.id = `explorer-group-${group.key}`;
        head.dataset.key = group.key;
        root.setAttribute("aria-labelledby", head.id);

        const chevron = document.createElement("span");
        chevron.className = "exgroup__chevron";
        chevron.setAttribute("aria-hidden", "true");
        const dot = document.createElement("span");
        dot.className = "exrow__dot";
        dot.style.background = speciesColor(group.hue);
        const name = document.createElement("span");
        name.className = "exgroup__name";
        name.textContent = group.name;
        const count = document.createElement("span");
        count.className = "exgroup__count";
        // jelzés, ha a csoportban kijelölt egyed van (összecsukva is látszik)
        const sel = document.createElement("span");
        sel.className = "exgroup__sel";
        sel.hidden = true;
        head.append(chevron, dot, name, sel, count);

        const rows = document.createElement("ul");
        rows.className = "exgroup__rows";
        rows.setAttribute("role", "presentation");

        root.append(head, rows);
        fragment.append(root);
        explorerGroups.set(group.key, { root, head, rows, count, chevron, sel });
    }
    explorerList.replaceChildren(fragment);
}

// handlers: onSelect(id, additive), onToggleGroup(key), onQuery(text), onSearchEnter(), onNavigate(delta), onToggle(collapsed)
export function initExplorer({ onSelect, onToggleGroup, onQuery, onSearchEnter, onNavigate, onToggle }, collapsed) {
    explorerList.addEventListener("click", (event) => {
        const head = event.target.closest(".exgroup__head");
        if (head) {
            onToggleGroup(head.dataset.key);
            return;
        }
        // Ctrl (macOS-en Cmd) + kattintás: hozzáadás / eltávolítás, mint a térképen
        const row = event.target.closest(".exrow");
        if (row) onSelect(Number(row.dataset.id), event.ctrlKey || event.metaKey);
    });

    // billentyűzet: a nyilak a nyitott csoportok sorai között léptetik a kijelölést;
    // a csoportfejlécek gombok (Tab, Enter / Szóköz: nyit / csuk)
    const keys = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10, Home: "first", End: "last" };
    explorerList.addEventListener("keydown", (event) => {
        if (!(event.key in keys)) return;
        event.preventDefault();
        onNavigate(keys[event.key]);
    });

    explorerSearch.addEventListener("input", () => onQuery(explorerSearch.value));
    explorerSearch.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            onSearchEnter();
        } else if (event.key === "ArrowDown") {
            event.preventDefault();
            explorerList.focus();
        } else if (event.key === "Escape" && explorerSearch.value !== "") {
            // Esc a keresőben előbb a keresést törli, nem a kijelölést
            event.stopPropagation();
            explorerSearch.value = "";
            onQuery("");
        }
    });

    explorerToggle.addEventListener("click", () => {
        const next = !document.documentElement.classList.contains("explorer-collapsed");
        setExplorerCollapsed(next);
        onToggle(next);
    });

    setExplorerCollapsed(collapsed);
}

export function setExplorerCollapsed(collapsed) {
    document.documentElement.classList.toggle("explorer-collapsed", collapsed);
    explorerToggle.setAttribute("aria-expanded", String(!collapsed));
    const label = collapsed ? "Lénylista kinyitása" : "Lénylista összecsukása";
    explorerToggle.setAttribute("aria-label", label);
    explorerToggle.title = label;
    explorerToggle.firstElementChild.textContent = collapsed ? "›" : "‹";
}

// fejléc: név, szín, élő egyedek száma (kereséskor találat / élő), nyitott-e
function updateGroupHeader(group, searching) {
    const view = explorerGroups.get(group.key);
    view.root.hidden = !group.visible;
    view.root.classList.toggle("is-collapsed", !group.open);
    view.head.setAttribute("aria-expanded", String(group.open));
    view.chevron.textContent = group.open ? "▾" : "▸";

    let count;
    if (searching) count = `${group.matches} / ${group.alive}`;
    else count = group.alive === 0 ? "kihalt" : String(group.alive);
    if (view.count.textContent !== count) view.count.textContent = count;
    const selected = group.selectedCount ?? 0;
    view.sel.hidden = selected === 0;
    const selText = `● ${selected}`;
    if (view.sel.textContent !== selText) view.sel.textContent = selText;
    view.root.classList.toggle("has-selected", selected > 0);

    const parts = [`${group.name}: ${group.alive} élő egyed`];
    if (selected > 0) parts.push(`${selected} kijelölve`);
    if (!group.open) parts.push("összecsukva");
    view.head.setAttribute("aria-label", parts.join(", "));
}

// diff: az explorer.js ExplorerModel.update() eredménye
export function renderExplorer(diff) {
    if (!diff.changed && !diff.invalidQuery) return;

    ensureExplorerGroups(diff.groups);

    if (diff.reset) {
        explorerRows.clear();
        highlightedIds.clear();
        for (const group of diff.groups) {
            const fragment = document.createDocumentFragment();
            for (const entry of group.entries) {
                const row = createExplorerRow(entry);
                explorerRows.set(entry.id, row);
                fragment.append(row);
            }
            explorerGroups.get(group.key).rows.replaceChildren(fragment);
        }
    } else {
        for (const id of diff.removed) {
            explorerRows.get(id)?.remove();
            explorerRows.delete(id);
        }
        for (const entry of diff.added) {
            const row = createExplorerRow(entry);
            explorerRows.set(entry.id, row);
            const group = explorerGroups.get(entry.speciesId ?? "none") ?? explorerGroups.get("none");
            group.rows.append(row);
        }
    }

    if (diff.reset || diff.groupsChanged) {
        for (const group of diff.groups) updateGroupHeader(group, diff.hasQuery);
    }

    // a kiemelés a közös kijelölést követi (több sor is lehet)
    const wanted = new Set(diff.selectedIds ?? []);
    for (const id of highlightedIds) {
        if (wanted.has(id)) continue;
        const row = explorerRows.get(id);
        if (row) {
            row.classList.remove("is-selected");
            row.setAttribute("aria-selected", "false");
        }
        highlightedIds.delete(id);
    }
    for (const id of wanted) {
        const row = explorerRows.get(id);
        if (!row) continue;
        row.classList.add("is-selected");
        row.setAttribute("aria-selected", "true");
        highlightedIds.add(id);
    }

    // az utoljára kijelölt sor az aktív: ehhez görget (csak kijelölésváltáskor)
    const current = explorerRows.get(diff.selectedId);
    if (current) {
        explorerList.setAttribute("aria-activedescendant", current.id);
        if (diff.selectionChanged) current.scrollIntoView({ block: "nearest" });
    } else {
        explorerList.removeAttribute("aria-activedescendant");
    }

    let count;
    if (diff.invalidQuery) count = "Csak számot írj (pl. 42 vagy #42).";
    else if (diff.entries.length === 0) count = diff.hasQuery ? "Nincs ilyen élő lény." : "Nincs élő lény.";
    else count = diff.hasQuery ? `${diff.entries.length} találat` : `${diff.entries.length} élő lény`;
    if (explorerCount.textContent !== count) explorerCount.textContent = count;
}

// --- alsó panel: 0 kijelölt → tájékoztatás, 1 → egyedi panel, 2–5 → összehasonlító táblázat ---

const inspectorTitle = document.getElementById("inspectorTitle");
const selectionNotice = document.getElementById("selectionNotice");

const EMPTY_HTML = `<p class="inspector__empty">Kattints egy lényre a részletek megtekintéséhez.<br /><span class="inspector__empty-hint">Ctrl + kattintással legfeljebb 5 lény hasonlítható össze.</span></p>`;

// az összehasonlítás nyitott szekciói (a lenyithatók alapból csukva)
const openSections = new Set();
let lastComparison = null;
let comparisonCache = null; // { structure, cells: [{ el, html }], rows: [{ el, differs }] }

// handlers: onRemove(id) – egy lény eltávolítása a kijelölésből (címke × gombja)
export function initInspector({ onRemove }) {
    inspectorBody.addEventListener("click", (event) => {
        const remove = event.target.closest("[data-remove-id]");
        if (remove) {
            onRemove(Number(remove.dataset.removeId));
            return;
        }
        const toggle = event.target.closest("[data-toggle-section]");
        if (toggle) {
            const key = toggle.dataset.toggleSection;
            if (openSections.has(key)) openSections.delete(key);
            else openSections.add(key);
            if (lastComparison) renderComparison(lastComparison);
        }
    });
}

// rövid, magától eltűnő tájékoztatás a panel fejlécében
let noticeTimer = null;
export function showSelectionNotice(text) {
    selectionNotice.textContent = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
        selectionNotice.textContent = "";
    }, 3000);
}

// desc: az inspector.js describeSelection() eredménye
export function renderSelectionPanel(desc) {
    deselectBtn.hidden = desc === null;

    if (desc === null || desc.mode === "single") {
        lastComparison = null;
        comparisonCache = null;
        setText(inspectorTitle, "Kijelölt lény");
        setText(deselectBtn, "kijelölés megszüntetése (Esc)");
        if (desc === null) setHTML(inspectorBody, EMPTY_HTML);
        else renderInspector(desc.view);
        return;
    }

    // az egyedi nézet gyorsítótára érvénytelen, a táblázat a saját frissítését kezeli
    inspectorBody.__html = null;
    setText(inspectorTitle, `Összehasonlítás (${desc.count} / ${desc.max})`);
    setText(deselectBtn, "Összes kijelölés törlése (Esc)");
    renderComparison(desc);
}

function setText(element, text) {
    if (element.textContent !== text) element.textContent = text;
}

// színminta: a lény saját színe kitöltve, a faj színe körvonalként (mint a térképen)
function creatureDot(hue, speciesHue) {
    const ring = speciesHue === null ? "" : `; box-shadow: 0 0 0 1.5px hsl(${speciesHue}, 75%, 60%)`;
    return `<span class="cmp__dot" style="background:hsl(${hue}, 70%, 55%)${ring}"></span>`;
}

function cellHTML(cell) {
    return `${swatchHTML(cell)}${cell.value}${meterHTML(cell)}`;
}

// A táblázat szerkezete csak akkor épül újra, ha a kijelöltek köre / állapota vagy a nyitott
// szekciók változnak; különben csak a megváltozott cellák tartalma frissül.
function renderComparison(desc) {
    lastComparison = desc;
    const columns = desc.columns;
    const sections = desc.sections.map((section) => ({
        ...section,
        open: !section.collapsible || openSections.has(section.key),
    }));

    const structure = JSON.stringify([
        columns.map((c) => [c.id, c.status, c.hue, c.speciesHue]),
        sections.map((s) => [s.key, s.open, s.open ? s.rows.map((r) => r.key) : []]),
    ]);

    if (!comparisonCache || comparisonCache.structure !== structure) {
        inspectorBody.innerHTML = comparisonHTML(columns, sections);
        comparisonCache = {
            structure,
            cells: [...inspectorBody.querySelectorAll("[data-cell]")].map((el) => ({ el, html: el.innerHTML })),
            rows: [...inspectorBody.querySelectorAll("[data-row]")].map((el) => ({ el, differs: el.classList.contains("is-different") })),
        };
        return;
    }

    // csak a változott cellák (pl. energia, életkor) és az "eltér" jelölés frissül
    let cellIndex = 0;
    let rowIndex = 0;
    for (const section of sections) {
        if (!section.open) continue;
        for (const row of section.rows) {
            const rowView = comparisonCache.rows[rowIndex++];
            if (rowView.differs !== row.differs) {
                rowView.el.classList.toggle("is-different", row.differs);
                rowView.differs = row.differs;
            }
            for (const cell of row.cells) {
                const view = comparisonCache.cells[cellIndex++];
                const html = cellHTML(cell);
                if (view.html !== html) {
                    view.el.innerHTML = html;
                    view.el.title = cell.value; // a levágott (…) érték teljes szövege
                    view.html = html;
                }
            }
        }
    }
}

const escapeAttr = (text) => String(text).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

function comparisonHTML(columns, sections) {
    const chips = columns
        .map(
            (c) => `
            <span class="chip${c.dead ? " is-dead" : ""}">
                <span class="chip__num">${c.number}</span>
                ${creatureDot(c.hue, c.speciesHue)}
                <span class="chip__id">#${c.id}</span>
                <span class="chip__species">${c.speciesName}</span>
                ${c.dead ? `<span class="chip__dead">${c.removed ? "HALOTT · eltávolítva" : "HALOTT"}</span>` : ""}
                <button type="button" class="chip__remove" data-remove-id="${c.id}" aria-label="#${c.id} eltávolítása a kijelölésből" title="Eltávolítás a kijelölésből">×</button>
            </span>`,
        )
        .join("");

    const removedNotice = columns.some((c) => c.removed)
        ? `<p class="inspector__notice">Van olyan kijelölt holttest, amely már kikerült a világból: az utolsó ismert adatai látszanak.</p>`
        : "";

    const head = `<tr><th scope="col" class="cmp__corner">Tulajdonság</th>${columns
        .map(
            (c) =>
                `<th scope="col" class="cmp__col${c.dead ? " is-dead" : ""}"><span class="chip__num">${c.number}</span>${creatureDot(c.hue, c.speciesHue)}#${c.id}</th>`,
        )
        .join("")}</tr>`;

    const bodies = sections
        .map((section) => {
            const title = section.collapsible
                ? `<button type="button" class="cmp__toggle" data-toggle-section="${section.key}" aria-expanded="${section.open}"><span aria-hidden="true">${section.open ? "▾" : "▸"}</span> ${section.title}</button>`
                : section.title;
            const rows = section.open
                ? section.rows
                      .map(
                          (row) =>
                              `<tr class="cmp__row${row.differs ? " is-different" : ""}" data-row><th scope="row">${row.label}</th>${row.cells
                                  .map((cell, i) => `<td data-cell class="${columns[i].dead ? "is-dead" : ""}" title="${escapeAttr(cell.value)}">${cellHTML(cell)}</td>`)
                                  .join("")}</tr>`,
                      )
                      .join("")
                : "";
            return `<tbody class="cmp__section"><tr class="cmp__section-head"><th colspan="${columns.length + 1}">${title}</th></tr>${rows}</tbody>`;
        })
        .join("");

    return `
        <div class="cmp">
            <div class="cmp__chips">${chips}</div>
            ${removedNotice}
            <div class="cmp__scroll">
                <!-- fix elrendezés: a lények oszlopai egyenlő szélességűek, nem a szöveg hosszától függnek -->
                <table class="cmp__table" style="--cols: ${columns.length}">
                    <colgroup><col class="cmp__labelcol" />${columns.map(() => "<col />").join("")}</colgroup>
                    <thead>${head}</thead>
                    ${bodies}
                </table>
            </div>
            <p class="cmp__legend">A kiemelt sorokban eltérnek az értékek. Az eltérés önmagában nem jó vagy rossz.</p>
        </div>`;
}
