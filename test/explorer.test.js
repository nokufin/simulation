import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIdQuery, explorerEntries, bestMatch, ExplorerModel } from "../explorer.js";
import { Selection, pickCreatureAt, aliveCreatureById } from "../selection.js";
import { describeCreature } from "../inspector.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, addReadyParent, run, snapshot } from "./helpers.js";

// --- keresés ---

test("az id-keresés elfogadja a #42, 42 és szóközös alakot", () => {
    assert.equal(parseIdQuery("#42"), "42");
    assert.equal(parseIdQuery("42"), "42");
    assert.equal(parseIdQuery("  # 42 "), "42");
    assert.equal(parseIdQuery(""), null);
    assert.equal(parseIdQuery("#"), null);
    assert.equal(parseIdQuery("abc"), false);
    assert.equal(parseIdQuery("4a"), false);
});

test("a lista csak az élőket mutatja, id szerint, és csak a kiválasztáshoz szükséges adatokkal", () => {
    const world = makeWorld();
    addCreature(world, 100, 100, { generation: 2, genes: { hue: 130 } });
    addCreature(world, 200, 100).die("test");
    addCreature(world, 300, 100, { generation: 5 });

    const entries = explorerEntries(world);
    assert.deepEqual(entries, [
        { id: 1, speciesId: null, hue: 130, generation: 2 },
        { id: 3, speciesId: null, hue: 30, generation: 5 },
    ]);
});

test("az id-szűrés előtag szerint működik, érvénytelen keresésre üres a lista", () => {
    const world = makeWorld();
    world.nextCreatureId = 4;
    addCreature(world, 100, 100); // #4
    world.nextCreatureId = 40;
    addCreature(world, 200, 100); // #40
    addCreature(world, 300, 100); // #41
    world.nextCreatureId = 142;
    addCreature(world, 400, 100); // #142

    assert.deepEqual(explorerEntries(world, "4").map((e) => e.id), [4, 40, 41]);
    assert.deepEqual(explorerEntries(world, "41").map((e) => e.id), [41]);
    assert.deepEqual(explorerEntries(world, false), []);
});

test("Enter a keresőben: pontos egyezés, különben az első találat", () => {
    const entries = [{ id: 4 }, { id: 40 }, { id: 42 }];
    assert.equal(bestMatch(entries, "42").id, 42);
    assert.equal(bestMatch(entries, "4").id, 4);
    assert.equal(bestMatch([{ id: 40 }, { id: 42 }], "4").id, 40);
    assert.equal(bestMatch([], "7"), null);
    assert.equal(bestMatch(entries, null), null);
});

// --- listás kijelölés és kétirányú szinkron ---

test("listából kijelölve ugyanaz a közös állapot jön létre, mint térképes kattintással", () => {
    const world = makeWorld();
    const target = addCreature(world, 400, 300);
    addCreature(world, 800, 300);

    const fromMap = new Selection();
    fromMap.select(pickCreatureAt(world.creatures, 400, 300));

    const fromList = new Selection();
    fromList.select(aliveCreatureById(world.creatures, target.id));

    assert.equal(fromMap.creature, target);
    assert.equal(fromList.creature, target);
    assert.deepEqual(describeCreature(fromList.creature, world), describeCreature(fromMap.creature, world));
});

test("halott vagy nem létező id-t a lista nem jelöl ki", () => {
    const world = makeWorld();
    const corpse = addCreature(world, 400, 300);
    corpse.die("test");

    assert.equal(aliveCreatureById(world.creatures, corpse.id), null);
    assert.equal(aliveCreatureById(world.creatures, 999), null);
});

test("térképes kijelölés → a lista kiemeli a sort; váltás és megszüntetés is követi", () => {
    const world = makeWorld();
    const a = addCreature(world, 200, 300);
    const b = addCreature(world, 900, 300);
    const selection = new Selection();
    const model = new ExplorerModel();

    let diff = model.update(world, selection.creature);
    assert.equal(diff.selectedId, null);

    selection.select(pickCreatureAt(world.creatures, a.x, a.y));
    diff = model.update(world, selection.creature);
    assert.equal(diff.selectedId, a.id);
    assert.equal(diff.selectionChanged, true);

    // változatlan állapotban nincs teendő
    diff = model.update(world, selection.creature);
    assert.equal(diff.changed, false);

    selection.select(pickCreatureAt(world.creatures, b.x, b.y));
    diff = model.update(world, selection.creature);
    assert.equal(diff.selectedId, b.id);
    assert.equal(diff.selectionChanged, true);

    selection.clear();
    diff = model.update(world, selection.creature);
    assert.equal(diff.selectedId, null);
    assert.equal(diff.selectionChanged, true);
});

test("a listának nincs saját kijelölése: mindig a közös állapotot tükrözi", () => {
    const world = makeWorld();
    const a = addCreature(world, 200, 300);
    const b = addCreature(world, 900, 300);
    const selection = new Selection();
    const model = new ExplorerModel();

    // billentyűs lépés a listában → a közös kijelölésen keresztül
    model.update(world, selection.creature);
    selection.select(aliveCreatureById(world.creatures, model.neighbourId(1)));
    assert.equal(model.update(world, selection.creature).selectedId, a.id);

    // közben a térképen máshová kattintanak: a lista ezt követi, nem a saját előző értékét
    selection.select(b);
    assert.equal(model.update(world, selection.creature).selectedId, b.id);
    assert.equal(model.neighbourId(-1), a.id);
});

