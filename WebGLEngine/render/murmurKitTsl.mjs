// WebGLEngine/render/murmurKitTsl.mjs
//
// THE SHADER HALF of the murmur-web kit -- render/murmurKit.mjs's twin, built as TSL nodes so every one of
// the eighteen species can be written against it instead of re-approximating it. The CPU file is the
// reference; this is the thing that has to agree with it, and tools/ship/murmurKit-selfcheck.mjs is where the
// two are made to.
//
// *** THE PAIR IS THE POINT, AND THIS TREE HAS THE SCAR TO PROVE IT. *** v4579 and v4580 each shipped an
// "emulation" of a shader that rebuilt the formula from JS constants and never read the shader at all, so
// three sabotages passed green. The rule that came out of it: the CPU side must be a genuinely independent
// implementation AND the gate must drive the real one. Here the independence is real -- murmurKit.mjs is f64
// scalar JS, this is an f32 node graph on a GPU -- and the agreement is measured rather than assumed.
//
// INTEGER HASHING IN TSL FOLLOWS THIS TREE'S OWN HOUSE IDIOM, not a new one: render/isingTsl.mjs's philox
// counter already does uint bit-mixing in TSL with .toVar()/.assign()/.bitXor(), and this reads the same way.
"use strict";

import { MH_R, MH_ETA, MH_EXT, MH_TILT, MH_SCATTER_K, MH_EXIT_CAP, MH_DRIFT_WOBBLE_CAP } from "./murmurKit.mjs";

/**
 * makeMurmurKitTsl(TSL) -> the kit's node builders.
 *
 * Every function returns a TSL node and takes nodes, so they compose into a species' fragment graph exactly
 * the way murmur's own GLSL functions compose into a species' GLSL body.
 */
