# simulation

Böngészőben futó mesterséges élet-szimuláció (vanilla JavaScript, Canvas 2D, függőségek nélkül).

## Futtatás

Az ES modulok `file://`-ról nem töltődnek be, ezért helyi webszerverről kell megnyitni
(pl. VS Code Live Server, vagy `npx serve`), majd az `index.html`-t.

## Beállítások

A `config.js`-ben:

- `WORLD_CONFIG`: pálya mérete, kezdő lény- és kajaszám, tick/s, populációs biztonsági korlát,
  a populációs grafikon mintavételezése. A canvas felbontása és a képarány is innen jön.
- `EVOLUTION_CONFIG`: mutációs esély és erősség, a szaporodás hatásfoka.

## Szaporodás és öröklődés

- Egy lény akkor hoz létre utódot, ha ivarérett (`maturityAge`), elég energiája van
  (`reproductionThreshold`), és letelt a várakozási idő (`reproductionCooldown`).
  Ezek gének, alapértékük a `genetics.js`-ben van.
- A szülő `offspringEnergy / reproductionEfficiency` energiát fizet, az utód `offspringEnergy`-vel
  indul. A hatásfok legfeljebb 1, így a szaporodás sosem termel energiát.
- Az utód a szülő génjeit kapja: minden mutálható gén `mutationRate` eséllyel ±`mutationStrength`
  arányban eltér. A kezdő világ a `SPAWN_GENE_RANGES`-ből sorsol, a mutáció a tágabb
  `GENE_LIMITS`-en belül mozoghat.
- A születéseket a lények kérik, a `World` a lépés végén, a lények sorrendjében teljesíti.
- A `maxPopulation` csak biztonsági korlát. A populáció ki is halhat; ez érvényes eredmény.
- A szaporodási módot a `reproduction.js` stratégiái adják (most: `asexual`), a lény a
  `genes.reproductionStrategy` alapján választ. Új mód (pl. ivaros) új stratégiaként adható hozzá.

## Fajok

Az 5 alapító szín 5 faj (`species.js`): piros, narancs, zöld, kék, lila. Minden lénynek van
`speciesId`-je; az alapítók sorban kapják, az utód a szülőtől örökli (a faj nem gén, nem mutálódik).
A lény egyéni színe (`genes.hue`) a faj színéből indul, és mutációval kissé eltolódhat.

## Megfigyelés

- Kattints egy lényre a térképen: fehér gyűrű jelöli, és alul megjelenik a részletes panel
  (azonosítás, életállapot, az összes gén, szaporodási helyzet és annak akadályai).
- Átfedésnél az élő lény nyer a holttesttel szemben, utána a kattintáshoz közelebbi,
  egyenlő távolságnál a fölül rajzolt (később született).
- Üres helyre kattintva a kijelölés megmarad. Megszüntetni Esc-kel vagy a panel gombjával lehet.
- Ha a kijelölt lény meghal, a panel HALOTT állapotot, a halál okát és tickjét mutatja; ha a
  holttest kikerül a világból, az utolsó ismert adatok maradnak látva, jelzéssel.
- A bal oldali **Lények** lista az élőlényeket fajonként csoportosítva mutatja (szín, #id, generáció);
  a fajcsoportok fejléce a faj nevét, színét és élő létszámát mutatja, és összecsukható.
  Kijelöléskor a lény csoportja kinyílik, kereséskor csak a találatot tartalmazó csoportok látszanak. Egy sorra
  kattintva ugyanaz történik, mint a térképen; a térképes kijelölés a listában is kiemelődik.
  Keresés id alapján (`42` vagy `#42`, Enter: kijelölés), a listában a nyilakkal, Home/End-del
  lehet lépkedni. A panel összecsukható (a beállítást a böngésző megjegyzi).
- **Többes kijelölés:** Ctrl (macOS-en Cmd) + kattintás a térképen vagy a listában hozzáad, a már
  kijelöltet eltávolítja; legfeljebb 5 lény (a halottak is beleszámítanak). Sima kattintás csak az
  adott lényt jelöli ki, Esc mindent töröl.
- 2–5 kijelölt lénynél az alsó panel összehasonlító táblázat: oszloponként egy lény (kiválasztási
  sorrendben, a térképen a gyűrű melletti sorszám ugyanaz), soronként a tulajdonságok szekciókba
  csoportosítva; a részletes gének lenyithatók. Az eltérő értékű sorok semleges kiemelést kapnak.
- A kijelölésnek egyetlen közös állapota van; az csak olvassa a világot, a szimulációra nincs hatása.

## Seed és visszajátszás

Minden futásnak van egy seedje: a fejlécben és a konzolban látszik.
Ugyanaz a seed ugyanazt a futást adja: `index.html?seed=12345`.
Seed nélkül véletlen seedet választ.

## Tesztek

```
npm test
```

Node.js 22+ kell hozzá (a beépített `node:test` futtatót használja, nincs mit telepíteni).
A tesztek a `test/` mappában vannak, és böngésző nélkül futtatják a szimulációt.

## Szerkezet

| Fájl | Szerep |
|---|---|
| `config.js` | Beállítások (`WORLD_CONFIG`, `EVOLUTION_CONFIG`). |
| `genetics.js` | Gének: alapértékek, kezdeti tartományok, mutációs határok, mutáció. |
| `reproduction.js` | Szaporodási stratégiák, születési költség. |
| `world.js` | A világ és egy szimulációs lépés. DOM nélkül, Node-ban is fut. |
| `creature.js` | A lény: gének, állapot, érzékel → dönt → cselekszik. |
| `food.js` | A kaja. |
| `rng.js` | Seedelt véletlenszám-generátor; a szimuláció csak ezt használja. |
| `scenario.js` | Az alap kezdőállapot (az app és a tesztek is ezt használják). |
| `selection.js` | Kattintásos találat és a kijelölt példány nyilvántartása. |
| `species.js` | A fajok: kulcs, név, szín. |
| `explorer.js` | A lénylista tartalma és változásai (új / eltűnt sorok), id-keresés. |
| `inspector.js` | A kijelölt lény és a populáció adatai megjeleníthető formában. |
| `render.js` | Kirajzolás a canvasra, csak olvassa a világot. |
| `ui.js` | Panelek és gombok. |
| `main.js` | Belépési pont, fix 60 tick/s fő ciklus. |
