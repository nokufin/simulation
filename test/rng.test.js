import { test } from "node:test";
import assert from "node:assert/strict";
import { createRng } from "../rng.js";

const take = (rng, n) => Array.from({ length: n }, () => rng.next());

test("azonos seed azonos számsort ad", () => {
    assert.deepEqual(take(createRng(123), 1000), take(createRng(123), 1000));
});

test("eltérő seed eltérő számsort ad", () => {
    assert.notDeepEqual(take(createRng(1), 20), take(createRng(2), 20));
});

test("next() a [0, 1) tartományban marad", () => {
    for (const value of take(createRng(7), 10000)) {
        assert.ok(value >= 0 && value < 1, `tartományon kívül: ${value}`);
    }
});

test("range(min, max) a [min, max) tartományban marad", () => {
    const rng = createRng(99);
    for (let i = 0; i < 10000; i++) {
        const value = rng.range(-5, 3);
        assert.ok(value >= -5 && value < 3, `tartományon kívül: ${value}`);
    }
});

test("a seed 32 bites előjel nélküli egészként tárolódik", () => {
    assert.equal(createRng(-1).seed, 4294967295);
    assert.deepEqual(take(createRng(2 ** 32 + 5), 10), take(createRng(5), 10));
});
