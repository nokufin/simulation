import { canvas, ctx } from "./canvas.js";

export class Food {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.size = 6;
        this.maxAmount = 50;
        this.amount = this.maxAmount;
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

    draw() {
        // a sugár a maradék mennyiséggel zsugorodik
        const r = this.size * (0.35 + 0.65 * (this.amount / this.maxAmount));

        ctx.beginPath();
        ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
        ctx.fillStyle = "cyan";
        ctx.strokeStyle = "rgb(0, 110, 120)";
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
    }

    respawn() {
        this.x = this.size + Math.random() * (canvas.width - this.size * 2);
        this.y = this.size + Math.random() * (canvas.height - this.size * 2);
        this.amount = this.maxAmount;
    }
}
