import { test } from "node:test";
import assert from "node:assert/strict";
import { AiBrain, parseDecision, describeSituation, DIRECTIONS } from "../ai-brain.js";
import { AI_CONFIG } from "../config.js";
import { isAiSpecies, getSpecies } from "../species.js";
import { createDefaultWorld } from "../scenario.js";
import { makeWorld, addCreature, addFood, run } from "./helpers.js";

// --- a lény oldala: a szándék követése (szinkron, hálózat nélkül) ---

const intentFor = (world, fields) => ({ until: world.tick + 600, reason: "teszt", ...fields });

test("a fekete faj az AI-faj, a többi nem", () => {
    assert.equal(isAiSpecies("black"), true);
    assert.equal(getSpecies("black").tone, "black");
    for (const id of ["red", "blue", "green", "yellow", "purple", null]) assert.equal(isAiSpecies(id), false);
});

test("seek: jóllakottan is a választott kajához megy, odaérve eszik, a szándék véget ér", () => {
    const world = makeWorld();
    const near = addFood(world, 700, 300);
    const chosen = addFood(world, 640, 380);
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 140 });
    creature.aiIntent = intentFor(world, { action: "seek", foodId: chosen.id, foodSpawn: chosen.spawnCount });

    world.step();
    assert.equal(creature.state, "seeking");
    assert.equal(creature.target, chosen, "a modell által választott kaja, nem a legközelebbi");
    assert.notEqual(creature.target, near);

    for (let t = 0; t < 300 && creature.aiIntent; t++) world.step();
    assert.equal(creature.aiIntent, null);
    assert.ok(creature.canReach(chosen, 3), "odaért");
    assert.equal(creature.state, "eating");
});

test("seek: ha a választott kaja közben elfogyott és újraszületett, a szándék elvész", () => {
    const world = makeWorld();
    const food = addFood(world, 700, 300);
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 140 });
    creature.aiIntent = intentFor(world, { action: "seek", foodId: food.id, foodSpawn: food.spawnCount - 1 });

    world.step();
    assert.equal(creature.aiIntent, null);
    assert.equal(creature.state, "wandering", "jóllakottan a beépített logika bóklászik");
});

test("rest: áll, nem mozdul, csak az alapanyagcsere fogy", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 100 });
    creature.aiIntent = intentFor(world, { action: "rest" });

    run(world, 50);
    assert.equal(creature.state, "resting");
    assert.deepEqual([creature.x, creature.y], [640, 300]);
    const { metabolicRate, size } = creature.genes;
    assert.ok(Math.abs(100 - creature.energy - 50 * metabolicRate * (size / 20) * 0.1) < 1e-9);
});

test("explore: a választott irányba fordul és halad, a pálya szélén a szándék véget ér", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 140, heading: 0 });
    creature.aiIntent = intentFor(world, { action: "explore", heading: DIRECTIONS.N, direction: "N" });

    run(world, 60);
    assert.equal(creature.state, "exploring");
    assert.ok(creature.y < 280, `felfelé (N) haladt: y=${creature.y}`);

    run(world, 600);
    assert.equal(creature.aiIntent, null, "a felső szélnél véget ért");
    assert.notEqual(creature.state, "exploring");
});

test("explore: ha megéhezik és kaját lát, a beépített logika átveszi", () => {
    const world = makeWorld();
    addFood(world, 700, 300);
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 30 });
    creature.aiIntent = intentFor(world, { action: "explore", heading: DIRECTIONS.W, direction: "W" });

    world.step();
    assert.equal(creature.aiIntent, null);
    assert.equal(creature.state, "seeking");
});

test("a lejárt szándékot a lény eldobja", () => {
    const world = makeWorld();
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 140 });
    creature.aiIntent = { action: "rest", until: 3, reason: "" };

    run(world, 3);
    assert.equal(creature.state, "resting");
    world.step();
    assert.equal(creature.aiIntent, null);
    assert.equal(creature.state, "wandering");
});

// --- a modell válaszának ellenőrzése ---

function situationWithFood(ids) {
    return { prompt: { visible_food: ids.map((id) => ({ food_id: id })), passable_directions: ["N"] } };
}

test("parseDecision: csak érvényes akciót, látott kaját és létező irányt fogad el", () => {
    const situation = situationWithFood([3, 7]);
    assert.deepEqual(parseDecision('{"action":"seek","food_id":7,"reason":" éhes "}', situation), {
        action: "seek",
        foodId: 7,
        reason: "éhes",
    });
    assert.equal(parseDecision('{"action":"seek","food_id":99,"reason":""}', situation), null, "nem látott kaja");
    assert.equal(parseDecision('{"action":"seek","food_id":null,"reason":""}', situation).foodId, 3, "azonosító nélkül a legközelebbi");
    assert.equal(parseDecision('{"action":"seek","food_id":null,"reason":""}', situationWithFood([])), null, "nincs látott kaja");
    assert.deepEqual(parseDecision('{"action":"explore","direction":"sw","reason":"x"}', situation), {
        action: "explore",
        direction: "SW",
        reason: "x",
    });
    assert.equal(parseDecision('{"action":"explore","direction":"UP","reason":""}', situation), null);
    assert.deepEqual(parseDecision('{"action":"rest","reason":"spórol"}', situation), { action: "rest", reason: "spórol" });
    assert.equal(parseDecision('{"action":"fly","reason":""}', situation), null);
    assert.equal(parseDecision("persze, íme a válasz", situation), null);
});