export function makeMurmurKitTsl(TSL) {
    const need = ["Fn", "float", "vec2", "vec3", "uint", "int", "Loop", "floor", "mix", "exp", "sqrt", "cos",
                  "sin", "dot", "length", "normalize", "clamp", "max", "min", "pow", "smoothstep", "select", "abs"];
    for (const n of need) if (typeof TSL[n] !== "function") throw new Error(`murmurKitTsl: the TSL namespace has no ${n}()`);
    const { Fn, float, vec2, vec3, uint, int, Loop, floor, mix, exp, sqrt, cos, sin, dot, length,
            normalize, clamp, max, min, pow, smoothstep, select, abs } = TSL;

    // ---- the integer avalanche ---------------------------------------------------------------------------
    // murmur's own, INCLUDING the first shift of 15 where canonical murmur3 fmix32 uses 16. The two disagree
    // on 63,999 of 64,000 lattice cells (measured, see murmurKit.mjs's header), so this is not a detail that
    // survives being written from memory.
    const mhHash = Fn(([x, y, z]) => {
        const h = x.mul(uint(1597334673)).bitXor(y.mul(uint(3812015801))).bitXor(z.mul(uint(2798796415))).toVar();
        h.assign(h.bitXor(h.shiftRight(uint(15))));
        h.assign(h.mul(uint(2246822519)));
        h.assign(h.bitXor(h.shiftRight(uint(13))));
        h.assign(h.mul(uint(3266489917)));
        h.assign(h.bitXor(h.shiftRight(uint(16))));
        return h;
    });

    /** A unit vector uniform on the sphere from one integer lattice cell. Takes ivec3 components as ints. */
    const mhGrad3 = Fn(([cx, cy, cz]) => {
        const h = mhHash(uint(cx.add(int(4096))), uint(cy.add(int(4096))), uint(cz.add(int(4096)))).toVar();
        const z = float(h.bitAnd(uint(0xFFFF))).mul(2.0 / 65535.0).sub(1.0).toVar();
        const a = float(h.shiftRight(uint(16)).bitAnd(uint(0xFFFF))).mul(6.28318530718 / 65536.0).toVar();
        const r = sqrt(max(float(0.0), float(1.0).sub(z.mul(z)))).toVar();
        return vec3(r.mul(cos(a)), r.mul(sin(a)), z);
    });

    /** Gradient noise, quintic fade, eight corners -- murmur's mh_noise3. */
    const mhNoise3 = Fn(([p]) => {
        const i = floor(p).toVar();
        const f = p.sub(i).toVar();
        const u = f.mul(f).mul(f).mul(f.mul(f.mul(6.0).sub(15.0)).add(10.0)).toVar();
        const cx = int(i.x), cy = int(i.y), cz = int(i.z);
        const corner = (dx, dy, dz) =>
            dot(mhGrad3(cx.add(int(dx)), cy.add(int(dy)), cz.add(int(dz))), f.sub(vec3(dx, dy, dz)));
        const va = corner(0, 0, 0), vb = corner(1, 0, 0), vc = corner(0, 1, 0), vd = corner(1, 1, 0);
        const ve = corner(0, 0, 1), vf = corner(1, 0, 1), vg = corner(0, 1, 1), vh = corner(1, 1, 1);
        return mix(mix(mix(va, vb, u.x), mix(vc, vd, u.x), u.y),
                   mix(mix(ve, vf, u.x), mix(vg, vh, u.x), u.y), u.z);
    });

    /** One lane of the hash as 0..1. The >> 8 keeps 24 bits -- float32's exact-integer range, not a rounding. */
    const mhHash1 = Fn(([cell, lane]) => {
        const c = uint(int(cell).add(int(32768)));
        const l = uint(int(lane).add(int(32768)));
        return float(mhHash(c, l, uint(0x9E3779B9)).shiftRight(uint(8))).mul(1.0 / 16777216.0);
    });

    // ---- the gesture clock ---------------------------------------------------------------------------------
    /** Returns vec4(env, u, rand, dur) -- murmur's own order. sin^2(pi u): zero value AND zero slope at both ends. */
    const mhFlourish = Fn(([t, lane, slotLen]) => {
        const SLOT = max(slotLen, float(1.0)).toVar();
        const slot = floor(t.div(SLOT)).toVar();
        const local = t.sub(slot.mul(SLOT)).toVar();
        const start = float(0.9).add(SLOT.mul(0.28).mul(mhHash1(slot, lane))).toVar();
        const dur = SLOT.mul(float(0.24).add(float(0.16).mul(mhHash1(slot.add(811.0), lane)))).toVar();
        const u = local.sub(start).div(dur).toVar();
        const uc = clamp(u, 0.0, 1.0).toVar();
        const sn = sin(float(Math.PI).mul(uc)).toVar();
        // murmur's own `(u <= 0 || u >= 1) ? 0 : sn*sn`. Written as a select on the clamped edge rather than
        // a branch so the graph stays uniform-control-flow on both backends.
        const env = select(u.lessThanEqual(0.0).or(u.greaterThanEqual(1.0)), float(0.0), sn.mul(sn));
        return TSL.vec4(env, uc, mhHash1(slot.add(1607.0), lane), dur);
    });

    /** kit.ts's mh_spin: yaw about y then tilt about x. A rotation -- the CPU twin's gate asserts it preserves length. */
    const mhSpin = Fn(([p, ay, ax]) => {
        const ca = cos(ay).toVar(), sa = sin(ay).toVar();
        const q = vec3(ca.mul(p.x).add(sa.mul(p.z)), p.y, sa.negate().mul(p.x).add(ca.mul(p.z))).toVar();
        const cb = cos(ax).toVar(), sb = sin(ax).toVar();
        return vec3(q.x, cb.mul(q.y).sub(sb.mul(q.z)), sb.mul(q.y).add(cb.mul(q.z)));
    });

    /** kit.ts's mh_drift: eased angular travel, so an arc hurries and dawdles instead of spinning. */
    const mhDrift = Fn(([t, rate, wobble, lane]) => {
        const k = clamp(wobble, 0.0, MH_DRIFT_WOBBLE_CAP).toVar();
        const w2 = float(0.137).add(lane.mul(0.0413)).toVar();
        return rate.mul(t).add(k.mul(rate).div(w2).mul(sin(w2.mul(t).add(lane.mul(1.71)))));
    });

    const mhBreath = Fn(([t, lane]) =>
        float(0.5).add(float(0.5).mul(
            sin(t.mul(0.668).add(lane)).mul(0.62).add(sin(t.mul(0.427).add(lane.mul(2.3)).add(1.1)).mul(0.38)))));

    // ---- the glass body ------------------------------------------------------------------------------------
    /** Snell written out so the total-internal guard is visible -- murmur's own reason: a silent NaN at the
     *  limb is a black ring around a glass ball. */
    const mhRefract = Fn(([V, N, eta]) => {
        const ci = clamp(dot(V, N).negate(), 0.0, 1.0).toVar();
        const k = float(1.0).sub(eta.mul(eta).mul(float(1.0).sub(ci.mul(ci)))).toVar();
        return select(k.lessThanEqual(0.0), V,
                      normalize(V.mul(eta).add(N.mul(eta.mul(ci).sub(sqrt(max(k, float(1e-9))))))));
    });

    /** The interior look direction, and the ONLY place tilt enters the family. */
    const mhLook = Fn(([V, N, tilt]) => {
        const rd = mhRefract(V, N, float(MH_ETA)).toVar();
        return select(abs(tilt.x).add(abs(tilt.y)).lessThanEqual(0.0), rd,
                      normalize(rd.add(vec3(tilt.x, tilt.y, float(0.0)).mul(MH_TILT))));
    });

    /** How far the interior ray runs, against the UNDEFORMED unit sphere -- murmur's own deliberate choice. */
    const mhExit = Fn(([P, rd]) => {
        const b = dot(P, rd).toVar();
        const c = dot(P, P).sub(1.0).toVar();
        const disc = b.mul(b).sub(c).toVar();
        return select(disc.lessThanEqual(0.0), float(0.0),
                      clamp(b.negate().add(sqrt(max(disc, float(0.0)))), 0.0, MH_EXIT_CAP));
    });

    // ---- the medium -----------------------------------------------------------------------------------------
    const mhHaze = Fn(([p, t, scale]) =>
        clamp(float(0.5).add(float(0.85).mul(
            mhNoise3(vec3(p.x.mul(scale).add(t.mul(0.051)),
                          p.y.mul(scale).sub(t.mul(0.033)),
                          p.z.mul(scale).add(t.mul(0.089)))))), 0.0, 1.0));

    const mhMedium = Fn(([p, t, scale]) =>
        float(1.0).sub(smoothstep(float(0.05), float(0.98), length(p)))
            .mul(float(0.55).add(float(0.45).mul(mhHaze(p, t, scale)))));

    const mhInside = Fn(([p]) => float(1.0).sub(smoothstep(float(0.76), float(0.99), length(p))));

    const mhTransmit = Fn(([fres]) => float(1.0).sub(float(0.88).mul(pow(clamp(fres, 0.0, 1.0), float(2.2)))));

    const mhScatter = Fn(([arg, amp]) => amp.mul(exp(arg.mul(-MH_SCATTER_K))));

    return {
        MH_R, MH_ETA, MH_EXT, MH_TILT, MH_SCATTER_K, MH_EXIT_CAP,
        mhHash, mhGrad3, mhNoise3, mhHash1, mhFlourish, mhBreath, mhDrift, mhSpin,
        mhRefract, mhLook, mhExit, mhHaze, mhMedium, mhInside, mhTransmit, mhScatter,
        Loop,
    };
}

