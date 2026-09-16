// FILE: simulation/OceanPopulation.mjs
// v1 — headless predator/prey population sim for demos_code/ocean_ecosystem.js
//
// Same shape as demos_code/aquariumEcosystem.js: a pure, ctx-free, seeded-RNG-injectable
// class that a demo reads state from to position meshes. No GL, no Date.now(), no
// Math.random() — update(dt) is the only clock, so two runs fed the same dt sequence and
// the same rng produce byte-identical output (see tools/ship/oceanPopulation-selfcheck.mjs).
//
// Fish and octopus are agents with an energy budget instead of a fixed head count:
//   * A coarse plankton/food grid over the play disc regrows with the same
//     d += (growth*d*(1-d) + seed)*dt logistic aquariumEcosystem.js's algae uses.
//   * Fish wander + mildly flock + seek the richest nearby food cell + flee the nearest
//     octopus, graze the cell they're standing on (draining it, gaining energy), and pay
//     metabolism + speed² movement costs every tick. Energy <= 0 -> dead. Energy over a
//     threshold -> splits into a second fish nearby (half the energy each).
//   * Octopus wander/patrol, and roll a per-tick catch chance against the nearest fish
//     inside their catch radius; a catch removes the fish and feeds the octopus. Octopus
//     pay a slower metabolism (they go longer between meals) and reproduce on a longer
//     timescale (a much higher energy threshold, not a separate timer).
// Population counts are never set directly after construction — they are just how many
// agents happen to be alive, which is the whole point.
//
// Deliberately 2D (x/z only, like the food grid): the demo already knows how to turn an
// (x,z) into a world Y via ctx.getSurfaceY/waterTop, so this module doesn't duplicate that.

const TWO_PI = Math.PI * 2;

export class OceanPopulation {
    constructor(opts = {}) {
        this.areaR = opts.areaR ?? 50;
        this.rng = opts.rng ?? Math.random;

        // ---- food grid ----
        this.gridN   = opts.gridN   ?? 20;               // cells per side, covering -areaR..areaR
        this.growth  = opts.growth  ?? 0.55;              // logistic growth rate
        this.seed    = opts.seed    ?? 0.012;             // spontaneous trickle on bare cells
        this.cell    = (2 * this.areaR) / this.gridN;
        this.food = new Float32Array(this.gridN * this.gridN);
        for (let i = 0; i < this.food.length; i++) this.food[i] = this.rng() < 0.5 ? this.rng() * 0.6 : 0;

        // ---- fish tuning ----
        this.fishEnergyInit      = opts.fishEnergyInit      ?? 55;
        this.fishMetabolism      = opts.fishMetabolism      ?? 3.2;   // energy/s, constant
        this.fishMoveCost        = opts.fishMoveCost        ?? 0.55;  // energy per (speed^2 * s)
        this.fishEatRate         = opts.fishEatRate         ?? 0.9;   // density/s grazed
        this.fishFoodToEnergy    = opts.fishFoodToEnergy    ?? 55;    // energy gained per unit density eaten
        this.fishReproThreshold  = opts.fishReproThreshold  ?? 100;
        this.fishSpeed           = opts.fishSpeed           ?? 3.2;
        this.fishVision          = opts.fishVision           ?? 9;
        this.fishFleeRadius      = opts.fishFleeRadius      ?? 10;
        this.fishMaxPop          = opts.fishMaxPop          ?? 400;   // runaway guard, not a target

        // ---- octopus tuning ----
        this.octoEnergyInit      = opts.octoEnergyInit      ?? 140;
        this.octoMetabolism      = opts.octoMetabolism      ?? 2.1;   // energy/s — slower burn than fish
        this.octoCatchRadius     = opts.octoCatchRadius     ?? 4.5;
        this.octoCatchProb       = opts.octoCatchProb       ?? 0.55;  // per second, while a fish is in range
        this.octoCatchGain       = opts.octoCatchGain       ?? 70;    // energy gained per catch
        this.octoReproThreshold  = opts.octoReproThreshold  ?? 320;   // much higher -> naturally slower cycle
        this.octoSpeed           = opts.octoSpeed           ?? 1.6;
        this.octoMaxPop          = opts.octoMaxPop          ?? 40;

        this._nextId = 1;
        this.fish = [];
        this.octopus = [];
        const initFish = opts.initFish ?? 24;
        const initOctopus = opts.initOctopus ?? 2;
        for (let i = 0; i < initFish; i++) this.fish.push(this._newFish());
        for (let i = 0; i < initOctopus; i++) this.octopus.push(this._newOctopus());

        this.tick = 0;
        this._events = [];
    }

    // ---- rng helpers (all draws route through this.rng, never Math.random) ----
    _r(min, max) { return min + this.rng() * (max - min); }
    _id() { return this._nextId++; }