test("a helyzetleírás a látott kajákat, járható irányokat és az állapotot tartalmazza", () => {
    const world = makeWorld();
    const food = addFood(world, 700, 300);
    const creature = addCreature(world, 640, 300, { speciesId: "black", energy: 75 });
    creature.sense(world);

    const { prompt } = describeSituation(creature, world);
    assert.equal(prompt.you.energy_pct, 50);
    assert.deepEqual(prompt.visible_food, [{ food_id: food.id, distance: 60, direction: "E", amount_pct: 100 }]);
    assert.deepEqual(prompt.passable_directions.sort(), Object.keys(DIRECTIONS).sort());
});

// --- az agy: kérések ütemezése kamu Ollamával ---

// a kamu fetch minden kérést rögzít, és kézzel engedi el a válaszokat
function fakeOllama({ models = [AI_CONFIG.model] } = {}) {
    const calls = [];
    const fetchFn = (url, options) =>
        new Promise((resolve, reject) => {
            calls.push({ url, body: options.body ? JSON.parse(options.body) : null, resolve, reject });
        });
    const respond = (call, payload) => call.resolve({ ok: true, json: async () => payload });
    return {
        calls,
        fetchFn,
        respondTags: (call) => respond(call, { models: models.map((name) => ({ name })) }),
        respondChat: (call, decision) => respond(call, { message: { content: JSON.stringify(decision) } }),
    };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

function brainWorld() {
    const world = makeWorld();
    const food = addFood(world, 700, 300);
    const ai = addCreature(world, 640, 300, { speciesId: "black", energy: 75 });
    const other = addCreature(world, 300, 300, { speciesId: "red", energy: 75 });
    world.step();
    return { world, food, ai, other };
}

test("az agy előbb ellenőrzi a modellt, utána csak az AI-fajtól kérdez, egyszerre egyet", async () => {
    const ollama = fakeOllama();
    const brain = new AiBrain(AI_CONFIG, { fetchFn: ollama.fetchFn });
    const { world, food, ai } = brainWorld();

    brain.update(world);
    assert.equal(ollama.calls.length, 1);
    assert.match(ollama.calls[0].url, /\/api\/tags$/);
    ollama.respondTags(ollama.calls[0]);
    await flush();
    assert.equal(brain.status, "ready");

    brain.update(world);
    brain.update(world); // amíg fut egy kérés, újat nem indít
    assert.equal(ollama.calls.length, 2);
    const chat = ollama.calls[1];
    assert.match(chat.url, /\/api\/chat$/);
    assert.equal(chat.body.model, AI_CONFIG.model);
    assert.ok(chat.body.messages[1].content.includes(`"food_id":${food.id}`));
    assert.equal(brain.status, "thinking");

    ollama.respondChat(chat, { action: "seek", food_id: food.id, reason: "Ott a kaja." });
    await flush();
    assert.equal(brain.decisions, 1);
    assert.deepEqual(
        [ai.aiIntent.action, ai.aiIntent.foodId, ai.aiIntent.foodSpawn, ai.aiLast.reason],
        ["seek", food.id, food.spawnCount, "Ott a kaja."],
    );

    // a friss döntés után a lény egy ideig nem kérdez újra; a piros lény sosem
    brain.update(world);
    assert.equal(ollama.calls.length, 2);
    assert.ok(world.creatures.filter((c) => c.aiIntent).every((c) => c === ai));
});

test("érvénytelen válasz: nincs szándék, a lény a beépített logikával él", async () => {
    const ollama = fakeOllama();
    const brain = new AiBrain(AI_CONFIG, { fetchFn: ollama.fetchFn });
    const { world, ai } = brainWorld();

    brain.update(world);
    ollama.respondTags(ollama.calls[0]);
    await flush();
    brain.update(world);
    ollama.respondChat(ollama.calls[1], { action: "seek", food_id: 12345, reason: "kitalált kaja" });
    await flush();

    assert.equal(brain.rejected, 1);
    assert.equal(ai.aiIntent, null);
});

test("hiányzó modell vagy elérhetetlen Ollama: hibaállapot, várakozás után újrapróbál", async () => {
    let time = 0;
    const ollama = fakeOllama({ models: ["valami-mas:1b"] });
    const brain = new AiBrain(AI_CONFIG, { fetchFn: ollama.fetchFn, now: () => time });
    const { world } = brainWorld();

    brain.update(world);
    ollama.respondTags(ollama.calls[0]);
    await flush();
    assert.equal(brain.status, "error");
    assert.match(brain.statusText, /ollama pull/);

    brain.update(world);
    assert.equal(ollama.calls.length, 1, "a várakozási idő alatt nem próbálkozik");

    time += 10000;
    brain.update(world);
    assert.equal(ollama.calls.length, 2);
    ollama.calls[1].reject(new TypeError("Failed to fetch"));
    await flush();
    assert.equal(brain.status, "error");
    assert.match(brain.statusText, /nem érhető el/);
});

test("kikapcsolva nem kérdez", () => {
    const ollama = fakeOllama();
    const brain = new AiBrain({ ...AI_CONFIG, enabled: false }, { fetchFn: ollama.fetchFn });
    const { world } = brainWorld();
    brain.update(world);
    assert.equal(ollama.calls.length, 0);
    assert.equal(brain.status, "off");
});

test("az alapvilágban van fekete alapító, és AI nélkül ugyanúgy él, mint a többi", () => {
    const world = createDefaultWorld(1);
    const black = world.creatures.find((c) => c.speciesId === "black");
    assert.ok(black, "van fekete alapító");
    run(world, 300);
    assert.equal(black.aiIntent, null);
});