/**
 * THE PROBE THE GATE DRIVES. Not a demo: it exists so tools/ship/murmurKit-selfcheck.mjs can compare the REAL
 * compiled shader against render/murmurKit.mjs on the same inputs, rather than comparing the CPU reference to
 * a JS re-statement of itself -- which is exactly the mistake v4579 and v4580 shipped twice, where an
 * "emulation" rebuilt the formula from JS constants, never read the shader, and let three sabotages pass.
 *
 * *** THE HASH IS COMPARED BIT-EXACTLY, NOT WITHIN A TOLERANCE. *** An 8-bit channel round-trips an exact byte
 * (v = byte/255 in, round(v*255) out), so a uint32 packed one byte per channel comes back as the same uint32 or
 * as something visibly wrong -- there is no "close" for a hash, and a tolerance would hide precisely the
 * wrong-shift error this kit's provenance note exists about.
 *
 * mode: "hash"  -> pixel (x,y) carries mhHash(x, y, 0) packed big-endian across RGBA.
 *       "noise" -> mhNoise3 over a fixed lattice, remapped to 0..1 in R (8-bit, so compared within quantisation).
 *       "exit"  -> mhExit for a ray through the body, in R, scaled by 1/MH_EXIT_CAP.
 */
export function makeMurmurKitProbeTsl(THREE, TSL, { mode = "hash", n = 16 } = {}) {
    const K = makeMurmurKitTsl(TSL);
    const { Fn, float, vec3, vec4, uint, int, uv, floor, clamp } = TSL;

    const main = Fn(() => {
        // Pixel indices from uv. floor(uv * n) is the cell, exactly as the CPU side enumerates it.
        const px = floor(uv().x.mul(n)).toVar();
        const py = floor(uv().y.mul(n)).toVar();

        if (mode === "hash") {
            const h = K.mhHash(uint(int(px)), uint(int(py)), uint(0)).toVar();
            // big-endian across RGBA; each channel is an exact byte/255 so the readback is lossless
            const b0 = float(h.shiftRight(uint(24)).bitAnd(uint(255))).div(255.0);
            const b1 = float(h.shiftRight(uint(16)).bitAnd(uint(255))).div(255.0);
            const b2 = float(h.shiftRight(uint(8)).bitAnd(uint(255))).div(255.0);
            const b3 = float(h.bitAnd(uint(255))).div(255.0);
            return vec4(b0, b1, b2, b3);
        }
        if (mode === "noise") {
            // A lattice that deliberately straddles cell boundaries, where a wrong fade or a wrong gradient
            // shows up and a smooth interior would not.
            const p = vec3(px.mul(0.37), py.mul(0.29), float(0.61));
            const v = clamp(K.mhNoise3(p).mul(0.5).add(0.5), 0.0, 1.0);
            return vec4(v, v, v, 1.0);
        }
        // "exit": a ray entering the unit sphere at a known point and running along +z.
        const P = vec3(px.div(n).mul(1.6).sub(0.8), py.div(n).mul(1.6).sub(0.8), float(-0.5));
        const L = K.mhExit(P, vec3(0.0, 0.0, 1.0)).div(K.MH_EXIT_CAP);
        return vec4(L, L, L, 1.0);
    });

    const material = new THREE.NodeMaterial();
    material.transparent = false;
    material.depthTest = false;
    material.depthWrite = false;
    material.fragmentNode = main();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return { material, scene, camera, uniforms: {}, setKnobs() {}, setTime() {} };
}
