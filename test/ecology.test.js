import { test } from "node:test";
import assert from "node:assert/strict";
import { createDefaultWorld } from "../scenario.js";
import { LAND, DEEP, habitatClass, HABITAT_PROFILES } from "../habitat.js";
import { defaultGenes } from "../genetics.js";
import { Creature } from "../creature.js";
import { populationSummary, describeCreature } from "../inspector.js";
import { makeWorld, addFood, run, snapshot } from "./helpers.js";

const landGenes = () => ({ ...defaultGenes(), ...HABITAT_PROFILES.land });
const waterGenes = () => ({ ...defaultGenes(), ...HABITAT_PROFILES.water });

// a futás minden tick-jében ellenőriz egy feltételt minden élő lényre
function runChecking(world, ticks, check) {
    for (let t = 0; t < ticks; t++) {
        world.step();
        for (const creature of world.creatures) if (creature.alive) check(creature, world);
    }
}

// --- táplálék ---

test("a táplálék csak a saját élőhelyén jelenik meg, újraszületés után is (mindkét regenerációval)", () => {
    for (const regrowth of ["instant", "gradual"]) {
        for (const seed of [1, 2, 3]) {
            const world = createDefaultWorld(seed, { regrowth });
            let respawns = 0;
            for (let t = 0; t < 15000; t++) {
                world.step();
                if (t % 50 !== 0) continue;
                for (const food of world.foods) {
                    const type = world.terrain.typeAt(food.x, food.y);
                    if (food.habitat === "land") assert.equal(type, LAND, `${regrowth}, seed ${seed}: szárazföldi kaja vízben`);
                    else assert.equal(type, DEEP, `${regrowth}, seed ${seed}: vízi kaja nem mély vízben`);
                }
            }
            respawns = world.foods.reduce((sum, food) => sum + food.spawnCount, 0);
            assert.ok(respawns > world.foods.length * 3, `${regrowth}, seed ${seed}: alig volt újraszületés`);
        }
    }
});

test("a lények csak a saját terepükön lévő kaját veszik célba", () => {
    for (const seed of [1, 4]) {
        const world = createDefaultWorld(seed);
        runChecking(world, 10000, (creature) => {
            if (creature.target) {
                assert.ok(world.canOccupy(creature.genes, creature.target.x, creature.target.y), `#${creature.id} elérhetetlen célpont`);
            }
        });
    }
});

test("fokozatos regeneráció: a leevett kaja üresen, új helyen indul, és helyben nő vissza (regresszió)", () => {
    const world = makeWorld(3, { regrowth: "gradual", growthRate: 0.5, minEdible: 10 });
    const food = addFood(world, 300, 300, 1);
    food.bite(1); // a lények leették

    world.step();
    assert.equal(food.spawnCount, 1);
    assert.equal(food.amount, 0);
    const { x, y } = food;

    run(world, 10);
    assert.equal(food.spawnCount, 1, "az üres kaja nem ugrálhat tovább");
    assert.deepEqual([food.x, food.y], [x, y]);
    assert.equal(food.amount, 5);
    assert.equal(world.isFoodAvailable(food), false, "10 alatt még nem éri meg megcélozni");

    run(world, 10);
    assert.equal(world.isFoodAvailable(food), true);
    run(world, 200);
    assert.equal(food.amount, food.maxAmount);
});

test("fokozatos regeneráció: a részben megevett kaja is visszanő, a helyén", () => {
    const world = makeWorld(3, { regrowth: "gradual", growthRate: 0.2 });
    const food = addFood(world, 300, 300, 20);
    run(world, 10);
    assert.ok(Math.abs(food.amount - 22) < 1e-9);
    assert.equal(food.spawnCount, 0);
});

// --- élőhelyek: senki nem kerül tiltott terepre ---

test("a kezdeti szárazföldi lény sosem kerül mély vízbe, a vízi sosem szárazföldre (több seed, hosszú futás)", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
        const world = createDefaultWorld(seed);
        let checks = 0;
        runChecking(world, 20000, (creature) => {
            const type = world.terrain.typeAt(creature.x, creature.y);
            const kind = habitatClass(creature.genes);
            if (kind === "land") assert.notEqual(type, DEEP, `seed ${seed}, #${creature.id} mély vízben`);
            if (kind === "water") assert.notEqual(type, LAND, `seed ${seed}, #${creature.id} szárazföldön`);
            assert.ok(world.canOccupy(creature.genes, creature.x, creature.y));
            checks++;
        });
        assert.ok(checks > 100000, `seed ${seed}: kevés ellenőrzés (${checks})`);
    }
});

