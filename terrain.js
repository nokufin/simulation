// Terep: a térkép rácsa, cellánként szárazföld / sekély víz / mély víz.
// Valódi, lekérdezhető környezeti adat (nem dekoráció): a mozgás, az élelem helye és a
// születés helye is ebből dolgozik. A generálás seedelt és determinisztikus, és saját
// véletlenszám-folyamot használ, így nem tolja el a világ többi véletlenjét.

import { createRng } from "./rng.js";
import { LAND, SHALLOW, DEEP } from "./habitat.js";

export class Terrain {
    // types: Uint8Array cellánként (LAND / SHALLOW / DEEP), sorfolytonosan
    constructor(width, height, cellSize, types) {
        this.width = width;
        this.height = height;
        this.cellSize = cellSize;
        this.cols = Math.ceil(width / cellSize);
        this.rows = Math.ceil(height / cellSize);
        this.types = types;
        this.hasWater = types.some((type) => type !== LAND);

        // az élelem lehetséges helyei: szárazföldön a víztől legalább egy cellára,
        // vízben a mély részen (a sekély sáv átmeneti zóna, ott nem terem élelem)
        this.landFoodCells = [];
        this.waterFoodCells = [];
        const distance = this.distanceToOtherType();
        for (let i = 0; i < types.length; i++) {
            if (types[i] === LAND && distance[i] >= 2) this.landFoodCells.push(i);
            if (types[i] === DEEP) this.waterFoodCells.push(i);
        }
    }

    // csupa szárazföld (pl. a kézzel összerakott tesztvilágokhoz)
    static flat(width, height, cellSize = 10) {
        const cols = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);
        return new Terrain(width, height, cellSize, new Uint8Array(cols * rows).fill(LAND));
    }

    // seedelt térkép: hullámos partvonalú tenger + legfeljebb néhány öböl, összefüggő
    // szárazfölddel és összefüggő vízzel
    static generate(width, height, seed, { cellSize = 10, waterFraction = 0.4, shallowWidth = 2 } = {}) {
        const rng = createRng((seed ^ 0x5bd1e995) >>> 0);
        const cols = Math.ceil(width / cellSize);
        const rows = Math.ceil(height / cellSize);

        // simított zaj (néhány oktáv) + egy irányos lejtés, hogy a víz egy összefüggő
        // tengerként, ne szétszórt tavakként jelenjen meg
        const noise = valueNoise(cols, rows, rng, [
            { scale: 16, weight: 1 },
            { scale: 8, weight: 0.5 },
            { scale: 4, weight: 0.25 },
        ]);
        const angle = rng.angle();
        const dx = Math.cos(angle);
        const dy = Math.sin(angle);
        const height01 = new Float32Array(cols * rows);
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const along = ((c / cols - 0.5) * dx + (r / rows - 0.5) * dy) * 2; // -1..1 körül
                height01[r * cols + c] = along * 1.2 + noise[r * cols + c] * 0.9;
            }
        }

        // a vízszint úgy, hogy a cellák kb. waterFraction része legyen víz
        const sorted = Float32Array.from(height01).sort();
        const level = sorted[Math.floor(sorted.length * waterFraction)];
        const water = new Uint8Array(cols * rows);
        for (let i = 0; i < water.length; i++) water[i] = height01[i] < level ? 1 : 0;

        // csak a legnagyobb összefüggő víz és szárazföld marad: a kis szigetek / tavacskák
        // beolvadnak a környezetükbe, így mindkét élőhely egyben bejárható
        keepLargestComponent(water, cols, rows, 1);
        keepLargestComponent(water, cols, rows, 0);

        // a part menti víz sekély, a többi mély
        const types = new Uint8Array(cols * rows);
        const toLand = bfsDistance(water, cols, rows, 0);
        for (let i = 0; i < types.length; i++) {
            if (!water[i]) types[i] = LAND;
            else types[i] = toLand[i] <= shallowWidth ? SHALLOW : DEEP;
        }
        return new Terrain(width, height, cellSize, types);
    }

    cellIndex(x, y) {
        const c = Math.min(Math.max(Math.floor(x / this.cellSize), 0), this.cols - 1);
        const r = Math.min(Math.max(Math.floor(y / this.cellSize), 0), this.rows - 1);
        return r * this.cols + c;
    }

    typeAt(x, y) {
        return this.types[this.cellIndex(x, y)];
    }

    isWater(x, y) {
        return this.typeAt(x, y) !== LAND;
    }

    isLand(x, y) {
        return this.typeAt(x, y) === LAND;
    }

    // egy cella véletlen pontja (a cellán belül)
    pointInCell(index, rng) {
        const c = index % this.cols;
        const r = Math.floor(index / this.cols);
        return {
            x: Math.min((c + rng.next()) * this.cellSize, this.width - 0.001),
            y: Math.min((r + rng.next()) * this.cellSize, this.height - 0.001),
        };
    }

    // cellánként a távolság (cellában) a legközelebbi eltérő (víz ↔ szárazföld) celláig
    distanceToOtherType() {
        const water = this.types.map((type) => (type === LAND ? 0 : 1));
        const toWater = bfsDistance(water, this.cols, this.rows, 1);
        const toLand = bfsDistance(water, this.cols, this.rows, 0);
        return water.map((w, i) => (w ? toLand[i] : toWater[i]));
    }

    // a víz aránya (statisztikához, teszthez)
    get waterFraction() {
        let count = 0;
        for (const type of this.types) if (type !== LAND) count++;
        return count / this.types.length;
    }
}

