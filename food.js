// Kaja: véges mennyiség, falatonként fogy. Élőhelyhez kötött: szárazföldi kaja csak
// szárazföldön, vízi kaja csak (mély) vízben terem.
//
// Regeneráció (a világ beállítása, lásd config.js FOOD_CONFIG):
//   "instant" - elfogyás után azonnal, tele születik újra egy új helyen (a korábbi modell)
//   "gradual" - elfogyás után új helyen üresen jelenik meg, és tick-enként growthRate-tel
//               nő vissza; a részben megevett kaja is visszanő. Csak minEdible felett
//               célozzák meg a lények.

export class Food {
    constructor(id, habitat = "land") {
        this.id = id;
        this.habitat = habitat; // "land" | "water"
        this.x = 0;
        this.y = 0;
        this.size = 6;
        this.maxAmount = 50;
        this.amount = this.maxAmount;
        // hányszor született újra: így a lény észreveszi, ha a régi célpontja eltűnt
        this.spawnCount = 0;
        // a lények az utolsó falatig megették (fokozatos módban csak ez helyezi át; a frissen
        // kihelyezett, még üres kaja nem "elfogyott", hanem helyben nő)
        this.eatenOut = false;
    }

    // egy falat: annyit ad vissza, amennyi tényleg maradt
    bite(request) {
        const taken = Math.min(request, this.amount);
        this.amount -= taken;
        if (taken > 0 && this.amount <= 0) this.eatenOut = true;
        return taken;
    }

    get depleted() {
        return this.amount <= 0;
    }

    // érdemes-e megcélozni (fokozatos regenerációnál a frissen kinőtt kaja még nem)
    isEdible(minEdible = 0) {
        return this.amount > 0 && this.amount >= minEdible;
    }

    // tick-enkénti visszanövés (csak fokozatos regenerációnál)
    grow(rate) {
        if (this.amount < this.maxAmount) {
            this.amount = Math.min(this.amount + rate, this.maxAmount);
        }
    }

    // új hely a saját élőhelyén; startAmount: tele (instant) vagy 0 (gradual)
    respawn(world, startAmount = this.maxAmount) {
        const point = world.randomFoodPoint(this.habitat);
        this.x = point.x;
        this.y = point.y;
        this.amount = startAmount;
        this.eatenOut = false;
        this.spawnCount++;
    }
}
