import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorld } from "../scenario.js";
import { drawWorld } from "../render.js";
import { snapshot } from "./helpers.js";

// canvas-kontextus helyett: minden metódushívást és értékadást elnyel
const fakeCtx = new Proxy({}, { get: () => () => {}, set: () => true });

test("azonos seed és kezdés mellett a futás tick-ről tick-re azonos", () => {
    const a = createDefaultWorld(42);
    const b = createDefaultWorld(42);
    assert.equal(snapshot(a), snapshot(b));

    // végigmegy egy teljes életcikluson (öregkori halálok és holttest-eltávolítás is)
    for (let t = 0; t < 12000; t++) {
        a.step();
        b.step();
        if (t % 500 === 0) assert.equal(snapshot(a), snapshot(b), `eltérés a ${t}. tick-ben`);
    }
    assert.equal(snapshot(a), snapshot(b));
    assert.ok(a.deaths > 0, "a futás nem ért el halálig");
});

test("eltérő seed eltérő világot és futást ad", () => {
    const a = createDefaultWorld(1);
    const b = createDefaultWorld(2);
    assert.notEqual(snapshot(a), snapshot(b));
});

test("a szimuláció nem használja a Math.random-ot", () => {
    const original = Math.random;
    Math.random = () => {
        throw new Error("Math.random hívás a szimulációban");
    };
    try {
        const world = createDefaultWorld(7);
        for (let t = 0; t < 3000; t++) world.step();
    } finally {
        Math.random = original;
    }
});

test("a kirajzolás nem befolyásolja a szimulációt", () => {
    const drawn = createDefaultWorld(99);
    const plain = createDefaultWorld(99);

    for (let t = 0; t < 3000; t++) {
        drawn.step();
        drawWorld(fakeCtx, drawn, { debug: true, selected: drawn.creatures[0] });
        plain.step();
    }

    assert.equal(snapshot(drawn), snapshot(plain));
});
