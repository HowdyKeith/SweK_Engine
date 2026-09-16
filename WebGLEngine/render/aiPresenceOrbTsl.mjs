// WebGLEngine/render/aiPresenceOrbTsl.mjs
//
// tools/ship/nextRounds.mjs's ai-presence-orb-widget entry, closed. krispuckett/murmur-web (MIT) -- "responsive
// AI presence orbs for the web" -- has one runtime dependency (vgpu, its own WebGPU/WebGL2 device abstraction,
// separate from this tree's gfx/device.js), so the backlog entry's own "how" names the precedented move: hand-
// port the DESIGN into render/tslSource.mjs's own TSL convention, the way render/swiftShaderPass.js hand-ported
// krispuckett/SwiftUIShaders' Metal shaders rather than adopting a second rendering stack. This is the shader
// half; render/aiPresenceOrbState.mjs (read first -- it explains what WAS and was not independently confirmed
// against murmur-web's real source) is the pure-JS half, playing the role render/swiftShaderModel.mjs plays for
// swiftShaderPass.js: a CPU reference this file's rendered pixels are graded against.
//
// *** THE TECHNIQUE, READ FROM murmur-web's src/shaders/kit.ts DIRECTLY, NOT GUESSED: *** a star-shaped SDF
// sphere SOLVED ANALYTICALLY rather than raymarched (two fixed-point iterations in the general case); this
// port ships the UNDEFORMED special case only ("still" has no silhouette deformation, matching its own
// species description, "a quiet glass sphere"), where the analytic solve collapses to the textbook orthographic
// ray-sphere formula: for a sphere of radius R centred at the origin, viewed along -Z, a screen point at
// in-plane offset rho has entry height z = sqrt(R^2 - rho^2) and surface normal N = (rho.x, rho.y, z) / R --
// hand-cross-checked in the gate against the independent quadratic ray-sphere intersection formula, which must
// agree with this closed form exactly (both solve the same sphere, by two different routes).
//
// *** ONE FRESNEL TERM WAS NOT GIVEN AND WAS RECONSTRUCTED, NAMED HERE RATHER THAN LEFT SILENT: *** kit.ts's
// fetched description gives what fres is USED for (a transmission split "1 - 0.88*pow(fres,2.2)", a rim
// "pow(fres, 3.9 or 5.4)") but not the base fres = f(cosIncidence) formula itself. This port defines fres = 1 -
// ci (ci = cosine of incidence, 0 at the silhouette, 1 dead centre) -- the plainest read consistent with both
// quoted uses (fres=0 centre, fres=1 grazing) -- rather than a Schlick power this port cannot cite.
//
// *** HUE ROTATION IS DONE AS A DIRECT 2D ROTATION OF OKLab's (a,b), NOT VIA atan2. *** vendor/three-webgpu's
// TSL namespace has no atan2 (checked directly: grepping for it finds nothing, only single-argument atan) --
// but a hue shift by angle theta in OKLab's polar (C, h) form is exactly the same operation as rotating the
// Cartesian (a, b) pair by theta, which needs only cos/sin (both present) and avoids atan2's origin
// singularity besides. render/aiPresenceOrbState.mjs's lchToOklab/oklabToLch (JS, for the gate's own reference
// computation) and this shader's rotation therefore compute the identical transform two different ways.
"use strict";

/** Uniforms in a stable order -- setKnobs() writes by name, nothing depends on iteration order elsewhere. */
export const ORB_KNOBS = Object.freeze([
    "time", "speed", "glow", "depth", "hueShift", "presence", "clarity", "glintRate", "voice", "aspect",
    // limn's own four, from murmur's src/styles.ts roster. They sit in the same uniform block rather than a
    // second one because a species is a different BODY over one shared kit, which is exactly how murmur's own
    // eighteen are arranged -- each reads c0..c3 out of the same argument list.
    "rimWidth", "travel", "innerHint", "spread",
    // comet's own three (it shares `spread` with limn, exactly as murmur's roster does -- c3 is `spread` on
    // seventeen of the eighteen species).
    "orbitTilt", "trail", "pointSize",
    // droplet's own three. It is the FIRST species here whose silhouette moves, so it is also the first to
    // replace the analytic sphere below with the kit's deformed solve.
    "wobble", "tension", "sheen",
]);

/** The species this file can build. murmur ships eighteen; these are the two that are ported. */
export const ORB_SPECIES = Object.freeze(["still", "limn", "comet", "droplet"]);

/**
 * The three colour anchors the rail is built from, as murmur's own WEB-SPEC names them: ink '#0A0A0B' is the
 * ground the field dissolves into, tone '#6C63E8' the single hue family anchor. tone2 defaults to tone, which
 * is the case murmur calls out as having to collapse EXACTLY to the single-anchor rail -- duo is 0 there and
 * every duotone term becomes the identity.
 */
export const ORB_COLORS = Object.freeze({
    ink: Object.freeze([0x0A / 255, 0x0A / 255, 0x0B / 255]),
    tone: Object.freeze([0x6C / 255, 0x63 / 255, 0xE8 / 255]),
});

import { makeMurmurKitTsl } from "./murmurKitTsl.mjs";
import { MH_EXT, MH_TAPS, MH_SURFACE_KNOBS } from "./murmurKit.mjs";

const R_BODY = 0.62;          // sphere radius in the -1..1 quad
const EDGE_FEATHER = 0.015;   // antialiased silhouette width, in the same units as R_BODY
// *** ETA AND GLINT_WIDTH ARE GONE, AND REMOVING THEM IS THE SAME REPAIR AS THE ONE ABOVE. *** ETA held
// murmur's MH_ETA and fed the refraction this file computed and discarded; the kit owns that constant now and
// KIT.mhLook uses it for real. GLINT_WIDTH was the width of the time-only gaussian, which no longer exists.
// Both were left behind by the same change and both would have read, to the next person, as live tuning knobs
// for behaviour the file no longer has -- which is exactly how the dead refraction survived a round with a
// gate written about it.
// *** BASE_L / BASE_C / BASE_H ARE GONE, AND THAT IS THE POINT OF v4627. *** They were this port's own
// choice of anchor -- the header said so: "a deliberately calm blue-violet, this port's own pick" --
// standing in for murmur's palette table, which was not part of what had been fetched. The rail is
// built from the ink and tone anchors now (ORB_COLORS, murmur's own house values), so a constant that
// chose the family's colour on this port's behalf has nothing left to choose. Removed rather than left
// sitting: a dead tuning knob reads as a live one, which is exactly how the dead refraction survived a
// round with a gate written about it.

