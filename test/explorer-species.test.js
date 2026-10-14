import { test } from "node:test";
import assert from "node:assert/strict";
import { ExplorerModel, groupBySpecies, explorerEntries } from "../explorer.js";
import { Selection, pickCreatureAt, aliveCreatureById } from "../selection.js";
import { SPECIES } from "../species.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, addReadyParent, run } from "./helpers.js";

const groupOf = (diff, key) => diff.groups.find((g) => g.key === key);

// kis világ ismert fajokkal: #1 citromsárga, #2 piros, #3 piros, #4 kék
function smallWorld() {
    const world = makeWorld();
    addCreature(world, 100, 100, { speciesId: "yellow", generation: 1 });
    addCreature(world, 300, 100, { speciesId: "red" });
    addCreature(world, 500, 100, { speciesId: "red", generation: 2 });
    addCreature(world, 700, 100, { speciesId: "blue" });
    return world;
}

// --- csoportosítás ---

test("a csoportok a fajok sorrendjében jönnek, névvel, színnel és élő létszámmal", () => {
    const diff = new ExplorerModel().update(smallWorld(), null);

    assert.deepEqual(
        diff.groups.map((g) => [g.key, g.name, g.hue, g.alive]),
        [
            ["red", "Piros", 0, 2],
            ["blue", "Kék", 205, 1],
            ["green", "Zöld", 130, 0],
            ["yellow", "Citromsárga", 55, 1],
            ["purple", "Lila", 280, 0],
            ["black", "Fekete (AI)", 0, 0],
            ["none", "Faj nélkül", null, 0],
        ],
    );
});

test("a csoporton belül id szerinti sorrend, a lista a megjelenítés (fajcsoport) sorrendjében", () => {
    const diff = new ExplorerModel().update(smallWorld(), null);

    assert.deepEqual(groupOf(diff, "red").entries.map((e) => e.id), [2, 3]);
    assert.deepEqual(diff.entries.map((e) => e.id), [2, 3, 4, 1]);
    assert.deepEqual(Object.keys(diff.entries[0]).sort(), ["generation", "hue", "id", "speciesId"]);
});

test("a kihalt faj fejléce 0 élővel is látszik, a faj nélküli csoport csak ha van tagja", () => {
    const world = smallWorld();
    let diff = new ExplorerModel().update(world, null);
    assert.equal(groupOf(diff, "green").visible, true);
    assert.equal(groupOf(diff, "none").visible, false);

    addCreature(world, 900, 100); // faj nélkül
    diff = new ExplorerModel().update(world, null);
    assert.equal(groupOf(diff, "none").visible, true);
    assert.deepEqual(groupOf(diff, "none").entries.map((e) => e.id), [5]);
});

test("a holttestek nem számítanak bele a faj létszámába", () => {
    const world = smallWorld();
    world.creatures[1].die("test"); // #2 piros

    const groups = groupBySpecies(world, explorerEntries(world));
    const red = groups.find((g) => g.key === "red");
    assert.equal(red.alive, 1);
    assert.deepEqual(red.entries.map((e) => e.id), [3]);
});

// --- összecsukás ---

test("az összecsukott csoport sorait a billentyűs léptetés kihagyja", () => {
    const world = smallWorld();
    const model = new ExplorerModel();

    model.toggleGroup("red");
    const diff = model.update(world, null);

    assert.equal(groupOf(diff, "red").open, false);
    assert.equal(model.neighbourId("first"), 4, "a piros csoport össze van csukva, az első a kék");
    assert.equal(model.neighbourId("last"), 1);

    model.toggleGroup("red");
    model.update(world, null);
    assert.equal(model.neighbourId("first"), 2);
});

test("a léptetés a megjelenítés sorrendjét követi, a csoportokon át", () => {
    const world = smallWorld();
    const model = new ExplorerModel();
    model.update(world, world.creatures[2]); // #3, a piros csoport utolsója

    assert.equal(model.neighbourId(1), 4, "#3 után a kék csoport #4-e jön");
    assert.equal(model.neighbourId(-1), 2);
});

// --- kijelölés és szinkron ---

test("térképen kijelölt lény a saját fajcsoportjában emelődik ki, és a csoport kinyílik", () => {
    const world = smallWorld();
    const selection = new Selection();
    const model = new ExplorerModel();
    model.toggleGroup("blue");
    model.update(world, null);

    const blue = world.creatures[3];
    selection.select(pickCreatureAt(world.creatures, blue.x, blue.y));
    const diff = model.update(world, selection.creature);

    assert.equal(diff.selectedId, 4);
    assert.equal(diff.selectionChanged, true);
    assert.equal(groupOf(diff, "blue").open, true);
    assert.equal(model.collapsed.has("blue"), false, "a kinyitás megmarad");
});

