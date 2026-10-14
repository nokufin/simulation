import { test } from "node:test";
import assert from "node:assert/strict";
import {
    Selection,
    MAX_SELECTION,
    applySelectionClick,
    pickCreatureAt,
    aliveCreatureById,
} from "../selection.js";
import { ExplorerModel } from "../explorer.js";
import { describeSelection, describeCreature } from "../inspector.js";
import { drawWorld } from "../render.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, run, snapshot } from "./helpers.js";

// hat lény sorban, különböző fajokból (#1..#6)
function sixCreatures() {
    const world = makeWorld();
    const species = ["red", "yellow", "green", "blue", "purple", "red"];
    species.forEach((speciesId, i) => addCreature(world, 100 + i * 200, 300, { speciesId }));
    return world;
}

// a térképes kattintás: találat + ugyanaz a kattintásfüggvény, mint a main.js-ben
const clickMap = (selection, world, creature, ctrl = false) =>
    applySelectionClick(selection, pickCreatureAt(world.creatures, creature.x, creature.y), ctrl);

// a listás kattintás: id alapján, ugyanazzal a függvénnyel
const clickList = (selection, world, id, ctrl = false) =>
    applySelectionClick(selection, aliveCreatureById(world.creatures, id), ctrl);

const ids = (selection) => selection.creatures.map((c) => c.id);

// --- kijelölési mechanizmus ---

test("sima kattintás: csak az adott lény lesz kijelölve, a korábbi többes kijelölés helyett", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const [a, b, c] = world.creatures;

    assert.equal(clickMap(selection, world, a), "selected");
    assert.deepEqual(ids(selection), [1]);

    clickMap(selection, world, b, true);
    clickMap(selection, world, c, true);
    assert.deepEqual(ids(selection), [1, 2, 3]);

    assert.equal(clickMap(selection, world, b), "selected");
    assert.deepEqual(ids(selection), [2]);
});

test("Ctrl + kattintás hozzáad, a sorrend a kiválasztás sorrendje", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const c = world.creatures;

    clickMap(selection, world, c[3]);
    assert.equal(clickMap(selection, world, c[0], true), "added");
    assert.equal(clickMap(selection, world, c[4], true), "added");

    assert.deepEqual(ids(selection), [4, 1, 5]);
});

test("Ctrl + kattintás a már kijelölt lényre: kikerül, a többi sorrendje marad", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const c = world.creatures;
    for (const creature of [c[0], c[1], c[2]]) clickMap(selection, world, creature, true);

    assert.equal(clickMap(selection, world, c[1], true), "removed");
    assert.deepEqual(ids(selection), [1, 3]);
});

test("legfeljebb 5 lény: a hatodik hozzáadását elutasítja, a kijelölés nem változik", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const c = world.creatures;

    assert.equal(MAX_SELECTION, 5);
    for (const creature of c.slice(0, 5)) assert.equal(clickMap(selection, world, creature, true), "added");
    assert.equal(clickMap(selection, world, c[5], true), "full");
    assert.deepEqual(ids(selection), [1, 2, 3, 4, 5]);

    // a teltnél is lehet eltávolítani, utána újra hozzáadni
    assert.equal(clickMap(selection, world, c[0], true), "removed");
    assert.equal(clickMap(selection, world, c[5], true), "added");
    assert.deepEqual(ids(selection), [2, 3, 4, 5, 6]);
});

test("az elpusztult kijelölt lény is beleszámít az ötös korlátba, akkor is, ha már eltűnt", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const c = world.creatures;
    for (const creature of c.slice(0, 5)) clickMap(selection, world, creature, true);

    c[0].die("starvation");
    run(world, 600); // a holttest kikerül a világból
    assert.equal(selection.statusOf(c[0], world), "removed");

    assert.equal(applySelectionClick(selection, c[5], true), "full");
    assert.equal(selection.size, 5);
});

test("üres helyre kattintva nincs változás, Ctrl-lal sem", () => {
    const world = sixCreatures();
    const selection = new Selection();
    clickMap(selection, world, world.creatures[0]);
    clickMap(selection, world, world.creatures[1], true);

    const miss = pickCreatureAt(world.creatures, 640, 50);
    assert.equal(miss, null);
    assert.equal(applySelectionClick(selection, miss, false), "none");
    assert.equal(applySelectionClick(selection, miss, true), "none");
    assert.deepEqual(ids(selection), [1, 2]);
});

