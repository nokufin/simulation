// Kaja: véges mennyiség, falatonként fogy, elfogyás után új helyen újraszületik.

export class Food {
    constructor(id) {
        this.id = id;
        this.x = 0;
        this.y = 0;
        this.size = 6;
        this.maxAmount = 50;
        this.amount = this.maxAmount;
        // hányszor született újra: így a lény észreveszi, ha a régi célpontja eltűnt
        this.spawnCount = 0;
    }

    // egy falat: annyit ad vissza, amennyi tényleg maradt
    bite(request) {
        const taken = Math.min(request, this.amount);
        this.amount -= taken;
        return taken;
    }

    get depleted() {
        return this.amount <= 0;
    }

    respawn(world) {
        const point = world.randomPoint(this.size);
        this.x = point.x;
        this.y = point.y;
        this.amount = this.maxAmount;
        this.spawnCount++;
    }
}