test("billentyűs léptetés: le, fel, első, utolsó, a széleken megáll", () => {
    const world = makeWorld();
    for (let i = 0; i < 4; i++) addCreature(world, 100 + i * 200, 300);
    const model = new ExplorerModel();
    model.update(world, null);

    assert.equal(model.neighbourId(1), 1, "kijelölés nélkül lefelé: az első");
    assert.equal(model.neighbourId(-1), 4, "kijelölés nélkül felfelé: az utolsó");

    model.update(world, world.creatures[1]); // #2
    assert.equal(model.neighbourId(1), 3);
    assert.equal(model.neighbourId(-1), 1);
    assert.equal(model.neighbourId(10), 4);
    assert.equal(model.neighbourId(-10), 1);
    assert.equal(model.neighbourId("first"), 1);
    assert.equal(model.neighbourId("last"), 4);
});

test("ha a keresés kiszűri a kijelölt lényt, a sor nem emelődik ki, de a kijelölés megmarad", () => {
    const world = makeWorld();
    const a = addCreature(world, 200, 300); // #1
    addCreature(world, 900, 300); // #2
    const selection = new Selection();
    selection.select(a);
    const model = new ExplorerModel();

    model.setQuery("#2");
    const diff = model.update(world, selection.creature);
    assert.equal(diff.reset, true, "keresésváltás után újraépül a lista");
    assert.deepEqual(diff.entries.map((e) => e.id), [2]);
    assert.equal(diff.selectedId, null);
    assert.equal(selection.creature, a);
});

// --- születések és halálozások ---

test("az újszülött automatikusan a lista végére kerül, a lista újraépítése nélkül", () => {
    const world = makeWorld();
    const parent = addReadyParent(world, 640, 300);
    const model = new ExplorerModel();
    model.update(world, null);

    world.step();
    const diff = model.update(world, null);

    assert.equal(world.births, 1);
    assert.equal(diff.reset, false);
    assert.deepEqual(diff.removed, []);
    assert.deepEqual(diff.added, [{ id: 2, speciesId: null, hue: parent.genes.hue, generation: 1 }]);
});

test("a meghalt lény kikerül a listából; ha ki volt jelölve, a panel adatai megmaradnak", () => {
    const world = makeWorld();
    const victim = addCreature(world, 200, 300, { energy: 0, health: 0.3 });
    addCreature(world, 900, 300);
    const selection = new Selection();
    selection.select(victim);
    const model = new ExplorerModel();
    assert.equal(model.update(world, selection.creature).selectedId, victim.id);

    run(world, 2);
    const diff = model.update(world, selection.creature);

    assert.deepEqual(diff.removed, [victim.id]);
    assert.equal(diff.selectedId, null, "halott lény sora nem lehet kiemelve");
    assert.equal(selection.creature, victim, "a közös kijelölés megmaradt");
    assert.equal(selection.status(world), "dead");
    const life = describeCreature(selection.creature, world, selection.status(world)).sections.find((s) => s.key === "life");
    assert.equal(life.rows.find((r) => r.key === "status").value, "HALOTT");
});

test("ha kisebb id-jű sor jelenne meg, a lista biztonságosan újraépül", () => {
    const world = makeWorld();
    world.nextCreatureId = 10;
    addCreature(world, 200, 300);
    const model = new ExplorerModel();
    model.update(world, null);

    world.nextCreatureId = 3;
    addCreature(world, 900, 300);
    const diff = model.update(world, null);

    assert.equal(diff.reset, true);
    assert.deepEqual(diff.entries.map((e) => e.id), [3, 10]);
});

test("hosszú futásban a lista mindig pontosan az élőket tartalmazza", () => {
    const world = createDefaultWorld(6);
    const model = new ExplorerModel();
    let ids = new Set();
    let births = 0;
    let deaths = 0;

    for (let t = 0; t < 20000; t++) {
        world.step();
        if (t % 8 !== 0) continue; // a felület is ritkítva frissít

        const diff = model.update(world, null);
        if (diff.reset) ids = new Set(diff.entries.map((e) => e.id));
        for (const id of diff.removed) ids.delete(id);
        for (const entry of diff.added) ids.add(entry.id);
        births += diff.added.length;
        deaths += diff.removed.length;

        const alive = world.creatures.filter((c) => c.alive).map((c) => c.id);
        assert.deepEqual([...ids].sort((a, b) => a - b), alive, `${world.tick}. tick`);
    }
    assert.ok(births > 10 && deaths > 10, `születés: ${births}, halál: ${deaths}`);
});

// --- a szimulációra nincs hatása ---

test("a lista frissítése és a listás kijelölés nem változtat a futáson", () => {
    const observed = createDefaultWorld(17);
    const plain = createDefaultWorld(17);
    const selection = new Selection();
    const model = new ExplorerModel();

    for (let t = 0; t < 6000; t++) {
        observed.step();
        plain.step();
        model.update(observed, selection.creature);
        const id = model.neighbourId(1);
        const creature = id === null ? null : aliveCreatureById(observed.creatures, id);
        if (creature) selection.select(creature);
    }

    assert.equal(snapshot(observed), snapshot(plain));
});

test("érvénytelen keresésnél a modell üres listát ad és jelzi a hibát (regresszió)", () => {
    const world = makeWorld();
    addCreature(world, 200, 300);
    const model = new ExplorerModel();

    model.setQuery("abc");
    const diff = model.update(world, null);
    assert.equal(diff.invalidQuery, true);
    assert.deepEqual(diff.entries, []);
});
