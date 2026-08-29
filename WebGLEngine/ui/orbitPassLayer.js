// ui/orbitPassLayer.js — v4134
//
// A handful of satellites passing overhead, for the arrival to fly through.
//
// Keith asked for the real-terrain fly-in to "fly into the satellite layer briefly, then see the adsblayer".
// The engine already HAD satellites -- simulation/SatelliteFleet.js -- and they are the wrong ones: that is a
// COMBAT system where cities launch armed satellites with cooldowns, lasers and kaiju targeting, wired to
// damage numbers. Dragging a weapons simulation into a scenic descent would have given the arrival a fleet
// that wants to shoot at something. This layer is scenery and nothing else: it spawns, it drifts, it stops.
//
// IT REUSES planeMeshLayer's PATH RATHER THAN INVENTING ONE. Same buildVoxelMesh -> assetLoader._createMesh
// registration, same router entity:spawnMesh / ecs Position transform, same despawn. A second way to put a
// moving mesh in this world is the duplicate-definition shape this tree keeps paying for.
//
// SEEDED, NOT RANDOM. Two arrivals at the same place look the same. hitBurst.js already argued this for its
// debris ("uses no Math.random ... so the spray does not travel further on a faster machine") and the reason
// is stronger here: this runs during a CINEMATIC, and a shot that is different every time cannot be graded by
// a gate or judged by eye against the last one.
//
// API: window.orbitPass.start({shellY, count, seed}) / .stop() / .tick(dtSec) / .status()
import { buildVoxelMesh } from "../gpu/voxelCreature.js";

// Bus with two solar wings. Nose toward -Z like planeMeshLayer's aircraft, so the same yaw convention applies.
function genSatellite() {
    const v = [];
    const bus = 1, panel = 5, dish = 4;
    for (let z = -1; z <= 1; z++) for (let x = -1; x <= 1; x++) v.push([x, 0, z, bus]);   // body
    for (let x = -6; x <= -2; x++) v.push([x, 0, 0, panel]);                              // port wing
    for (let x = 2; x <= 6; x++) v.push([x, 0, 0, panel]);                                // starboard wing
    v.push([0, 1, 0, dish]); v.push([0, 2, 0, dish]);                                     // dish mast
    return v;
}

// A tiny deterministic LCG -- the same one the ES pages use, for the same reason.
function makeRng(seed) { let s = (seed >>> 0) || 1; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; }

export function installOrbitPass() {
    const KIND = "orbit_satellite";
    let registered = false, on = false, t = 0;
    let sats = [];                       // { id, r, phase, speed, y, tilt }
    let cfg = { shellY: 300, count: 5, seed: 20260829, spread: 900 };

    function registerKind() {
        if (registered) return true;
        const al = window.assetLoader;
        if (!al || !al.gl || !al.cache || !al._createMesh) return false;
        if (!al.cache.get(KIND)) {
            try {
                const g = buildVoxelMesh(genSatellite());
                const mesh = al._createMesh(g.positions.buffer, g.indices.buffer, g.normals.buffer, g.colors.buffer,
                    { name: KIND, vertexCount: g.vertexCount, indexCount: g.indices.length, hasNormals: true, hasColors: true });
                if (mesh) { al.cache.set(KIND, mesh); al._ollamaRequested?.add?.(KIND); }
            } catch (e) { console.warn("[orbitPass] register:", e && e.message); return false; }
        }
        registered = true;
        return true;
    }

    function _spawn(x, y, z, yaw) {
        try { const r = window.router?.exec?.({ type: "entity:spawnMesh", assetId: KIND, kind: KIND, x, y, z, scaleX: 1, scaleY: 1, scaleZ: 1, yaw }); return r && r.id; } catch { return null; }
    }
    function _despawn(id) { try { window.router?.exec?.({ type: "entity:despawn", id }); } catch {} }
    function _move(id, x, y, z, yaw) {
        try { const ecs = window.ecsWorld; if (!ecs?.getComponent) return; const p = ecs.getComponent(id, "Position");
            if (p) { p.x = x; p.y = y; p.z = z; if (yaw !== undefined) p.yaw = yaw; } } catch {}
    }

    // Circular tracks around the arrival point at slightly different radii, heights and rates -- enough for a
    // pass to read as orbital motion without pretending to be orbital mechanics. It is NOT a two-body solution
    // and does not claim to be one; calling it an orbit propagator would be the sort of dressed-up guess this
    // tree names everywhere.
    function place(i, s) {
        const a = s.phase + t * s.speed;
        return { x: Math.cos(a) * s.r, y: s.y, z: Math.sin(a) * s.r * s.tilt, yaw: -a };
    }

    function start(o = {}) {
        if (!registerKind()) return { ok: false, error: "asset loader not ready" };
        stop();
        cfg = { ...cfg, ...o };
        const rng = makeRng(cfg.seed);
        sats = [];
        for (let i = 0; i < Math.max(0, cfg.count | 0); i++) {
            const s = {
                r: cfg.spread * (0.55 + rng() * 0.75),
                phase: rng() * Math.PI * 2,
                speed: 0.05 + rng() * 0.06,          // radians/sec: a slow, readable drift
                y: cfg.shellY * (0.85 + rng() * 0.35),
                tilt: 0.35 + rng() * 0.5,            // squash z so tracks are inclined rather than all flat rings
                id: null,
            };
            const p = place(i, s);
            s.id = _spawn(p.x, p.y, p.z, p.yaw);
            if (s.id != null) sats.push(s);
        }
        on = sats.length > 0;
        return { ok: on, count: sats.length, shellY: cfg.shellY };
    }

    function tick(dtSec) {
        if (!on) return;
        t += Math.max(0, Number(dtSec) || 0);
        for (let i = 0; i < sats.length; i++) { const p = place(i, sats[i]); _move(sats[i].id, p.x, p.y, p.z, p.yaw); }
    }

    function stop() {
        for (const s of sats) if (s.id != null) _despawn(s.id);
        sats = []; on = false; t = 0;
        return { ok: true };
    }

    function status() { return { ok: true, on, count: sats.length, shellY: cfg.shellY, registered }; }

    window.orbitPass = { start, stop, tick, status };
    console.log("[orbitPass] window.orbitPass.start({shellY,count,seed}) / .stop() / .tick(dt) — satellites for the arrival to pass through");
}
