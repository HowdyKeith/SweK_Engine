// FILE: world/waveSystem.js
// VERSION: v1 - SURFACE WATER WAVES

export class WaveSystem {

    constructor() {

        this.time = 0;
        this.amplitude = 0.4;
    }

    update(dt) {
        this.time += dt;
    }

    // ============================================================
    // HEIGHT OFFSET FUNCTION (USED IN SHADER OR WATER RENDER)
    // ============================================================
    sample(x, z) {

        return Math.sin(x * 0.1 + this.time) *
               Math.cos(z * 0.1 + this.time) *
               this.amplitude;
    }
}