test("a teljes kijelölés megszüntetése (Esc)", () => {
    const world = sixCreatures();
    const selection = new Selection();
    for (const creature of world.creatures.slice(0, 3)) clickMap(selection, world, creature, true);

    selection.clear();

    assert.equal(selection.size, 0);
    assert.equal(describeSelection(selection, world), null);
    assert.deepEqual(new ExplorerModel().update(world, selection).selectedIds, []);
});

test("a címke × gombja id alapján távolít el, halott lényt is", () => {
    const world = sixCreatures();
    const selection = new Selection();
    for (const creature of world.creatures.slice(0, 3)) clickMap(selection, world, creature, true);
    world.creatures[1].die("test");

    selection.removeById(2);
    assert.deepEqual(ids(selection), [1, 3]);
});

test("a kijelölt lények listája másolat: kívülről nem módosítható", () => {
    const world = sixCreatures();
    const selection = new Selection();
    clickMap(selection, world, world.creatures[0]);

    selection.creatures.push(world.creatures[1]);
    assert.equal(selection.size, 1);
});

test("a régi, egy kijelölésre szabott API jelentése változatlan", () => {
    const world = sixCreatures();
    const selection = new Selection();
    assert.equal(selection.creature, null);
    assert.equal(selection.status(world), "none");

    selection.select(world.creatures[2]);
    assert.equal(selection.creature, world.creatures[2]);
    assert.equal(selection.status(world), "alive");

    // többnél: az utoljára kijelölt
    selection.toggle(world.creatures[4]);
    assert.equal(selection.creature, world.creatures[4]);
});

// --- szinkron: térkép, lista, csoportok ---

test("térképen és listában kijelölve ugyanaz a közös állapot jön létre, vegyesen is", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const model = new ExplorerModel();

    clickMap(selection, world, world.creatures[0]); // térkép
    clickList(selection, world, 3, true); // lista, Ctrl
    clickMap(selection, world, world.creatures[4], true); // térkép, Ctrl
    clickList(selection, world, 1, true); // lista, Ctrl: eltávolítás

    assert.deepEqual(ids(selection), [3, 5]);
    const diff = model.update(world, selection);
    assert.deepEqual(diff.selectedIds, [3, 5]);
    assert.equal(diff.selectedId, 5, "az utoljára kijelölt az aktív sor");
});

test("a fajcsoport fejléce jelzi, hány kijelölt egyed van benne, összecsukva is", () => {
    const world = sixCreatures(); // #1 és #6 piros
    const selection = new Selection();
    const model = new ExplorerModel();
    clickMap(selection, world, world.creatures[0]);
    clickMap(selection, world, world.creatures[5], true);
    clickMap(selection, world, world.creatures[3], true); // kék

    model.update(world, selection);
    model.toggleGroup("red");
    const diff = model.update(world, selection);
    const red = diff.groups.find((g) => g.key === "red");

    assert.equal(red.open, false);
    assert.equal(red.selectedCount, 2);
    assert.equal(diff.groups.find((g) => g.key === "blue").selectedCount, 1);
    assert.equal(diff.groups.find((g) => g.key === "green").selectedCount, 0);
    assert.equal(diff.groupsChanged, true);
});

test("csak az újonnan kijelölt lény csoportja nyílik ki, a korábbiaké összecsukva marad", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const model = new ExplorerModel();
    clickMap(selection, world, world.creatures[0]); // piros
    model.update(world, selection);
    model.toggleGroup("red");
    model.toggleGroup("blue");

    clickList(selection, world, 4, true); // kék hozzáadása
    const diff = model.update(world, selection);

    assert.equal(diff.groups.find((g) => g.key === "blue").open, true);
    assert.equal(diff.groups.find((g) => g.key === "red").open, false);
});

