// WebGLEngine/physics/kaijuBox3dScene.js — v2259
//
// The box3d rigid-body scene for the kaiju city: it turns kaijuCity's buildings into box3d bodies, carries the
// kaiju as a kinematic collider the flow-field AI drives, and gives back the transforms of everything DYNAMIC
// (toppled buildings + debris + thrown props) each frame for the renderer to draw. Standing buildings stay
// STATIC (they don't move, the existing renderer draws them axis-aligned as now); toppling WAKES a building to
// dynamic so box3d takes over its fall. This is the "over kaiju's world" layer -- kaiju keeps flow-field
// locomotion, ClothSim, water, civ AI; box3d only owns the rigid destruction.
//
// It wraps a box3d WORLD HANDLE (never imports box3dLoader) so it runs headless against a mock in tests. Use
// createSceneFromLoader(box3d, opts) in the browser to build one from the real WASM behind box3d.enabled().

import { createKaijuBox3D } from "./kaijuBox3d.js";

export function createKaijuBox3DScene(world, opts = {}) {
    const rb = createKaijuBox3D(world);
    const groundHalf = opts.groundHalf || 500;
    rb.addStatic({ pos: [0, -0.5, 0], half: [groundHalf, 0.5, groundHalf] });

    // the kaiju is a KINEMATIC collider: the AI drives it (driveKaiju), and it shoves whatever dynamic bodies
    // it sweeps through. It is never rendered from here (kaiju draws its own mesh), so it has no render entry.
    const kaijuHalf = opts.kaijuHalf || [3, 8, 3];
    const kaijuRec = rb.addKinematic({ pos: opts.kaijuStart || [0, kaijuHalf[1], 0], half: kaijuHalf });

    const buildings = new Map();     // key -> rec
    const active = [];               // render entries for DYNAMIC bodies: { ref, pos, quat, kind }
    let nextId = 1;
    const keyOf = (b) => (b.id != null ? b.id : (b.__b3id != null ? b.__b3id : (b.__b3id = "b" + nextId++)));

    // a render entry whose apply() the bridge calls on sync (dynamic bodies only)
    function entryFor(ref, kind, pos) {
        const e = { ref, kind, pos: pos.slice(), quat: [0, 0, 0, 1] };
        e.apply = (p, q) => { e.pos = p; e.quat = q; };
        return e;
    }

    return {
        rb, kaijuRec,

        // register one kaijuCity building (footprint w x d at x,z, height h) as a STANDING static box.
        addBuilding(b) {
            const w = b.w || 1, d = b.d || 1, h = b.h || 1;
            const pos = [b.x + w / 2, h / 2, b.z + d / 2];
            const entry = entryFor(b, "building", pos);
            const rec = rb.addStatic({ pos, half: [w / 2, h / 2, d / 2], apply: entry.apply });
            rec._entry = entry; rec._standing = true;
            buildings.set(keyOf(b), rec);
            return rec;
        },
        addBuildings(list) { for (const b of list || []) this.addBuilding(b); return buildings.size; },

        // move the kaiju collider to the AI's world pose each frame; it pushes dynamic bodies it touches.
        driveKaiju(pos, quat) { rb.driveKinematic(kaijuRec, pos, quat || [0, 0, 0, 1]); },

        // topple a building: wake it to dynamic (the kaiju collider or the optional impulse then knocks it over).
        topple(b, impulse) {
            const rec = buildings.get(keyOf(b));
            if (!rec || !rec._standing) return null;
            rb.setType(rec, "dynamic"); rec._standing = false;
            active.push(rec._entry);
            if (impulse) rb.impulse(rec, impulse);
            return rec;
        },
        toppleAll(impulse) { for (const rec of buildings.values()) if (rec._standing) { rb.setType(rec, "dynamic"); rec._standing = false; active.push(rec._entry); if (impulse) rb.impulse(rec, impulse); } },

        // crumble: scatter N debris chunks from a point (e.g. where the kaiju struck).
        spawnDebris(pos, n = 8, o = {}) {
            const spread = o.spread || 6, size = o.size || 0.6, out = [];
            for (let i = 0; i < n; i++) {
                const a = (i / n) * Math.PI * 2;
                const entry = entryFor({ debris: true }, "debris", pos);
                rb.throwObject({ pos: [pos[0], pos[1] + i * 0.12, pos[2]], half: [size, size, size], apply: entry.apply },
                    { velocity: [Math.cos(a) * spread, 4 + (i % 3), Math.sin(a) * spread], spin: [1 + (i % 3), 2, 1] });
                active.push(entry); out.push(entry);
            }
            return out;
        },

        // a prop the kaiju throws (a car, a chunk of road) -- travels and tumbles.
        throwProp(pos, velocity, spin, half) {
            const entry = entryFor({ prop: true }, "prop", pos);
            rb.throwObject({ pos, half: half || [0.6, 0.4, 0.9], apply: entry.apply }, { velocity, spin: spin || [0, 0, 0] });
            active.push(entry);
            return entry;
        },

        step(dt = 1 / 60, sub = 4) { return rb.stepAndSync(dt, sub); },

        // everything the renderer must draw at a box3d transform this frame (toppled buildings + debris + props).
        // standing buildings are NOT here -- the existing renderer draws those axis-aligned as before.
        activeBodies() { return active; },

        stateHash() { return rb.stateHash(); },
        buildingCount() { return buildings.size; },
        activeCount() { return active.length; },
        standingCount() { let n = 0; for (const r of buildings.values()) if (r._standing) n++; return n; },
        destroy() { rb.destroy(); buildings.clear(); active.length = 0; },
    };
}

// browser convenience: build a scene from the box3d loader behind box3d.enabled(). Returns { ready:false, reason }
// if the WASM is not built, so callers fall back to kaiju's own crumble/topple.
export async function createSceneFromLoader(loader, opts = {}) {
    const st = await loader.init();
    if (!st.ready) return { ready: false, reason: st.reason };
    const world = loader.createWorld({ gravity: opts.gravity || [0, -20, 0] });
    const scene = createKaijuBox3DScene(world, opts);
    scene.ready = true;
    return scene;
}

if (typeof module !== "undefined" && module.exports) module.exports = { createKaijuBox3DScene, createSceneFromLoader };
