// AI-agy: a fekete (AI) faj lényei egy helyi nyelvi modelltől (Ollama) kérnek döntést.
//
// A szimuláció szinkron, 60 tick/s; a modell válasza másodpercekig tart. Ezért a kettő külön fut:
//   - a lépésekbe nem nyúl bele; a fő ciklus képkockánként hívja az update(world)-öt,
//   - egyszerre egy kérés megy (a helyi GPU-t úgysem érdemes párhuzamosan terhelni),
//   - a válaszból egy "szándék" lesz (creature.aiIntent), amit a lény a következő tickektől
//     maga követ (creature.followIntent); a köztes időben a beépített logikával él.
// Egy lény akkor kérdez, ha nincs érvényes szándéka, vagy érdemben változott a helyzete
// (és legalább minIntervalTicks eltelt), illetve maxIntervalTicks-enként mindenképp.
//
// Determinizmus: a modell válasza és ideje nem visszajátszható, így bekapcsolt AI mellett a futás
// sem az (a seed csak a kezdőállapotot rögzíti). ?ai=0 mellett a futás újra teljesen
// determinisztikus. A szimuláció magja (world.js, creature.js) nem hív hálózatot; ez a modul
// csak a böngészős appban fut, a tesztek egy kamu fetch-csel hajtják.

import { isAiSpecies } from "./species.js";
import { reproductionStatus } from "./reproduction.js";

// égtájak a képernyőn (y lefelé nő): az "N" felfelé mutat
export const DIRECTIONS = Object.freeze({
    N: -Math.PI / 2,
    NE: -Math.PI / 4,
    E: 0,
    SE: Math.PI / 4,
    S: Math.PI / 2,
    SW: (3 * Math.PI) / 4,
    W: Math.PI,
    NW: (-3 * Math.PI) / 4,
});

export const ACTIONS = ["seek", "explore", "rest"];

// ennyi px-en át szabad útnak kell lennie, hogy egy irány "járhatónak" számítson
const PASSABLE_LENGTH = 60;
// hiba után ennyi ideig (ms) nem próbálkozik újra
const ERROR_BACKOFF_MS = 5000;

// a modell válaszának kötelező formája (Ollama structured output)
export const DECISION_SCHEMA = Object.freeze({
    type: "object",
    properties: {
        action: { type: "string", enum: ACTIONS },
        food_id: { type: ["integer", "null"] },
        direction: { type: ["string", "null"], enum: [...Object.keys(DIRECTIONS), null] },
        reason: { type: "string" },
    },
    // minden mező kötelező (a nem használt null): enélkül a kis modellek kihagyják a food_id-t
    required: ["action", "food_id", "direction", "reason"],
});

const SYSTEM_PROMPT = `You control one creature in an artificial life simulation. Your goal: survive as long as possible and reproduce.
Rules of the world:
- Energy drops every tick; moving costs more energy than standing still. At 0 energy the creature loses health and starves.
- Eating food restores energy. Food is only edible when you touch it; you only know about food you can see.
- Reproduction happens automatically when the creature is mature and has enough energy, so staying well fed means more offspring.
- Other creatures compete for the same food.
Possible actions:
- "seek": go to one visible food and eat it. Set "food_id" to one of the listed visible_food ids, "direction" to null.
- "explore": travel in a compass direction to find new food. Set "direction" to one of passable_directions (N is up), "food_id" to null.
- "rest": stand still to save energy. Set "food_id" and "direction" to null.
Answer with JSON only. "reason" is one short, simple sentence in Hungarian explaining the choice (call food "kaja", energy "energia").`;

const round = (value) => Math.round(value);
const pct = (value) => Math.round(value * 100);

// az irány (radián) legközelebbi égtája
function compass(angle) {
    let best = "E";
    let bestDiff = Infinity;
    for (const [name, dir] of Object.entries(DIRECTIONS)) {
        const diff = Math.abs(Math.atan2(Math.sin(angle - dir), Math.cos(angle - dir)));
        if (diff < bestDiff) {
            best = name;
            bestDiff = diff;
        }
    }
    return best;
}