    _newFish(near) {
        let x, z;
        if (near) { x = near.x + this._r(-2, 2); z = near.z + this._r(-2, 2); }
        else { const a = this.rng() * TWO_PI, r = this.rng() * this.areaR * 0.8; x = Math.cos(a) * r; z = Math.sin(a) * r; }
        return { id: this._id(), x, z, vx: this._r(-1, 1), vz: this._r(-1, 1),
                 energy: near ? near.energy / 2 : this.fishEnergyInit };
    }
    _newOctopus(near) {
        let x, z;
        if (near) { x = near.x + this._r(-3, 3); z = near.z + this._r(-3, 3); }
        else { const a = this.rng() * TWO_PI, r = this._r(this.areaR * 0.2, this.areaR * 0.8); x = Math.cos(a) * r; z = Math.sin(a) * r; }
        return { id: this._id(), x, z, heading: this.rng() * TWO_PI, turnT: this._r(2, 5),
                 energy: near ? near.energy / 2 : this.octoEnergyInit };
    }

    // ---- food grid ----
    _cellIndex(x, z) {
        const gx = Math.min(this.gridN - 1, Math.max(0, ((x + this.areaR) / this.cell) | 0));
        const gz = Math.min(this.gridN - 1, Math.max(0, ((z + this.areaR) / this.cell) | 0));
        return gz * this.gridN + gx;
    }
    _growFood(dt) {
        const g = this.food;
        for (let i = 0; i < g.length; i++) {
            const d = g[i];
            const nd = d + (this.growth * d * (1 - d) + this.seed) * dt;
            g[i] = nd > 1 ? 1 : nd;
        }
    }
    // Richest neighbouring cell (3x3), used as a fish's seek target.
    _richestNeighbour(x, z) {
        const gx = Math.min(this.gridN - 1, Math.max(0, ((x + this.areaR) / this.cell) | 0));
        const gz = Math.min(this.gridN - 1, Math.max(0, ((z + this.areaR) / this.cell) | 0));
        let bestC = gx, bestR = gz, bestD = this.food[gz * this.gridN + gx];
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
            const c = gx + dc, r = gz + dr;
            if (c < 0 || c >= this.gridN || r < 0 || r >= this.gridN) continue;
            const d = this.food[r * this.gridN + c];
            if (d > bestD) { bestD = d; bestC = c; bestR = r; }
        }
        return { x: -this.areaR + (bestC + 0.5) * this.cell, z: -this.areaR + (bestR + 0.5) * this.cell, d: bestD };
    }

    foodTotal() { let s = 0; for (let i = 0; i < this.food.length; i++) s += this.food[i]; return s; }

    // ---- one tick ----
    update(dt) {
        this._events = [];
        this._growFood(dt);
        this._stepFish(dt);
        this._stepOctopus(dt);
        this.tick++;
        return this._events;
    }

    _stepFish(dt) {
        const F = this.fish, O = this.octopus, visSq = this.fishVision * this.fishVision, fleeSq = this.fishFleeRadius * this.fishFleeRadius;
        for (const f of F) {
            // mild cohesion toward nearby fish + seek richest nearby food + flee nearest octopus
            let cohX = 0, cohZ = 0, cohN = 0;
            for (const o2 of F) {
                if (o2 === f) continue;
                const dx = o2.x - f.x, dz = o2.z - f.z, d2 = dx * dx + dz * dz;
                if (d2 < visSq) { cohX += dx; cohZ += dz; cohN++; }
            }
            let ax = this._r(-1, 1) * 0.6, az = this._r(-1, 1) * 0.6;   // wander
            if (cohN) { ax += (cohX / cohN) * 0.05; az += (cohZ / cohN) * 0.05; }
            const target = this._richestNeighbour(f.x, f.z);
            const tdx = target.x - f.x, tdz = target.z - f.z, td = Math.hypot(tdx, tdz) || 1;
            ax += (tdx / td) * 0.8; az += (tdz / td) * 0.8;
            for (const o of O) {
                const dx = f.x - o.x, dz = f.z - o.z, d2 = dx * dx + dz * dz;
                if (d2 < fleeSq && d2 > 0.0001) { const d = Math.sqrt(d2), k = 1 - d / this.fishFleeRadius; ax += (dx / d) * 4 * k; az += (dz / d) * 4 * k; }
            }
            // soft homing back toward the play disc
            const hd = Math.hypot(f.x, f.z);
            if (hd > this.areaR * 0.9 && hd > 0) { ax += -f.x / hd * 2; az += -f.z / hd * 2; }

            f.vx += ax * dt; f.vz += az * dt;
            const sp = Math.hypot(f.vx, f.vz);
            if (sp > this.fishSpeed) { const s = this.fishSpeed / sp; f.vx *= s; f.vz *= s; }
            f.x += f.vx * dt; f.z += f.vz * dt;

            // graze the cell under the fish
            const idx = this._cellIndex(f.x, f.z);
            const have = this.food[idx];
            const eaten = Math.min(have, this.fishEatRate * dt);
            this.food[idx] = have - eaten;
            f.energy += eaten * this.fishFoodToEnergy;

            // costs
            const sp2 = f.vx * f.vx + f.vz * f.vz;
            f.energy -= this.fishMetabolism * dt + this.fishMoveCost * sp2 * dt;
        }

        // deaths
        this.fish = F.filter((f) => {
            if (f.energy <= 0) { this._events.push({ type: "death", species: "fish", id: f.id, x: f.x, z: f.z }); return false; }
            return true;
        });

        // reproduction (after deaths, before the population cap check)
        if (this.fish.length < this.fishMaxPop) {
            const born = [];
            for (const f of this.fish) {
                if (f.energy > this.fishReproThreshold) {
                    f.energy /= 2;
                    const child = this._newFish(f);
                    born.push(child);
                    this._events.push({ type: "birth", species: "fish", id: child.id, x: child.x, z: child.z, parent: f.id });
                }
            }
            if (born.length) this.fish = this.fish.concat(born);
        }
    }

    _stepOctopus(dt) {
        const O = this.octopus, F = this.fish, catchSq = this.octoCatchRadius * this.octoCatchRadius;
        for (const o of O) {
            // find nearest fish
            let best = null, bestD2 = Infinity;
            for (const f of F) {
                const dx = f.x - o.x, dz = f.z - o.z, d2 = dx * dx + dz * dz;
                if (d2 < bestD2) { bestD2 = d2; best = f; }
            }
            let caught = false;
            if (best && bestD2 < catchSq) {
                // steer toward the target while hunting
                const dx = best.x - o.x, dz = best.z - o.z, d = Math.hypot(dx, dz) || 1;
                o.x += (dx / d) * this.octoSpeed * dt; o.z += (dz / d) * this.octoSpeed * dt;
                const p = Math.min(1, this.octoCatchProb * dt);
                if (this.rng() < p) {
                    caught = true;
                    o.energy += this.octoCatchGain;
                    this._events.push({ type: "catch", octopusId: o.id, fishId: best.id, x: best.x, z: best.z });
                    F.splice(F.indexOf(best), 1);
                }
            } else {
                // wander/patrol
                o.turnT -= dt;
                if (o.turnT <= 0) { o.heading += this._r(-0.8, 0.8); o.turnT = this._r(2, 5); }
                const hd = Math.hypot(o.x, o.z);
                if (hd > this.areaR * 0.85) o.heading = Math.atan2(-o.z, -o.x);
                o.x += Math.cos(o.heading) * this.octoSpeed * 0.5 * dt;
                o.z += Math.sin(o.heading) * this.octoSpeed * 0.5 * dt;
            }
            o.energy -= this.octoMetabolism * dt;
            void caught;
        }

        this.octopus = O.filter((o) => {
            if (o.energy <= 0) { this._events.push({ type: "death", species: "octopus", id: o.id, x: o.x, z: o.z }); return false; }
            return true;
        });

        if (this.octopus.length < this.octoMaxPop) {
            const born = [];
            for (const o of this.octopus) {
                if (o.energy > this.octoReproThreshold) {
                    o.energy /= 2;
                    const child = this._newOctopus(o);
                    born.push(child);
                    this._events.push({ type: "birth", species: "octopus", id: child.id, x: child.x, z: child.z, parent: o.id });
                }
            }
            if (born.length) this.octopus = this.octopus.concat(born);
        }
    }

    // ---- queries ----
    counts() { return { fish: this.fish.length, octopus: this.octopus.length, tick: this.tick }; }
    fishList() { return this.fish.map((f) => ({ id: f.id, x: f.x, z: f.z, energy: f.energy, vx: f.vx, vz: f.vz })); }
    octopusList() { return this.octopus.map((o) => ({ id: o.id, x: o.x, z: o.z, energy: o.energy })); }
    eventsThisTick() { return this._events; }

    // Repeated update() calls, returning one summary row per step — the population-curve
    // CSV skeeto/aquarium dumps to a file, returned here as plain data instead.
    simulate(steps, dt) {
        const rows = [];
        let t = 0;
        for (let i = 0; i < steps; i++) {
            this.update(dt);
            t += dt;
            const fe = this.fish.reduce((s, f) => s + f.energy, 0);
            const oe = this.octopus.reduce((s, o) => s + o.energy, 0);
            rows.push({
                t,
                fish: this.fish.length,
                octopus: this.octopus.length,
                avgFishEnergy: this.fish.length ? fe / this.fish.length : 0,
                avgOctoEnergy: this.octopus.length ? oe / this.octopus.length : 0,
                food: this.foodTotal(),
            });
        }
        return rows;
    }
}

export default OceanPopulation;
