// A világ alapbeállításai egy helyen. Ezt módosítsd; a canvas mérete, a képarány,
// a kezdőállapot és a fő ciklus is innen olvas.

export const WORLD_CONFIG = Object.freeze({
    width: 1280, // a pálya mérete px-ben (a canvas felbontása is)
    height: 600,
    initialCreatures: 6, // ennyi lénnyel indul a világ (fajonként egy alapító, lásd species.js)
    initialLandFood: 12, // ennyi szárazföldi kaja van egyszerre a pályán
    initialWaterFood: 10, // ennyi vízi kaja van egyszerre a pályán
    waterFraction: 0.4, // a térkép kb. ekkora része víz (a generálás után kicsit eltérhet)
    terrainCellSize: 10, // a terep rácsának cellamérete (px)
    ticksPerSecond: 60, // szimulációs lépés / valós másodperc 1× sebességnél
    // biztonsági korlát: ennyi élő lény felett nincs új születés. Szándékosan jóval a
    // természetes (kaja által megszabott) szint felett van (ez mérve kb. 80–130),
    // hogy ne ez szabályozza a populációt, csak az elszabadulás ellen védjen
    maxPopulation: 200,
    historyInterval: 60, // ennyi tick-enként jegyzi fel a populáció adatait (grafikonhoz)
    historyLength: 600, // ennyi mintát tart meg (60 tick-enként = 10 perc)
});

// öröklődés és szaporodás
export const EVOLUTION_CONFIG = Object.freeze({
    mutationRate: 0.1, // egy-egy gén ekkora eséllyel mutálódik születéskor
    mutationStrength: 0.1, // a mutáció legfeljebb ennyi arányban térít el (±10%)
    reproductionEfficiency: 0.75, // az utód a szülő által fizetett energia ennyi részét kapja
});

// táplálék-regeneráció (lásd food.js). "instant": azonnal tele születik újra (a korábbi
// modell); "gradual": üresen indul, és fokozatosan nő vissza
export const FOOD_CONFIG = Object.freeze({
    regrowth: "instant", // alapértelmezés: a korábbi modell (a "gradual" mért javaslat, lásd README)
    growthRate: 0.2, // energia / tick kajánként (gradual); mérve 0,1–0,2 között életképes mindkét élőhely
    minEdible: 10, // ennyi alatt nem éri meg megcélozni (gradual)
});

// a fekete (AI) faj: döntéseit egy helyi Ollama-modell hozza (lásd ai-brain.js).
// Csak a böngészős appban fut; a tesztek és a Node-os futtatás nem hívják.
// ?ai=0 az URL-ben kikapcsolja (ekkor a futás seed alapján újra teljesen visszajátszható).
export const AI_CONFIG = Object.freeze({
    enabled: true,
    url: "http://localhost:11434", // az Ollama API címe
    model: "qwen2.5-coder:7b",
    temperature: 0.3,
    timeoutMs: 30000, // ennyi után feladja a kérést (a lény addig a beépített logikával él)
    minIntervalTicks: 120, // egy lény legfeljebb ennyi tick-enként kérdez (~2 s 1× sebességnél)...
    maxIntervalTicks: 900, // ...és legalább ennyi tick-enként, ha a helyzete nem is változott
    intentTicks: 600, // egy döntés legfeljebb ennyi tick-ig érvényes
    maxVisibleFood: 5, // a promptban ennyi legközelebbi látott kaja szerepel
});