// A lény helyzete a modellnek (prompt) és a változásfigyelésnek (key). Csak olvas.
export function describeSituation(creature, world, { maxVisibleFood = 5 } = {}) {
    const { genes } = creature;
    const repro = reproductionStatus(creature, world);

    const visible = [...creature.seenFoods]
        .sort((a, b) => a.distance - b.distance)
        .slice(0, maxVisibleFood)
        .map(({ food, distance }) => ({
            food_id: food.id,
            distance: round(distance),
            direction: compass(Math.atan2(food.y - creature.y, food.x - creature.x)),
            amount_pct: pct(food.amount / food.maxAmount),
        }));

    const passable = Object.entries(DIRECTIONS)
        .filter(([, angle]) => creature.freeLength(world, angle) >= PASSABLE_LENGTH)
        .map(([name]) => name);

    let nearby = 0;
    for (const other of world.creatures) {
        if (other !== creature && other.alive && creature.distanceTo(other) <= genes.visionRange) nearby++;
    }

    const prompt = {
        you: {
            energy_pct: pct(creature.energy / genes.maxEnergy),
            health_pct: pct(creature.health / genes.maxHealth),
            age_pct_of_lifespan: pct(creature.age / genes.maxAge),
            current_activity: creature.state,
            terrain_here: ["land", "shallow water", "deep water"][world.terrain.typeAt(creature.x, creature.y)],
            vision_range: round(genes.visionRange),
            mature: repro.mature,
            can_reproduce_now: repro.canReproduce,
            energy_needed_to_reproduce_pct: pct(genes.reproductionThreshold),
        },
        visible_food: visible,
        passable_directions: passable,
        other_creatures_in_view: nearby,
    };

    return { prompt, key: situationKey(creature) };
}

// a döntés szempontjából érdemi változás: energia 20%-os sávokban, a látott kaják köre, a
// tevékenység és az ivarérettség (a pozíció apró változása nem számít). Olcsó: képkockánként
// minden AI-lényre lefut.
export function situationKey(creature) {
    return JSON.stringify([
        Math.floor((creature.energy / creature.genes.maxEnergy) * 5),
        creature.seenFoods.map((seen) => seen.food.id).sort((a, b) => a - b),
        creature.state,
        creature.age >= creature.genes.maturityAge,
    ]);
}

