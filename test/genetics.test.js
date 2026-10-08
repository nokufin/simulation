import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../rng.js";
import {
    defaultGenes,
    randomGenes,
    mutateGenes,
    SPAWN_GENE_RANGES,
    GENE_LIMITS,
} from "../genetics.js";

const MUTATION = { rate: 0.1, strength: 0.1 };

test("a kezdeti sorsolás a SPAWN_GENE_RANGES-en belül marad, és seedfüggő", () => {
    const rng = createRng(1);
    for (let i = 0; i < 1000; i++) {
        const genes = randomGenes(rng);
        for (const [name, [min, max]] of Object.entries(SPAWN_GENE_RANGES)) {
            assert.ok(genes[name] >= min && genes[name] < max, `${name}: ${genes[name]}`);
        }
    }
    assert.deepEqual(randomGenes(createRng(5)), randomGenes(createRng(5)));
    assert.notDeepEqual(randomGenes(createRng(5)), randomGenes(createRng(6)));
});

test("a kezdeti tartományok a mutációs határokon belül vannak, de azoknál szűkebbek", () => {
    for (const [name, [min, max]] of Object.entries(SPAWN_GENE_RANGES)) {
        const [limitMin, limitMax] = GENE_LIMITS[name];
        assert.ok(limitMin <= min && max <= limitMax, `${name} kilóg a határokból`);
        assert.ok(limitMax - limitMin > max - min, `${name}: a határ nem tágabb`);
    }
});

test("0 mutációs eséllyel az utód génjei megegyeznek a szülőével", () => {
    const parent = randomGenes(createRng(3));
    const child = mutateGenes(parent, createRng(9), { rate: 0, strength: 0.5 });
    assert.deepEqual(child, parent);
    assert.notEqual(child, parent, "nem másolat, hanem ugyanaz az objektum");
});

test("a mutáció nem módosítja a szülő génjeit", () => {
    const parent = randomGenes(createRng(3));
    const before = { ...parent };
    mutateGenes(parent, createRng(9), { rate: 1, strength: 0.5 });
    assert.deepEqual(parent, before);
});

test("mutációkor a gén legfeljebb ±strength arányban tér el, a nem mutálható gének változatlanok", () => {
    const rng = createRng(11);
    const parent = defaultGenes();
    for (let i = 0; i < 1000; i++) {
        const child = mutateGenes(parent, rng, { rate: 1, strength: 0.1 });
        for (const name of Object.keys(GENE_LIMITS)) {
            const ratio = child[name] / parent[name];
            assert.ok(ratio >= 0.9 - 1e-12 && ratio <= 1.1 + 1e-12, `${name}: ${ratio}`);
        }
        for (const name of ["metabolicRate", "maxEnergy", "maturityAge", "offspringEnergy", "reproductionStrategy"]) {
            assert.equal(child[name], parent[name], `${name} megváltozott`);
        }
    }
});

test("ismételt erős mutáció sem viszi ki a géneket a GENE_LIMITS-ből", () => {
    const rng = createRng(21);
    let genes = defaultGenes();
    for (let generation = 0; generation < 5000; generation++) {
        genes = mutateGenes(genes, rng, { rate: 1, strength: 0.5 });
        for (const [name, [min, max]] of Object.entries(GENE_LIMITS)) {
            assert.ok(genes[name] >= min && genes[name] <= max, `${generation}. gen, ${name}: ${genes[name]}`);
        }
        assert.ok(genes.hue >= 0 && genes.hue < 360, `hue: ${genes.hue}`);
    }
});

test("a mutációs esély érvényesül: kb. a gének 10%-a mutálódik", () => {
    const rng = createRng(31);
    const parent = defaultGenes();
    const names = Object.keys(GENE_LIMITS);
    let mutated = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) {
        const child = mutateGenes(parent, rng, MUTATION);
        for (const name of names) {
            if (child[name] !== parent[name]) mutated++;
        }
    }
    const share = mutated / (trials * names.length);
    assert.ok(Math.abs(share - 0.1) < 0.01, `mutált arány: ${share}`);
});

test("azonos seed mellett azonos az utód génkészlete", () => {
    const parent = randomGenes(createRng(4));
    assert.deepEqual(
        mutateGenes(parent, createRng(77), MUTATION),
        mutateGenes(parent, createRng(77), MUTATION),
    );
});

test("hiányzó mutációs beállítás hibát jelez, nem kapcsolja ki csendben a mutációt (regresszió)", () => {
    const parent = defaultGenes();
    assert.throws(() => mutateGenes(parent, createRng(1), {}), /érvénytelen mutációs beállítás/);
    assert.throws(
        () => mutateGenes(parent, createRng(1), { mutationRate: 0.1, mutationStrength: 0.1 }),
        /érvénytelen mutációs beállítás/,
    );
});
