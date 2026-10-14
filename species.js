// Fajok: az alapító színek valódi fajok. Egy lény faja (speciesId) születéskor dől el:
// az alapítók a kezdőállapotban kapják, az utódok a szülőtől öröklik.
// A faj nem gén: nem mutálódik. A lény egyéni színe (genes.hue) a faj színéből indul,
// és mutációval kissé eltolódhat; a faj színe (hue itt) a fajt jelöli a felületen.
//
// habitat: az alapítók INDULÓ élőhelye (ebből kapják az élőhely-génjeiket, lásd habitat.js).
// Nem örök fajkorlát: a leszármazottak génjei generációk alatt eltávolodhatnak tőle.
//
// tone: "black" = a faj fekete (a hue csak az egyéni eltolódás alapja, a szín szürkeárnyalatos).
// ai: a faj döntéseit egy helyi nyelvi modell (Ollama) hozza, lásd ai-brain.js. Ha a modell
// nem elérhető vagy ki van kapcsolva, a faj ugyanazzal a beépített logikával él, mint a többi.
// solitary: a fajnak a világban egyetlen példánya van, és nem szaporodhat (reproduction.js).

export const SPECIES = Object.freeze([
    Object.freeze({ id: "red", name: "Piros", hue: 0, habitat: "land" }),
    Object.freeze({ id: "blue", name: "Kék", hue: 205, habitat: "water" }),
    Object.freeze({ id: "green", name: "Zöld", hue: 130, habitat: "land" }),
    Object.freeze({ id: "yellow", name: "Citromsárga", hue: 55, habitat: "land" }),
    Object.freeze({ id: "purple", name: "Lila", hue: 280, habitat: "water" }),
    Object.freeze({ id: "black", name: "Fekete (AI)", hue: 0, habitat: "land", tone: "black", ai: true, solitary: true }),
]);

// faj nélküli lény (pl. kézzel, tesztben létrehozott) ide sorolódik
export const UNKNOWN_SPECIES = Object.freeze({ id: null, name: "Faj nélkül", hue: null, habitat: null });

const BY_ID = new Map(SPECIES.map((species) => [species.id, species]));

export function getSpecies(id) {
    return BY_ID.get(id) ?? UNKNOWN_SPECIES;
}

// a lényt AI vezérli-e (a faja alapján; az utódok öröklik a fajt, így ezt is)
export const isAiSpecies = (id) => getSpecies(id).ai === true;

// egyetlen példány, nem szaporodhat
export const isSolitarySpecies = (id) => getSpecies(id).solitary === true;

// --- színek: minden felület (térkép, lista, panel) ugyanezeket használja ---

const isBlack = (id) => getSpecies(id).tone === "black";

// a lény teste a saját (mutálódó) színével
export function bodyColor(hue, speciesId) {
    return isBlack(speciesId) ? `hsl(${hue}, 8%, 11%)` : `hsl(${hue}, 70%, 55%)`;
}

// a test széle: a fekete testnek világos él kell, hogy a sötét terepen is látsszon
export function bodyEdgeColor(hue, speciesId) {
    return isBlack(speciesId) ? "hsl(0, 0%, 62%)" : `hsl(${hue}, 70%, 28%)`;
}

// a faj színe (körvonal, csoportpötty); faj nélkül szürke
export function speciesColor(speciesId) {
    const species = getSpecies(speciesId);
    if (species.hue === null) return "rgb(120, 120, 120)";
    return species.tone === "black" ? "rgb(8, 8, 8)" : `hsl(${species.hue}, 75%, 60%)`;
}

// a debug-réteg (látókúp, irány) áttetsző színe
export function accentColor(hue, speciesId, alpha = 1) {
    return isBlack(speciesId) ? `hsla(0, 0%, 85%, ${alpha})` : `hsla(${hue}, 70%, 65%, ${alpha})`;
}
