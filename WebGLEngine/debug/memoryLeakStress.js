// FILE: debug/memoryLeakStress.js
// VERSION: v1 — round 297
//
// Stress-test harness for memory leak detection. Spawns and despawns kaiju
// at a high rate, then takes heap snapshots before/after to detect any
// accumulating retention. Run from the browser console:
//
//     window.memLeakStress.run({ durationSec: 60, spawnRateHz: 10 })
//
// Reports retained allocations per system across the run. Doesn't auto-fail;
// reports numbers and lets you decide what's anomalous. Use Chrome DevTools
// "Memory" tab to take JS heap snapshots manually before + after for the
// definitive diff.
//
// What this catches:
//   - Maps that grow on add but never shrink on delete
//   - Closure refs that survive entity disposal (KaijuIK was a candidate
//     in the v294 tech debt audit — we now verify it cleans up)
//   - Particle pool leaks (each particle.spawn allocates)
//   - Animator cache leaks (EntityMeshRenderer._animators)
//   - KingPack._packs and ._demoralized entries
//
// What this does NOT catch:
//   - GPU-side leaks (texture/VBO retention) — separate from JS heap
//   - WebAudio nodes that aren't disconnected
//   - DOM elements left attached after panel destruction

export class MemoryLeakStress {
    constructor({ kaijuManager, kaijuIK, particles, meshRenderer, kingPack }) {
        this.kaijuManager = kaijuManager;
        this.kaijuIK      = kaijuIK;
        this.particles    = particles;
        this.meshRenderer = meshRenderer;
        this.kingPack     = kingPack;

        this._running = false;
        this._timer = null;
        this._tickHandle = null;
    }

    // Take a snapshot of the sizes of various caches and pools.
    snapshot(label = "") {
        const s = {
            label,
            t: performance.now(),
            kaiju: this.kaijuManager?.kaiju?.size ?? 0,
            animators: this.meshRenderer?._animators?.size ?? 0,
            ikWired: this.kaijuIK?._wired?.size ?? 0,
            packs: this.kingPack?._packs?.size ?? 0,
            demoralized: this.kingPack?._demoralized?.size ?? 0,
            // particles: most particle systems keep an internal array;
            // we look for a likely-named property without crashing if absent
            particles: this.particles?._active?.length
                    ?? this.particles?.particles?.length
                    ?? this.particles?._particles?.length
                    ?? -1,
            heapMB: this._heapMB(),
        };
        return s;
    }

    _heapMB() {
        if (typeof performance === "undefined") return -1;
        const m = performance.memory;
        if (!m) return -1;     // not Chrome; field absent
        return (m.usedJSHeapSize / 1048576).toFixed(1);
    }

    // Print a diff between two snapshots
    diff(before, after) {
        const out = {
            label:        `${before.label} → ${after.label}`,
            elapsedSec:   ((after.t - before.t) / 1000).toFixed(1),
            kaiju:        after.kaiju       - before.kaiju,
            animators:    after.animators   - before.animators,
            ikWired:      after.ikWired     - before.ikWired,
            packs:        after.packs       - before.packs,
            demoralized:  after.demoralized - before.demoralized,
            particles:    (after.particles >= 0 && before.particles >= 0)
                          ? after.particles - before.particles
                          : "n/a",
            heapMBDelta:  (after.heapMB - before.heapMB).toFixed(1),
        };
        return out;
    }

    async run({ durationSec = 60, spawnRateHz = 10, settleSec = 2 } = {}) {
        if (this._running) {
            console.warn("[MemLeakStress] already running");
            return null;
        }
        this._running = true;
        const startSnap = this.snapshot("baseline");
        console.log("[MemLeakStress] start:", startSnap);

        const intervalMs = 1000 / spawnRateHz;
        const tEnd = performance.now() + durationSec * 1000;
        let spawned = 0;
        let killed = 0;

        await new Promise((resolve) => {
            const tickOnce = () => {
                if (!this._running || performance.now() >= tEnd) {
                    clearInterval(this._timer);
                    this._timer = null;
                    resolve();
                    return;
                }
                // Force spawn one kaiju
                try {
                    if (this.kaijuManager?._tryAutoSpawn) {
                        const beforeSize = this.kaijuManager.kaiju.size;
                        this.kaijuManager._tryAutoSpawn();
                        if (this.kaijuManager.kaiju.size > beforeSize) spawned++;
                    }
                    // Kill the oldest kaiju
                    if (this.kaijuManager?.kaiju?.size > 0) {
                        const oldest = this.kaijuManager.kaiju.values().next().value;
                        if (oldest && oldest.state !== "dying") {
                            oldest.hp = 0;
                            oldest.state = "dying";
                            killed++;
                        }
                    }
                } catch (e) {
                    console.warn("[MemLeakStress] tick error:", e?.message ?? e);
                }
            };
            this._timer = setInterval(tickOnce, intervalMs);
        });

        // Settle period — let pending despawns + GC complete
        await new Promise(r => setTimeout(r, settleSec * 1000));

        // Try to trigger GC via a memory pressure spike (not guaranteed)
        // Throwaway allocation; immediately frees.
        if (typeof gc === "function") {
            try { gc(); } catch {}
        } else {
            // Best-effort: large temporary alloc, dropped immediately.
            const big = new Array(1e6).fill(0);
            big.length = 0;
        }
        await new Promise(r => setTimeout(r, 500));

        const endSnap = this.snapshot("post-stress");
        const d = this.diff(startSnap, endSnap);
        const report = {
            spawned, killed,
            durationSec: durationSec,
            spawnRateHz,
            baseline: startSnap,
            final: endSnap,
            diff: d,
            verdict: this._verdict(d),
        };
        console.log("[MemLeakStress] done:", report);
        this._running = false;
        return report;
    }

    _verdict(d) {
        const flags = [];
        // We expect kaiju + animators + ikWired to net out to ~0 after
        // settle. Anything > 5 retained is suspicious (small drift from
        // in-flight despawns is OK).
        if (d.kaiju      > 5) flags.push(`kaiju retained: ${d.kaiju}`);
        if (d.animators  > 5) flags.push(`animators retained: ${d.animators}`);
        if (d.ikWired    > 5) flags.push(`IK constraints retained: ${d.ikWired}`);
        if (d.packs      > 2) flags.push(`packs retained: ${d.packs}`);
        if (d.demoralized > 5) flags.push(`demoralized retained: ${d.demoralized}`);
        // Heap delta — soft heuristic. A few MB of growth is normal due
        // to JIT warmup + V8 heap growth; > 20MB after a 60s stress is
        // worth investigating.
        const heapMBNum = parseFloat(d.heapMBDelta);
        if (Number.isFinite(heapMBNum) && heapMBNum > 20) {
            flags.push(`heap grew ${heapMBNum.toFixed(1)} MB`);
        }
        return flags.length === 0 ? "clean" : flags;
    }

    stop() {
        this._running = false;
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
    }
}

export function makeMemoryLeakStress(deps) {
    return new MemoryLeakStress(deps);
}