/**
 * Build the "still" orb from a TSL namespace (vendor/three-webgpu/three.tsl.js) and a THREE
 * (vendor/three-webgpu/three.webgpu.js), following render/badTvTsl.mjs's exact shape: a bare NodeMaterial whose
 * fragmentNode IS the effect, on a full-screen quad through an OrthographicCamera.
 *
 * `linear:true` (default false, so every existing direct-to-canvas caller -- ui/aiPresenceOrbWidget.js today
 * without the HDR pipeline, ai-presence-orb.html, tools/ship/aiPresenceOrb-selfcheck.mjs -- is byte-for-byte
 * unchanged) skips the final linearToSrgb() encode and returns the raw linear colour instead: the "scene" half
 * of render/aiPresenceOrbPresent.mjs's two-pass HDR pipeline, meant to be rendered into an HDR (half-float)
 * render target and gamma-encoded ONCE, in the present pass, rather than here.
 *
 * Returns { material, scene, camera, uniforms, setKnobs, setTime }.
 */
export function makeAiPresenceOrbTsl(THREE, TSL, { knobs = {}, linear = false, species = "still" } = {}) {
    if (!ORB_SPECIES.includes(species)) throw new Error(`aiPresenceOrbTsl: unknown species ${species}`);
    const need = ["Fn", "float", "vec2", "vec3", "vec4", "uv", "dot", "length", "normalize", "max", "min",
                  "clamp", "pow", "exp", "cos", "sin", "sqrt", "abs", "mix", "smoothstep", "select", "uniform", "negate"];
    for (const n of need) if (typeof TSL[n] !== "function") throw new Error(`aiPresenceOrbTsl: the TSL namespace has no ${n}()`);
    const { Fn, float, vec2, vec3, vec4, uv, dot, length, normalize, max, min, clamp, pow, exp, cos, sin, sqrt,
            abs, mix, smoothstep, select, uniform, negate, Loop } = TSL;
    // *** THE KIT IS IMPORTED RATHER THAN RE-APPROXIMATED, WHICH IS THE WHOLE POINT OF v4623 HAVING BUILT IT. ***
    // Everything below that used to be an in-file guess at murmur's volume -- a constant floor and a gaussian in
    // t -- is now the kit's own mh_exit / mh_medium / mh_inside / mh_flourish, graded against render/murmurKit
    // .mjs by tools/ship/murmurKit-selfcheck.mjs on a real GPU.
    const KIT = makeMurmurKitTsl(TSL);

    const k0 = { time: 0, speed: 1, glow: 1, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: 0, aspect: 1,
                 rimWidth: 0.4, travel: 0.5, innerHint: 0.3, spread: 0.4,
                 orbitTilt: 0.5, trail: 0.5, pointSize: 0.4,
                 wobble: 0.5, tension: 0.5, sheen: 0.5, ...knobs };
    const uniforms = {}; for (const n of ORB_KNOBS) uniforms[n] = uniform(float(k0[n])).label(n);
    // The rail's three anchors are colours, not scalars, so they sit beside the knob block rather than in it.
    const col0 = { ink: ORB_COLORS.ink, tone: ORB_COLORS.tone, tone2: ORB_COLORS.tone, ...(knobs.colors || {}) };
    for (const n of ["ink", "tone", "tone2"]) uniforms[n] = uniform(vec3(...col0[n])).label(n);

    // OKLab -> linear sRGB, cube done as explicit x*x*x (not pow(x,3): l_/m_/s_ can be legitimately negative
    // for an out-of-gamut Lab, and pow() with a non-integral-looking runtime exponent is the wrong tool here
    // even though 3 is an integer -- multiplication is unambiguous for a negative base).
    const cube = (x) => x.mul(x).mul(x);
    // The local OKLab decode is gone too: render/murmurKitTsl.mjs owns that conversion now, and two
    // copies of the same sixteen constants free to drift apart is the shape this tree spends most of
    // its gates on. The sabotage that proved this file's colour reaches pixels used to aim at this
    // decode's dominant coefficient -- it aims at the kit's now, which is where the decode lives.
    const linearToSrgb1 = Fn(([c]) => select(c.lessThanEqual(0.0031308), c.mul(12.92), pow(max(c, 1e-6), 1 / 2.4).mul(1.055).sub(0.055)));
    const linearToSrgb = Fn(([c]) => vec3(linearToSrgb1(c.x), linearToSrgb1(c.y), linearToSrgb1(c.z)));

    // still.ts's own interior floor: presence lifts it, clarity suppresses it, live voice energy lifts it further.
    const floorAmt = Fn(() => {
        const base = float(0.016).add(uniforms.presence.mul(0.085));
        return base.mul(float(1.0).sub(uniforms.clarity.mul(0.5))).mul(float(1.0).add(uniforms.voice.mul(0.55)));
    });
    // *** THE TIME-ONLY GLINT IS GONE, NOT KEPT AS A FALLBACK. *** It was exp(-(t mod period)^2 / w^2): one
    // number per FRAME, the same value at every pixel of the orb, where still.ts puts the light on a path
    // through the volume and solves it at the ray's closest approach. Leaving it here behind a flag would
    // leave two answers to one question in the file, and the gate would then be free to check the easy one.

    const main = Fn(() => {
        const p = uv().mul(2.0).sub(1.0);   // -1..1, symmetric orb: three's v=0-at-bottom vs device's v=0-at-top makes no visible difference
        // *** MEASURED, NOT ASSUMED CIRCULAR: A FULL-VIEWPORT ORTHOGRAPHIC QUAD STRETCHES ON A NON-SQUARE
        // CANVAS. *** A first render (900x600, a perfectly ordinary browser window) came back visibly
        // elliptical -- the camera's -1..1 NDC space maps to the canvas's ACTUAL pixel width and height, which
        // are equal only by coincidence. `aspect` = width/height is supplied by the caller (every real window
        // has one); scaling x by it before any distance/geometry math is done keeps a fixed NDC-y-space radius
        // R_BODY a true circle IN PIXELS on any aspect ratio, the same correction every full-screen-quad
        // effect that draws a screen-space SHAPE (as opposed to badTvTsl.mjs's screen-space colour warp, which
        // has no shape to distort) needs and a colour-only effect does not.
        const pc = vec2(p.x.mul(uniforms.aspect), p.y);
        const rho2 = dot(pc, pc);
        const rho = sqrt(rho2);
        const R = float(R_BODY);
        const V = vec3(0.0, 0.0, -1.0);                // orthographic ray, into the screen

        // *** DROPLET IS THE FIRST SPECIES HERE WHOSE SILHOUETTE MOVES, SO IT IS THE FIRST TO REPLACE THE
        // ANALYTIC SPHERE WITH THE KIT'S DEFORMED SOLVE. *** droplet.ts: "the body itself is the species: a
        // sphere of water in free fall ... everything the others keep at a whisper is turned up". Its
        // deformation runs at 0.052-0.092 against the other three's 0.018-0.024, and its shading gain at 3.30
        // against their 1.05-1.30 -- the shading is deliberately allowed past what the silhouette is.
        //
        // THE OTHER THREE KEEP THE INLINE SPHERE, and that is a measurement rather than a preference: mhBody
        // costs two extra mhDeform evaluations per pixel, and at amp = 0 it reduces to exactly this sphere
        // (checked in the gate -- Rd is 1 and the normal matches to f64). Paying for a solve whose answer is
        // known would slow three species to buy nothing, and would move their gates' pixels for no reason.
        const dN = vec3(0.0, 0.0, 1.0).toVar();
        const dP = vec3(0.0, 0.0, 0.0).toVar();
        let N, fres, bodyMask, bodyRd, bodyRho;
        if (species === "droplet") {
            // THE INHALE: the breath is the carrier and voice is what fills it, so the swell arrives on a
            // curve. droplet.ts: "a body that follows the raw envelope reads as a VU meter."
            const swell = float(0.22).add(KIT.mhBreath(uniforms.time, float(0.9)).mul(0.78)).mul(uniforms.voice).toVar();
            const bodyScale = float(1.0).add(swell.mul(0.050)).toVar();
            // Tension runs BACKWARDS through the amplitude on purpose, "because that is what tension IS".
            const wob = float(0.052).add(uniforms.wobble.mul(0.040))
                .mul(float(1.0).sub(uniforms.tension.mul(0.22)))
                .mul(float(1.0).add(swell.mul(0.30))).toVar();
            // uv in murmur's own units: this file's quad is -1..1 with the body at R_BODY, murmur's is uv with
            // the body at MH_R, so the ratio carries one space into the other.
            const uvM = pc.mul(KIT.MH_R / R_BODY).div(bodyScale).toVar();
            const b = KIT.mhBody(uvM, uniforms.time, float(0.004), wob, float(0.0), float(3.30),
                                 vec3(0.0, 0.0, 1.0), float(0.0), float(0.0), dP, dN).toVar();
            N = dN; fres = b.w; bodyMask = b.x; bodyRd = b.y; bodyRho = b.z;
        } else {
            const zArg = max(R.mul(R).sub(rho2), 0.0);   // clamped: outside the disk this would go negative
            const z = sqrt(zArg);
            N = vec3(pc, z).div(R);                      // sphere at the origin: outward normal = position / R
            fres = float(1.0).sub(clamp(N.z, 0.0, 1.0)); // 0 dead centre, 1 at the silhouette -- see header
            bodyMask = null; bodyRd = null; bodyRho = null;
        }
        const ci = clamp(N.z, 0.0, 1.0);               // = -dot(V, N) since V = (0,0,-1); cos(incidence)

        // *** THE REFRACTED RAY IS THE DIRECTION THE INTERIOR IS MARCHED ALONG, AND UNTIL v4624 IT WENT
        // NOWHERE. *** This file computed exactly this vector -- Snell with a TIR guard, matching kit.ts's
        // mh_refract line for line -- and then never used the variable again, while the gate proved the
        // guard "analytically unreachable at MH_ETA": a true statement about a value that reached no pixel.
        // The reason was not carelessness, it was that there was no volume to march: the interior was a
        // constant floor plus a gaussian in t. Both halves are repaired by the same change.
        const rd = KIT.mhLook(V, N, vec2(0.0, 0.0));   // tilt is not wired to a uniform here; the kit's exact
                                                       // zero test returns mh_refract's vector untouched
        // Entry point in BODY UNITS. On the sphere that IS the normal; on a deformed body it is not, so
        // droplet takes the point the solve actually returned.
        const P = species === "droplet" ? dP : N;
        const L = KIT.mhExit(P, rd).toVar();

        // still.ts's GESTURE CLOCK and its glint PATH. The light enters one side of the volume and leaves by
        // the other along a line hashed per gesture, and it is SOLVED at the ray's closest approach rather
        // than marched -- still.ts's own reason: "On the only event in the frame, sampling artefacts are the
        // entire picture, so this one is never marched."
        const slot = float(11.5).sub(uniforms.glintRate.mul(4.5));
        const fl = KIT.mhFlourish(uniforms.time, float(5.0), slot).toVar();
        const ga = fl.z.mul(6.2831853).toVar();
        const dir = normalize(vec3(cos(ga), sin(ga.mul(1.3)).mul(0.42), sin(ga))).toVar();
        const side = normalize(vec3(
            dir.y.mul(0.12).sub(dir.z),
            dir.z.mul(0.06).sub(dir.x.mul(0.12)),
            dir.x.sub(dir.y.mul(0.06)))).toVar();
        const along = float(-0.62).add(smoothstep(float(0.0), float(1.0), fl.y).mul(1.24));
        const lateral = float(0.34).mul(fl.z.mul(2.0).sub(1.0));
        const gp = side.mul(lateral).add(dir.mul(along)).toVar();
        const gw = float(0.085).add(uniforms.glintRate.mul(0.055)).toVar();

        const toG = gp.sub(P).toVar();
        const sG = dot(toG, rd).toVar();
        const argG = max(dot(toG, toG).sub(sG.mul(sG)), float(0.0)).div(max(gw.mul(gw), float(1e-6))).toVar();
        const atG = P.add(rd.mul(sG));
        const visG = KIT.mhInside(atG).mul(exp(sG.mul(-MH_EXT)));
        const glintLive = select(sG.greaterThan(0.0).and(sG.lessThan(L)),
            exp(negate(argG)).mul(1.05).add(KIT.mhScatter(argG, float(0.38))).mul(visG).mul(fl.x),
            float(0.0));

        // *** THE MARCH. *** still.ts's own loop, in its own order: the contribution is multiplied by the
        // surviving transmittance BEFORE that transmittance is updated, so the first tap is unattenuated.
        // Tidying those two lines into the other order changes the result by 1% or more, which is why
        // murmurKit-selfcheck asserts the ordering rather than trusting it.
        const acc = float(0.0).toVar();
        // *** THE SECOND CHANNEL, AND EVERY SPECIES HAS ONE. *** murmur's marches accumulate a hue NUMERATOR
        // beside the luminance, and the ratio of the two is where on the rail's spread axis this pixel sits.
        // render/murmurKit.mjs's marchStillInterior has returned it as `hueNum` since v4623 and this file
        // accumulated only the scalar, so every species passed hue = 0 to mh_lit and the axis built and gated
        // at v4627 reached no pixel at all. still.ts weights by DEPTH: p.z is the body's own depth, +1 toward
        // the viewer, so the near half of the ray goes one way on the hue and the far half the other.
        const accH = float(0.0).toVar();
        const trans = float(1.0).toVar();
        const ds = L.div(MH_TAPS).toVar();
        const fAmt = floorAmt().toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sMarch = float(i).add(0.5).mul(ds);
            const p = P.add(rd.mul(sMarch));
            const e = KIT.mhMedium(p, uniforms.time, float(1.9)).mul(fAmt).mul(KIT.mhInside(p)).toVar();
            acc.addAssign(e.mul(trans).mul(ds));
            accH.addAssign(e.mul(clamp(p.z, -1.0, 1.0)).mul(trans).mul(ds));
            trans.assign(trans.mul(exp(e.mul(2.0).add(MH_EXT).mul(ds).negate())));
        });

        // interior contribution -- the marched medium plus the solved glint, scaled by depth
        const stillDensity = acc.mul(3.4).add(glintLive).mul(uniforms.depth);

        // =====================================================================================================
        // *** LIMN -- THE SECOND SPECIES. "Near-dark glass whose EDGE is alive." ***
        //
        // Its brief in one line, from limn.ts: NEVER A FULL EVEN RING. Everything else in this block follows
        // from enforcing that. The arc is a bright head with a soft tail streaming off one side, built so the
        // FAR side of the ring never rises past a dim glow -- measured from murmur's own constants at
        // render/murmurKit.mjs's limnArc: 3.8% of peak at the 120 pt concentrations, which is the "four per
        // cent" limn.ts's own header quotes.
        //
        // *** THE PROFILE IS TWO VON MISES BUMPS AND NOT A GAUSSIAN, AND murmur RECORDS WHY IT HAD TO CHANGE. ***
        // "A gaussian in a wrapped angle is not a periodic function and no amount of tuning makes it one" --
        // their first cut left "a razor-thin dark seam down one radius of the body", 0.03 on one side of the
        // wrap against 0.21 on the other. exp(k*(cos(x)-1)) is a function of cos(x) alone and is therefore
        // periodic by construction. The CPU reference asserts that as an identity at +/-pi rather than
        // trusting the construction.
        const phi0 = KIT.mhDrift(uniforms.time,
            float(0.34).add(uniforms.travel.mul(0.40)).mul(float(1.0).add(uniforms.voice.mul(0.30))),
            float(0.62), float(1.0)).toVar();
        const phi = TSL.atan(pc.y, pc.x).toVar();
        // limn.ts wraps by subtracting a ROUNDED turn, which is exact at the seam; an atan round-trip is not.
        const aw = phi.sub(phi0).toVar();
        const awW = aw.sub(float(6.2831853).mul(TSL.floor(aw.div(6.2831853).add(0.5)))).toVar();
        const kHead = float(9.0).div(float(1.0).add(uniforms.voice.mul(0.60))).toVar();
        const kTail = float(1.6).div(float(1.0).add(uniforms.voice.mul(0.35))).toVar();
        const offT = float(-1.05);
        const headLobe = exp(kHead.mul(cos(awW).sub(1.0))).toVar();
        const tailLobe = exp(kTail.mul(cos(awW.sub(offT)).sub(1.0))).toVar();
        const arcProfile = headLobe.add(tailLobe.mul(0.52)).toVar();
        // THE TAIL LOBE'S OWN SHARE OF THE LIGHT AT THIS PIXEL, which limn.ts chose over the wrapped angle
        // for the same reason its arc is a function of cos alone: it is PERIODIC, "so the hue has no seam
        // either". It is limn's whole hue term -- this hero takes nothing from the march for it.
        const tailShare = tailLobe.mul(0.52).div(max(headLobe.add(tailLobe.mul(0.52)), float(1e-4))).toVar();

        // THE BAND: where the light sits radially, just inside the silhouette, thickening with voice. murmur
        // gives it a CEILING and says why -- three multipliers stack and at 18 pt with somebody talking they
        // produced "a solid wedge of light reaching the middle of the sphere", whose boundary at that radius
        // is a nearly straight line. "A hard edge on an organic form is the one thing this house never ships."
        const bw = min(float(0.070).add(uniforms.rimWidth.mul(0.055)).mul(float(1.0).add(uniforms.voice.mul(0.55))), float(0.30)).toVar();
        const dband = rho.div(R).sub(0.965).div(max(bw, float(1e-3))).toVar();
        const band = exp(negate(dband.mul(dband))).toVar();
        // Fresnel keeps the light physically ON the edge, so the arc bends around the curvature.
        const rimlight = band.mul(float(0.30).add(pow(fres, float(1.6)).mul(0.70))).toVar();
        const rimE = rimlight.mul(arcProfile).mul(float(1.70).add(uniforms.voice.mul(1.15))).toVar();

        // THE INTERIOR HINT: the arc as a direction in three dimensions, the volume glowing faintly where
        // that light entered. limn.ts: "It costs one line and it is the difference between a rim drawn ON a
        // dark disc and a rim lighting a dark VOLUME." The exponent is 2.2, down from 3 on murmur's own note
        // that a lower power is a wider wash.
        const arcDir = vec3(cos(phi0), sin(phi0), float(0.0)).toVar();
        const hintAmt = float(0.22).add(uniforms.innerHint.mul(0.38)).mul(float(1.0).add(uniforms.voice.mul(0.9))).toVar();
        const accL = float(0.0).toVar();
        const transL = float(1.0).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sM = float(i).add(0.5).mul(ds);
            const p2 = P.add(rd.mul(sM));
            const fade = KIT.mhInside(p2).toVar();
            const lit = pow(clamp(dot(normalize(p2.add(1e-5)), arcDir), 0.0, 1.0), float(2.2));
            const reach = smoothstep(float(0.10), float(0.85), length(p2));
            const haze = KIT.mhHaze(p2, uniforms.time, float(2.4)).mul(0.55).add(0.45);
            // Even the dark hero gets a floor: limn is "near-black GLASS and not a hole in the frame", at
            // 0.030 -- a third of what the luminous heroes carry.
            const e2 = lit.mul(reach).mul(haze).mul(hintAmt)
                .add(KIT.mhMedium(p2, uniforms.time, float(2.4)).mul(0.030)).mul(fade).toVar();
            accL.addAssign(e2.mul(transL).mul(ds));
            transL.assign(transL.mul(exp(e2.mul(1.80).add(MH_EXT).mul(ds).negate())));
        });
        const limnDensity = accL.mul(3.0).add(rimE).mul(uniforms.depth);

        // =====================================================================================================
        // *** COMET -- THE THIRD SPECIES. "One bright point on a tilted orbit inside the glass, trailing light." ***
        //
        // *** THE TRAIL IS NOT A HISTORY BUFFER AND COULD NOT BE. *** comet.ts: "The obvious build -- remember
        // where the point was and smear it -- is impossible here, because these shaders are STATELESS BY
        // CONTRACT: any time value has to render the correct frame." So it is solved geometrically. The orbit
        // is a circle in a plane, so the nearest point on it is closed form, and the ANGLE of that nearest
        // point subtracted from the head's angle IS how long ago the head was there. render/murmurKit.mjs's
        // cometNearest is the CPU twin, checked in the gate against a 200,000-sample brute force over the
        // circle -- a different method, agreeing to 7e-11.
        //
        // THE ORBIT IS TILTED ON PURPOSE AND BOUNDED AWAY FROM BOTH FAILURES: "face-on is a circle drawn on
        // the glass, edge-on is a line." tau runs 0.30..1.05 radians, and a slow precession keeps the edge-on
        // moment from landing twice in the same place.
        const tau = float(0.30).add(uniforms.orbitTilt.mul(1.05 - 0.30)).toVar();
        const prec = KIT.mhDrift(uniforms.time, float(0.070), float(0.45), float(2.0)).toVar();
        const e1 = KIT.mhSpin(vec3(1.0, 0.0, 0.0), prec, float(0.0)).toVar();
        const e2 = KIT.mhSpin(vec3(float(0.0), sin(tau), cos(tau)), prec, float(0.0)).toVar();
        const nrm = TSL.cross(e1, e2).toVar();
        const r0 = clamp(float(0.54).mul(float(1.0).sub(uniforms.voice.mul(0.24))), 0.20, 0.70).toVar();
        const rate = float(1.05).mul(float(1.0).add(uniforms.voice.mul(0.85))).toVar();
        const psi = KIT.mhDrift(uniforms.time, rate, float(0.38), float(3.0)).toVar();
        // Head width: comet.ts's first cut ran at 0.086 and "the head was a soft blob half the size of the core
        // it was supposed to be orbiting inside: a point of light has to be a POINT or the trail behind it has
        // nothing to have come from." The tube is deliberately WIDER than the nucleus -- true of comets, and
        // necessary because a tube thinner than the march step aliases the way the head did.
        const hw = float(0.028).add(uniforms.pointSize.mul(0.030)).mul(float(1.0).add(uniforms.voice.mul(0.45))).toVar();
        const tubeW = hw.mul(1.45).toVar();
        const decay = float(1.30).add(uniforms.trail.mul(2.60)).toVar();

        const accC = float(0.0).toVar();
        // comet weights its hue by the trail's AGE rather than by depth: clamp(age/pi, 0, 1) is 0 at the head
        // and 1 at the far end of the lap, so the colour drifts along the trail as it cools.
        const accHC = float(0.0).toVar();
        const transC = float(1.0).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sM = float(i).add(0.5).mul(ds);
            const p3 = P.add(rd.mul(sM));
            const fadeC = KIT.mhInside(p3).toVar();
            // THE NEAREST POINT ON THE ORBIT, in closed form.
            const u = dot(p3, e1).toVar(), v = dot(p3, e2).toVar(), w = dot(p3, nrm).toVar();
            const qd = sqrt(u.mul(u).add(v.mul(v))).sub(r0).toVar();
            const dist2 = qd.mul(qd).add(w.mul(w)).toVar();
            // ...and how long ago the head was there, wrapped into -pi..pi.
            const ageRaw = psi.sub(TSL.atan(v, u)).toVar();
            const age = ageRaw.sub(float(6.2831853).mul(TSL.floor(ageRaw.div(6.2831853).add(0.5)))).toVar();
            // *** THE FALL IS TAKEN TO ZERO AT BOTH ENDS, AND comet.ts RECORDS WHAT HAPPENED WHEN IT WAS NOT:
            // *** the trail still stood at a fifth when it met its own head and the scatter halo carried that
            // step into "a hard-edged wedge cut through the glass". "Two soft gradients meeting is a gradient;
            // A SOFT GRADIENT MEETING A STEP IS THE STEP."
            const fallBack = exp(age.negate().div(max(decay, float(1e-3))))
                .mul(float(1.0).sub(smoothstep(float(2.30), float(3.1416), age)));
            const fallAhead = exp(age.div(0.30));
            const fall = select(age.greaterThanEqual(0.0), fallBack, fallAhead).toVar();
            const targ = dist2.div(tubeW.mul(tubeW)).toVar();
            const trail = exp(negate(targ)).add(KIT.mhScatter(targ, float(0.22))).mul(fall).toVar();
            const eC = trail.mul(1.55).add(KIT.mhMedium(p3, uniforms.time, float(2.3)).mul(0.055)).mul(fadeC).toVar();
            accC.addAssign(eC.mul(transC).mul(ds));
            accHC.addAssign(trail.mul(1.55).mul(fadeC).mul(clamp(age.div(3.1415927), 0.0, 1.0)).mul(transC).mul(ds));
            transC.assign(transC.mul(exp(eC.mul(4.20).add(MH_EXT).mul(ds).negate())));
        });
        // *** THE HEAD IS SOLVED, NOT SAMPLED, AND LEAVING IT OUT GAVE comet A TRAIL AND NO POINT. ***
        // This was measured before it was fixed: with only the march, comet's brightest interior pixel sat at
        // (36,25) -- the SAME pixel as still's, and it did not move between t=2.4 and t=3.9. That is the
        // specular catchlight, not an orbiting spark. A species whose whole brief is "one bright point" had no
        // point. comet.ts says exactly why sampling cannot work: "The head is 0.043 body units across and the
        // march steps about 0.38, so whether a ray caught it at all depended on where the tap planes happened
        // to fall: the point flickered as it moved, and near the limb, where the refracted ray is long and the
        // ghost image lives, it rendered as a SECOND comet. A species whose whole brief is one bright point
        // cannot have two."
        //
        // sH is how far into the glass the closest approach lies, so exp(-MH_EXT * sH) dims the head on the
        // far side of its orbit -- the depth cue that says the point went BEHIND the middle, which is the
        // entire reason this species is tilted at all.
        const headPos = e1.mul(cos(psi)).add(e2.mul(sin(psi))).mul(r0).toVar();
        const toH = headPos.sub(P).toVar();
        const sH = dot(toH, rd).toVar();
        const dH2 = max(dot(toH, toH).sub(sH.mul(sH)), float(0.0)).toVar();
        const harg = dH2.div(max(hw.mul(hw), float(1e-6))).toVar();
        const visH = KIT.mhInside(P.add(rd.mul(sH))).mul(exp(sH.mul(-MH_EXT))).mul(KIT.mhTransmit(fres)).toVar();
        // A SOFTER POINT THAT BLOOMS: murmur's round one drove the narrow term to 1.55 and "a gaussian whose
        // peak is that far above the rail's knee is flat over most of its width: what draws is a disc of
        // constant cream with a step at its rim." At 0.92 the peak lands just into cream and the light that
        // was in the core is spent on the scatter instead -- ten times the area, dimming with depth.
        const headBright = float(1.0).add(uniforms.voice.mul(1.30));
        const headE = select(sH.greaterThan(0.0).and(sH.lessThan(L)),
            exp(negate(harg)).mul(0.92).add(KIT.mhScatter(harg, float(0.30))).mul(headBright).mul(visH),
            float(0.0)).toVar();
        const cometDensity = accC.mul(4.20).add(headE).mul(uniforms.depth);

        // =====================================================================================================
        // *** DROPLET -- THE FOURTH SPECIES. "A sphere of water in free fall." ***
        //
        // Its interior is briefed as very nearly CLEAR, and droplet.ts is explicit that this is not the same
        // as empty: "A clear interior is not an empty one -- it is what lets the refraction be visible,
        // because the only way to see a lens is to see something through it." So: a little haze, and one
        // soft luminous heart.
        //
        // THE HEART IS SOLVED AT THE RAY'S CLOSEST APPROACH, NOT SAMPLED -- the third species in a row where
        // that is the defining detail, and the one I got wrong on comet by stopping reading too early.
        // droplet.ts: "a core 0.22 body units across, marched at steps of about 0.38, was caught by one tap or
        // two depending on where the planes fell along a refracted ray whose direction changes every pixel."
        // IT IS CENTRED, and only just off it: a lag of 0.028 on three incommensurate periods, "enough that
        // the core is never nailed to the exact centre and far too little to read as off-centre".
        const swellD = float(0.22).add(KIT.mhBreath(uniforms.time, float(0.9)).mul(0.78)).mul(uniforms.voice).toVar();
        const coreC = vec3(
            sin(uniforms.time.mul(0.213).add(0.6)).mul(0.028),
            sin(uniforms.time.mul(0.167).add(2.4)).mul(0.026),
            sin(uniforms.time.mul(0.139).add(4.1)).mul(0.024)).toVar();
        // THE CORE IS SMALL, and has to be: "a core that fills the body is not a light inside glass, it is a
        // lamp with a shade." At a quarter of the radius it occupies a sixtieth of the volume, leaving the
        // rest for the refraction to be visible in -- and the refraction is the species.
        const coreR = float(0.17).add(float(1.0).sub(uniforms.tension).mul(0.10)).mul(float(1.0).add(swellD.mul(0.22))).toVar();
        const coreBright = float(1.0).add(uniforms.voice.mul(0.85)).toVar();
        const accD = float(0.0).toVar();
        // droplet weights by depth like still, and carries the `fade` a SECOND time -- its e already includes
        // mh_inside and the hue term multiplies by it again. That is droplet.ts as written ("the near half of
        // the ray one way, the far half the other"), ported rather than tidied.
        const accHD = float(0.0).toVar();
        const transD = float(1.0).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sM = float(i).add(0.5).mul(ds);
            const pD = P.add(rd.mul(sM));
            const eD = KIT.mhMedium(pD, uniforms.time, float(2.1)).mul(0.090).mul(KIT.mhInside(pD)).toVar();
            accD.addAssign(eD.mul(transD).mul(ds));
            accHD.addAssign(eD.mul(KIT.mhInside(pD)).mul(clamp(pD.z, -1.0, 1.0)).mul(transD).mul(ds));
            transD.assign(transD.mul(exp(eD.mul(2.40).add(MH_EXT).mul(ds).negate())));
        });
        const toC = coreC.sub(P).toVar();
        const sC = dot(toC, rd).toVar();
        const dC2 = max(dot(toC, toC).sub(sC.mul(sC)), float(0.0)).div(max(coreR.mul(coreR), float(1e-6))).toVar();
        const visC = KIT.mhInside(P.add(rd.mul(sC))).mul(exp(sC.mul(-MH_EXT))).mul(coreBright).toVar();
        // The scatter is what stops a clear interior reading as an empty one: "the heart lights the fog it
        // sits in, the fog dims with depth because MH_EXT is in the visibility term, and the drop comes out as
        // a lamp inside a lens instead of a disc pasted on ink."
        const heart = select(sC.greaterThan(0.0).and(sC.lessThan(L)),
            exp(negate(dC2)).mul(1.65).add(KIT.mhScatter(dC2, float(0.34))).mul(visC), float(0.0)).toVar();
        const dropletDensity = accD.mul(4.20).add(heart).mul(uniforms.depth);

        const density = species === "limn" ? limnDensity
            : species === "comet" ? cometDensity
            : species === "droplet" ? dropletDensity : stillDensity;

        // ---- THE SURFACE IS murmur's NOW, NOT THIS FILE'S APPROXIMATION OF IT ------------------------------
        // *** WHAT STOOD HERE WAS WRONG IN FIVE WAYS AND RIGHT IN TWO, AND THE TWO ARE WHY IT LOOKED FINE. ***
        // This file carried its own rim at a FIXED exponent of 4.5, two specular lobes off a FIXED light
        // direction of its own choosing (normalize(vec3(0.45, 0.6, 0.65)) -- up and to the RIGHT), a
        // per-species rim constant, a per-species spec constant, and no contact glow whatsoever. Against
        // murmur's roster, read off each hero's own mh_surface call site:
        //
        //   species   rim (this file)   rim (murmur)            spec (this file)  spec (murmur)      glow
        //   still     0.85              1.15 + 0.45*voice       0.9               1.30 + 0.35*voice  0.13
        //   limn      0.30  <- right    0.30                    0.9               0.78 + 0.35*voice  0.09
        //   comet     0.55              0.80 + 0.35*voice       0.22  <- right    0.22               0.15
        //   droplet   0.85              1.05 + 0.55*sheen+...   1.25              0.42 + 0.30*sheen  0.16
        //
        // The two that matched are exactly the two murmur QUOTES IN PROSE (limn's "0.30 is the fitted middle",
        // comet's "at 0.22 it is a catchlight") -- so the numbers a reader could find in a sentence were right
        // and every number that lived only in code was invented. That is the shape of the whole defect, and it
        // is worth naming: reading a port's prose is not reading its code.
        //
        // AND NONE OF THE FOUR HAD A CONTACT GLOW, which all eighteen species ask for.
        //
        // *** ONE OF THOSE SENTENCES IS ITSELF WRONG, AND BOTH HALVES ARE NOW CHECKED RATHER THAN REPEATED. ***
        // still.ts says "THE HIGHEST RIM AND SPECULAR IN THE COLLECTION"; abyss.ts says "1.70 is the highest
        // in the collection". Over murmur's own eighteen call sites abyss wins the rim at every voice (1.70
        // against still's 1.15) and still wins the SPECULAR outright (1.30 against nebula's 0.98). still.ts
        // bundles the two and is half right. This file used to repeat the wrong half.
        const SK = MH_SURFACE_KNOBS[species];
        const sheenK = species === "droplet" ? uniforms.sheen : float(0.0);
        const rimK = float(SK[0]).add(uniforms.voice.mul(SK[1]))
            .add(species === "droplet" ? sheenK.mul(0.55) : float(0.0)).toVar();
        const specK = float(SK[2]).add(uniforms.voice.mul(SK[3]))
            .add(species === "droplet" ? sheenK.mul(0.30) : float(0.0)).toVar();

        // THE BODY STRUCT mh_surface READS. droplet has it from the deformed solve; the other three stand on
        // the analytic sphere, where the entry point IS the normal, the deformed radius is exactly 1 and the
        // in-plane radius is rho in body units. Built with murmur's own two-sided feather rather than this
        // file's one-sided edge mask, so `m` means the same thing on both paths.
        const bodyFeather = float(Math.max(0.018, 1.3 * 0.004));
        const rhoBody = rho.div(R).toVar();
        const sphereM = float(1.0).sub(smoothstep(float(1.0).sub(bodyFeather), float(1.0).add(bodyFeather), rhoBody)).toVar();
        const surfB = species === "droplet"
            ? { m: bodyMask, P: dP, N, Rd: bodyRd, rho: bodyRho, fres }
            : { m: sphereM, P, N, Rd: float(1.0), rho: rhoBody, fres };
        // tilt is not wired to a uniform in this port (mh_look is given vec2(0,0) above for the same reason),
        // so the counter-move term is exercised at zero here and by the gate at nonzero.
        const sf = KIT.mhSurface(surfB, uniforms.time, KIT.mhSmall(float(120.0), float(120.0)),
                                 uniforms.ink, vec2(0.0, 0.0), rimK, specK, float(SK[4]));

        // *** THE COLOUR IS murmur's RAIL, AND NOW SO IS THE COMPOSITION INTO IT. *** v4627 replaced this
        // file's invented OKLab ramp with mh_palette/mh_lit but kept its own arrangement of the terms, and the
        // arrangement was wrong in two ways that mh_present settles exactly:
        //
        //   mh_present(body = e - spec - contact, spec, contact, ...) with railE = body + (spec + contact)*dark
        //
        // so the RIM belongs in `body`, NOT under the (* dark) factor this file had it under -- on a light
        // ground the rim is the whole silhouette and multiplying it by (1 - paper) deletes it exactly where it
        // does the most work. And the CONTACT GLOW belongs with the specular under that factor, which this
        // file could not get wrong only because it had no glow at all.
        //
        // The interior also gains the two terms murmur multiplies it by and this file did not: the membership
        // b.m and mh_transmit(b.fres), so the marched volume is masked by the silhouette and dimmed by the
        // glass it is seen through rather than reaching the edge at full strength.
        const pal = KIT.mhPalette(uniforms.ink, uniforms.tone, uniforms.tone2, uniforms.hueShift, uniforms.depth);
        const dark = float(1.0).sub(pal.paper).toVar();
        const interior = density.mul(surfB.m).mul(KIT.mhTransmit(fres)).toVar();
        const railE = interior.add(sf.rim).add(sf.spec.add(sf.glow).mul(dark)).toVar();
        // *** THE HUE ARGUMENT IS STILL ZERO, AND THAT IS A KNOWN GAP RATHER THAN A CHOICE. *** murmur's
        // species each compute hueMix = hue * <their own numerator> / max(e, 1e-4), where `hue` comes from a
        // SECOND channel their march accumulates: acc.y += e * clamp(p.z,-1,1) * trans * ds, then
        // hue = acc.y/acc.x * spreadK * MH_SPREAD. render/murmurKit.mjs's marchStillInterior already returns
        // that channel as `hueNum` -- the CPU reference has had it since v4623 -- and the march in THIS file
        // accumulates only the scalar, so every species passes 0 and the rail's spread axis, built and gated
        // at v4627, reaches no pixel. Named here rather than half-wired: it needs each hero's own numerator,
        // which is four more formulas, and it is what makes opal (spread 0.7, the species that deliberately
        // runs a third past MH_SPREAD) worth porting at all.
        // *** AND THE HUE ARGUMENT IS REAL NOW. *** Each hero computes its own, and they are NOT one formula
        // with four constants -- they differ in what they weight, in sign, and in gain:
        //   still    +(accH / acc) * spread * MH_SPREAD          weighted by depth
        //   limn     -tailShare    * spread * MH_SPREAD          the tail lobe's own share of the light, no
        //                                                        march channel at all, and NEGATIVE
        //   comet    -(accHC/accC) * spread * MH_SPREAD * 1.4    weighted by the trail's age, negative, gain
        //   droplet  +(accHD/accD) * spread * MH_SPREAD          depth again, with fade counted twice
        // The guard is murmur's own: below 1e-4 of accumulated light the ratio is meaningless and the hue is
        // zero, which is what keeps an empty ray from painting a colour.
        const spreadK = clamp(uniforms.spread, 0.0, 1.0).toVar();
        const hueRaw = species === "limn"
            ? tailShare.negate().mul(spreadK).mul(KIT.MH_SPREAD)
            : species === "comet"
                ? select(accC.greaterThan(1e-4), accHC.div(accC), float(0.0)).negate().mul(spreadK).mul(KIT.MH_SPREAD).mul(1.4)
                : species === "droplet"
                    ? select(accD.greaterThan(1e-4), accHD.div(accD), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    : select(acc.greaterThan(1e-4), accH.div(acc), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD);
        // mh_present's own hueMix: the hue scaled by the share of THIS pixel's energy that the species says
        // carries colour. still and comet count the interior plus 0.7 of the rim, droplet 0.6 of it, limn the
        // rim energy plus the interior -- four different numerators, transcribed rather than averaged.
        const eTotal = interior.add(sf.rim).add(sf.spec).add(sf.glow).toVar();
        const hueNum = species === "limn" ? rimE.add(interior)
            : species === "droplet" ? interior.add(sf.rim.mul(0.6))
            : interior.add(sf.rim.mul(0.7));
        const hueMix = hueRaw.mul(hueNum).div(max(eTotal, float(1e-4))).toVar();
        const colorLinear = max(KIT.mhLit(pal, railE, uniforms.glow, float(0.0), float(1.0), float(0.34), hueMix),
                                vec3(0.0));
        const outColor = linear ? colorLinear : linearToSrgb(colorLinear);

        // *** smoothstep(edge0, edge1, x) NEEDS edge0 < edge1 -- "results are undefined" otherwise (GLSL spec,
        // and WGSL inherits the same contract). The mask wants to fall from 1 to 0 as rho RISES past R, which
        // is the opposite direction, so it is built as ONE MINUS the correctly-ordered rise (R-feather < R),
        // not as smoothstep(R, R-feather, rho) with the arguments swapped to fake a falling curve. *** MEASURED
        // RATHER THAN LEFT AS A GUESS: on the device the gate actually runs on, the swapped form is not merely
        // close, it is algebraically IDENTICAL -- (x-a)/(b-a) = 1-(x-b)/(a-b) exactly, and smoothstep's own
        // Hermite curve is point-symmetric (smoothstep(t) = 1-smoothstep(1-t)), so smoothstep(a,b,x) = 1 -
        // smoothstep(b,a,x) for EVERY x, not only inside the band -- confirmed both by hand and by a sabotage
        // that swaps the arguments back and renders bit-identical output. So this fix is spec-compliance, not
        // a rendering fix on THIS implementation: the guarantee spent is that some OTHER device is free to
        // implement smoothstep a different way when edge0 >= edge1, and this file does not ask any device to.
        // *** FOR DROPLET THE MASK IS THE SOLVE'S OWN MEMBERSHIP, AND USING THE FIXED-RADIUS ONE WOULD HAVE
        // HIDDEN THE ENTIRE SPECIES. *** mhBody returns m from the DEFORMED radius Rd with murmur's own two
        // feather terms added rather than multiplied; clipping that to a circle of radius R_BODY would draw a
        // wobbling interior inside a perfectly round hole, which is the one thing droplet is not.
        // *** THE ALPHA IS murmur's CONTAINMENT NOW, AND THE OLD ONE DELETED THE CONTACT GLOW. ***
        // What stood here clipped at the BODY radius -- for droplet at the deformed membership, for the other
        // three at R_BODY with a feather. mh_surface's contact glow is nonzero ONLY outside the silhouette,
        // so an alpha that reaches zero at the silhouette multiplies the entire term by nothing: it was
        // computed correctly at v4629 and reached no pixel, exactly the way the refracted ray this file
        // computed and discarded did until v4624. The species gate's own outside-the-body ring read a flat
        // 0.00000 and is what found it.
        //
        // kit.ts says what the mask is for in as many words: "In this family the body has its own silhouette
        // well inside the circular clip, so this is a safety net FOR THE CONTACT GLOW rather than the design
        // of the edge." At reach 0.72 it falls from a uv radius of 0.36 to 0.49 against a worst-case body of
        // 0.339 -- comfortably outside every hero, which is the point.
        //
        // *** AND THE WOBBLE DOES NOT LEAVE WITH IT. *** droplet used the deformed membership as its alpha
        // because a fixed circle "would draw a wobbling interior inside a perfectly round hole". That reason
        // is discharged rather than ignored: b.m now multiplies the interior (above) and the rim and specular
        // (inside mh_surface), so the deformed silhouette is carried in the LIGHT, which is where murmur
        // carries it -- its own present pass composites through this same fixed containment for all eighteen.
        // The gate's droplet silhouette row measures the luminance edge rather than the alpha edge for the
        // same reason.
        const uvLen = length(pc).mul(KIT.MH_R / R_BODY).toVar();   // this quad's radius in murmur's uv units
        const edgeMask = KIT.mhContainment(uvLen, float(0.72));
        return vec4(outColor, edgeMask);
    });

    const material = new THREE.NodeMaterial();
    material.transparent = true;
    material.fragmentNode = main();
    const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
    return {
        material, scene, camera, uniforms,
        setTime(t) { uniforms.time.value = t; },
        // *** THE THREE COLOUR ANCHORS ARE SETTABLE TOO, AND THAT IS A GATE-COST DECISION AS MUCH AS AN API
        // ONE. *** They were already uniforms but only readable at build time, through the factory's own
        // knobs.colors -- so rendering the same species on a PAPER ground meant different factoryArgs, which
        // means a different cache key, which means a whole second WGSL compile (~195 ms on the box the gates
        // run on) for a change of three constants. Writing them here makes a paper-ground frame reuse the
        // shader it already built. It matters because half of mh_surface only does anything on paper: the rim
        // gain, the wrap flattening, the exponent tightening and the environment inversion are all no-ops on
        // ink, and a composition error that deletes the rim on paper is ALGEBRAICALLY INVISIBLE on ink, where
        // dark is exactly 1.
        setKnobs(k) {
            for (const n of ORB_KNOBS) if (k[n] != null) uniforms[n].value = k[n];
            if (k.colors) for (const n of ["ink", "tone", "tone2"]) {
                if (k.colors[n]) uniforms[n].value.set(...k.colors[n]);
            }
        },
    };
}
