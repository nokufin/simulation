// Seedelt, determinisztikus véletlenszám-generátor (mulberry32).
// Ugyanaz a seed mindig ugyanazt a számsort adja, így egy futás pontosan újrajátszható.
// A szimuláció minden véletlenje innen jön, sosem a Math.random-ból.

export function createRng(seed) {
    let state = seed >>> 0;

    // [0, 1) közötti szám, mint a Math.random
    function next() {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    return {
        seed: seed >>> 0,
        next,
        // [min, max) közötti szám
        range: (min, max) => min + next() * (max - min),
        // véletlen irány radiánban
        angle: () => next() * Math.PI * 2,
    };
}

// új seed, ha nincs megadva: ez az egyetlen hely, ahol a Math.random még szerepel,
// és csak a kezdőértéket választja ki, a futás menetét nem befolyásolja
export function randomSeed() {
    return Math.floor(Math.random() * 4294967296);
}