test("a kijelölés után a felhasználó újra összecsukhatja a csoportot", () => {
    const world = smallWorld();
    const selection = new Selection();
    const model = new ExplorerModel();
    selection.select(world.creatures[3]);
    model.update(world, selection.creature);

    model.toggleGroup("blue");
    const diff = model.update(world, selection.creature);
    assert.equal(groupOf(diff, "blue").open, false, "a modell nem nyitotta vissza");
    assert.equal(selection.creature, world.creatures[3], "a kijelölés megmaradt");
});

test("csoportból kiválasztva ugyanaz a közös kijelölés jön létre, mint a térképen", () => {
    const world = smallWorld();
    const model = new ExplorerModel();
    model.update(world, null);

    const fromList = new Selection();
    const id = groupOf(model.update(world, null), "red").entries[1].id; // #3
    fromList.select(aliveCreatureById(world.creatures, id));

    const fromMap = new Selection();
    const target = world.creatures[2];
    fromMap.select(pickCreatureAt(world.creatures, target.x, target.y));

    assert.equal(fromList.creature, fromMap.creature);
    assert.equal(model.update(world, fromList.creature).selectedId, 3);
});

// --- születés és halál ---

test("az újszülött a szülő fajcsoportjába kerül, a lista újraépítése nélkül", () => {
    const world = makeWorld();
    addCreature(world, 200, 100, { speciesId: "red" });
    const parent = addReadyParent(world, 640, 300, { speciesId: "green" });
    const model = new ExplorerModel();
    model.update(world, null);

    world.step();
    const diff = model.update(world, null);

    assert.equal(diff.reset, false);
    assert.equal(diff.added.length, 1);
    assert.equal(diff.added[0].speciesId, "green");
    assert.equal(groupOf(diff, "green").alive, 2);
    assert.equal(diff.groupsChanged, true);
    assert.deepEqual(groupOf(diff, "green").entries.map((e) => e.id), [parent.id, 3]);
});

test("a meghalt lény kikerül a fajcsoportjából, a létszám csökken", () => {
    const world = smallWorld();
    const model = new ExplorerModel();
    model.update(world, null);

    world.creatures[3].die("test"); // #4 kék, az egyetlen
    const diff = model.update(world, null);

    assert.deepEqual(diff.removed, [4]);
    assert.equal(groupOf(diff, "blue").alive, 0);
    assert.deepEqual(groupOf(diff, "blue").entries, []);
});

test("hosszú futásban minden csoport pontosan a faj élő egyedeit tartalmazza", () => {
    const world = createDefaultWorld(14);
    const model = new ExplorerModel();
    const rows = new Map(); // csoportkulcs → id-k, a diffekből építve (mint a DOM)
    let births = 0;

    for (let t = 0; t < 20000; t++) {
        world.step();
        if (t % 8 !== 0) continue;

        const diff = model.update(world, null);
        // ugyanúgy, mint a ui.js: újraépítéskor a teljes állapot, különben csak a változás
        if (diff.reset) {
            rows.clear();
            for (const g of diff.groups) rows.set(g.key, g.entries.map((e) => e.id));
        } else {
            for (const id of diff.removed) {
                for (const [key, ids] of rows) rows.set(key, ids.filter((x) => x !== id));
            }
            for (const entry of diff.added) {
                rows.get(entry.speciesId ?? "none").push(entry.id);
                births++;
            }
        }

        for (const species of SPECIES) {
            const truth = world.creatures.filter((c) => c.alive && c.speciesId === species.id).map((c) => c.id);
            assert.deepEqual(rows.get(species.id), truth, `${world.tick}. tick, ${species.id}`);
            assert.equal(groupOf(diff, species.id).alive, truth.length);
        }
    }
    assert.ok(births > 10, `kevés születés: ${births}`);
});

// --- keresés ---

test("kereséskor csak a találatot tartalmazó csoportok látszanak, és nyitva vannak", () => {
    const world = smallWorld();
    const model = new ExplorerModel();
    model.toggleGroup("red"); // a felhasználó összecsukta

    model.setQuery("#3");
    const diff = model.update(world, null);

    assert.equal(diff.reset, true);
    assert.deepEqual(diff.entries.map((e) => e.id), [3]);
    assert.equal(groupOf(diff, "red").visible, true);
    assert.equal(groupOf(diff, "red").open, true, "kereséskor a releváns csoport kinyílik");
    assert.equal(groupOf(diff, "red").matches, 1);
    assert.equal(groupOf(diff, "yellow").visible, false);
    assert.equal(groupOf(diff, "green").visible, false);
});

test("a keresés törlése után a csoport visszakapja a felhasználó által beállított állapotot", () => {
    const world = smallWorld();
    const model = new ExplorerModel();
    model.toggleGroup("red");

    model.setQuery("3");
    model.update(world, null);
    model.setQuery("");
    const diff = model.update(world, null);

    assert.equal(groupOf(diff, "red").open, false);
    assert.equal(groupOf(diff, "green").visible, true);
});
