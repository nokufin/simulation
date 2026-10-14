import { test } from "node:test";
import assert from "node:assert/strict";
import { Terrain, isConnected } from "../terrain.js";
import { LAND, SHALLOW, DEEP, canOccupyType, mobilityOn, habitatClass, HABITAT_PROFILES, BREATHING_THRESHOLD } from "../habitat.js";
import { defaultGenes, mutateGenes } from "../genetics.js";
import { createRng } from "../rng.js";

const W = 1280;
const H = 600;
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// --- a térkép ---

test("azonos seedből azonos térkép, eltérőből eltérő", () => {
    assert.deepEqual(Terrain.generate(W, H, 42).types, Terrain.generate(W, H, 42).types);
    assert.notDeepEqual(Terrain.generate(W, H, 42).types, Terrain.generate(W, H, 43).types);
});

test("a térkép generálása nem használja a világ véletlenszám-folyamát", () => {
    // a World a seedből saját rng-t indít; a terep egy ebből levezetett, külön folyamot használ
    const before = createRng(7).next();
    Terrain.generate(W, H, 7);
    assert.equal(createRng(7).next(), before);
});

test("minden seednél van víz és szárazföld is, mindkettő egy összefüggő terület", () => {
    for (const seed of SEEDS) {
        const terrain = Terrain.generate(W, H, seed);
        const water = terrain.waterFraction;
        assert.ok(water > 0.2 && water < 0.6, `seed ${seed}: víz ${water}`);
        assert.ok(isConnected(terrain, (t) => t === LAND), `seed ${seed}: széteső szárazföld`);
        assert.ok(isConnected(terrain, (t) => t !== LAND), `seed ${seed}: széteső víz`);
        assert.ok(terrain.landFoodCells.length > 100 && terrain.waterFoodCells.length > 100, `seed ${seed}: kevés kajahely`);
    }
});

test("a partvonal nem egyetlen egyenes határ", () => {
    for (const seed of SEEDS) {
        const terrain = Terrain.generate(W, H, seed);
        const { cols, rows, types } = terrain;
        // soronként a vízcellák száma; egyenes határnál a szomszédos sorok különbsége állandó
        const perRow = [];
        for (let r = 0; r < rows; r++) {
            let count = 0;
            for (let c = 0; c < cols; c++) if (types[r * cols + c] !== LAND) count++;
            perRow.push(count);
        }
        const steps = new Set(perRow.slice(1).map((n, i) => n - perRow[i]));
        assert.ok(steps.size >= 3, `seed ${seed}: túl egyenes part`);
    }
});

test("a sekély víz a part mentén van, a mély víz beljebb", () => {
    const terrain = Terrain.generate(W, H, 3);
    const distance = terrain.distanceToOtherType();
    for (let i = 0; i < terrain.types.length; i++) {
        if (terrain.types[i] === SHALLOW) assert.ok(distance[i] <= 2);
        if (terrain.types[i] === DEEP) assert.ok(distance[i] > 2);
    }
});

test("a terep pontonként lekérdezhető, a pályán kívüli pont a szélső cellát kapja", () => {
    const terrain = Terrain.generate(W, H, 5);
    for (let i = 0; i < 2000; i++) {
        const x = (i * 37) % W;
        const y = (i * 53) % H;
        const type = terrain.typeAt(x, y);
        assert.equal(terrain.isWater(x, y), type !== LAND);
        assert.equal(terrain.isLand(x, y), type === LAND);
    }
    assert.equal(terrain.typeAt(-50, -50), terrain.typeAt(0, 0));
    assert.equal(terrain.typeAt(W + 50, H + 50), terrain.typeAt(W - 1, H - 1));
});

test("a sík terep csupa szárazföld", () => {
    const flat = Terrain.flat(W, H);
    assert.equal(flat.hasWater, false);
    assert.ok(flat.types.every((t) => t === LAND));
});

// --- környezeti szabályok ---

test("a szárazföldi profil: szárazföld és sekély víz igen, mély víz nem; a vízi fordítva", () => {
    const land = { ...defaultGenes(), ...HABITAT_PROFILES.land };
    const water = { ...defaultGenes(), ...HABITAT_PROFILES.water };

    assert.deepEqual([LAND, SHALLOW, DEEP].map((t) => canOccupyType(land, t)), [true, true, false]);
    assert.deepEqual([LAND, SHALLOW, DEEP].map((t) => canOccupyType(water, t)), [false, true, true]);
    assert.equal(habitatClass(land), "land");
    assert.equal(habitatClass(water), "water");
});

test("a mozgékonyság a terep szerint szorozza a sebességet", () => {
    const land = { ...defaultGenes(), ...HABITAT_PROFILES.land };
    const water = { ...defaultGenes(), ...HABITAT_PROFILES.water };

    assert.equal(mobilityOn(land, LAND), 1);
    assert.equal(mobilityOn(land, SHALLOW), 0.5, "a szárazföldi lény gázol a sekélyben");
    assert.equal(mobilityOn(water, DEEP), 1);
    assert.equal(mobilityOn(water, SHALLOW), 1);
});

test("egyetlen mutáció nem válthat élőhelyet: a küszöbig sok, egyirányú generáció kellene", () => {
    // a lehető legkedvezőbb mutáció: mindig mutál, és mindig a legnagyobb felfelé lépéssel
    const alwaysUp = { next: () => 0.999999, range: (min, max) => max - 1e-9, angle: () => 0 };
    let genes = { ...defaultGenes(), ...HABITAT_PROFILES.water };

    let generations = 0;
    while (genes.airBreathing < BREATHING_THRESHOLD) {
        genes = mutateGenes(genes, { ...alwaysUp, next: () => 0 }, { rate: 1, strength: 0.1 });
        generations++;
        if (generations === 1) assert.equal(canOccupyType(genes, LAND), false, "egy mutáció után már szárazföldre léphet");
    }
    // 0,05 · 1,1^n ≥ 0,5 → n ≥ 25
    assert.ok(generations >= 25, `már ${generations} generáció után elérte`);
});

test("az élőhely-gének öröklődnek és a határokon belül mutálódnak", () => {
    const rng = createRng(9);
    let genes = { ...defaultGenes(), ...HABITAT_PROFILES.water };
    for (let i = 0; i < 2000; i++) {
        genes = mutateGenes(genes, rng, { rate: 1, strength: 0.5 });
        for (const key of ["airBreathing", "waterBreathing", "landMobility", "waterMobility"]) {
            assert.ok(genes[key] >= 0.01 && genes[key] <= 1, `${key}: ${genes[key]}`);
        }
    }
});
