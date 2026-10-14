// Környezeti szabályok: mely tereptípusra léphet egy lény, és milyen gyorsan mozog ott.
// A terep a világ tulajdonsága (terrain.js), a képességek a lény génjei. Ez a modul köti
// össze a kettőt, és nem tárol állapotot.
//
// Tereptípusok:
//   LAND    szárazföld
//   SHALLOW sekély víz (a part menti sáv): átmeneti zóna, levegőt és vizet lélegzők is beléphetnek
//   DEEP    mély víz: csak vízben lélegzők
//
// Az élőhely-gének 0..1 közöttiek, és öröklődnek, mutálódnak. Egy terep akkor bejárható,
// ha a lény ott lélegezni tud (a megfelelő légzési gén ≥ BREATHING_THRESHOLD), és mozogni is
// tud (a megfelelő mozgékonyság > 0). Az alapítók értékei messze vannak a küszöbtől, így
// egyetlen kis mutáció nem válthat élőhelyet; csak sok generáción átívelő változás.

export const LAND = 0;
export const SHALLOW = 1;
export const DEEP = 2;

export const TERRAIN_NAMES = ["szárazföld", "sekély víz", "mély víz"];

// ennyi kell a légzési génből, hogy a lény az adott közegben életben maradjon
export const BREATHING_THRESHOLD = 0.5;

// a sekély vízben a szárazföldi mozgás fele hatékony (gázolás)
const WADING_FACTOR = 0.5;

// az alapító fajok induló élőhely-génjei
export const HABITAT_PROFILES = Object.freeze({
    land: Object.freeze({ airBreathing: 0.9, waterBreathing: 0.05, landMobility: 1, waterMobility: 0.3 }),
    water: Object.freeze({ airBreathing: 0.05, waterBreathing: 0.9, landMobility: 0.05, waterMobility: 1 }),
});

const breathesAir = (genes) => genes.airBreathing >= BREATHING_THRESHOLD;
const breathesWater = (genes) => genes.waterBreathing >= BREATHING_THRESHOLD;

// a lény génjei alapján erre a tereptípusra léphet-e
export function canOccupyType(genes, type) {
    if (type === LAND) return breathesAir(genes) && genes.landMobility > 0;
    if (type === DEEP) return breathesWater(genes) && genes.waterMobility > 0;
    // sekély víz: bármelyik légzés elég, és bármelyik mozgásforma
    return (breathesAir(genes) || breathesWater(genes)) && (genes.landMobility > 0 || genes.waterMobility > 0);
}

// a maxSpeed szorzója az adott tereptípuson (0..1)
export function mobilityOn(genes, type) {
    if (type === LAND) return genes.landMobility;
    if (type === DEEP) return genes.waterMobility;
    return Math.max(genes.waterMobility, genes.landMobility * WADING_FACTOR);
}

// a lény képességek szerinti besorolása (statisztikához, panelhez)
export function habitatClass(genes) {
    const air = breathesAir(genes);
    const water = breathesWater(genes);
    if (air && water) return "amphibious";
    if (water) return "water";
    if (air) return "land";
    return "none";
}

export const HABITAT_CLASS_NAMES = {
    land: "szárazföldi",
    water: "vízi",
    amphibious: "kétéltű",
    none: "életképtelen",
};