test("a halott kijelölt lény sora kikerül a listából, a kijelölésben marad", () => {
    const world = sixCreatures();
    const selection = new Selection();
    const model = new ExplorerModel();
    for (const creature of world.creatures.slice(0, 3)) clickMap(selection, world, creature, true);
    model.update(world, selection);

    world.creatures[1].die("test");
    const diff = model.update(world, selection);

    assert.deepEqual(diff.removed, [2]);
    assert.deepEqual(diff.selectedIds, [1, 3]);
    assert.equal(selection.size, 3);
});

// --- gyűrűk a térképen ---

test("minden kijelölt lény kap gyűrűt és sorszámot; az eltűnt holttest helye üres marad", () => {
    const world = sixCreatures();
    const strokes = [];
    const labels = [];
    const ctx = new Proxy(
        {
            strokeStyle: null,
            arc(x, y) {
                this.at = [x, y];
            },
            stroke() {
                strokes.push({ style: this.strokeStyle, at: this.at });
            },
            fillText(text) {
                labels.push(text);
            },
        },
        { get: (t, k) => (k in t ? t[k] : () => {}) },
    );
    const [a, b, c] = world.creatures;

    drawWorld(ctx, world, { selected: [a, null, c] });

    const whiteRings = strokes.filter((s) => s.style === "white");
    assert.deepEqual(whiteRings.map((s) => s.at), [[a.x, a.y], [c.x, c.y]]);
    assert.deepEqual(labels, ["1", "3"], "a sorszám a táblázat oszlopáé, nem csúszik el");
    assert.equal(b.x, 300);
});

// --- az alsó panel módja ---

test("0 kijelölt: üres állapot, 1: teljes egyedi panel, 2–5: összehasonlítás", () => {
    const world = sixCreatures();
    const selection = new Selection();

    assert.equal(describeSelection(selection, world), null);

    selection.select(world.creatures[0]);
    const single = describeSelection(selection, world);
    assert.equal(single.mode, "single");
    assert.deepEqual(single.view, describeCreature(world.creatures[0], world, "alive"));

    for (const creature of world.creatures.slice(1, 5)) selection.toggle(creature);
    const compare = describeSelection(selection, world);
    assert.equal(compare.mode, "compare");
    assert.equal(compare.count, 5);
    assert.equal(compare.max, 5);
    assert.deepEqual(compare.columns.map((c) => [c.number, c.id]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
});

// --- az összehasonlító adatok ---

test("az oszlopok fejléce: id, faj neve és színe, egyedi szín", () => {
    const world = sixCreatures();
    world.creatures[1].genes.hue = 52;
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[1]);

    const [red, yellow] = describeSelection(selection, world).columns;
    assert.deepEqual([red.id, red.speciesName, red.speciesHue], [1, "Piros", 0]);
    assert.deepEqual([yellow.id, yellow.speciesName, yellow.speciesHue, yellow.hue], [2, "Citromsárga", 55, 52]);
});

test("minden cella pontosan az egyedi panel ugyanazon értéke (a tényleges modellből)", () => {
    const world = createDefaultWorld(4);
    run(world, 3000);
    const selection = new Selection();
    for (const creature of world.creatures.filter((c) => c.alive).slice(0, 4)) selection.toggle(creature);

    const compare = describeSelection(selection, world);
    selection.creatures.forEach((creature, column) => {
        const single = describeCreature(creature, world, "alive");
        const values = new Map();
        for (const section of single.sections) {
            for (const row of section.rows) values.set(`${section.key}.${row.key}`, row.value);
        }
        for (const section of compare.sections) {
            for (const row of section.rows) {
                assert.equal(row.cells[column].value, values.get(row.key), `#${creature.id} ${row.key}`);
            }
        }
    });
});

test("a kért adatok mind szerepelnek, szekciókba csoportosítva, a részletes gének lenyithatók", () => {
    const world = sixCreatures();
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[1]);

    const sections = describeSelection(selection, world).sections;
    const keys = (key) => sections.find((s) => s.key === key).rows.map((r) => r.key);

    assert.deepEqual(keys("identity"), ["identity.id", "identity.species", "identity.generation", "identity.parent", "life.age"]);
    assert.deepEqual(keys("life"), ["life.status", "life.activity", "life.health", "life.energy", "life.hunger"]);
    assert.deepEqual(keys("genes"), [
        "genes.size",
        "genes.maxSpeed",
        "genes.visionRange",
        "genes.fieldOfView",
        "genes.turnRate",
        "genes.metabolicRate",
        "genes.maxAge",
    ]);
    assert.deepEqual(keys("reproduction"), [
        "reproduction.mature",
        "reproduction.canReproduce",
        "reproduction.blockers",
        "reproduction.children",
    ]);
    assert.equal(sections.find((s) => s.key === "reproductionGenes").collapsible, true);
    assert.equal(sections.find((s) => s.key === "genes").collapsible, false);

    // az "Összes gén" a génmodell minden mezőjét tartalmazza
    const all = sections.find((s) => s.key === "allGenes");
    assert.equal(all.collapsible, true);
    assert.deepEqual(
        all.rows.map((r) => r.key.replace("genes.", "")).sort(),
        Object.keys(world.creatures[0].genes).sort(),
    );
});

