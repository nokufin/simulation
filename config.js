// A világ alapbeállításai egy helyen. Ezt módosítsd; a canvas mérete, a képarány,
// a kezdőállapot és a fő ciklus is innen olvas.

export const WORLD_CONFIG = Object.freeze({
    width: 1280, // a pálya mérete px-ben (a canvas felbontása is)
    height: 600,
    initialCreatures: 5, // ennyi lénnyel indul a világ
    initialFood: 16, // ennyi kaja van egyszerre a pályán
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
