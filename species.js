// Fajok: az 5 alapító szín mostantól valódi faj. Egy lény faja (speciesId) születéskor
// dől el: az alapítók a kezdőállapotban kapják, az utódok a szülőtől öröklik.
// A faj nem gén: nem mutálódik. A lény egyéni színe (genes.hue) a faj színéből indul,
// és mutációval kissé eltolódhat; a faj színe (hue itt) a fajt jelöli a felületen.

export const SPECIES = Object.freeze([
    Object.freeze({ id: "red", name: "Piros", hue: 0 }),
    Object.freeze({ id: "orange", name: "Narancs", hue: 40 }),
    Object.freeze({ id: "green", name: "Zöld", hue: 130 }),
    Object.freeze({ id: "blue", name: "Kék", hue: 205 }),
    Object.freeze({ id: "purple", name: "Lila", hue: 280 }),
]);

// faj nélküli lény (pl. kézzel, tesztben létrehozott) ide sorolódik
export const UNKNOWN_SPECIES = Object.freeze({ id: null, name: "Faj nélkül", hue: null });

const BY_ID = new Map(SPECIES.map((species) => [species.id, species]));

export function getSpecies(id) {
    return BY_ID.get(id) ?? UNKNOWN_SPECIES;
}
