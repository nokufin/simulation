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
- `AI_CONFIG`: a fekete faj nyelvi modellje (cím, modellnév, kérdezési gyakoriság, egy döntés érvényessége).

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

## Élőhelyek: víz és szárazföld

- A térkép (`terrain.js`) seedelt és determinisztikus: hullámos partvonalú tenger, összefüggő
  szárazfölddel és összefüggő vízzel. Cellánként lekérdezhető: szárazföld, sekély víz (a part
  menti sáv) vagy mély víz. A generálás saját véletlenszám-folyamot használ.
- Hogy egy lény hová léphet, a génjeiből és a terepből adódik (`habitat.js`): levegőlégzés és
  vízi légzés (≥ 0,5: életképes abban a közegben), mozgékonyság szárazföldön és vízben (a sebesség
  szorzója). A szárazföldi lény a sekély vízben gázolhat, mély vízbe nem mehet; a vízi lény
  szárazföldre nem mehet. Ezek öröklődő, mutálódó gének; az alapítók értékei messze vannak a
  küszöbtől, így élőhelyváltás csak sok generáción át, fokozatosan lehetséges.
- Kétféle táplálék van: szárazföldi (a parttól beljebb) és vízi (mély vízben). A lények csak a
  saját bejárható terepükön lévő, egyenes úton elérhető kaját célozzák meg, és ha egy célpont
  felé nem haladnak, feladják. A part mentén kerülőirányt keresnek (a nyíltabb terep felé),
  a választott oldalt megtartják, így nem remegnek.
- Táplálék-regeneráció (`config.js` → `FOOD_CONFIG.regrowth`):
  - `"instant"` (alapértelmezés): a leevett kaja azonnal, tele születik újra (a korábbi modell).
  - `"gradual"`: a leevett kaja új helyen üresen indul, és `growthRate`-tel nő vissza.
    Mérve stabil, korlátos populációkat ad (lásd a fejlesztési beszámolót); javasolt alapértelmezés.

## Fajok

A 6 alapító szín 6 faj (`species.js`): piros, kék, zöld, citromsárga, lila, fekete; induló élőhelyük:
szárazföld, víz, szárazföld, szárazföld, víz, szárazföld. Minden lénynek van
`speciesId`-je; az alapítók sorban kapják, az utód a szülőtől örökli (a faj nem gén, nem mutálódik).
A lény egyéni színe (`genes.hue`) a faj színéből indul, és mutációval kissé eltolódhat.

## A fekete (AI) faj: helyi nyelvi modell (Ollama)

A fekete faj lényei egy helyi Ollama-modelltől kérnek döntést (`ai-brain.js`, beállítás:
`config.js` → `AI_CONFIG`, alapból `qwen2.5-coder:7b` a `http://localhost:11434` címen).

- **Nem tickenként.** A modell egy válasza kb. 3–4 s, a szimuláció 60 tick/s. A modell ezért
  csak időnként szól bele: egy lény akkor kérdez, ha nincs érvényes döntése, vagy érdemben
  változott a helyzete (energia 20%-os sávban, a látott kaják köre, a tevékenység), de legfeljebb
  `minIntervalTicks`-enként. Egyszerre egy kérés fut; a legrégebben kérdezett lény jön sorra.
- **Mit lát a modell:** energia, életerő, kor, ivarérettség, a legközelebbi látott kaják
  (azonosító, távolság, égtáj, mennyiség), a járható égtájak és a látótávon belüli társak száma.
- **Mit dönthet:** `seek` (egy konkrét látott kajához megy, akkor is, ha nem éhes), `explore`
  (egy égtáj felé indul felfedezni), `rest` (áll, energiát spórol). A válasz JSON-sémához kötött,
  és magyar indoklást is ad.
- **Szándék, nem távirányítás.** A döntésből szándék lesz (`creature.aiIntent`), amit a lény
  maga követ tickről tickre (`creature.followIntent`). Ha a szándék lejár vagy értelmét veszti
  (elfogyott a kaja, a pálya széléhez ért, felfedezés közben megéhezik és kaját lát), a beépített
  logika veszi át. Az érvénytelen választ (kitalált kaja, nem létező irány) eldobja.
- **Hiba esetén** (nem fut az Ollama, nincs letöltve a modell, időtúllépés) a fekete faj a beépített
  logikával él tovább, és a fejléc kiírja a hibát. 5 s múlva újrapróbálja.
- **Felület:** a fejléc **AI** gombja ki/be kapcsolja, mellette az állapot (kész / gondolkodik /
  hiba, döntések száma, utolsó válaszidő). Egy fekete lényt kijelölve az inspektor felső sávja
  mutatja az aktuális szándékot, az utolsó döntést és a modell indoklását.
  A konzolból: `sim.brain.log` (az utolsó 30 döntés).
- **Determinizmus:** a modell válasza és időzítése nem visszajátszható, így bekapcsolt AI mellett
  a futás sem az. `index.html?seed=123&ai=0` kikapcsolja az AI-t, ekkor a futás seed alapján
  pontosan visszajátszható. A szimuláció magja (`world.js`, `creature.js`) nem hív hálózatot;
  a tesztek kamu `fetch`-csel futnak, Ollama nélkül.
- **Böngészőből:** az Ollama alapból engedi a `localhost` / `127.0.0.1` címekről jövő kéréseket
  (bármely porton), így `npx serve`-vel vagy Live Serverrel külön beállítás nélkül működik.
  Más címről az `OLLAMA_ORIGINS` környezeti változóval kell engedélyezni.

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
| `config.js` | Beállítások (`WORLD_CONFIG`, `EVOLUTION_CONFIG`, `FOOD_CONFIG`, `AI_CONFIG`). |
| `genetics.js` | Gének: alapértékek, kezdeti tartományok, mutációs határok, mutáció. |
| `reproduction.js` | Szaporodási stratégiák, születési költség. |
| `world.js` | A világ és egy szimulációs lépés. DOM nélkül, Node-ban is fut. |
| `creature.js` | A lény: gének, állapot, érzékel → dönt → cselekszik. |
| `food.js` | A kaja. |
| `rng.js` | Seedelt véletlenszám-generátor; a szimuláció csak ezt használja. |
| `scenario.js` | Az alap kezdőállapot (az app és a tesztek is ezt használják). |
| `selection.js` | Kattintásos találat és a kijelölt példány nyilvántartása. |
| `terrain.js` | A térkép: seedelt generálás, tereptípus pontonként, kajahelyek. |
| `habitat.js` | Környezeti szabályok: hová léphet egy lény, milyen gyorsan mozog ott. |
| `species.js` | A fajok: kulcs, név, szín; a színek kiszámítása minden felülethez. |
| `ai-brain.js` | A fekete faj agya: Ollama-kérések ütemezése, prompt, a válasz ellenőrzése. |
| `explorer.js` | A lénylista tartalma és változásai (új / eltűnt sorok), id-keresés. |
| `inspector.js` | A kijelölt lény és a populáció adatai megjeleníthető formában. |
| `render.js` | Kirajzolás a canvasra, csak olvassa a világot. |
| `ui.js` | Panelek és gombok. |
| `main.js` | Belépési pont, fix 60 tick/s fő ciklus. |
