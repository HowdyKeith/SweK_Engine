// FILE: engine/loop.js
// VERSION: v38 - Real FPS Tracking

export class EngineLoop {
    constructor() {
        this.onFrame = null;
        this.running = false;

        this.lastTime = performance.now();
        this.fps = 60;

        this._boundFrame = this._frame.bind(this);

        console.log("[EngineLoop v38 FPS]");
    }

    start() {
        if (this.running) return;

        this.running = true;
        this.lastTime = performance.now();

        requestAnimationFrame(this._boundFrame);
    }

    stop() {
        this.running = false;
    }

    _frame() {
        if (!this.running) return;

        const now = performance.now();
        const dt = now - this.lastTime;

        this.lastTime = now;

        if (dt > 0) {
            this.fps = Math.round(1000 / dt);
        }

        if (typeof this.onFrame === "function") {
            this.onFrame(dt);
        }

        requestAnimationFrame(this._boundFrame);
    }
}