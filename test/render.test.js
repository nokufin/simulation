import { test } from "node:test";
import assert from "node:assert/strict";
import { drawWorld } from "../render.js";
import { describeCreature } from "../inspector.js";
import { makeWorld, addCreature } from "./helpers.js";

// canvas-kontextus helyett: minden ív és minden kitöltés / körvonal rögzül a stílusával
function recordingCtx() {
    const ops = [];
    let arc = null;
    const ctx = {
        fillStyle: null,
        strokeStyle: null,
        lineWidth: 1,
        globalAlpha: 1,
        beginPath() {
            arc = null;
        },
        arc(x, y, r) {
            arc = { x, y, r };
        },
        fill() {
            ops.push({ op: "fill", style: this.fillStyle, ...arc });
        },
        stroke() {
            ops.push({ op: "stroke", style: this.strokeStyle, width: this.lineWidth, alpha: this.globalAlpha, ...arc });
        },
    };
    return {
        ops,
        ctx: new Proxy(ctx, { get: (target, key) => (key in target ? target[key] : () => {}) }),
    };
}

// egy lény rajzolt elemei (a pozíciója alapján)
const at = (ops, creature) => ops.filter((o) => o.x === creature.x && o.y === creature.y);

test("a test a lény saját színével, a körvonal a faja eredeti színével rajzolódik", () => {
    const world = makeWorld();
    // piros fajú lény, amelynek a saját színe mutációval narancsba sodródott
    const creature = addCreature(world, 300, 300, { speciesId: "red", genes: { hue: 40, size: 10 } });
    const { ctx, ops } = recordingCtx();

    drawWorld(ctx, world);

    const mine = at(ops, creature);
    const body = mine.find((o) => o.op === "fill");
    assert.equal(body.style, "hsl(40, 70%, 55%)");
    assert.equal(body.r, 10);

    const ring = mine.find((o) => o.op === "stroke" && o.r > 10);
    assert.equal(ring.style, "hsl(0, 75%, 60%)", "a körvonal nem a faj (piros) színe");
    assert.ok(ring.width <= 2, "a körvonal nem visszafogott");
});

test("a körvonal kis lénynél is a test körül, külön sugáron látszik", () => {
    const world = makeWorld();
    const tiny = addCreature(world, 300, 300, { speciesId: "blue", genes: { size: 3 } });
    const { ctx, ops } = recordingCtx();

    drawWorld(ctx, world);

    const ring = at(ops, tiny).find((o) => o.op === "stroke" && o.style.startsWith("hsl(205"));
    assert.ok(ring, "nincs fajkörvonal");
    assert.ok(ring.r - ring.width / 2 > 3 + 1, "a körvonal a test sötét élébe olvad");
});

test("faj nélküli lénynek nincs fajkörvonala", () => {
    const world = makeWorld();
    const creature = addCreature(world, 300, 300);
    const { ctx, ops } = recordingCtx();

    drawWorld(ctx, world);

    assert.equal(at(ops, creature).filter((o) => o.op === "stroke").length, 1, "csak a test éle");
});

test("a kijelölőgyűrű kívül esik a fajkörvonalon, és hézag marad köztük", () => {
    const world = makeWorld();
    const creature = addCreature(world, 300, 300, { speciesId: "green", genes: { size: 6 } });
    const { ctx, ops } = recordingCtx();

    drawWorld(ctx, world, { selected: creature });

    const strokes = at(ops, creature).filter((o) => o.op === "stroke");
    const ring = strokes.find((o) => o.style.startsWith("hsl(130"));
    const selection = strokes.filter((o) => o.style === "white" || o.style.startsWith("rgba(0, 0, 0"));
    assert.equal(selection.length, 2, "nincs kettős kijelölőgyűrű");

    const ringOuter = ring.r + ring.width / 2;
    const selectionInner = Math.min(...selection.map((o) => o.r - o.width / 2));
    assert.ok(selectionInner - ringOuter >= 2, `hézag: ${selectionInner - ringOuter}`);
});

test("halott lény teste szürke, a fajkörvonal vele együtt halványul", () => {
    const world = makeWorld();
    const corpse = addCreature(world, 300, 300, { speciesId: "purple" });
    corpse.die("test");
    corpse.fadeAlpha = 0.4;
    const { ctx, ops } = recordingCtx();

    drawWorld(ctx, world);

    const mine = at(ops, corpse);
    assert.equal(mine.find((o) => o.op === "fill").style, "gray");
    const ring = mine.find((o) => o.op === "stroke" && o.style.startsWith("hsl(280"));
    assert.equal(ring.alpha, 0.4);
});

// --- a panel: faj és egyedi szín ---

test("a panel külön mutatja a fajt (körvonal) és az egyedi színt (kitöltés), az eltéréssel", () => {
    const world = makeWorld();
    const cases = [
        [{ speciesId: "red", genes: { hue: 48 } }, "48° (fajszíntől +48°)"],
        [{ speciesId: "red", genes: { hue: 350 } }, "350° (fajszíntől −10°)"],
        [{ speciesId: "orange", genes: { hue: 40 } }, "40° (a faj színe)"],
        [{ speciesId: "purple", genes: { hue: 274.6 } }, "275° (fajszíntől −5°)"],
    ];

    for (const [state, expected] of cases) {
        const creature = addCreature(world, 300, 300, state);
        const identity = describeCreature(creature, world).sections.find((s) => s.key === "identity");
        const species = identity.rows.find((r) => r.key === "species");
        const color = identity.rows.find((r) => r.key === "color");

        assert.equal(color.value, expected);
        assert.equal(color.swatch, state.genes.hue);
        assert.equal(color.swatchKind, "fill");
        assert.equal(species.swatchKind, "ring");
    }
});
