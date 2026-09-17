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

import { MH_R, MH_ETA, MH_EXT, MH_TILT, MH_SCATTER_K, MH_SPREAD, MH_EXIT_CAP, MH_DRIFT_WOBBLE_CAP,
         MH_AMP_CAP, MH_SQRTPI } from "./murmurKit.mjs";

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

    /**
     * kit.ts's mh_roll: the THIRD rotation, in the xy plane about the view axis, applied BEFORE yaw and tilt.
     * Without it "three ribbons at three yaws and three tilts came out as three horizontal swooshes stacked on
     * each other, which is one swoosh". The CPU twin's gate asserts it preserves length, as mhSpin's does.
     */
    const mhRoll = Fn(([p, a]) => {
        const c = cos(a).toVar(), s = sin(a).toVar();
        return vec3(c.mul(p.x).sub(s.mul(p.y)), s.mul(p.x).add(c.mul(p.y)), p.z);
    });

    /**
     * *** THE CLOSED-FORM TUBE: w * sqrt(pi) / sin(alpha) * exp(-perp^2 / w^2). *** The whole-ray integral of
     * a gaussian tube crossed at angle alpha, and the reason arc and sol can draw a LINE where a march cannot
     * draw one thinner than its own step. sinA is floored by the CALLER -- arc at 0.58, sol at 0.55, each for
     * its own stated reason -- so nothing is floored here.
     */
    const mhTube = Fn(([w, sinA, perp2]) =>
        w.mul(MH_SQRTPI).div(sinA).mul(exp(perp2.div(w.mul(w)).negate())));

    /**
     * *** THE LIVE SIGNALS, CONDITIONED ONCE -- the shader half of murmurKit.mjs's mhLive. ***
     *
     * A PLAIN JS CLOSURE AND NOT AN Fn, for the reason this file has hit three times now: Fn() compiles its
     * body into a single callable node and cannot hand back a JS object of several nodes. Builders that
     * return a SET are closures; only builders that return one node are Fn.
     *
     * The state weights are selects on a float index rather than an integer switch because the index arrives
     * as a uniform: LISTENING is index 1, and THINKING and RESPONDING are 2 and 3, so `working` is the open
     * interval (1.5, 3.5) and covers both. The half-unit windows are how murmur's own TS compares them and
     * they are what makes an index of exactly 1.0 or 3.0 land unambiguously inside one.
     *
     * pow(0, 0.65) is 0 here and not a NaN: WGSL evaluates it as exp2(0.65 * log2(0)) = exp2(-inf) = 0, so a
     * silent level gives a silent voice and no epsilon is needed to protect it. The CPU twin returns exactly
     * 0 at the same input and murmurKit-selfcheck.mjs grades the pair at level 0 for that reason.
     */
    const mhLive = (level, activity, stateIndex) => {
        const L = clamp(level, 0.0, 1.0).toVar();
        const A = clamp(activity, 0.0, 1.0).toVar();
        const idx = float(stateIndex).toVar();
        const listening = select(idx.greaterThan(0.5).and(idx.lessThan(1.5)), float(1.0), float(0.0));
        const working = select(idx.greaterThan(1.5).and(idx.lessThan(3.5)), float(1.0), float(0.0));
        return {
            voice: pow(L, float(0.65)).mul(float(0.55).add(listening.mul(1.00 - 0.55))),
            pace: pow(A, float(0.85)).mul(float(0.60).add(working.mul(1.00 - 0.60))),
        };
    };

    /**
     * *** THE STATE READ -- the shader half of murmurKit.mjs's mhState. *** Four scalars, so a closure.
     *
     * SUCCESS (index 4) gives `complete`, `sweep` and `settled`; RESPONDING (index 3) gives `drive`; every
     * other state gives four zeros, which is why the multiply-by-(1 + complete) form murmur uses everywhere
     * is a no-op outside the flash instead of a thing each species has to guard.
     *
     * TSL's smoothstep IS the CPU twin's `ss` -- it clamps to 0..1 and returns u*u*(3-2u) -- so the pair here
     * is the same curve written twice and not two curves that happen to be close. The one place to be careful
     * is that `a` and `sweep` divide tau by DIFFERENT windows, 1.20 and 0.95: the ignition's travel finishes
     * a quarter-second before its breath does, which is what stops the flash reading as a wipe.
     */
    const mhState = (stateIndex, stateTau) => {
        const idx = float(stateIndex).toVar();
        const tau = max(float(stateTau), 0.0).toVar();
        const success = select(idx.greaterThan(3.5).and(idx.lessThan(4.5)), float(1.0), float(0.0)).toVar();
        const responding = select(idx.greaterThan(2.5).and(idx.lessThan(3.5)), float(1.0), float(0.0)).toVar();
        const a = clamp(tau.div(1.20), 0.0, 1.0).toVar();
        const sw = clamp(tau.div(0.95), 0.0, 1.0).toVar();
        return {
            complete: smoothstep(float(0.0), float(0.30), a)
                .mul(float(1.0).sub(smoothstep(float(0.36), float(1.0), a))).mul(success),
            settled: smoothstep(float(0.30), float(1.05), a).mul(success),
            sweep: smoothstep(float(0.0), float(1.0), sw).mul(success),
            drive: smoothstep(float(0.0), float(0.55), tau).mul(responding),
        };
    };

    /**
     * *** THE IGNITION SHELL -- the shader half of murmurKit.mjs's mhIgnite. *** A gaussian ring at
     * mix(lo, hi, sweep), which is how seven of the eighteen species run a SUCCESS along the marched ray.
     * The species' own gain is NOT folded in; see the CPU twin's note for why nebula and tempest make that
     * the load-bearing distinction.
     */
    const mhIgnite = Fn(([pLen, complete, sweep, lo, hi, width]) => {
        const sr = pLen.sub(mix(lo, hi, sweep)).div(width).toVar();
        return complete.mul(exp(sr.mul(sr).negate()));
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

    // ---- the colour rail: mh_palette / mh_shade / mh_tier / mh_lit ----------------------------------------
    // *** THE LAST STRUCTURAL PIECE OF THE KIT, AND THE ONE EVERY SPECIES WAS WEARING AN APPROXIMATION OF. ***
    // render/aiPresenceOrbTsl.mjs carried an OKLab ramp from a BASE_L / BASE_C / BASE_H this port chose, plus
    // a rim and two speculars ADDED AS WHITE on top -- which is the one thing murmur's own present pass calls
    // out as forbidden ("precisely the white overlay the family law forbids"). The rail below routes surface
    // and interior through the SAME energy-to-colour curve, which kit.ts says is "most of what keeps the
    // family reading as one family".

    const oklabToLinearT = Fn(([L, aa, bb]) => {
        const l_ = L.add(aa.mul(0.3963377773761749)).add(bb.mul(0.2158037573099136));
        const m_ = L.sub(aa.mul(0.1055613458156586)).sub(bb.mul(0.0638541728258133));
        const s_ = L.sub(aa.mul(0.0894841775298119)).sub(bb.mul(1.2914855480194092));
        const l = l_.mul(l_).mul(l_), m = m_.mul(m_).mul(m_), s = s_.mul(s_).mul(s_);
        return vec3(
            l.mul(4.0767416621).sub(m.mul(3.3077115913)).add(s.mul(0.2309699292)),
            l.mul(-1.2684380046).add(m.mul(2.6097574011)).sub(s.mul(0.3413193965)),
            l.mul(-0.0041960863).sub(m.mul(0.7034186147)).add(s.mul(1.7076147010)));
    });
    const srgbToLinearT = Fn(([c]) => select(c.lessThanEqual(0.04045), c.div(12.92), pow(max(c.add(0.055).div(1.055), float(1e-6)), float(2.4))));
    const linearToOklabT = Fn(([rgb]) => {
        const l = rgb.x.mul(0.4122214708).add(rgb.y.mul(0.5363325363)).add(rgb.z.mul(0.0514459929));
        const m = rgb.x.mul(0.2119034982).add(rgb.y.mul(0.6806995451)).add(rgb.z.mul(0.1073969566));
        const s = rgb.x.mul(0.0883024619).add(rgb.y.mul(0.2817188376)).add(rgb.z.mul(0.6299787005));
        const l_ = TSL.sign(l).mul(pow(abs(l), float(1 / 3))), m_ = TSL.sign(m).mul(pow(abs(m), float(1 / 3))), s_ = TSL.sign(s).mul(pow(abs(s), float(1 / 3)));
        return vec3(
            l_.mul(0.2104542683093140).add(m_.mul(0.7936177747023054)).sub(s_.mul(0.0040720430116193)),
            l_.mul(1.9779985324311684).sub(m_.mul(2.4285922420485799)).add(s_.mul(0.4505937096174110)),
            l_.mul(0.0259040424655478).add(m_.mul(0.7827717124575296)).sub(s_.mul(0.8086757549230774)));
    });
    const labOfSrgb = Fn(([rgb]) => linearToOklabT(vec3(srgbToLinearT(rgb.x), srgbToLinearT(rgb.y), srgbToLinearT(rgb.z))));
    const mhLchT = Fn(([L, C, h]) => vec3(L, C.mul(cos(h)), C.mul(sin(h))));

    /** HOW LIGHT THE GROUND IS, in OKLab lightness and not an RGB average. 0 for the house ink, 1 for paper. */
    const mhPaper = Fn(([inkRgb]) => smoothstep(float(0.50), float(0.72), labOfSrgb(inkRgb).x));

    /**
     * *** THE RAIL IS BUILT BY PLAIN JS CLOSURES, NOT BY Fn, AND THE REASON IS STRUCTURAL. ***
     * mh_palette hands back NINE values -- four OKLab stops and five scalars -- and mh_shade and mh_lit take
     * that whole set as one argument. An Fn's parameter list carries NODES, not a JS object of them, so
     * expressing this as shader functions would mean either nine separate parameters threaded through every
     * call site or packing scalars into spare vector channels. A JS closure inlines exactly the same nodes
     * into the caller's graph and keeps the set together, which is what the CPU twin in murmurKit.mjs does
     * too. The kit's other builders take and return single nodes and stay Fn.
     *
     * *** AN EARLIER VERSION OF THIS COMMENT BLAMED THE Fn BOUNDARY FOR A BLACK RENDER. THAT WAS WRONG. ***
     * The rail did render black at every input, and the bisect that chased it eliminated the palette, the
     * OKLab decode, the stop walk, an out-parameter theory and finally an Fn-arity theory -- each of which
     * measured CORRECT -- before writing the arity theory down as the cause anyway, on the strength of "the
     * same walk works inline". It did not survive the rewrite: the closures rendered black too. The actual
     * cause was one line: mh_shade used MH_SPREAD and this module never imported it, so the identifier threw
     * inside the builder. three.js CATCHES that, console.errors it, and substitutes a node generating zero --
     * see the note in tools/ship/webgpuHarness.mjs, which used to return those black pixels as ok:true and now
     * fails the render and names the file and line. The lesson is not about Fn: it is that four correct
     * components do not add up to a working shader, and "did it compile" is a question worth asking FIRST.
     *
     * Returns a plain object of nodes. No out-parameters, no packing into spare channels.
     */
    const mhPalette = (inkRgb, toneRgb, tone2Rgb, hueShift, depth) => {
        const ink = labOfSrgb(inkRgb).toVar(), tone = labOfSrgb(toneRgb).toVar(), tone2 = labOfSrgb(tone2Rgb).toVar();
        const L = tone.x.toVar();
        const C = length(vec2(tone.y, tone.z)).toVar();
        const h = TSL.atan(tone.z, tone.y).add(hueShift).toVar();
        const d = clamp(depth, 0.30, 2.00).toVar();
        const paper = mhPaper(inkRgb).toVar();
        const C2 = length(vec2(tone2.y, tone2.z)).toVar();
        const h2 = TSL.atan(tone2.z, tone2.y).add(hueShift).toVar();
        const dhRaw = h2.sub(TSL.atan(tone.z, tone.y).add(hueShift)).toVar();
        // the SHORT way round: without the wrap two anchors either side of the origin walk through green.
        const dHue = dhRaw.sub(float(6.2831853).mul(TSL.floor(dhRaw.div(6.2831853).add(0.5)))).toVar();
        const dC = C2.div(max(C, float(1e-4))).toVar();
        const dL = tone2.x.div(max(L, float(1e-4))).toVar();
        // EXACTLY ZERO when the anchors are equal -- kit.ts: "the property the whole upgrade rests on".
        const duo = smoothstep(float(0.004), float(0.035), length(tone2.sub(tone))).toVar();

        // THE INK RAIL climbs (energy becomes light); THE PAPER RAIL descends and DEEPENS, because on a light
        // ground energy cannot become light -- it becomes chroma and shadow, which is what a tinted
        // transparent object does to the light behind it. Mixed at the STOPS, which kit.ts calls exact.
        const d0 = ink, d1 = mhLchT(mix(ink.x, L, float(0.30).div(d)), C.mul(float(0.52).add(d.mul(0.10))), h.sub(0.35));
        const d2 = mhLchT(L, C, h), d3 = mhLchT(min(L.mul(float(1.20).add(d.mul(0.12))), float(0.93)), C.mul(0.55), h.add(0.10));
        const l0 = ink, l1 = mhLchT(mix(ink.x, L, float(0.42).div(d)), C.mul(float(0.34).add(d.mul(0.10))), h.add(0.05));
        const l2 = mhLchT(L.mul(float(0.82).sub(d.mul(0.06))), C.mul(float(1.20).add(d.mul(0.14))), h);
        const l3 = mhLchT(max(L.mul(float(0.52).sub(d.mul(0.05))), float(0.18)), C.mul(float(1.05).add(d.mul(0.10))), h.sub(0.08));
        return {
            s0: mix(d0, l0, paper).toVar(), s1: mix(d1, l1, paper).toVar(),
            s2: mix(d2, l2, paper).toVar(), s3: mix(d3, l3, paper).toVar(),
            paper, duo, dHue, dC, dL,
        };
    };

    /** WALK THE FAMILY. Three eased segments so the joins are C1 -- no kink shows as a contour line. */
    const mhShade = (p, tIn, hue) => {
        const t = clamp(tIn, 0.0, 1.0).toVar();
        const lab = mix(p.s2, p.s3, smoothstep(float(0.0), float(1.0), t.sub(0.78).div(0.22))).toVar();
        lab.assign(select(t.lessThan(0.78), mix(p.s1, p.s2, smoothstep(float(0.0), float(1.0), t.sub(0.40).div(0.38))), lab));
        lab.assign(select(t.lessThan(0.40), mix(p.s0, p.s1, smoothstep(float(0.0), float(1.0), t.mul(2.5))), lab));
        // Decomposed into pos and neg rather than clamped to the cap, because opal deliberately runs its
        // spread a third past MH_SPREAD. The rotation moves hue while holding lightness and chroma EXACTLY --
        // the safe axis; the unsafe one trades chroma for hue, which is how a warm palette turns to mud.
        const a = hue.div(MH_SPREAD).toVar();
        const pos = max(a, float(0.0)).toVar(), neg = max(a.negate(), float(0.0)).toVar();
        const rot = neg.negate().mul(MH_SPREAD).add(pos.mul(mix(float(MH_SPREAD), p.dHue, p.duo))).toVar();
        const w = min(pos, float(1.0)).mul(p.duo).toVar();
        const cS = float(1.0).add(w.mul(p.dC.sub(1.0))).toVar();
        const lS = float(1.0).add(w.mul(p.dL.sub(1.0))).toVar();
        const ch = cos(rot).toVar(), sh = sin(rot).toVar();
        return oklabToLinearT(lab.x.mul(lS),
            lab.y.mul(ch).sub(lab.z.mul(sh)).mul(cS),
            lab.y.mul(sh).add(lab.z.mul(ch)).mul(cS));
    };

    /** Identity below the knee, an asymptotic compression above -- so a specular keeps its SHAPE, not a plateau. */
    const mhKnee = (x, knee) => select(x.lessThan(knee), x,
        knee.add(float(1.0).sub(knee).mul(float(1.0).sub(exp(x.sub(knee).div(max(float(1.0).sub(knee), float(1e-3))).negate())))));

    /**
     * *** mh_present's TAIL -- the shader half of murmurKit.mjs's mhPresentFinish. *** The full reasoning,
     * murmur's three terms and their numbers, and how the sign of uvY was MEASURED rather than copied, are
     * all in the CPU twin's doc comment; this is the same arithmetic on a node graph.
     *
     * NO BRANCH ON paper, matching the twin: murmur's `if (paper > 0.002)` is an early-out, both weights
     * carry `paper` as a factor, and dropping it on both sides is what makes the pair agree exactly.
     *
     * RETURNS UN-CLAMPED LINEAR LIGHT, also matching mh_present, which hands its result to mh_out and lets
     * THAT clamp after the encode. The shadow weight reaches 1.11 and the mix is allowed to overshoot.
     */
    const mhPresentFinish = (rgb, spec, contact, uvY, pal, inkLinear) =>
        mhPresentKnee(mhPresentPaper(rgb, spec, contact, uvY, pal, inkLinear), pal.paper);

    /** mh_present's tone knee, which MOVES with the ground: 0.90 on ink, 0.96 on paper. Per channel. */
    const mhPresentKnee = (rgb, paper) => {
        const knee = mix(float(0.90), float(0.96), paper).toVar();
        return vec3(mhKnee(rgb.x, knee), mhKnee(rgb.y, knee), mhKnee(rgb.z, knee));
    };

    /**
     * The two GROUND-DEPENDENT terms alone -- the catchlight and the contact shadow -- split from the knee
     * because in this tree the two belong to different stages. render/aiPresenceOrbPresent.mjs already
     * applies knee(x, 0.90) on the HDR path, quoting present.wgsl's own "the tone curve ... is written ONCE";
     * the catchlight and shadow read `paper`, which nothing downstream of the species shader knows about.
     * The CPU twin's doc comment carries the full reasoning and the gap this leaves.
     */
    const mhPresentPaper = (rgb, spec, contact, uvY, pal, inkLinear) => {
        const paper = pal.paper;
        const litLab = mhLchT(min(pal.s0.x.mul(1.06).add(0.05), float(1.02)), float(0.012), float(0.9)).toVar();
        const lit = oklabToLinearT(litLab.x, litLab.y, litLab.z).toVar();
        const kCatch = smoothstep(float(0.34), float(0.92), spec).mul(paper).toVar();
        const afterLit = mix(rgb, lit, kCatch).toVar();
        const below = smoothstep(float(-0.10), float(0.66), uvY.div(MH_R)).toVar();
        const kShade = clamp(contact.mul(2.60), 0.0, 1.0).mul(float(0.06).add(below.mul(1.05))).mul(paper).toVar();
        return mix(afterLit, inkLinear.mul(0.55), kShade);
    };

    /** THE VALUE HIERARCHY AS ONE CURVE: the bottom 78% of energy into the rail's first 72%, the rest on the peak. */
    const mhTier = (e) => {
        const x = clamp(e, 0.0, 1.0).toVar();
        const body = x.div(0.78).mul(0.72);
        const peak = float(0.72).add(x.sub(0.78).div(1.0 - 0.78).mul(0.28));
        return mix(body, peak, smoothstep(float(0.78 - 0.10), float(0.78 + 0.10), x));
    };

    /** THE ONE PLACE ENERGY BECOMES LIGHT. At glow = 0 a third of the energy survives, on purpose. */
    const mhLit = (p, e, glow, base, span, emis, hue) => {
        const G = max(glow, float(0.0)).toVar();
        const en = clamp(mhKnee(max(e, float(0.0)).mul(float(0.35).add(G.mul(0.65))), float(0.92)), 0.0, 1.0).toVar();
        const tRail = clamp(base.add(span.mul(mhTier(en))), 0.0, 1.0).toVar();
        const col = mhShade(p, tRail, hue).toVar();
        // Emission is gated to the SPECULAR and switched off as the ground goes light, because on paper the
        // top of the rail is the DEEPEST colour rather than the brightest.
        return col.mul(float(1.0).add(emis.mul(G).mul(float(1.0).sub(p.paper)).mul(smoothstep(float(0.72), float(1.0), tRail))));
    };

    // ---- the deformed body: mh_shape / mh_deform / mh_body ------------------------------------------------
    // The half of the kit the first three species did not need. still, limn and comet are all solved against
    // an UNDEFORMED sphere; droplet is the one where "the body itself is the species".

    /** THE DEFORMATION AND ITS EXACT GRADIENT. Returns vec4(d, g.x, g.y, g.z) -- one call, both answers. */
    const mhDeform = Fn(([n, t, amp, hi, flowDir, flowAmp, flowPhase]) => {
        const a1 = t.mul(0.083).toVar();
        const a2 = t.mul(0.061).add(2.10).toVar();
        const a3 = t.mul(0.047).add(4.37).toVar();
        const ax1 = normalize(vec3(cos(a1), float(0.62), sin(a1))).toVar();
        const ax2 = normalize(vec3(float(0.55), cos(a2), sin(a2))).toVar();
        const ax3 = normalize(vec3(sin(a3), float(-0.44), cos(a3))).toVar();
        const NORM = 1 / (0.55 + 0.30 + 0.18);
        const u1 = dot(n, ax1).toVar(), u2 = dot(n, ax2).toVar(), u3 = dot(n, ax3).toVar();
        const d = sin(u1.mul(1.70)).mul(0.55)
            .add(sin(u2.mul(2.60).add(1.9)).mul(0.30))
            .add(sin(u3.mul(3.40).add(4.1)).mul(0.18)).mul(NORM).toVar();
        // d/dn of sin(k * dot(n, a)) is k*cos(...)*a -- the normal is analytic, not finite-differenced, which
        // is what lets the specular and the rim ride the wobble without stair-stepping.
        const g = ax1.mul(cos(u1.mul(1.70)).mul(0.55 * 1.70 * NORM))
            .add(ax2.mul(cos(u2.mul(2.60).add(1.9)).mul(0.30 * 2.60 * NORM)))
            .add(ax3.mul(cos(u3.mul(3.40).add(4.1)).mul(0.18 * 3.40 * NORM))).toVar();
        // The tremor -- a fourth mode at wavenumber 6.9, its axis turning eight times faster than the body's.
        const a4 = t.mul(0.63).toVar();
        const ax4 = normalize(vec3(cos(a4).mul(0.8), sin(a4.mul(0.77)), sin(a4))).toVar();
        const u4 = dot(n, ax4).toVar();
        d.addAssign(hi.mul(sin(u4.mul(6.90))));
        g.addAssign(ax4.mul(hi.mul(6.90).mul(cos(u4.mul(6.90)))));
        // The travelling wave: how RESPONDING gets a heading into the silhouette.
        const uf = dot(n, flowDir).toVar();
        d.addAssign(flowAmp.mul(sin(uf.mul(3.20).add(flowPhase))));
        g.addAssign(flowDir.mul(flowAmp.mul(3.20).mul(cos(uf.mul(3.20).add(flowPhase)))));
        return TSL.vec4(d, g);
    });

    /**
     * THE BODY, SOLVED WITHOUT MARCHING IT. Two fixed-point iterations on z = sqrt(Rd(n)^2 - rho^2) -- measured
     * against a run-to-fixpoint solve in the gate at 0.021 pixels of disagreement at the amplitude cap and the
     * limb, which is kit.ts's "well under a pixel" made into a number.
     *
     * Returns vec4(m, Rd, rho, fres) and writes the entry point and normal into the two Var arguments, because
     * a TSL Fn returns one node and this solve produces four things worth having.
     */
    const mhBody = Fn(([uvIn, t, px, ampIn, hi, gain, flowDir, flowAmp, flowPhase, outP, outN]) => {
        const amp = clamp(ampIn, 0.0, MH_AMP_CAP).toVar();       // THE CLIP IS THE LAW
        const s = uvIn.div(MH_R).toVar();
        const rho = length(s).toVar();
        const z0 = sqrt(max(float(1.0).sub(min(rho.mul(rho), float(1.0))), float(0.0))).toVar();
        const n0 = normalize(vec3(s.x, s.y, z0.add(1e-6))).toVar();
        const R0 = float(1.0).add(mhDeform(n0, t, amp, hi, flowDir, flowAmp, flowPhase).x.mul(amp)).toVar();
        const z1 = sqrt(max(R0.mul(R0).sub(rho.mul(rho)), float(0.0))).toVar();
        const n1 = normalize(vec3(s.x, s.y, z1.add(1e-6))).toVar();
        const d1 = mhDeform(n1, t, amp, hi, flowDir, flowAmp, flowPhase).toVar();
        const Rd = float(1.0).add(d1.x.mul(amp)).toVar();
        const z2 = sqrt(max(Rd.mul(Rd).sub(rho.mul(rho)), float(0.0))).toVar();
        outP.assign(vec3(s.x, s.y, z2));
        // For F(p) = |p| - Rd(p/|p|) the gradient is n minus the tangential part of Rd's gradient over Rd.
        const gt0 = vec3(d1.y, d1.z, d1.w).mul(amp).toVar();
        const gt = gt0.sub(n1.mul(dot(gt0, n1))).toVar();
        outN.assign(normalize(n1.sub(gt.mul(gain).div(max(Rd, float(1e-3))))));
        // The silhouette is soft by two numbers ADDED rather than multiplied: 1.8% of organic feather because
        // nothing in this house has a hard edge, plus 1.3 px of antialiasing because at 18 pt the fixed
        // feather is a fifth of a pixel and would alias to a staircase.
        const feather = max(float(0.018), px.mul(1.3)).toVar();
        const m = float(1.0).sub(smoothstep(Rd.sub(feather), Rd.add(feather), rho)).toVar();
        return TSL.vec4(m, Rd, rho, float(1.0).sub(clamp(outN.z, 0.0, 1.0)));
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

    // ---- opal's lives and abyss's clocks -----------------------------------------------------------------
    // *** THESE LIVE IN THE KIT FOR THE REASON limnArc AND cometFall DO: SO THERE IS A PAIR. *** They are
    // species-specific arithmetic, not shared technique -- but the CPU twin in render/murmurKit.mjs is only
    // worth having if something grades the shader against it, and a formula inlined in
    // render/aiPresenceOrbTsl.mjs has nothing to grade. Written here, the kit gate's probe renders them and
    // compares. v4632's sabotage sweep is what settled it: with opal's life inline in the species file,
    // removing its floor, flattening its four periods into one and swapping sin squared for a bare sine ALL
    // passed every row in the tree.

    /** ONE OF opal's FOUR LIVES. sin SQUARED for flat ends, on a floor of 0.16 -- nothing ever switches on. */
    const mhOpalLife = Fn(([k, t]) => {
        const per = float(14.3).add(k.mul(2.7));
        const sn = sin(t.mul(6.2831853).div(per).add(k.mul(1.97))).toVar();
        return float(0.16).add(sn.mul(sn).mul(0.84));
    });

    /** abyss's SLOT LENGTH in seconds. High rarity is rarer; voice and the small mounts both shorten it. */
    const mhAbyssSlot = Fn(([rarity, voice, small]) =>
        mix(float(9.0), float(26.0), clamp(rarity, 0.0, 1.0))
            .div(float(1.0).add(voice.mul(0.55)))
            .mul(mix(float(1.0), float(0.66), small)));

    // ---- the surface: mh_key / mh_small / mh_surface -----------------------------------------------------
    // *** ALL EIGHTEEN SPECIES CALL mh_surface AND THIS PORT APPROXIMATED IT UNTIL v4629. *** What stood in
    // render/aiPresenceOrbTsl.mjs was a fresnel rim at a fixed exponent of 4.5, two lobes off a FIXED light
    // direction this port chose, a per-species rim constant that matched murmur's roster on two species out of
    // four, and NO CONTACT GLOW AT ALL. See render/murmurKit.mjs for what each term is and why.

    /**
     * THE CONTAINMENT: a safety net for the CONTACT GLOW, not the design of the edge. At reach 0.72 the fall
     * runs from a uv radius of 0.36 to 0.49 while the body's worst case is 0.339, so it sits clear outside
     * every hero's silhouette -- which is the whole point, since the glow is nonzero only out there.
     */
    const mhContainment = Fn(([uvLen, reach]) =>
        float(1.0).sub(smoothstep(reach, reach.add(0.26), uvLen.mul(2.0))));

    /** THE KEY LIGHT, AND IT MOVES. Up and to the LEFT -- screen y runs down, so both leads are negative. */
    const mhKey = Fn(([t]) => {
        const dr = t.mul(0.21).toVar();
        return normalize(vec3(sin(dr).mul(0.055).sub(0.52),
                              cos(dr.mul(0.83)).mul(0.045).sub(0.60),
                              float(0.61)));
    });

    /** THE SIZE DIAL: 1 at 18 pt, 0 at 120 pt and above. Its real midpoint is 52 pt, not the 46 kit.ts says. */
    const mhSmall = Fn(([w, h]) => float(1.0).sub(smoothstep(float(16.0), float(88.0), max(min(w, h), float(1.0)))));

    /**
     * THE SURFACE EVERY HERO SHARES. A JS closure, not an Fn, for the reason the colour rail is one: it takes
     * a BODY (six nodes) and hands back THREE, and an Fn's parameter list carries single nodes, not sets.
     *
     * b: { m, P, N, Rd, rho, fres } as returned alongside mhBody. tilt: a vec2 in [-1,1]^2.
     * Returns { rim, spec, glow } in the energy units mh_lit consumes.
     */
    const mhSurface = (b, t, small, inkRgb, tilt, rimKIn, specK, glowK) => {
        const paper = mhPaper(inkRgb).toVar();
        // The edge does more work on paper than on ink -- it is the whole silhouette of an object otherwise
        // nearly the colour of the page. A third more of it, and no other term changes.
        const rimK = rimKIn.mul(mix(float(1.0), float(1.32), paper)).toVar();

        // THE BARELY COUNTER-MOVE: the catchlight shifts AGAINST the tilt, because the world stays put while
        // the object turns. A fifth of what the interior does, and meant to be subliminal.
        const H = normalize(mhKey(t).sub(vec3(tilt.x, tilt.y, float(0.0)).mul(MH_TILT * 0.20))
                            .add(vec3(0.0, 0.0, 1.0))).toVar();
        const nh = clamp(dot(b.N, H), 0.0, 1.0).toVar();
        // Screen y runs down, so a normal pointing UP has negative y: this is the sky half of the sphere.
        const sky = float(0.5).sub(clamp(b.N.y, -1.0, 1.0).mul(0.5)).toVar();
        // SIZE-ADAPTIVE TIGHT LOBE: 96 at 120 pt, 16 at 18 pt, where a 96 highlight would be a third of a
        // pixel and would flicker in and out as the body moved under it.
        const tight = mix(float(96.0), float(16.0), small).toVar();
        const spec = pow(nh, tight).add(pow(nh, float(4.0)).mul(0.09))
            .mul(b.m).mul(specK).mul(mix(float(0.92), float(1.08), sky)).toVar();

        // THE RIM IS NOT A RING: 55% everywhere plus 45% on the side AWAY from the key. That asymmetry
        // FLATTENS on paper, where the rim stops being lighting and becomes the refracted edge of a clear
        // sphere, which goes all the way round.
        const nxy = normalize(vec2(b.N.x.add(1e-4), b.N.y.add(1e-4))).toVar();
        const wrap0 = float(0.55).add(clamp(dot(nxy, normalize(vec2(0.42, 0.50))), 0.0, 1.0).mul(0.45)).toVar();
        const wrap = mix(wrap0, float(0.88), paper).toVar();
        // THE ENVIRONMENT, and the rule is that if you can see it, it is wrong: 14% on the rim, read off the
        // normal. A VALUE gradient and not a colour one -- a second hue through a term nobody dialled would
        // break the one-hue-family law from underneath -- and it INVERTS on paper.
        const envRim = mix(mix(float(0.86), float(1.14), sky), mix(float(1.14), float(0.86), sky), paper).toVar();
        const rim = pow(b.fres, mix(float(3.9), float(5.4), paper)).mul(b.m).mul(wrap).mul(rimK).mul(envRim).toVar();

        // OUTSIDE ONLY: (1 - m) is zero under the silhouette and rises through it. It pools DOWNWARD, because
        // its job is to stop the silhouette meeting the ink as a cut line, not to be a halo anybody notices.
        const outr = b.rho.sub(b.Rd).div(0.13).toVar();
        const pool = float(0.55).add(smoothstep(float(-0.25), float(0.85), b.P.y).mul(0.55)).toVar();
        const glow = exp(outr.mul(outr).negate()).mul(float(1.0).sub(b.m)).mul(pool).mul(glowK).toVar();

        return { rim, spec, glow };
    };

    return {
        // *** MH_SPREAD IS IN THIS LIST BECAUSE IT HAS NOW GONE MISSING TWICE, THE SAME CONSTANT BOTH TIMES. ***
        // v4627: mh_shade used it and this module never imported it, so the whole colour rail rendered black
        // and the bisect cost most of a round. v4630: it WAS imported here but not handed back, so a species
        // reading KIT.MH_SPREAD got undefined, multiplied a node by it, and three.js emitted WGSL containing
        // the literal token `null` -- which the GPU rejected at pipeline creation rather than silently. Both
        // times the value is one number that half the family's colour depends on and nothing owned it.
        MH_R, MH_ETA, MH_EXT, MH_TILT, MH_SCATTER_K, MH_SPREAD, MH_EXIT_CAP,
        mhHash, mhGrad3, mhNoise3, mhHash1, mhFlourish, mhBreath, mhDrift, mhSpin, mhRoll, mhTube, MH_SQRTPI, mhLive, mhState, mhIgnite,
        mhRefract, mhLook, mhExit, mhHaze, mhMedium, mhInside, mhTransmit, mhScatter,
        mhDeform, mhBody, MH_AMP_CAP,
        mhKey, mhSmall, mhSurface, mhContainment, mhOpalLife, mhAbyssSlot,
        mhPaper, mhPalette, mhShade, mhKnee, mhTier, mhPresentFinish, mhPresentPaper, mhPresentKnee, mhLit, mhLchT, labOfSrgb, srgbToLinearT, linearToOklabT, oklabToLinearT,
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
 *       "live"  -> mh_live's voice in R and pace in G, over signal (x) by state (y).
 *       "state" -> mh_state's complete/sweep/settled/drive in RGBA, over tau (x) by state (y).
 *       "ignite" -> the SUCCESS shell for three species in RGB, over |p| (x) by sweep (y).
 *       "finishPaper" / "finishInk" / "finishGrey" -> mh_present's tail over specular (x) by height (y);
 *                the grey case carries a light ground and a mid-grey page, which is where two of its
 *                constants are observable at all.
 */
export function makeMurmurKitProbeTsl(THREE, TSL, { mode = "hash", n = 16 } = {}) {
    const K = makeMurmurKitTsl(TSL);
    const { Fn, float, vec2, vec3, vec4, uint, int, uv, floor, clamp, select, pow, max } = TSL;

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
        if (mode === "rail" || mode === "railLight") {
            // *** THE RAIL, PIXEL BY PIXEL, AGAINST THE CPU REFERENCE. *** x carries the energy 0..2 and y the
            // glow 0..1, so one frame samples the surface of mh_lit rather than a point on it.
            //
            // *** TWO TONES, AND THE SECOND ONE IS NOT A SECOND SAMPLE OF THE SAME THING. *** The house tone
            // #6C63E8 has an OKLab L of 0.5800, so the ink rail's top stop lands at 0.7656 and the 0.93
            // ceiling on it is never reached at any depth in range -- measured, and with only that tone here
            // the ceiling could be deleted from the shader without moving a single pixel of this frame. The
            // light tone #C8C4FF would put that stop at 1.1136, off the end of the lightness axis, so it is
            // the input on which the cap is load-bearing.
            const TONE = mode === "railLight"
                ? vec3(0xC8 / 255, 0xC4 / 255, 0xFF / 255)
                : vec3(0x6C / 255, 0x63 / 255, 0xE8 / 255);
            const pal = K.mhPalette(vec3(0x0A / 255, 0x0A / 255, 0x0B / 255), TONE, TONE, float(0.0), float(1.0));
            const lit = K.mhLit(pal, px.div(n).mul(2.0), py.div(n), float(0.0), float(1.0), float(0.34), float(0.0)).toVar();
            const enc = (v) => select(v.lessThanEqual(0.0031308), v.mul(12.92), pow(max(v, float(1e-6)), float(1 / 2.4)).mul(1.055).sub(0.055));
            return vec4(clamp(enc(lit.x), 0.0, 1.0), clamp(enc(lit.y), 0.0, 1.0), clamp(enc(lit.z), 0.0, 1.0), 1.0);
        }
        if (mode === "opalAbyss") {
            // x carries opal's life for flash floor(px/4) over a 24 s span; y carries abyss's slot length over
            // the rarity range at three voices. One frame, both species' clocks, graded against the f64 twin.
            const k = TSL.floor(px.div(n).mul(4.0)).toVar();
            const tt = py.div(n).mul(24.0).toVar();
            const life = K.mhOpalLife(k, tt).toVar();
            const slot = K.mhAbyssSlot(px.div(n), TSL.floor(py.div(n).mul(3.0)).mul(0.5), float(0.0)).toVar();
            return vec4(clamp(life, 0.0, 1.0), clamp(slot.div(32.0), 0.0, 1.0), 0.0, 1.0);
        }
        if (mode === "surface") {
            // *** mh_surface OVER A WHOLE SPHERE, AGAINST THE CPU REFERENCE. *** The frame spans -1.2..1.2 in
            // body units so the OUTSIDE of the silhouette is in shot: the contact glow lives entirely out
            // there and a probe cropped to the body would grade it at zero everywhere and call that agreement.
            //
            // The body is built here the same way the species' analytic-sphere path builds it, and the gate's
            // CPU side builds it identically -- so what this pair grades is mh_surface, not two different
            // opinions about what a sphere is.
            const bx = px.div(n).mul(2.4).sub(1.2).toVar();
            const by = py.div(n).mul(2.4).sub(1.2).toVar();
            const rho = TSL.length(vec2(bx, by)).toVar();
            const bz = TSL.sqrt(max(float(1.0).sub(rho.mul(rho)), float(0.0))).toVar();
            const Nb = vec3(bx, by, bz).toVar();
            const f = float(0.018);
            const bm = float(1.0).sub(TSL.smoothstep(float(1.0).sub(f), float(1.0).add(f), rho)).toVar();
            const bodyS = { m: bm, P: Nb, N: Nb, Rd: float(1.0), rho, fres: float(1.0).sub(clamp(Nb.z, 0.0, 1.0)) };
            // Knobs picked so all three channels are exercised at once and none saturates: still's own rim and
            // specular, and a glow raised to 0.40 so the outside band is well clear of 8-bit quantisation.
            const sf = K.mhSurface(bodyS, float(3.7), float(0.0), vec3(0x0A / 255, 0x0A / 255, 0x0B / 255),
                                   vec2(0.35, -0.20), float(1.15), float(1.30), float(0.40));
            // Each channel carries its own scale so none of the three clips: rim and spec reach about 1.3,
            // the glow about 0.4. The gate divides by the same numbers.
            return vec4(clamp(sf.rim.div(2.0), 0.0, 1.0), clamp(sf.spec.div(2.0), 0.0, 1.0),
                        clamp(sf.glow.div(0.5), 0.0, 1.0), 1.0);
        }
        if (mode === "finishPaper" || mode === "finishInk" || mode === "finishGrey") {
            // *** mh_present's TAIL OVER ITS WHOLE INPUT SQUARE, ON BOTH GROUNDS. *** x carries the SPECULAR
            // 0..1.2 (past the catchlight's 0.92 upper edge, so the saturated end is in shot) and y carries
            // the vertical position -1.2..1.2 in body units, which is what the shadow's `below` reads -- so
            // one frame samples the catchlight along one axis and the shadow's pooling along the other.
            //
            // THE CONTACT IS HELD AT 0.5 RATHER THAN SWEPT, because clamp(contact * 2.60, 0, 1) saturates at
            // 0.385 and a third axis would spend half the frame on a constant. The clamp itself is graded by
            // the CPU rows instead. The incoming rgb is a mid grey, which is the one value that can move UP
            // toward the catchlight and DOWN toward the shadow and show both.
            //
            // BOTH GROUNDS, because every term here except the knee is multiplied by `paper`: on ink this
            // function is the knee and nothing else, and a probe that only ran on paper could not tell a
            // correct ink path from one that had quietly applied the paper terms at half strength.
            // *** AND A THIRD GROUND, BECAUSE TWO OF mh_present's CONSTANTS ARE INVISIBLE ON THE OTHER TWO. ***
            // Found by sabotage, measured rather than assumed. (1) The catchlight's 1.06 gain is DEAD on the
            // house paper: s0.L is 0.9701, so 0.9701 * 1.06 + 0.05 = 1.0782 and the 1.02 cap takes it -- the
            // gain could be 1.12 or 1.5 and the frame would not move. On a LIGHT GREY ground s0.L is 0.8054,
            // the sum is 0.9038, and the gain is live. (2) The shadow's 0.55 tint multiplies the INK colour,
            // and the house ink is 0.00304 in linear light: 0.55 of it is 0.00167 against 0.75's 0.00228, a
            // difference of 0.00061 where one 8-bit step is 0.00392. It cannot be seen on a near-black page
            // by construction. This case gives it a MID-GREY ink so it can be.
            const paperGround = mode === "finishPaper";
            const greyCase = mode === "finishGrey";
            const ink = greyCase ? vec3(0.45, 0.45, 0.45) : vec3(0x0A / 255, 0x0A / 255, 0x0B / 255);
            const ground = greyCase ? vec3(0.75, 0.75, 0.75) : (paperGround ? vec3(0.97, 0.96, 0.94) : vec3(0x0A / 255, 0x0A / 255, 0x0B / 255));
            const TONE = vec3(0x6C / 255, 0x63 / 255, 0xE8 / 255);
            const pal = K.mhPalette(ground, TONE, TONE, float(0.0), float(1.0));
            const spec = px.div(n).mul(1.2).toVar();
            const uvY = py.div(n).mul(2.4).sub(1.2).mul(K.MH_R).toVar();
            const inkLin = vec3(K.srgbToLinearT(ink.x), K.srgbToLinearT(ink.y), K.srgbToLinearT(ink.z));  // the page, not the ground
            const outRgb = K.mhPresentFinish(vec3(0.5, 0.5, 0.5), spec, float(0.5), uvY, pal, inkLin).toVar();
            // Scaled by a half so the catchlight's warm white (near 1.0 linear) and any overshoot below zero
            // both sit inside the 0..1 an 8-bit channel can carry. The gate divides by the same number.
            return vec4(clamp(outRgb.mul(0.5), 0.0, 1.0), 1.0);
        }
        if (mode === "ignite") {
            // *** THE SHELL OVER THE WHOLE RAY BY THE WHOLE SWEEP. *** x carries |p| over 0..1.2 -- past the
            // surface, so the ring's far end is in shot rather than cropped at the body -- and y carries the
            // sweep 0..1, so one frame is the ring's entire journey from the heart to the surface.
            //
            // *** AND THE ALPHA CHANNEL READS THE SAME LATTICE A SECOND WAY, FOR `complete`. *** The first cut
            // held complete at 1 in all three channels and reasoned that a pure multiplier did not need an
            // axis of its own. A sabotage then deleted the multiplier from this function and walked through
            // every row in the gate: the frame is IDENTICAL when complete is 1. So alpha re-reads x as |p|
            // and y as COMPLETE, with the sweep PINNED at 0.5 -- pinned, and not read off the same y,
            // because a port that spent `sweep` where `complete` belongs would pass a probe that confounded
            // the two. complete reaches 0 EXACTLY at row 0, which is the state four of murmur's five are in.
            //
            // THREE SPECIES IN THREE CHANNELS, and they are the three that bracket the table: still has the
            // shortest travel (hi 0.95) and the widest ring (0.26), duet the narrowest (0.22), and tempest
            // the longest (hi 1.05) with the highest gain. A probe carrying one species could not tell a
            // correct table from a constant.
            const pLen = px.div(n).mul(1.2).toVar();
            const sweep = py.div(n).toVar();
            const one = float(1.0);
            const r = K.mhIgnite(pLen, one, sweep, float(0.02), float(0.95), float(0.26));   // still
            const g = K.mhIgnite(pLen, one, sweep, float(0.02), float(1.00), float(0.22));   // duet
            const b = K.mhIgnite(pLen, one, sweep, float(0.02), float(1.05), float(0.24));   // tempest
            const a = K.mhIgnite(pLen, py.div(n), float(0.5), float(0.02), float(0.95), float(0.26));  // still, complete on y
            return vec4(clamp(r, 0.0, 1.0), clamp(g, 0.0, 1.0), clamp(b, 0.0, 1.0), clamp(a, 0.0, 1.0));
        }
        if (mode === "live") {
            // *** mh_live OVER THE WHOLE INPUT SQUARE, AGAINST THE f64 TWIN. *** x is the raw signal 0..1 and
            // y is the STATE, floor(y*5), so one frame carries all five of murmur's states rather than the one
            // a point sample would have picked -- and the two weight windows are different (LISTENING alone
            // for voice, THINKING and RESPONDING together for pace), so a frame that only saw idle would grade
            // neither of them.
            //
            // x REACHES 0 EXACTLY, on purpose: pow(0, 0.65) is the one input where a WGSL exp2(log2(0)) could
            // come back NaN instead of 0 on a driver that handles the -inf differently, and a probe whose
            // lattice started at 1/16 would never ask.
            const u = px.div(n).toVar();
            const si = TSL.floor(py.div(n).mul(5.0)).toVar();
            const lv = K.mhLive(u, u, si);
            return vec4(clamp(lv.voice, 0.0, 1.0), clamp(lv.pace, 0.0, 1.0), 0.0, 1.0);
        }
        if (mode === "state") {
            // *** mh_state, ALL FOUR OUTPUTS AT ONCE, ACROSS ALL FIVE STATES. *** x is tau over 0..1.4, which
            // is past the end of SUCCESS's own 1.2 s window so the settled tail is in shot rather than cropped
            // at the point it is still rising; y is the state index.
            //
            // THE THREE STATES THAT PRODUCE NOTHING ARE GRADED TOO, and they are the reason the y axis is here
            // at all: every species multiplies its interior by (1 + complete), so `complete` being exactly zero
            // in IDLE is the thing that keeps eighteen shaders from needing eighteen guards. A probe that only
            // sampled SUCCESS would let a gating bug through as four rows of agreement.
            const tau = px.div(n).mul(1.4).toVar();
            const si = TSL.floor(py.div(n).mul(5.0)).toVar();
            const st = K.mhState(si, tau);
            return vec4(clamp(st.complete, 0.0, 1.0), clamp(st.sweep, 0.0, 1.0),
                        clamp(st.settled, 0.0, 1.0), clamp(st.drive, 0.0, 1.0));
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