test("az utód mindig a saját génjei szerint életképes helyre születik", () => {
    for (const seed of [2, 6]) {
        const world = createDefaultWorld(seed);
        const original = world.spawnOffspring.bind(world);
        let born = 0;
        world.spawnOffspring = (birth) => {
            const child = original(birth);
            assert.ok(world.canOccupy(child.genes, child.x, child.y), `#${child.id} életképtelen helyre született`);
            born++;
            return child;
        };
        run(world, 20000);
        assert.ok(born > 50, `seed ${seed}: kevés születés (${born})`);
    }
});

test("a szétlökés sem tol senkit tiltott terepre", () => {
    const world = createDefaultWorld(4, { initialCreatures: 60 });
    runChecking(world, 3000, (creature) => {
        assert.ok(world.canOccupy(creature.genes, creature.x, creature.y), `#${creature.id}`);
    });
});

// --- navigáció a part mentén ---

// egy part menti pont, ahonnan a lény egyenesen a tiltott terep felé néz
function coastStart(world, genes) {
    const { terrain } = world;
    for (let i = 0; i < terrain.types.length; i++) {
        const x = (i % terrain.cols) * terrain.cellSize + 5;
        const y = Math.floor(i / terrain.cols) * terrain.cellSize + 5;
        if (x < 60 || y < 60 || x > world.width - 60 || y > world.height - 60) continue;
        if (!world.canOccupy(genes, x, y)) continue;
        for (let a = 0; a < 8; a++) {
            const angle = (a * Math.PI) / 4;
            if (!world.canOccupy(genes, x + Math.cos(angle) * 12, y + Math.sin(angle) * 12)) return { x, y, angle };
        }
    }
    throw new Error("nincs part");
}

test("a partnak nekiinduló lény nem akad el, hanem továbbhalad (szárazföldi és vízi)", () => {
    for (const seed of [1, 2, 3]) {
        for (const genes of [landGenes(), waterGenes()]) {
            const world = createDefaultWorld(seed, { initialCreatures: 0 });
            const start = coastStart(world, genes);
            const creature = new Creature(1, start.x, start.y, genes, start.angle);
            world.creatures.push(creature);

            let farthest = 0;
            for (let t = 0; t < 600; t++) {
                world.step();
                assert.ok(world.canOccupy(genes, creature.x, creature.y));
                farthest = Math.max(farthest, creature.distanceTo(start));
            }
            assert.ok(farthest > 100, `seed ${seed}: csak ${farthest.toFixed(0)} px-re jutott`);
        }
    }
});

test("hosszú futásban senki nem ragad le a parton, és nem keres örökké elérhetetlen kaját", () => {
    for (const seed of [2, 5]) {
        const world = createDefaultWorld(seed);
        const windows = new Map();
        const seeking = new Map();
        let checked = 0;
        for (let t = 0; t < 20000; t++) {
            world.step();
            for (const c of world.creatures) {
                if (!c.alive) continue;
                // 600 tick folyamatos bóklászás alatt a bejárt terület (befoglaló téglalap
                // átlója) legalább 30 px: a beszorult vagy helyben remegő lénynél ez kicsi,
                // a hurkot leíró (de haladó) lénynél nagy, akkor is, ha a végén visszaér
                if (c.state === "wandering") {
                    const w = windows.get(c.id);
                    if (!w) windows.set(c.id, { t, minX: c.x, maxX: c.x, minY: c.y, maxY: c.y });
                    else {
                        w.minX = Math.min(w.minX, c.x);
                        w.maxX = Math.max(w.maxX, c.x);
                        w.minY = Math.min(w.minY, c.y);
                        w.maxY = Math.max(w.maxY, c.y);
                        if (t - w.t >= 600) {
                            const spread = Math.hypot(w.maxX - w.minX, w.maxY - w.minY);
                            assert.ok(spread >= 30, `seed ${seed}, #${c.id} beragadt (${t}. tick, ${spread.toFixed(0)} px)`);
                            windows.set(c.id, { t, minX: c.x, maxX: c.x, minY: c.y, maxY: c.y });
                            checked++;
                        }
                    }
                } else windows.delete(c.id);

                // ugyanazt a kaját legfeljebb 600 tick-ig keresi
                const key = c.state === "seeking" ? `${c.target.id}:${c.targetSpawn}` : null;
                const s = seeking.get(c.id);
                if (!key) seeking.delete(c.id);
                else if (!s || s.key !== key) seeking.set(c.id, { key, t });
                else assert.ok(t - s.t <= 600, `seed ${seed}, #${c.id} ${t - s.t} tick óta keres`);
            }
        }
        assert.ok(checked > 100, `seed ${seed}: kevés vizsgált szakasz (${checked})`);
    }
});

