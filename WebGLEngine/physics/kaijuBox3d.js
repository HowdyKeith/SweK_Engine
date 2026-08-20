// WebGLEngine/physics/kaijuBox3d.js — v2257
//
// The rigid-body LAYER for kaiju: box3d owns the destructible/dynamic props (toppling buildings, falling
// debris, tumbling thrown objects) while kaiju keeps its own systems for everything box3d is not built for
// (GPU flow-field locomotion, ClothSim capes, water, civ AI). This bridge is the seam: it registers kaiju
// world objects as box3d bodies and, each frame, reads box3d's transforms back onto them. kaiju renders
// "over" box3d's rigid truth.
//
// It wraps a box3d WORLD HANDLE (from box3dLoader.createWorld) but never imports it, so it runs headless
// against a mock world in tests. box3d's transform readback is index-ordered [x,y,z,qx,qy,qz,qw] per body,
// and the shim is add-only with a create-time static|dynamic type -- so this bridge is add-only too, which
// matches how destruction actually works (a wall does not move, it SPAWNS debris). Static bodies are skipped
// on sync (they never move); only dynamic bodies are written back.
//
//   const rb = createKaijuBox3D(world);
//   rb.addStatic({ pos:[0,-0.5,0], half:[50,0.5,50] });                 // ground / indestructible backdrop
//   const crate = rb.addDynamic({ pos:[0,5,0], half:[.5,.5,.5], ref: entity, apply:(p,q)=>entity.setTransform(p,q) });
//   rb.stepAndSync(1/60, 4);                                            // step box3d, then pull transforms onto kaiju

export function createKaijuBox3D(world, opts = {}) {
    if (!world || typeof world.addBox !== "function") throw new Error("kaijuBox3d: needs a box3d world handle");
    const substeps = opts.substeps || 4;
    const bodies = [];   // { idx, obj, dynamic } in box3d creation order

    function add(obj, forcedType) {
        const o = obj || {};
        const kind = forcedType || o.type || "dynamic";      // "static" | "dynamic" | "kinematic"
        const idx = world.addBox({
            type: kind,
            pos: o.pos || [0, 0, 0],
            half: o.half || [0.5, 0.5, 0.5],
            density: o.density != null ? o.density : 1,
        });
        const rec = { idx, obj: o, kind };     // o is the ORIGINAL object -> sync writes back to the caller's ref
        bodies.push(rec);
        return rec;
    }
    const idxOf = (r) => (typeof r === "number" ? r : r && r.idx);

    // write one body's transform onto its kaiju object: prefer an apply(pos,quat) callback,
    // else set .pos/.quat on a .ref, else on the object itself.
    function applyTransform(rec, pos, quat) {
        const o = rec.obj;
        if (typeof o.apply === "function") { o.apply(pos, quat); return; }
        const target = o.ref || o;
        target.pos = pos; target.quat = quat;
    }

    return {
        add,
        addStatic(obj) { return add(obj, "static"); },
        addDynamic(obj) { return add(obj, "dynamic"); },
        addKinematic(obj) { return add(obj, "kinematic"); },   // a mover the AI drives (the kaiju collider)

        step(dt = 1 / 60, sub = substeps) { world.step(dt, sub); },

        // pull box3d's transforms back onto the registered DYNAMIC objects (static never moves; kinematic is
        // driven by us, not read). reads ONCE (the view is only valid until the next box3d call) then applies.
        sync() {
            const xf = world.readTransforms();
            let moved = 0;
            for (const rec of bodies) {
                if (rec.kind !== "dynamic") continue;
                const o = rec.idx * 7;
                if (o + 7 > xf.length) continue;            // guard: body index beyond the buffer
                applyTransform(rec, [xf[o], xf[o + 1], xf[o + 2]], [xf[o + 3], xf[o + 4], xf[o + 5], xf[o + 6]]);
                moved++;
            }
            return moved;
        },

        stepAndSync(dt = 1 / 60, sub = substeps) { world.step(dt, sub); return this.sync(); },

        // --- v2258: make the kaiju CAUSE the physics ---
        impulse(rec, v) { world.impulse(idxOf(rec), v); },                 // kick / blast
        angularImpulse(rec, v) { world.angularImpulse(idxOf(rec), v); },   // add spin
        setVelocity(rec, v) { world.setVelocity(idxOf(rec), v); },         // launch at a speed
        driveKinematic(rec, pos, quat = [0, 0, 0, 1]) { world.setTransform(idxOf(rec), pos, quat); },  // move the AI collider each frame
        setType(rec, kind) { world.setType(idxOf(rec), kind); if (rec && typeof rec === "object") rec.kind = kind; },  // wall -> debris
        // throw a prop from the kaiju's hand: dynamic body, given a launch velocity and a tumble.
        throwObject(obj, { velocity = [0, 0, 0], spin = [0, 0, 0] } = {}) {
            const rec = add(obj, "dynamic");
            if (velocity) world.setVelocity(rec.idx, velocity);
            if (spin && (spin[0] || spin[1] || spin[2])) world.angularImpulse(rec.idx, spin);
            return rec;
        },

        stateHash() { return typeof world.stateHash === "function" ? world.stateHash() : 0; },
        count() { return bodies.length; },
        dynamicCount() { return bodies.reduce((n, b) => n + (b.kind === "dynamic" ? 1 : 0), 0); },
        kinematicCount() { return bodies.reduce((n, b) => n + (b.kind === "kinematic" ? 1 : 0), 0); },
        destroy() { if (typeof world.destroy === "function") world.destroy(); bodies.length = 0; },
    };
}

if (typeof module !== "undefined" && module.exports) module.exports = { createKaijuBox3D };