// --- segédek ---

// rácspontokon véletlen értékek, bilineárisan simítva, több léptékben összegezve (-1..1 körül)
function valueNoise(cols, rows, rng, octaves) {
    const out = new Float32Array(cols * rows);
    for (const { scale, weight } of octaves) {
        const gc = Math.ceil(cols / scale) + 2;
        const gr = Math.ceil(rows / scale) + 2;
        const grid = Array.from({ length: gc * gr }, () => rng.range(-1, 1));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const fx = c / scale;
                const fy = r / scale;
                const x0 = Math.floor(fx);
                const y0 = Math.floor(fy);
                const tx = smooth(fx - x0);
                const ty = smooth(fy - y0);
                const v00 = grid[y0 * gc + x0];
                const v10 = grid[y0 * gc + x0 + 1];
                const v01 = grid[(y0 + 1) * gc + x0];
                const v11 = grid[(y0 + 1) * gc + x0 + 1];
                const top = v00 + (v10 - v00) * tx;
                const bottom = v01 + (v11 - v01) * tx;
                out[r * cols + c] += (top + (bottom - top) * ty) * weight;
            }
        }
    }
    return out;
}

const smooth = (t) => t * t * (3 - 2 * t);

function neighbours(i, cols, rows) {
    const c = i % cols;
    const r = (i - c) / cols;
    const list = [];
    if (c > 0) list.push(i - 1);
    if (c < cols - 1) list.push(i + 1);
    if (r > 0) list.push(i - cols);
    if (r < rows - 1) list.push(i + cols);
    return list;
}

// a `value` értékű cellák közül csak a legnagyobb összefüggő tartomány marad meg;
// a többi az ellenkező értéket kapja
function keepLargestComponent(grid, cols, rows, value) {
    const label = new Int32Array(grid.length).fill(-1);
    const sizes = [];
    for (let start = 0; start < grid.length; start++) {
        if (grid[start] !== value || label[start] !== -1) continue;
        const id = sizes.length;
        let size = 0;
        const stack = [start];
        label[start] = id;
        while (stack.length) {
            const i = stack.pop();
            size++;
            for (const n of neighbours(i, cols, rows)) {
                if (grid[n] === value && label[n] === -1) {
                    label[n] = id;
                    stack.push(n);
                }
            }
        }
        sizes.push(size);
    }
    if (sizes.length <= 1) return;
    const biggest = sizes.indexOf(Math.max(...sizes));
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === value && label[i] !== biggest) grid[i] = 1 - value;
    }
}

// cellánként a távolság (4-szomszédos lépésben) a legközelebbi `target` értékű celláig
function bfsDistance(grid, cols, rows, target) {
    const dist = new Int32Array(grid.length).fill(-1);
    const queue = [];
    for (let i = 0; i < grid.length; i++) {
        if (grid[i] === target) {
            dist[i] = 0;
            queue.push(i);
        }
    }
    for (let head = 0; head < queue.length; head++) {
        const i = queue[head];
        for (const n of neighbours(i, cols, rows)) {
            if (dist[n] === -1) {
                dist[n] = dist[i] + 1;
                queue.push(n);
            }
        }
    }
    // ha nincs ilyen cella, "végtelen" távolság
    for (let i = 0; i < dist.length; i++) if (dist[i] === -1) dist[i] = 1 << 20;
    return dist;
}

// összefüggő-e egy tereptípus-csoport (teszthez): a predicate szerinti cellák egy tartományt alkotnak
export function isConnected(terrain, predicate) {
    const { cols, rows, types } = terrain;
    const cells = [];
    for (let i = 0; i < types.length; i++) if (predicate(types[i])) cells.push(i);
    if (cells.length === 0) return true;
    const seen = new Uint8Array(types.length);
    const stack = [cells[0]];
    seen[cells[0]] = 1;
    let count = 0;
    while (stack.length) {
        const i = stack.pop();
        count++;
        for (const n of neighbours(i, cols, rows)) {
            if (!seen[n] && predicate(types[n])) {
                seen[n] = 1;
                stack.push(n);
            }
        }
    }
    return count === cells.length;
}