export function buildMessages(situation) {
    return [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Current situation (JSON):\n${JSON.stringify(situation.prompt)}` },
    ];
}

// A modell válaszából érvényes döntés, vagy null. Csak olyan kaját fogad el, amit a lény látott,
// és csak járható irányt; a hibás választ eldobja (a lény a beépített logikával él tovább).
export function parseDecision(text, situation) {
    let raw;
    try {
        raw = typeof text === "string" ? JSON.parse(text) : text;
    } catch {
        return null;
    }
    if (!raw || !ACTIONS.includes(raw.action)) return null;
    const reason = typeof raw.reason === "string" ? raw.reason.trim().slice(0, 200) : "";

    if (raw.action === "seek") {
        const visible = situation.prompt.visible_food;
        // azonosító nélkül a legközelebbi látott kaja (a lista távolság szerint rendezett)
        const foodId = raw.food_id === null || raw.food_id === undefined ? visible[0]?.food_id : Number(raw.food_id);
        if (!visible.some((f) => f.food_id === foodId)) return null;
        return { action: "seek", foodId, reason };
    }
    if (raw.action === "explore") {
        const direction = String(raw.direction ?? "").toUpperCase();
        if (!(direction in DIRECTIONS)) return null;
        return { action: "explore", direction, reason };
    }
    return { action: "rest", reason };
}

export class AiBrain {
    // config: a config.js AI_CONFIG-ja; fetchFn / now: tesztben cserélhető
    constructor(config, { fetchFn = (...args) => fetch(...args), now = () => Date.now() } = {}) {
        this.config = config;
        this.fetchFn = fetchFn;
        this.now = now;

        this.enabled = config.enabled;
        // "off" | "checking" | "ready" | "thinking" | "error"
        this.status = this.enabled ? "checking" : "off";
        this.statusText = "";
        this.connected = false; // sikerült-e már elérni az Ollamát (és megvan-e a modell)
        this.inFlight = null; // { creatureId, startedAt }
        this.retryAt = 0;
        this.memory = new Map(); // lény id → { lastAskTick, lastKey }

        // összesítés a felülethez
        this.requests = 0;
        this.decisions = 0;
        this.rejected = 0; // érvénytelen válaszok
        this.errors = 0;
        this.lastLatencyMs = null;
        this.log = []; // az utolsó döntések: { tick, creatureId, action, detail, reason, latencyMs }
    }

    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.status = "off";
            this.statusText = "";
        } else if (this.status === "off") {
            this.status = this.connected ? "ready" : "checking";
            this.retryAt = 0;
        }
    }

    // Képkockánként hívható; legfeljebb egy kérést indít, és sosem vár a válaszra.
    update(world) {
        if (!this.enabled || this.inFlight || this.now() < this.retryAt) return;
        if (!this.connected) {
            this.checkConnection();
            return;
        }

        const creature = this.pickCreature(world);
        if (creature) this.ask(creature, world);
    }

    // az a lény, amelyik a legrégebben kérdezett, és most kérdeznie kell
    pickCreature(world) {
        const { minIntervalTicks, maxIntervalTicks } = this.config;
        let best = null;
        let bestLast = Infinity;

        for (const creature of world.creatures) {
            if (!creature.alive || !isAiSpecies(creature.speciesId)) continue;
            const memory = this.memory.get(creature.id);
            const last = memory?.lastAskTick ?? -Infinity;
            const since = world.tick - last;
            if (since < minIntervalTicks) continue;

            const intentValid = creature.aiIntent !== null && creature.aiIntent.until >= world.tick;
            const changed = !memory || situationKey(creature) !== memory.lastKey;
            if (intentValid && !changed && since < maxIntervalTicks) continue;

            if (last < bestLast) {
                best = creature;
                bestLast = last;
            }
        }

        // a halott lények emlékét nem kell tovább tartani
        if (this.memory.size > 500) {
            for (const id of this.memory.keys()) {
                if (!world.creatures.some((c) => c.id === id && c.alive)) this.memory.delete(id);
            }
        }
        return best;
    }

    // elérhető-e az Ollama, és le van-e töltve a modell
    async checkConnection() {
        this.inFlight = { creatureId: null, startedAt: this.now() };
        try {
            const res = await this.request("/api/tags", null);
            const names = (res.models ?? []).map((m) => m.name);
            if (!names.includes(this.config.model)) {
                throw new Error(`a "${this.config.model}" modell nincs letöltve (ollama pull ${this.config.model})`);
            }
            this.connected = true;
            this.status = this.enabled ? "ready" : "off";
            this.statusText = this.config.model;
        } catch (error) {
            this.fail(error); // retryAt után újra ellenőriz
        } finally {
            this.inFlight = null;
        }
    }

    async ask(creature, world) {
        const situation = describeSituation(creature, world, this.config);
        this.memory.set(creature.id, { lastAskTick: world.tick, lastKey: situation.key });
        this.inFlight = { creatureId: creature.id, startedAt: this.now() };
        this.status = "thinking";
        this.requests++;

        try {
            const res = await this.request("/api/chat", {
                model: this.config.model,
                messages: buildMessages(situation),
                stream: false,
                format: DECISION_SCHEMA,
                keep_alive: "15m",
                options: { temperature: this.config.temperature, num_predict: 160 },
            });
            const latencyMs = this.now() - this.inFlight.startedAt;
            this.lastLatencyMs = latencyMs;
            this.status = this.enabled ? "ready" : "off";
            this.statusText = this.config.model;

            const decision = parseDecision(res.message?.content ?? "", situation);
            if (!decision) {
                this.rejected++;
                return;
            }
            this.apply(creature, decision, world, latencyMs);
        } catch (error) {
            this.fail(error);
        } finally {
            this.inFlight = null;
        }
    }

    // a döntésből szándék a lényen; a válasz közben eltelt idő alatt a világ változhatott,
    // ezért a lény a követéskor újra ellenőrzi (pl. megvan-e még a kaja)
    apply(creature, decision, world, latencyMs) {
        this.decisions++;
        const { tick } = world;
        let detail = "";
        const intent = { action: decision.action, reason: decision.reason, issuedTick: tick, until: tick + this.config.intentTicks };

        if (decision.action === "seek") {
            const food = world.foods.find((f) => f.id === decision.foodId);
            intent.foodId = decision.foodId;
            intent.foodSpawn = food ? food.spawnCount : -1;
            detail = `#${decision.foodId} kaja`;
        } else if (decision.action === "explore") {
            intent.heading = DIRECTIONS[decision.direction];
            intent.direction = decision.direction;
            detail = decision.direction;
        } else {
            intent.until = tick + Math.round(this.config.intentTicks / 2);
        }

        creature.aiLast = { action: decision.action, detail, reason: decision.reason, tick, latencyMs };
        creature.aiDecisionCount = (creature.aiDecisionCount ?? 0) + 1;
        if (creature.alive) creature.aiIntent = intent;

        this.log.unshift({ tick, creatureId: creature.id, action: decision.action, detail, reason: decision.reason, latencyMs });
        this.log.length = Math.min(this.log.length, 30);
    }

    fail(error) {
        this.errors++;
        this.status = this.enabled ? "error" : "off";
        this.statusText = error.name === "AbortError" ? "időtúllépés" : error.message || String(error);
        this.retryAt = this.now() + ERROR_BACKOFF_MS;
    }

    async request(path, body) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
        try {
            const res = await this.fetchFn(this.config.url + path, {
                method: body ? "POST" : "GET",
                headers: body ? { "Content-Type": "application/json" } : undefined,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });
            if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
            return await res.json();
        } catch (error) {
            // a böngésző a CORS- és kapcsolati hibát is TypeError-ként jelzi
            if (error instanceof TypeError) {
                this.connected = false; // újra kapcsolatot kell ellenőrizni
                throw new Error(`az Ollama nem érhető el (${this.config.url})`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    }
}