test("az eltérés jelölése semleges: csak azt mondja meg, hogy eltérnek-e az értékek", () => {
    const world = sixCreatures();
    world.creatures[1].genes.size = 12.5;
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[1]);

    const genes = describeSelection(selection, world).sections.find((s) => s.key === "genes").rows;
    const size = genes.find((r) => r.key === "genes.size");
    const turn = genes.find((r) => r.key === "genes.turnRate");
    assert.equal(size.differs, true);
    assert.equal(turn.differs, false);
    assert.deepEqual(Object.keys(size).sort(), ["cells", "differs", "key", "label"], "nincs jó/rossz minősítés");
});

// --- elpusztult lények az összehasonlításban ---

test("a meghalt lény az összehasonlításban marad: HALOTT, a halál okával", () => {
    const world = sixCreatures();
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[1]);
    Object.assign(world.creatures[1], { energy: 0, health: 0.3 });

    run(world, 2);
    const compare = describeSelection(selection, world);
    const life = compare.sections.find((s) => s.key === "life").rows;
    const cell = (key, column) => life.find((r) => r.key === key).cells[column].value;

    assert.equal(compare.columns[1].dead, true);
    assert.equal(cell("life.status", 0), "ÉL");
    assert.equal(cell("life.status", 1), "HALOTT");
    assert.equal(cell("life.cause", 1), "éhezés");
    assert.equal(cell("life.cause", 0), "—", "élő lénynél nincs halálok");
});

test("a világból kikerült holttest utolsó adatai elérhetők maradnak", () => {
    const world = sixCreatures();
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[2]);
    world.creatures[2].die("starvation");

    run(world, 600);
    const compare = describeSelection(selection, world);

    assert.equal(compare.columns[1].removed, true);
    const status = compare.sections.find((s) => s.key === "life").rows.find((r) => r.key === "life.status");
    assert.equal(status.cells[1].value, "HALOTT – a holttest már nincs a világban");
    assert.equal(compare.sections.find((s) => s.key === "identity").rows[0].cells[1].value, "#3");
});

test("halott nélkül a halálok sora nem jelenik meg", () => {
    const world = sixCreatures();
    const selection = new Selection();
    selection.select(world.creatures[0]);
    selection.toggle(world.creatures[1]);

    const life = describeSelection(selection, world).sections.find((s) => s.key === "life").rows;
    assert.equal(life.some((r) => r.key === "life.cause"), false);
});

// --- a szimuláció változatlan ---

test("a többes kijelölés, az összehasonlítás és a gyűrűk nem változtatnak a futáson", () => {
    const observed = createDefaultWorld(33);
    const plain = createDefaultWorld(33);
    const selection = new Selection();
    const model = new ExplorerModel();
    const ctx = new Proxy({}, { get: () => () => {}, set: () => true });

    for (let t = 0; t < 8000; t++) {
        observed.step();
        plain.step();

        const alive = observed.creatures.filter((c) => c.alive);
        if (alive.length) {
            const target = alive[t % alive.length];
            applySelectionClick(selection, pickCreatureAt(observed.creatures, target.x, target.y), t % 3 !== 0);
        }
        if (t % 50 === 0) selection.clear();
        describeSelection(selection, observed);
        model.update(observed, selection);
        drawWorld(ctx, observed, { debug: true, selected: selection.creatures });
    }

    assert.equal(snapshot(observed), snapshot(plain));
    assert.ok(observed.births > 0);
});