test("a part mentén nincs remegés: hirtelen megfordulás csak elvétve", () => {
    const world = createDefaultWorld(2);
    const last = new Map();
    let flips = 0;
    let samples = 0;
    for (let t = 0; t < 15000; t++) {
        world.step();
        for (const c of world.creatures) {
            if (!c.alive) continue;
            const prev = last.get(c.id);
            if (prev !== undefined) {
                const d = Math.abs(((((c.heading - prev) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
                samples++;
                if (d > 2.5) flips++;
            }
            last.set(c.id, c.heading);
        }
    }
    // mérve kb. 0,5 ezrelék; a tesztküszöb ennek többszöröse
    assert.ok(flips / samples < 0.003, `megfordulás: ${((flips / samples) * 1000).toFixed(2)}‰`);
});

// --- életképesség élőhelyenként ---

test("a szárazföldi és a vízi populáció külön-külön is életképes lehet", () => {
    for (const [label, species] of [
        ["szárazföldi", ["red", "green", "yellow"]],
        ["vízi", ["blue", "purple"]],
    ]) {
        let survived = 0;
        for (const seed of [1, 2, 3, 5]) {
            const world = createDefaultWorld(seed, { species, initialCreatures: 4 });
            run(world, 25000);
            if (world.aliveCount >= 10 && world.births >= 50) survived++;
        }
        assert.ok(survived >= 3, `${label}: csak ${survived}/4 seedben életképes`);
    }
});

test("hosszú futásban nincs NaN és érvénytelen pozíció (több seed, mindkét regenerációval)", () => {
    for (const regrowth of ["instant", "gradual"]) {
        for (const seed of [7, 8]) {
            const world = createDefaultWorld(seed, { regrowth });
            runChecking(world, 20000, (c) => {
                assert.ok(Number.isFinite(c.x + c.y + c.heading + c.speed + c.energy + c.health), `#${c.id} NaN`);
                assert.ok(c.x >= 0 && c.x <= world.width && c.y >= 0 && c.y <= world.height, `#${c.id} a pályán kívül`);
                assert.ok(world.canOccupy(c.genes, c.x, c.y), `#${c.id} tiltott terepen`);
            });
        }
    }
});

// --- determinizmus ---

test("terepes világban is azonos seed = azonos futás (mindkét regenerációval)", () => {
    for (const regrowth of ["instant", "gradual"]) {
        const a = createDefaultWorld(77, { regrowth });
        const b = createDefaultWorld(77, { regrowth });
        assert.deepEqual(a.terrain.types, b.terrain.types);
        for (let t = 1; t <= 15000; t++) {
            a.step();
            b.step();
            if (t % 1000 === 0) assert.equal(snapshot(a), snapshot(b), `${regrowth}: eltérés a ${t}. tick-ben`);
        }
        assert.ok(a.births > 0);
    }
});

// --- megfigyelői felület ---

test("az összesítő élőhely szerint is bontja a populációt, a panel mutatja a terepet és a képességet", () => {
    const world = createDefaultWorld(1);
    const summary = populationSummary(world);
    assert.equal(summary.landAlive, 4, "piros, zöld, citromsárga, fekete");
    assert.equal(summary.waterAlive, 2, "kék, lila");

    const blue = world.creatures.find((c) => c.speciesId === "blue");
    const life = describeCreature(blue, world).sections.find((s) => s.key === "life").rows;
    const value = (key) => life.find((r) => r.key === key).value;
    assert.ok(["mély víz", "sekély víz"].includes(value("terrain")));
    assert.equal(value("habitat"), "vízi (sekély víz, mély víz)");
});

test("második védelmi vonal: kikapcsolt előrelátással sem lép tiltott terepre", () => {
    const world = createDefaultWorld(3, { initialCreatures: 0 });
    for (const genes of [landGenes(), waterGenes()]) {
        const start = coastStart(world, genes);
        const creature = new Creature(1, start.x, start.y, { ...genes, maxSpeed: 4 }, start.angle);
        creature.isDirectionClear = () => true; // az előrelátás "mindent szabadnak lát"

        for (let t = 0; t < 200; t++) {
            creature.speed = creature.genes.maxSpeed;
            creature.move(world);
            assert.ok(world.canOccupy(genes, creature.x, creature.y), `${t}. lépés: tiltott terepen`);
        }
    }
});
