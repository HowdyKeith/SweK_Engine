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
    // droplet's own three. It is the FIRST species here whose silhouette moves ENOUGH TO BE THE SUBJECT --
    // every one of the eighteen deforms, which v4632 had to find out the hard way.
    "wobble", "tension", "sheen",
    // opal's three and abyss's three, from the same roster. `drift` is shared between them exactly as
    // murmur's own roster shares it -- opal spends c1 on it and abyss c2.
    "flashes", "softness", "drift", "creatures", "rarity",
    // nebula's three and tempest's three, which are the SAME three -- and sharing them is faithful rather
    // than thrifty. murmur names c0..c2 per species (nebula reads densityK/foldK/glintK, tempest reads
    // stormK/churnK/flickerK) but they are one argument list and they mean the same thing on both: how much
    // weather there is, how hard it turns over, and how strong the thing buried in it is. The port already
    // shares `drift` between opal and abyss for exactly this reason. c3 is `spread` on both, as it is on
    // seventeen of the eighteen.
    "density", "fold", "glint",
    // fathom's three and geode's three. NOT shared this time, and the difference from nebula/tempest is the
    // point: those two read one argument list that means the same thing on both ("how much weather"), while
    // fathom's c0 sets how far apart its shells sit and geode's cuts its faces harder. Same slot, different
    // quantity, so the port gives them different names rather than pretending the roster shares more than it
    // does.
    "layers", "parallax", "murk", "facet", "glim", "stone",
    // arc's three and sol's three, also unshared, and this pair is the clearest case yet FOR not sharing.
    // Both species draw a line with the SAME closed-form integral, so a careless port would have given them
    // one set of knob names on the strength of the shared machinery. But arc's c0 sets how far round its
    // single filament goes and sol's sets how far its corona reaches off the limb; arc's c1 is how much its
    // plane wanders and sol's is how high its three tongues lift. The machinery is shared and the QUANTITIES
    // are not, which is precisely the distinction the fathom/geode note above was drawing.
    "bow", "sway", "pin", "corona", "prom", "simmer",
]);

/** The species this file can build. murmur ships eighteen; these are the six that are ported. */
export const ORB_SPECIES = Object.freeze(["still", "limn", "comet", "droplet", "opal", "abyss",
                                          "nebula", "tempest", "fathom", "geode", "arc", "sol"]);

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
import { MH_EXT, MH_TAPS, MH_SURFACE_KNOBS, MH_SHAPE, MH_DROPLET_GAIN, MH_MIST,
         MH_TEMPEST_BOLT, MH_FATHOM, MH_GEODE, MH_ARC, MH_SOL, MH_R, mhAa } from "./murmurKit.mjs";

/**
 * THE MOIRE GATE, EVALUATED ON THE CPU BECAUSE THIS PORT HAS ONE MOUNT. kit.ts's mh_aa eases a structure's
 * contribution to nothing as it approaches a third of a cycle per pixel. Its arguments are the mount's pixel
 * size and scale, and this file reads BOTH of those at a fixed nominal 120 pt -- the same 120 that smallK is
 * read at twelve lines into every species. So the gate is a constant per species, and it is COMPUTED FROM THE
 * KIT rather than written down as one, so that a reader can check it against kit.ts instead of taking a
 * transcribed number on trust. At 120 pt both species' structures are comfortably resolved and it returns 1.
 */
const KIT_AA = (cycles) => mhAa(2 * Math.PI * cycles / MH_R, 120, 1);

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
                  "clamp", "pow", "exp", "cos", "sin", "sqrt", "abs", "mix", "smoothstep", "select", "uniform", "negate",
                  // cross() arrived with arc and sol: both need the angle between the view ray and a curve's
                  // own tangent, which is the 1/sin(alpha) term the closed-form tube integral divides by.
                  "cross"];
    for (const n of need) if (typeof TSL[n] !== "function") throw new Error(`aiPresenceOrbTsl: the TSL namespace has no ${n}()`);
    const { Fn, float, vec2, vec3, vec4, uv, dot, length, normalize, max, min, clamp, pow, exp, cos, sin, sqrt,
            abs, mix, smoothstep, select, uniform, negate, cross, Loop } = TSL;
    // *** THE KIT IS IMPORTED RATHER THAN RE-APPROXIMATED, WHICH IS THE WHOLE POINT OF v4623 HAVING BUILT IT. ***
    // Everything below that used to be an in-file guess at murmur's volume -- a constant floor and a gaussian in
    // t -- is now the kit's own mh_exit / mh_medium / mh_inside / mh_flourish, graded against render/murmurKit
    // .mjs by tools/ship/murmurKit-selfcheck.mjs on a real GPU.
    const KIT = makeMurmurKitTsl(TSL);

    const k0 = { time: 0, speed: 1, glow: 1, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: 0, aspect: 1,
                 rimWidth: 0.4, travel: 0.5, innerHint: 0.3, spread: 0.4,
                 orbitTilt: 0.5, trail: 0.5, pointSize: 0.4,
                 wobble: 0.5, tension: 0.5, sheen: 0.5,
                 flashes: 0.5, softness: 0.6, drift: 0.4, creatures: 0.4, rarity: 0.6,
                 density: 0.5, fold: 0.5, glint: 0.5,
                 layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
                 bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5, ...knobs };
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
        // ---- THE BODY: EVERY SPECIES GETS ITS OWN, AND THREE OF THEM WERE ON A SPHERE -------------------
        // *** murmur GIVES ALL EIGHTEEN A DEFORMED BODY AND NOT ONE OF THEM HAS amp = 0. *** This file solved
        // droplet with the kit's mh_body and left still, limn and comet on the analytic sphere, on the
        // strength of a v4626 note saying the three "are not standing on different geometry -- they are on
        // the amp = 0 case of this one". That is a true statement about mh_body and a FALSE one about those
        // species. Read off their own mh_shape calls:
        //
        //     still   0.018 + 0.006 * breath(t, 4.2),  gain 1.12
        //     limn    0.020,                            gain 1.05
        //     comet   0.024,                            gain 1.30
        //     opal    0.022 + 0.008 * breath(t, 7.4),   gain 1.22
        //     abyss   0.019 + 0.006 * breath(t, 14.1),  gain 1.14
        //     droplet wob (0.052 .. 0.092),             gain 3.30
        //
        // Measured over 2,000 directions, the deformed radius strays 3.06% of the radius on still, 3.40% on
        // limn and 4.08% on comet -- about half a pixel at 48 px, and MOVING, because the three axes turn on
        // periods of 76, 103 and 134 seconds. Small, real, and not zero. A sphere is not the amp = 0 case of
        // a body whose amp is 0.018; it is a different body.
        //
        // So there is ONE path now. droplet is no longer special-cased: it differs from the others in the
        // NUMBERS it passes, which is exactly how murmur's own eighteen differ from each other.
        const dN = vec3(0.0, 0.0, 1.0).toVar();
        const dP = vec3(0.0, 0.0, 0.0).toVar();
        // droplet alone scales the whole body with the breath -- its swell is the species, and the others
        // breathe only through their amplitude.
        const swell = species === "droplet"
            ? float(0.22).add(KIT.mhBreath(uniforms.time, float(0.9)).mul(0.78)).mul(uniforms.voice).toVar()
            : float(0.0).toVar();
        const bodyScale = float(1.0).add(swell.mul(species === "droplet" ? 0.050 : 0.0)).toVar();
        // Tension runs BACKWARDS through droplet's amplitude on purpose, "because that is what tension IS".
        // The five non-droplet shapes come from the kit's own table, so the gate can assert them against
        // murmur's roster instead of against a copy of this file.
        const SH = MH_SHAPE[species] || MH_SHAPE.still;
        const shapeAmp = species === "droplet"
            ? float(0.052).add(uniforms.wobble.mul(0.040))
                .mul(float(1.0).sub(uniforms.tension.mul(0.22)))
                .mul(float(1.0).add(swell.mul(0.30))).toVar()
            : (SH[1] === 0 ? float(SH[0]).toVar()
                           : float(SH[0]).add(KIT.mhBreath(uniforms.time, float(SH[2])).mul(SH[1])).toVar());
        const shapeGain = float(species === "droplet" ? MH_DROPLET_GAIN : SH[3]);
        // uv in murmur's own units: this file's quad is -1..1 with the body at R_BODY, murmur's is uv with
        // the body at MH_R, so the ratio carries one space into the other.
        const uvM = pc.mul(KIT.MH_R / R_BODY).div(bodyScale).toVar();
        const bodyV = KIT.mhBody(uvM, uniforms.time, float(0.004), shapeAmp, float(0.0), shapeGain,
                                 vec3(0.0, 0.0, 1.0), float(0.0), float(0.0), dP, dN).toVar();
        const N = dN, fres = bodyV.w, bodyMask = bodyV.x, bodyRd = bodyV.y, bodyRho = bodyV.z;
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
        // The entry point comes from the solve for every species now, not just droplet.
        const P = dP;
        const L = KIT.mhExit(P, rd).toVar();

        // THE MARCH STEP AND THE SIZE DIAL ARE SHARED, and they moved up here when the blocks became
        // closures: both were defined inside still's stretch and read by every other hero, which block scope
        // turned into a ReferenceError the moment the wrapping landed. Their own comment already said so --
        // "THE SIZE DIAL, once, for every species" -- so this is the file catching up with what it knew.
        const ds = L.div(MH_TAPS).toVar();
        const smallK = KIT.mhSmall(float(120.0), float(120.0)).toVar();

        // *** EACH SPECIES' BLOCK IS A CLOSURE NOW, AND ONLY THE SELECTED ONE IS CALLED. ***
        // Until v4635 every block below ran for every species: still's compiled shader carried abyss's
        // three-lane march, opal's four flashes, droplet's solve and both mist marches, and only the
        // `density` and `hueRaw` selectors at the bottom picked one. MEASURED at v4634, when nebula and
        // tempest arrived: they cost tools/ship/murmurSpecies-selfcheck.mjs a PAIRED 213, 288 and 213 ms
        // over three interleaved runs -- a gate that renders NEITHER of them -- and left it at 2,834 ms
        // against a 3,000 ms budget with TEN species still to port. The tax was about 122 ms per species
        // per gate, on every gate, forever.
        //
        // `species` is a build-time JS constant, so this is plain control flow and not a shader branch.
        // What each closure returns is the contract the two selectors at the bottom read: a density node,
        // and whatever energy and hue terms that hero's own hue rail needs.
        const buildStill = () => {
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
        return { density: stillDensity, acc, accH };
        };

        const buildLimn = () => {
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
        return { density: limnDensity, tailShare, rimE };
        };

        const buildComet = () => {
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
        return { density: cometDensity, accC, accHC };
        };

        const buildDroplet = () => {
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
        return { density: dropletDensity, accD, accHD };
        };

        const buildOpal = () => {
        // =====================================================================================================
        // *** OPAL -- THE FIFTH SPECIES. "Internal play-of-colour: soft flashes drifting through the volume." ***
        //
        // NO STROBE, EVER, and opal.ts says that is the constraint the whole species is built around: play-of-
        // colour in a real opal "is not a flicker; it is a slow shifting of where the light is coming from as
        // the stone turns, and the eye reads it as depth rather than as an event". So every flash is BORN AND
        // ABSORBED SLOWLY -- four lives on periods of 14.3, 17.1, 19.6 and 22.4 seconds, mutually
        // incommensurate and phase-offset so no two ever arrive together, each a sin SQUARED for flat ends and
        // each with a FLOOR of 0.16 rather than a zero, "so a flash at its dimmest is still faintly present
        // and there is no moment of switching on".
        //
        // FOUR FLASHES, SOLVED AT CLOSEST APPROACH rather than marched -- the same argument comet's head and
        // droplet's heart won: "they are compact bodies, so five marched samples would draw the shape of the
        // sampling; two dot products each draws the shape of the flash".
        //
        // *** AND THIS IS THE SPECIES THE SPREAD AXIS WAS WIRED FOR. *** It carries the roster's highest
        // default (0.7) and the one internal multiplier above the family cap, 1.30, which opal.ts justifies
        // directly: the four flashes sit at four points across the spread, two either side of the anchor, and
        // the multiplier "takes the extremes to about thirty-seven degrees of OKLAB hue at spread 1: still
        // one hue family by the rail's own definition, and the widest this collection ever goes".
        const opalDrift = float(0.055).add(uniforms.drift.mul(0.075)).toVar();
        const opalRad = float(0.135).add(uniforms.softness.mul(0.095))
            .mul(mix(float(1.0), float(1.70), smallK)).mul(float(1.0).add(uniforms.voice.mul(0.30))).toVar();
        const opalBright = float(0.82).add(uniforms.flashes.mul(0.55)).mul(float(1.0).add(uniforms.voice.mul(0.85))).toVar();
        // Two of the four crossfade away at the small mounts: "four soft blobs in a thirteen-point bead is a
        // texture and two is a composition".
        const pairB = float(1.0).sub(smoothstep(float(0.30), float(0.72), smallK)).toVar();
        const spreadAmt = clamp(uniforms.spread, 0.0, 1.0).mul(KIT.MH_SPREAD).mul(1.30).toVar();
        const flO = KIT.mhFlourish(uniforms.time, float(13.0), float(10.6)).toVar();
        const flashE = float(0.0).toVar();
        const flashH = float(0.0).toVar();
        for (let k = 0; k < 4; k++) {
            const w = k < 2 ? float(1.0) : pairB;
            const fk = k;
            // THE LIFE comes from the kit, where the CPU twin can grade it. sin squared for flat ends, on a
            // floor of 0.16 so nothing ever switches on.
            const life = KIT.mhOpalLife(float(fk), uniforms.time).toVar();
            // THE WANDER: three incommensurate rates per flash, so each traces its own slow closed-ish path.
            const c = vec3(sin(opalDrift.mul(uniforms.time).mul(0.83 + 0.11 * fk).add(fk * 2.1)).mul(0.44),
                           sin(opalDrift.mul(uniforms.time).mul(0.67 + 0.13 * fk).add(fk * 3.7 + 1.1)).mul(0.40),
                           sin(opalDrift.mul(uniforms.time).mul(0.95 + 0.09 * fk).add(fk * 1.3 + 2.6)).mul(0.42)).toVar();
            const rk = opalRad.mul(0.80 + 0.30 * ((fk * 0.37 + 0.21) % 1))
                .mul(k === 0 ? float(1.0).add(flO.x.mul(0.35)) : float(1.0)).toVar();
            const to = c.sub(P).toVar();
            const sO = dot(to, rd).toVar();
            const argO = max(dot(to, to).sub(sO.mul(sO)), 0.0).div(max(rk.mul(rk), float(1e-6))).toVar();
            const visO = KIT.mhInside(P.add(rd.mul(sO))).mul(exp(sO.mul(-MH_EXT))).toVar();
            // The scatter carries most of the light: "a flash in an opal is the glow it throws into the stone
            // more than it is its own centre".
            const eO = select(sO.greaterThan(0.0).and(sO.lessThan(L)),
                exp(negate(argO)).mul(0.55).add(KIT.mhScatter(argO, float(0.46)))
                    .mul(visO).mul(life).mul(opalBright).mul(w), float(0.0)).toVar();
            flashE.addAssign(eO);
            flashH.addAssign(eO.mul((fk - 1.5) / 1.5));   // the four hues, two either side of the anchor
        }
        const accO = float(0.0).toVar();
        const transO = float(1.0).toVar();
        const medO = mix(float(0.060), float(0.032), smallK).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const pO = P.add(rd.mul(float(i).add(0.5).mul(ds)));
            const eM = KIT.mhMedium(pO, uniforms.time, float(2.1)).mul(medO).mul(KIT.mhInside(pO)).toVar();
            accO.addAssign(eM.mul(transO).mul(ds));
            transO.assign(transO.mul(exp(eM.mul(2.0).add(MH_EXT).mul(ds).negate())));
        });
        const opalDensity = accO.mul(3.40).add(flashE).mul(uniforms.depth);
        return { density: opalDensity, flashE, flashH, spreadAmt };
        };

        const buildAbyss = () => {
        // =====================================================================================================
        // *** ABYSS -- THE SIXTH SPECIES. "Deep-sea dark glass: rare glows passing through, mostly night." ***
        //
        // THE PATIENCE PIECE, and abyss.ts argues for its place in a set of eighteen: "it is the only hero
        // whose default state is genuinely almost nothing happening. Still is quiet; this one is dark ... at
        // the default rarity a creature passes roughly every twenty seconds, and between them there is a dark
        // bead with an edge. Nothing else in this collection asks the viewer to wait, and a set of eighteen
        // presences needs one that does."
        //
        // RARITY IS THE SLOT LENGTH and it runs the intuitive way -- high is rarer. Three lanes on long,
        // independently jittered clocks (31, 37 and 41 against slot multipliers of 1, 1.37 and 1.81), so the
        // gaps are never equal and two creatures overlap only occasionally.
        //
        // A CREATURE IS A PASSAGE, NOT AN APPEARANCE: it enters one side of the volume and leaves by the
        // other over the whole life of its gesture, on a line hashed per pass, "so what the eye sees is
        // something crossing rather than something switching on in place".
        //
        // AND IT CARRIES THE COLLECTION'S HIGHEST RIM, 1.70, which abyss.ts argues for against its own first
        // try: a rim term "peaks around a third of its coefficient once the fresnel and the membership have
        // taken their share -- so at 0.92 the silhouette was genuinely almost invisible and the species read
        // as an empty cell rather than as a dark one". Its catchlight comes DOWN to 0.38 for the mirror
        // reason: at 0.62 "there was a bright point sitting on the shell in every single frame, including the
        // long dark stretches this species exists for".
        const abyssBase = KIT.mhAbyssSlot(uniforms.rarity, uniforms.voice, smallK).toVar();
        const thirdC = float(1.0).sub(smoothstep(float(0.30), float(0.72), smallK)).toVar();
        const abyssRad = float(0.155).add(uniforms.creatures.mul(0.075)).mul(mix(float(1.0), float(1.80), smallK)).toVar();
        const abyssBright = float(0.85).add(uniforms.creatures.mul(0.75))
            .mul(float(1.0).add(uniforms.voice.mul(0.95))).mul(mix(float(1.0), float(1.45), smallK)).toVar();
        const abyssReach = float(0.62).add(uniforms.drift.mul(0.30)).toVar();
        const glowE = float(0.0).toVar();
        const glowH = float(0.0).toVar();
        for (let k = 0; k < 3; k++) {
            const seed = [31.0, 37.0, 41.0][k], slot = [1.0, 1.37, 1.81][k];
            const f = KIT.mhFlourish(uniforms.time, float(seed), abyssBase.mul(slot)).toVar();
            const wk = k < 2 ? float(1.0) : thirdC;
            const fk = k;
            const ga = f.z.mul(6.2831853).add(fk * 1.7).toVar();
            const dirA = normalize(vec3(cos(ga), sin(ga.mul(1.6).add(fk)).mul(0.40), sin(ga.mul(0.8).add(1.3)))).toVar();
            const sideA = normalize(TSL.cross(dirA, vec3(0.08, 1.0, 0.14))).toVar();
            const gp = sideA.mul(f.z.mul(2.0).sub(1.0).mul(0.42))
                .add(dirA.mul(mix(abyssReach.negate(), abyssReach, smoothstep(float(0.0), float(1.0), f.y)))).toVar();
            const toA = gp.sub(P).toVar();
            const sA = dot(toA, rd).toVar();
            const argA = max(dot(toA, toA).sub(sA.mul(sA)), 0.0).div(max(abyssRad.mul(abyssRad), float(1e-6))).toVar();
            const visA = KIT.mhInside(P.add(rd.mul(sA))).mul(exp(sA.mul(-MH_EXT))).toVar();
            // Mostly scatter: "a glow in deep water is the water it lights".
            const eA = select(sA.greaterThan(0.0).and(sA.lessThan(L)).and(f.x.greaterThan(0.002)),
                exp(negate(argA)).mul(0.45).add(KIT.mhScatter(argA, float(0.52)))
                    .mul(visA).mul(f.x).mul(abyssBright).mul(wk), float(0.0)).toVar();
            glowE.addAssign(eA);
            glowH.addAssign(eA.mul(fk - 1.0));
        }
        // NIGHT: the floor is a third of what the quietest luminous hero carries -- "enough that the far wall
        // exists, not enough to be a colour".
        const accA = float(0.0).toVar();
        const transA = float(1.0).toVar();
        const medA = mix(float(0.022), float(0.014), smallK).mul(float(1.0).add(uniforms.voice.mul(0.60))).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const pA = P.add(rd.mul(float(i).add(0.5).mul(ds)));
            const eM = KIT.mhMedium(pA, uniforms.time, float(1.9)).mul(medA).mul(KIT.mhInside(pA)).toVar();
            accA.addAssign(eM.mul(transA).mul(ds));
            transA.assign(transA.mul(exp(eM.mul(2.0).add(MH_EXT).mul(ds).negate())));
        });
        const abyssDensity = accA.mul(3.20).add(glowE).mul(uniforms.depth);
        return { density: abyssDensity, glowE, glowH };
        };

        const buildMist = () => {
        // =====================================================================================================
        // *** NEBULA AND TEMPEST -- THE SEVENTH AND EIGHTH, AND THE ONLY TWO OF THE EIGHTEEN WITH NO OBJECT
        // INSIDE THE GLASS AT ALL. *** nebula.ts: "EVERY OTHER HERO PUTS SOMETHING INSIDE THE BODY and lets
        // the medium carry it. This one deletes the something. The mist IS the species." They are also the
        // only two that never call mh_medium -- checked across all eighteen source files -- because the
        // density field IS the subject rather than the thing a subject sits in.
        //
        // tempest.ts names the pairing itself: "NEBULA'S SIBLING AND ITS OPPOSITE TEMPERAMENT. Both are
        // domain-warped mist and everything else about them differs. Nebula is lit evenly from within and
        // its business is DEPTH. This one is lit from INSIDE ITS OWN FLASHES, its density runs harder so the
        // cloud has real dark in it, and its business is ENERGY."
        //
        // ONE PATH, TWO SETS OF NUMBERS, which is how murmur's own two files are written: the march below is
        // structurally identical and every constant that differs is read from the table beside it. The
        // difference that matters most is the density curve -- nebula smoothsteps the noise over
        // (-0.20, 0.30) and tempest over (-0.12, 0.46), so tempest's lower edge sits further up and the
        // cloud gets REAL HOLES for its lightning to be seen against.
        //
        // THE FOLD IS A DOMAIN WARP: one noise displaces the coordinates the second is read at. TWO noise
        // samples per tap, which nebula.ts calls "the entire budget this species gets and the reason it can
        // afford to be the only hero with real turbulence".
        // THE NUMBERS COME FROM THE KIT'S OWN TABLE, not from constants typed here: see MH_MIST in
        // render/murmurKit.mjs for why, and tools/ship/murmurKit-selfcheck.mjs for the rows that grade it.
        // *** THE FALLBACK IS NOT COSMETIC AND THE HARNESS FOUND OUT WHY. *** Every species' block in this
        // file is BUILT for every species and selected at the end -- still's shader carries abyss's march and
        // opal's too -- so this block runs its constructor for all eight. Before v4634 it read a ternary,
        // which always produced an object; a bare MH_MIST[species] lookup is undefined for the six that are
        // not mist, and `MIST.scale` then threw inside the TSL builder. three.js CATCHES that, console.errors
        // it and substitutes a node generating zero, so the render "succeeds" and returns black -- which is
        // why tools/ship/webgpuHarness.mjs was taught at v4627 to FAIL on page errors. It did: four gates
        // went red at once with the file and line. The six non-mist species never SELECT mistDensity, so
        // which table they build against cannot reach a pixel.
        const MIST = MH_MIST[species] || MH_MIST.nebula;
        const densityK = clamp(uniforms.density, 0.0, 1.0).toVar();
        const foldK = clamp(uniforms.fold, 0.0, 1.0).toVar();
        const glintK = clamp(uniforms.glint, 0.0, 1.0).toVar();
        // `energy` is tempest's own term and tempest.ts calls it "the deepest reading of cadence in the
        // collection": it raises the churn, quickens the weather AND shortens both flicker slots at once.
        // This port has no state machine (mh_state/mh_live are not ported and the port runs as idle), so the
        // only live input it can honour is voice -- which is named here rather than quietly dropped.
        const energy = species === "tempest" ? clamp(uniforms.voice.mul(0.85), 0.0, 1.6).toVar() : float(0.0).toVar();
        const mScale = float(MIST.scale).mul(mix(float(1.0), float(MIST.small), smallK)).toVar();
        const mWarp = float(MIST.warp).mul(mix(float(1.0), float(0.60), smallK)).toVar();
        const mFold = float(MIST.foldB).add(foldK.mul(MIST.foldK)).mul(float(1.0).add(energy.mul(0.85)))
            .mul(mix(float(1.0), float(0.55), smallK)).toVar();
        const mDr = KIT.mhDrift(uniforms.time, float(MIST.drB).add(foldK.mul(MIST.drK)), float(0.45), float(MIST.drLane))
            .mul(float(1.0).add(energy.mul(0.95)).add(uniforms.voice.mul(0.35))).toVar();
        const mAbsorb = float(MIST.absorb).mul(float(0.55).add(densityK.mul(0.85))).toVar();
        const mEmit = float(MIST.emitB).add(densityK.mul(MIST.emitK)).toVar();

        // THE BURIED GESTURE. nebula gets ONE glint on a 7.2 s slot and no depth mask; tempest gets TWO
        // lightning lanes on 2.9 and 4.3 s slots that "interleave without ever landing together", each
        // depth-MASKED to the inner two thirds. That mask is the species' one inviolable rule.
        const mistRate = float(1.0).div(float(1.0).add(energy.mul(1.30))).toVar();
        const flA = species === "tempest"
            ? KIT.mhFlourish(uniforms.time, float(MH_TEMPEST_BOLT.lanes[0].seed),
                             float(MH_TEMPEST_BOLT.lanes[0].slot).mul(mistRate)).toVar()
            : KIT.mhFlourish(uniforms.time, float(3.0), float(7.2)).toVar();
        const flB = KIT.mhFlourish(uniforms.time, float(MH_TEMPEST_BOLT.lanes[1].seed),
                                   float(MH_TEMPEST_BOLT.lanes[1].slot).mul(mistRate)).toVar();
        const gAng = flA.z.mul(6.2831853).toVar();
        const gPosA = species === "tempest"
            ? vec3(cos(flA.z.mul(6.283)), sin(flA.z.mul(9.1).add(1.1)).mul(0.75), sin(flA.z.mul(5.3).add(2.7))).mul(0.40).toVar()
            : vec3(cos(gAng), sin(gAng.mul(1.7).add(1.1)).mul(0.72), sin(gAng.mul(0.9).add(2.7))).mul(0.46)
                .add(vec3(0.0, -0.16, 0.06).mul(flA.y)).toVar();
        const gPosB = vec3(cos(flB.z.mul(7.7).add(2.2)), sin(flB.z.mul(6.4).add(3.9)).mul(0.75),
                           sin(flB.z.mul(8.8).add(0.4))).mul(0.40).toVar();
        const gW = species === "tempest"
            ? float(0.150).add(glintK.mul(0.070)).mul(mix(float(1.0), float(1.65), smallK)).toVar()
            : float(0.130).add(glintK.mul(0.045)).mul(mix(float(1.0), float(1.65), smallK)).toVar();
        const gAmp = species === "tempest"
            ? float(0.85).add(glintK.mul(2.80)).mul(float(1.0).add(energy.mul(0.45))).toVar()
            : flA.x.mul(float(0.55).add(glintK.mul(1.35))).mul(mix(float(1.0), float(1.55), smallK)).toVar();

        const accM = float(0.0).toVar();
        const accMH = float(0.0).toVar();
        const transM = float(1.0).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const pM = P.add(rd.mul(float(i).add(0.5).mul(ds))).toVar();
            const fade = KIT.mhInside(pM).toVar();
            // THE FOLD: one noise displaces the coordinates the next is read at.
            const w = KIT.mhNoise3(pM.mul(mWarp).add(vec3(0.0, mDr.mul(0.70), mDr))).toVar();
            const q = pM.mul(mScale)
                .add(w.mul(mFold).mul(species === "tempest" ? vec3(0.90, -0.62, 0.68) : vec3(0.92, -0.58, 0.71)))
                .add(vec3(0.0, 0.0, mDr)).toVar();
            const nz = KIT.mhNoise3(q).toVar();
            const dens = smoothstep(float(MIST.dLo), float(MIST.dHi), nz).mul(fade).toVar();
            // LIT FROM WITHIN: emission rises toward the middle of the body and absorption does not, so the
            // dark parts are dark "because something is IN FRONT, not because nothing is there".
            const rp = length(pM).toVar();
            const glowIn = float(MIST.gLo).add(float(1.0).sub(smoothstep(float(0.0), float(MIST.gFar), rp)).mul(MIST.gK)).toVar();
            const eM = dens.mul(glowIn).mul(mEmit).mul(float(1.0).add(uniforms.voice.mul(MIST.voiceE))).toVar();
            if (species === "tempest") {
                // THE DEPTH MASK, which is why the flickers never reach the surface. Outside 0.62 of the
                // radius it is exactly zero, so no flash can light the shell however bright it is.
                const deep = float(1.0).sub(smoothstep(float(MH_TEMPEST_BOLT.maskIn),
                                                       float(MH_TEMPEST_BOLT.maskOut), rp)).toVar();
                const d0 = pM.sub(gPosA).div(max(gW, float(1e-3))).toVar();
                const d1 = pM.sub(gPosB).div(max(gW, float(1e-3))).toVar();
                const a0 = dot(d0, d0).toVar(), a1 = dot(d1, d1).toVar();
                // MOSTLY SCATTER, "much more of it than any other hero's: a flash inside a cloud is seen
                // almost entirely as the cloud lighting up, not as the flash".
                const bolt = flA.x.mul(exp(negate(a0)).mul(0.42).add(KIT.mhScatter(a0, float(0.62))))
                    .add(flB.x.mul(exp(negate(a1)).mul(0.42).add(KIT.mhScatter(a1, float(0.62))))).toVar();
                // Weighted by the LOCAL DENSITY: lightning lights the cloud, so it is brightest where there
                // is something for it to light.
                eM.addAssign(bolt.mul(gAmp).mul(deep).mul(float(0.30).add(dens.mul(0.85))));
            } else {
                const dg = pM.sub(gPosA).div(max(gW, float(1e-3))).toVar();
                const garg = dot(dg, dg).toVar();
                eM.addAssign(gAmp.mul(exp(negate(garg)).mul(0.75).add(KIT.mhScatter(garg, float(0.22)))));
            }
            accM.addAssign(eM.mul(transM).mul(ds));
            // DEPTH CARRIES THE SPREAD: the near folds one way, the deep glow the other, "so the cloud has
            // two hues in conversation through its thickness". Same channel still and droplet use.
            accMH.addAssign(eM.mul(clamp(pM.z, -1.0, 1.0)).mul(transM).mul(ds));
            // *** THE LINE OF ARITHMETIC. *** nebula.ts: "NEARER FOLDS OCCLUDE FARTHER GLOW, and that
            // sentence is a coefficient of 3.1." tempest runs it at 3.6, which is what gives it real dark.
            transM.assign(transM.mul(exp(mAbsorb.mul(dens).add(MH_EXT).mul(ds).negate())));
        });
        const mistDensity = accM.mul(MIST.gain).mul(uniforms.depth);
        return { density: mistDensity, accM, accMH };
        };

        // =====================================================================================================
        // *** FATHOM -- THE NINTH. "Layered translucent depths: nested shells, seen through each other." ***
        //
        // NOT MIST, AND THAT IS THE WHOLE DISTINCTION FROM NEBULA, which fathom.ts draws itself: "Nebula's
        // answer to depth is a cloud whose near folds silhouette against its own glow -- volume without any
        // surface in it. This species goes the other way: three legible SURFACES at three radii ... What the
        // eye gets from a cloud is atmosphere; what it gets from nested shells is measurement."
        //
        // THE SHELLS ARE SOLVED, NOT MARCHED: each crossing is one quadratic against a sphere, and "a ray
        // that enters the body crosses every shell it reaches exactly twice".
        //
        // *** AND THEY SORT THEMSELVES, WHICH IS WHY THERE IS NO SORT. *** A ray from outside meets the
        // biggest shell first, then the middle, then the smallest, then the smallest again on the way out,
        // then the middle, then the biggest. Outer-in, inner-out. The order is known in advance and cannot
        // vary, so the six contributions are simply written in that sequence and the transmittance is right.
        //
        // *** AND IT IS WORTH ONE LEAST-SIGNIFICANT BIT, WHICH IS NOT WHAT THE PARAGRAPH ABOVE SOUNDS LIKE.
        // *** Reversing MH_FATHOM.order and re-rendering 27 fathom frames -- three murks by three voices by
        // three times -- moves 361 bytes of 248,832 (0.145%), every one of them by exactly 1 of 255. The
        // reason is in the algebra: a shell contributes en * trS and then attenuates trS by exp(-absorb*en),
        // which for small en is 1 - absorb*en, so the composite is (sum of en) minus absorb times the sum of
        // en_i * en_j over pairs -- and a pair sum is SYMMETRIC, so order cannot reach it. The first term
        // that can tell the orders apart is third-order in quantities already under 0.1. The sequence stays
        // as written because it is what the geometry gives and because higher absorption would make it
        // matter; the claim that it is doing visible work here is retracted, and tools/ship/
        // murmurSpecies6-selfcheck.mjs declines to grade it for exactly that reason.
        const buildFathom = () => {
            const FA = MH_FATHOM;
            const layersK = clamp(uniforms.layers, 0.0, 1.0).toVar();
            const parallaxK = clamp(uniforms.parallax, 0.0, 1.0).toVar();
            const murkK = clamp(uniforms.murk, 0.0, 1.0).toVar();
            const flF = KIT.mhFlourish(uniforms.time, float(9.0), float(9.4)).toVar();
            const keyF = KIT.mhKey(uniforms.time).toVar();
            // Voice and the gesture push the shells APART -- "not brighter, deeper".
            const spanK = float(1.0).add(uniforms.voice.mul(0.22)).add(flF.x.mul(0.16)).toVar();
            const third = float(1.0).sub(smoothstep(float(0.28), float(0.68), smallK)).toVar();
            const thick = float(FA.thickB).add(layersK.mul(FA.thickK)).mul(mix(float(1.0), float(1.90), smallK)).toVar();
            const foldAmp = float(FA.foldB).add(parallaxK.mul(FA.foldK))
                .mul(float(1.0).add(uniforms.voice.mul(0.55))).mul(mix(float(1.0), float(0.50), smallK)).toVar();
            const bq = dot(P, rd).toVar();
            const PP = dot(P, P).toVar();
            // THE FOLD HAS TO MOVE THE OUTLINE, or three shells come out as three perfect concentric circles
            // -- "a target, not a set of folded surfaces". The radius is folded per pixel in the pixel's own
            // IN-PLANE direction, which is exactly the direction of the shell's limb there: an approximation
            // away from the limb and exact AT it, which is the right place for the error to be.
            const limbDir = normalize(vec3(P.x, P.y, 0.02).add(1e-5)).toVar();
            const ANG = FA.shells.map((sh) =>
                KIT.mhDrift(uniforms.time, float(sh.rate), float(sh.wob), float(sh.lane)).toVar());
            const AX = ANG.map((a) => normalize(vec3(cos(a), 0.42, sin(a))).toVar());
            const R0 = min(float(FA.shells[0].base).add(layersK.mul(FA.shells[0].rk)).mul(spanK), float(FA.rCap)).toVar();
            const RAD = FA.shells.map((sh, k) => k === 0 ? R0
                : float(sh.base).add(layersK.mul(sh.rk)).mul(spanK).toVar());
            const WGT = FA.shells.map((sh, k) => k === 2 ? float(sh.w).mul(third).toVar() : float(sh.w).toVar());
            const foldOf = (dir, k) => float(0.62).mul(sin(dot(dir, AX[k]).mul(2.30).add(ANG[k].mul(1.7))))
                .add(float(0.38).mul(sin(dot(dir, vec3(AX[k].z, AX[k].x, AX[k].y)).mul(3.70)
                    .sub(ANG[k].mul(1.1)).add(2.1))));
            // Per-shell crossing data: the ray distance, the energy, and the crossing's own outward z, which
            // is all the hue rail needs of the direction.
            const sHit = [], eHit = [], zHit = [];
            for (let k = 0; k < 3; k++) {
                const R = RAD[k];
                const RK = R.add(foldAmp.mul(R.div(max(R0, float(1e-3)))).mul(foldOf(limbDir, k))).toVar();
                const disc = bq.mul(bq).sub(PP).add(RK.mul(RK)).toVar();
                const sq = sqrt(max(disc, float(0.0))).toVar();
                for (let h = 0; h < 2; h++) {
                    const sc = (h === 0 ? bq.negate().sub(sq) : bq.negate().add(sq)).toVar();
                    const live = disc.greaterThan(0.0).and(sc.greaterThan(0.0)).and(sc.lessThan(L));
                    const pt = P.add(rd.mul(sc)).toVar();
                    const dir = normalize(pt.add(1e-5)).toVar();
                    const g = dot(dir, rd).toVar();
                    // GRAZING CROSSINGS GLOW, and this is the effect that sells translucency: the material a
                    // ray meets crossing a thin shell is its thickness over the COSINE of the angle to the
                    // surface, so a crossing near the limb passes through several times as much skin. Free --
                    // the cosine is a dot product the crossing already computed -- and floored at 0.26 so the
                    // amplification cannot diverge.
                    const graze = thick.div(max(abs(g), float(FA.grazeFloor))).toVar();
                    const lit = float(FA.litB).add(clamp(dot(dir, keyF), 0.0, 1.0).mul(FA.litK)).toVar();
                    const en = graze.mul(float(FA.eB).add(foldOf(dir, k).mul(0.5).add(0.5).mul(FA.eK)))
                        .mul(lit).mul(WGT[k]).toVar();
                    sHit.push(sc); eHit.push(select(live, en, float(0.0)).toVar()); zHit.push(dir.z);
                }
            }
            // THE MURK BETWEEN THE SHELLS, marched: it is a medium, not a surface.
            const medAmt = float(FA.medB).add(murkK.mul(FA.medK)).mul(mix(float(1.0), float(0.70), smallK)).toVar();
            const accF = float(0.0).toVar();
            const transF = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pF = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eF = KIT.mhMedium(pF, uniforms.time, float(2.0)).mul(medAmt).mul(KIT.mhInside(pF)).toVar();
                accF.addAssign(eF.mul(transF).mul(ds));
                transF.assign(transF.mul(exp(eF.mul(FA.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            // THE SHELLS, FRONT TO BACK, IN THE ORDER GEOMETRY GUARANTEES. A crossing that did not happen
            // carries zero energy, so it contributes nothing AND leaves the transmittance untouched --
            // exp(0) is 1 -- which is how a `continue` is written when there are no branches.
            const shellE = float(0.0).toVar(), shellH = float(0.0).toVar();
            const trS = float(1.0).toVar();
            const absorbF = float(FA.absorbB).add(murkK.mul(FA.absorbK)).toVar();
            FA.order.forEach((k, i) => {
                const idx = k * 2 + (i < 3 ? 0 : 1);
                const en = eHit[idx].mul(exp(sHit[idx].mul(-MH_EXT))).toVar();
                shellE.addAssign(en.mul(trS));
                // DEPTH CARRIES THE HUE: the near faces one way, the far the other, "so the layers are told
                // apart by colour as well as by brightness".
                shellH.addAssign(en.mul(trS).mul(clamp(zHit[idx], -1.0, 1.0)));
                trS.assign(trS.mul(exp(absorbF.mul(en).negate())));
            });
            const fathomDensity = shellE.mul(FA.shellGain).add(accF.mul(FA.murkGain)).mul(uniforms.depth);
            return { density: fathomDensity, shellE, shellH };
        };

        // =====================================================================================================
        // *** GEODE -- THE TENTH. "A cut crystal inside the glass, catching light face by face." ***
        //
        // *** ITS OWN FILE OPENS BY REJECTING ITS FIRST BUILD, AND THE REASON IS ONE THIS PORT HAS NOW MET
        // THREE TIMES. *** geode.ts: "A FACET IS A PLANE, AND THE FIRST BUILD'S WASN'T. It partitioned the
        // volume by which of six DIRECTIONS a point was most aligned with ... the partition was then
        // integrated along the view ray, and integrating a hard-edged structure through five samples averages
        // exactly the angularity that was the point." comet's head fell between the taps; droplet's heart was
        // solved for the same reason; this is the third.
        //
        // SO THE CRYSTAL IS A REAL CONVEX SOLID, INTERSECTED. Four axes make eight planes -- a slab per axis,
        // with different offsets on the two sides so the gem is irregular rather than a symmetric octahedron
        // -- and the ray is tested by the slab method: the entry is the LAST plane the ray crosses going in,
        // the exit the FIRST it crosses coming out, and the solid is hit when the entry precedes the exit.
        //
        // AND THE ENTRY PLANE IS THE FACE YOU ARE LOOKING AT, which is the whole species: its normal shades
        // it against the key, so as the solid turns, faces come up bright one at a time and roll away into
        // near-darkness. Nothing animates that; the rotation does all of it.
        const buildGeode = () => {
            const GE = MH_GEODE;
            const facetK = clamp(uniforms.facet, 0.0, 1.0).toVar();
            const glimK = clamp(uniforms.glim, 0.0, 1.0).toVar();
            const stoneK = clamp(uniforms.stone, 0.0, 1.0).toVar();
            const flG = KIT.mhFlourish(uniforms.time, float(19.0), float(10.2)).toVar();
            const ayG = KIT.mhDrift(uniforms.time, float(GE.spinRate), float(GE.spinWob), float(GE.spinLane)).toVar();
            const axG = float(0.34).add(sin(uniforms.time.mul(0.041)).mul(0.22)).toVar();
            // THE RAY, IN THE STONE'S FRAME. Rotating the ray IN is one transform; rotating the eight planes
            // OUT would be eight.
            const Pc = KIT.mhSpin(P, ayG, axG).toVar();
            const Rc = KIT.mhSpin(rd, ayG, axG).toVar();
            // The stone has to sit INSIDE the glass with room around it: at 0.56 it reached the shell and the
            // containment cut its corners off, "and a crystal whose silhouette is decided by something other
            // than its own planes has stopped being a crystal".
            const gScale = float(GE.scaleB).add(stoneK.mul(GE.scaleK)).mul(mix(float(1.0), float(1.20), smallK)).toVar();
            const fourth = float(1.0).sub(smoothstep(float(0.24), float(0.66), smallK)).toVar();
            const o4 = mix(float(GE.o4), float(GE.o4Small), fourth).toVar();
            const tIn = float(-1e9).toVar(), tIn2 = float(-1e9).toVar(), tOut = float(1e9).toVar();
            const fN = vec3(0.0, 0.0, 1.0).toVar(), fN2 = vec3(0.0, 0.0, 1.0).toVar();
            for (let k = 0; k < 4; k++) {
                const A = vec3(...GE.axes[k]).normalize().toVar();
                const dpK = (k < 3 ? float(GE.dp[k]).mul(gScale) : o4.mul(gScale)).toVar();
                const dmK = (k < 3 ? float(GE.dm[k]).mul(gScale) : o4.mul(GE.o4m).mul(gScale)).toVar();
                const na = dot(A, Rc).toVar();
                const pa = dot(A, Pc).toVar();
                // A ray PARALLEL to a slab is not a division: it is either inside the slab forever or outside
                // it forever, so the divisor is made safe and the answer is selected rather than computed.
                const deg = abs(na).lessThan(1e-5);
                const naS = select(deg, float(1.0), na).toVar();
                const t1 = dpK.sub(pa).div(naS).toVar();
                const t2 = dmK.negate().sub(pa).div(naS).toVar();
                const outside = pa.greaterThan(dpK).or(pa.lessThan(dmK.negate()));
                const tn = select(deg, select(outside, float(1e9), float(-1e9)), min(t1, t2)).toVar();
                const tf = select(deg, select(outside, float(-1e9), float(1e9)), max(t1, t2)).toVar();
                const nIn = select(t1.lessThan(t2), A, A.negate()).toVar();
                // The LAST plane in, and the runner-up beside it -- both read from the OLD values before
                // either is written, which is what keeps the two-deep ranking correct without a sort.
                const better = tn.greaterThan(tIn);
                const second = tn.greaterThan(tIn2);
                const nextIn2 = select(better, tIn, select(second, tn, tIn2)).toVar();
                const nextN2 = select(better, fN, select(second, nIn, fN2)).toVar();
                const nextIn = select(better, tn, tIn).toVar();
                const nextN = select(better, nIn, fN).toVar();
                tIn2.assign(nextIn2); fN2.assign(nextN2); tIn.assign(nextIn); fN.assign(nextN);
                tOut.assign(min(tOut, tf));
            }
            const sEnter = max(tIn, float(0.0)).toVar();
            const chord = min(tOut, L).sub(sEnter).toVar();
            const hit = chord.greaterThan(0.0).and(sEnter.lessThan(L));
            // THE EDGE, AND IT IS SOFT-EDGED WITHOUT BEING BLURRED. Two entry planes nearly equally last
            // means the ray is arriving at an EDGE, so the shading normal blends between the two faces over a
            // narrow band. That is a soft transition across HARD geometry, which is what a blur cannot
            // imitate -- and the silhouette softens for free, because the chord goes to zero at every edge of
            // the outline.
            const soft = float(GE.softB).sub(facetK.mul(GE.softK)).mul(gScale).toVar();
            const eMix = exp(max(tIn.sub(tIn2), float(0.0)).div(max(soft, float(1e-4))).negate()).toVar();
            const nrm = normalize(mix(fN, fN2, eMix.mul(0.5)).add(1e-5)).toVar();
            const keyG = KIT.mhSpin(KIT.mhKey(uniforms.time), ayG, axG).toVar();
            const sharp = max(float(GE.sharpB).add(facetK.mul(GE.sharpK)).sub(uniforms.voice.mul(GE.sharpV)), float(0.7)).toVar();
            const face = pow(clamp(dot(nrm, keyG), 0.0, 1.0), sharp).toVar();
            const litG = float(GE.litB).add(face.mul(GE.litK))
                .add(flG.x.mul(1.70).mul(pow(clamp(dot(nrm, normalize(vec3(...GE.axes[0]).add(vec3(...GE.axes[2])))), 0.0, 1.0), float(3.0)))).toVar();
            const bodyG = smoothstep(float(0.0), gScale.mul(GE.bodyEdge), chord).toVar();
            const visG = KIT.mhInside(P.add(rd.mul(sEnter.add(chord.mul(0.4))))).mul(exp(sEnter.mul(-MH_EXT))).toVar();
            // A bright line where two faces meet.
            const edgeG = glimK.mul(float(1.0).sub(smallK)).mul(0.85).mul(eMix).mul(float(1.0).sub(eMix.mul(0.4))).toVar();
            const crystalE = select(hit, litG.mul(bodyG).add(edgeG.mul(bodyG)).mul(visG), float(0.0)).toVar();
            // Faces take hue by WHICH WAY THEY POINT, so neighbouring faces of the stone are neighbouring hues.
            const crystalH = crystalE.mul(clamp(nrm.x.mul(0.7).add(nrm.y.mul(0.5)), -1.0, 1.0)).toVar();
            const medG = mix(float(GE.medB), float(GE.medS), smallK).toVar();
            const accG = float(0.0).toVar();
            const transG = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pG = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eG = KIT.mhMedium(pG, uniforms.time, float(2.0)).mul(medG).mul(KIT.mhInside(pG)).toVar();
                accG.addAssign(eG.mul(transG).mul(ds));
                transG.assign(transG.mul(exp(eG.mul(GE.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const geodeDensity = accG.mul(GE.murkGain).add(crystalE.mul(GE.crystalGain)).mul(uniforms.depth);
            return { density: geodeDensity, crystalE, crystalH };
        };

        // =====================================================================================================
        // *** ARC -- THE ELEVENTH. "One soft bright filament arcing gently through the volume." ***
        //
        // *** THIS IS THE HARDEST THING THE KIT HAS BEEN ASKED TO DRAW, AND ITS OWN FILE SAYS SO IN THE FIRST
        // PARAGRAPH. *** arc.ts: "THE SPECIES IS A LINE ... Everything else is either compact enough to solve
        // at the ray's closest approach or broad enough that five samples average it honestly. A FILAMENT IS
        // NEITHER: thin enough that a march steps straight over it, and extended enough that there is no
        // closed form for a ray's nearest approach."
        //
        // A MARCHED FILAMENT CANNOT BE THINNER THAN ITS MARCH -- the constraint stated as arithmetic: "At ten
        // steps down a two-unit chord the interval is 0.2, so a tube narrower than that is caught by whichever
        // tap lands in it and missed otherwise, and the line renders dim, uneven and flickering. Widening it
        // to 0.125 was the only way to make ten taps honest, and the verdict on that was a fat slug of light."
        //
        // SO THE SEARCH RUNS ALONG THE CURVE, NOT ALONG THE RAY, and that inversion is the whole port. For a
        // point on the curve the ray's closest approach is two dot products; sampling THAT along the curve
        // finds where the ray passes nearest the filament, and a parabola through the winner and its two
        // neighbours refines it to well inside a sample interval. The integral is then exact, because locally
        // the curve is a straight line and a gaussian tube crossed at angle alpha integrates in closed form --
        // KIT.mhTube, which sol uses too and which is why these two ship in one round.
        const buildArc = () => {
            const AR = MH_ARC;
            const bowK = clamp(uniforms.bow, 0.0, 1.0).toVar();
            const swayKn = clamp(uniforms.sway, 0.0, 1.0).toVar();
            const pinK = clamp(uniforms.pin, 0.0, 1.0).toVar();
            const flA = KIT.mhFlourish(uniforms.time, float(AR.flourishSlot), float(AR.flourishDur)).toVar();

            // THE ARC'S FRAME -- roll FIRST, then yaw and tilt. Roll is the third rotation the kit gained for
            // this round: without it a curve's projected ellipse keeps its long axis horizontal on screen
            // however it is yawed and tilted, which is what turned three ribbons into one swoosh.
            const sway = float(AR.swayB).add(swayKn.mul(AR.swayK)).toVar();
            const ro = float(AR.rollB).add(sway.mul(AR.rollAmp).mul(
                sin(KIT.mhDrift(uniforms.time, float(AR.rollRate), float(AR.rollWob), float(AR.rollLane))))).toVar();
            const ay = KIT.mhDrift(uniforms.time, float(AR.yawRate), float(AR.yawWob), float(AR.yawLane)).toVar();
            const ax = float(AR.tiltB).add(sway.mul(AR.tiltAmp)
                .mul(sin(uniforms.time.mul(AR.tiltRate).add(AR.tiltPhase)))).toVar();

            // THE GEOMETRY. The arc's midpoint sits `pin` from the centre on the bow axis and the circle has
            // radius Rc, so the circle's centre is at (pin - Rc) along that axis. arc.ts on the trade: "A
            // tighter circle carries more arc before its ends run out to the edge, which is the same trade a
            // draughtsman makes to get a longer line out of a fixed sheet: the shape it draws is a shallow
            // catenary U rather than a comma."
            const pin = mix(float(AR.pinFar), float(AR.pinNear), pinK)
                .mul(float(1.0).add(uniforms.voice.mul(AR.pinVoice)).add(flA.x.mul(AR.pinFlourish))).toVar();
            const Rc = float(AR.rcB).add(bowK.mul(AR.rcK)).toVar();
            const span = float(AR.spanB).add(bowK.mul(AR.spanK))
                .mul(mix(float(1.0), float(AR.spanSmall), smallK)).toVar();
            const cz = pin.sub(Rc).toVar();

            // A THREAD, and its width is a FREE DESIGN DECISION now rather than a sampling constraint --
            // arc.ts: "Once the sampling constraint is gone the width is a free design decision again: 0.052
            // is five per cent of the sphere's radius, and it is that because that is what reads as
            // calligraphic." That sentence is the entire justification for the machinery above it.
            const w = float(AR.wB).add(bowK.mul(AR.wK)).mul(mix(float(1.0), float(AR.wSmall), smallK)).toVar();
            const bright = float(AR.brightB).add(uniforms.voice.mul(AR.brightVoice))
                .mul(float(1.0).add(flA.x.mul(AR.brightFlourish))).toVar();
            // The moire gate, evaluated through the kit rather than baked: at this port's nominal 120 pt mount
            // arc's 4.2 cycles are comfortably resolved and it returns 1, but it is COMPUTED, so a reader can
            // check it against kit.ts instead of taking a 1 on trust.
            const shimAmt = float(KIT_AA(AR.shimCycles)).mul(float(1.0).sub(smallK))
                .mul(uniforms.glintRate.mul(AR.shimPace)).toVar();

            const Pa = KIT.mhSpin(KIT.mhRoll(P, ro), ay, ax).toVar();
            const Ra = KIT.mhSpin(KIT.mhRoll(rd, ro), ay, ax).toVar();

            // THE SEARCH, UNROLLED. Twenty samples along the curve; the loop is written out in JS so every
            // sample's angle is a compile-time constant and the parabola's three-point window can be tracked
            // beside the winner. *** THE THREE VALUES ARE SELECTED FROM THE OLD ONES BEFORE ANY ASSIGNMENT,
            // which is the discipline geode's two-deep entry ranking needed for the same reason: a running
            // argmin written the obvious way reads a value it has just overwritten.
            // Sample angles are compile-time fractions of `span`, so `span` scales the whole search and the
            // step between samples is span * 2/(NS-1) -- the node form of arc.ts's dth.
            const NS = AR.samples;
            const thOf = (i) => -1 + 2 * (i / (NS - 1));
            const dthN = span.mul(2 / (NS - 1)).toVar();
            const gAt = (thNode) => {
                const C = vec3(Rc.mul(sin(thNode)), cz.add(Rc.mul(cos(thNode))), float(0.0)).toVar();
                const D = C.sub(Pa).toVar();
                const sc = dot(D, Ra).toVar();
                return { g: dot(D, D).sub(sc.mul(sc)).toVar(), sc, C };
            };
            const G = [], TH = [];
            for (let i = 0; i < NS; i++) {
                const thI = span.mul(thOf(i)).toVar();
                TH.push(thI); G.push(gAt(thI).g);
            }

            // TWO CROSSINGS, IN TWO HALVES OF TEN, and the reason is geometric: "a shallow U seen from most
            // angles is crossed twice, and a global minimum would find only one and break the thread where it
            // passes over itself."
            const partE = [], thPick = [];
            for (let hf = 0; hf < AR.halves; hf++) {
                const lo = hf * (NS / AR.halves), hi = lo + NS / AR.halves - 1;
                let bG = G[lo].toVar(), bTh = TH[Math.min(Math.max(lo, 1), NS - 2)].toVar();
                let bY0 = G[Math.min(Math.max(lo, 1), NS - 2) - 1].toVar();
                let bY1 = G[Math.min(Math.max(lo, 1), NS - 2)].toVar();
                let bY2 = G[Math.min(Math.max(lo, 1), NS - 2) + 1].toVar();
                for (let i = lo + 1; i <= hi; i++) {
                    const ci = Math.min(Math.max(i, 1), NS - 2);
                    const better = G[i].lessThan(bG);
                    const nG = select(better, G[i], bG).toVar();
                    const nTh = select(better, TH[ci], bTh).toVar();
                    const n0 = select(better, G[ci - 1], bY0).toVar();
                    const n1 = select(better, G[ci], bY1).toVar();
                    const n2 = select(better, G[ci + 1], bY2).toVar();
                    bG.assign(nG); bTh.assign(nTh); bY0.assign(n0); bY1.assign(n1); bY2.assign(n2);
                }
                // Parabolic refinement. A flat triple is a zero denominator, so the offset is selected rather
                // than divided -- the same safe-divisor shape geode's degenerate slab needed.
                const den = bY0.sub(bY1.mul(2.0)).add(bY2).toVar();
                const off = select(abs(den).greaterThan(1e-7),
                                   clamp(bY0.sub(bY2).mul(0.5).div(select(abs(den).greaterThan(1e-7), den, float(1.0))),
                                         -1.0, 1.0), float(0.0)).toVar();
                const th = clamp(bTh.add(off.mul(dthN)), span.negate(), span).toVar();

                const hit = gAt(th);
                const sc = hit.sc.toVar();
                const perp2 = max(dot(hit.C.sub(Pa), hit.C.sub(Pa)).sub(sc.mul(sc)), float(0.0)).toVar();
                const live = sc.greaterThan(0.0).and(sc.lessThan(L));

                // THE SPINDLE, AND IT IS TWO EXPONENTS ON ONE PROFILE. Width rides `prof` linearly and
                // brightness rides prof^1.35, "so the thread reads as a stroke laid down with pressure in the
                // middle and lifted at both ends, rather than as a rod of even ink that happens to narrow".
                // A filament of even width with a fade painted on its ends is a rod that got dimmer.
                const u = clamp(abs(th).div(max(span, float(1e-3))), 0.0, 1.0).toVar();
                const prof = pow(max(float(1.0).sub(u.mul(u)), float(0.0)), float(AR.profPow)).toVar();
                const wl = w.mul(float(AR.wlFloor).add(prof.mul(AR.wlRide))).toVar();

                // The angle between ray and tangent, floored at 0.58 rather than the 0.30 the geometry allows:
                // "at three and a third it put a bright BULGE wherever the filament leaned toward the viewer,
                // and a thread with a swelling two thirds along it is not brightest at its centre."
                const T = vec3(cos(th), sin(th).negate(), float(0.0)).toVar();
                const sinA = max(length(cross(Ra, T)), float(AR.sinFloor)).toVar();

                const run = float(1.0).add(shimAmt.mul(sin(th.mul(AR.runFreq).sub(uniforms.time.mul(AR.runRate))))).toVar();
                const pr = th.sub(mix(span.negate(), span, flA.y)).div(0.34).toVar();
                const pulse = flA.x.mul(0.95).mul(exp(pr.mul(pr).negate())).toVar();

                // THE CLOSED FORM, TWICE: once for the thread and once for its halo. The halo's coefficient is
                // 0.09 where every marched hero gives its scatter 0.24, and the arithmetic is in the kit's
                // note on mhTube -- the integral scales with WIDTH, so a halo 3.2x wider carries 3.2x the
                // light at the same coefficient and stops being a glow around a thread.
                const ws = wl.div(Math.sqrt(KIT.MH_SCATTER_K)).toVar();
                const core = KIT.mhTube(wl, sinA, perp2).toVar();
                const halo = KIT.mhTube(ws, sinA, perp2).mul(AR.haloK).toVar();
                const vis = KIT.mhInside(Pa.add(Ra.mul(sc))).mul(exp(sc.mul(-MH_EXT))).toVar();
                const e = core.add(halo).mul(pow(prof, float(AR.brightPow)))
                    .mul(bright).mul(run).mul(float(1.0).add(pulse)).mul(vis).toVar();
                partE.push(select(live, e, float(0.0)).toVar());
                thPick.push(th);
            }

            // When both halves land in the same place the second is a DUPLICATE of the first, not a second
            // crossing -- so it is faded out by how far apart the two picks are rather than counted twice.
            const sep = smoothstep(float(AR.sepIn), float(AR.sepOut), abs(thPick[0].sub(thPick[1]))).toVar();
            const filE = partE[0].add(partE[1].mul(sep)).toVar();
            const filH = partE[0].mul(clamp(thPick[0].div(max(span, float(1e-3))), -1.0, 1.0))
                .add(partE[1].mul(sep).mul(clamp(thPick[1].div(max(span, float(1e-3))), -1.0, 1.0))).toVar();

            // The medium is STILL MARCHED, and arc.ts says why that is not an inconsistency: "it is broad, so
            // five is honest for it, and it carries the only noise this hero reads."
            const medAmt = mix(float(AR.medB), float(AR.medS), smallK).toVar();
            const accA = float(0.0).toVar();
            const transA = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pA = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eA = KIT.mhMedium(pA, uniforms.time, float(2.0)).mul(medAmt).mul(KIT.mhInside(pA)).toVar();
                accA.addAssign(eA.mul(transA).mul(ds));
                transA.assign(transA.mul(exp(eA.mul(AR.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const arcDensity = accA.mul(AR.medGain)
                .add(filE.mul(AR.filGain).mul(mix(float(1.0), float(AR.filSmall), smallK)))
                .mul(uniforms.depth);
            return { density: arcDensity, filE, filH };
        };

        // =====================================================================================================
        // *** SOL -- THE TWELFTH. "A miniature sun: one composed core, and prominences as calligraphy." ***
        //
        // *** IT SHIPS WITH ARC BECAUSE ITS OWN FILE SAYS SO IN SIX WORDS: "THE PROMINENCES, solved the way
        // arc's filament is." *** Same curve search, same parabolic refinement, same closed-form tube -- which
        // is why the tube moved into the kit this round instead of being written twice.
        //
        // AND THE TWO HALVES OF THIS SPECIES ARE SOLVED DIFFERENTLY ON PURPOSE. sol.ts: "THE CORE IS THE MASS
        // AND THE PROMINENCES ARE THE LINE. Both are solved rather than sampled, and they are solved
        // differently because they are different kinds of thing." The core is a perfect disc costing one
        // square root -- "exactly, analytically round from every angle, at every frame, with no sampling in it
        // anywhere" -- and the tongues are line integrals.
        const buildSol = () => {
            const SO = MH_SOL;
            const coronaK = clamp(uniforms.corona, 0.0, 1.0).toVar();
            const promK = clamp(uniforms.prom, 0.0, 1.0).toVar();
            const simmerK = clamp(uniforms.simmer, 0.0, 1.0).toVar();
            const flS = KIT.mhFlourish(uniforms.time, float(SO.flourishSlot), float(SO.flourishDur)).toVar();

            const Rs = float(SO.rsB).add(coronaK.mul(SO.rsK)).mul(mix(float(1.0), float(SO.rsSmall), smallK))
                .mul(float(1.0).add(KIT.mhBreath(uniforms.time, float(SO.rsBreathLane)).sub(0.5).mul(2.0).mul(SO.rsBreath))
                    .add(uniforms.voice.mul(SO.rsVoice))).toVar();

            // THE RAY'S PERPENDICULAR DISTANCE TO THE CENTRE: the whole core, in three lines and one square
            // root. Nothing here is sampled, which is what makes the outline exactly circular at every angle.
            const bqS = dot(P, rd).toVar();
            const perp2S = max(dot(P, P).sub(bqS.mul(bqS)), float(0.0)).toVar();
            const perpS = sqrt(perp2S).toVar();
            const disc = smoothstep(Rs.mul(SO.discOut), Rs.mul(SO.discIn), perpS).toVar();
            const sFront = bqS.negate().sub(sqrt(max(Rs.mul(Rs).sub(perp2S), float(0.0)))).toVar();

            // THE GRANULATION IS WEIGHTED TO THE DISC'S INTERIOR, and this is not a refinement -- it is the
            // repair of the one failure this species cannot afford. sol.ts: "Granulation applied across the
            // limb modulates the very threshold that makes the core round, and the photosphere grew NOTCHES in
            // its outline -- which on the one hero whose brief is a composed circular core is the worst place
            // to lose it."
            const simAmt = float(KIT_AA(SO.simCycles)).mul(float(1.0).sub(smallK))
                .mul(float(SO.simB).add(simmerK.mul(SO.simK)))
                .mul(float(SO.simPaceB).add(uniforms.glintRate.mul(SO.simPaceK))).toVar();
            const sp3 = P.add(rd.mul(max(sFront, float(0.0)))).toVar();
            const gran = float(1.0).add(simAmt.mul(SO.granK)
                .mul(smoothstep(float(SO.granIn), float(SO.granOut), disc))
                .mul(KIT.mhNoise3(sp3.mul(SO.granScale).add(vec3(float(0.0), float(0.0),
                    uniforms.time.mul(float(SO.granRateB).add(uniforms.glintRate.mul(SO.granRateK))))))))
                .toVar();
            const coreE = disc.mul(gran).mul(float(SO.coreB).add(coronaK.mul(SO.coreK))
                .mul(float(1.0).add(uniforms.voice.mul(SO.coreVoice)))).toVar();

            const coronaW = float(SO.coronaWB).add(coronaK.mul(SO.coronaWK))
                .mul(float(1.0).add(uniforms.voice.mul(SO.coronaWVoice))).toVar();
            const coronaE = exp(max(perpS.sub(Rs), float(0.0)).div(max(coronaW, float(1e-3))).negate())
                .mul(float(1.0).sub(disc.mul(SO.coronaDisc)))
                .mul(float(SO.coronaB).add(coronaK.mul(SO.coronaK))).toVar();

            // THE PROMINENCES. Three, on periods of 13, 17 and 21 seconds, "each spending most of its cycle
            // flat against the surface, so the sun is never symmetric and never crowded. The lift is
            // sin-squared, flat at both ends." The third retires on small mounts.
            const pairB = float(1.0).sub(smoothstep(float(SO.pairIn), float(SO.pairOut), smallK)).toVar();
            const promW = float(SO.promWB).add(promK.mul(SO.promWK))
                .mul(mix(float(1.0), float(SO.promWSmall), smallK)).toVar();
            const promE = float(0.0).toVar();
            const NP = SO.samples;
            for (let k = 0; k < SO.count; k++) {
                const wk = k < 2 ? float(1.0).toVar() : pairB;
                const per = SO.perB + SO.perK * k;
                const sn = sin(uniforms.time.mul(2 * Math.PI / per).add(k * 2.13)).toVar();
                const lift = sn.mul(sn).toVar();
                const a1 = uniforms.time.mul(SO.rootA1 + SO.rootA1K * k).add(k * SO.rootPh1).toVar();
                const a2 = uniforms.time.mul(SO.rootA2 + SO.rootA2K * k).add(k * SO.rootPh2).toVar();
                const dir = normalize(vec3(cos(a1).mul(cos(a2)), sin(a2), sin(a1).mul(cos(a2)))).toVar();
                const tang = normalize(cross(dir, vec3(0.13, 0.97, 0.21)).add(1e-4)).toVar();
                const hk = float(SO.hkB).add(promK.mul(SO.hkK)).mul(lift)
                    .mul(float(1.0).add(uniforms.voice.mul(SO.hkVoice))).toVar();
                // A WIDER SWEEP ALONG THE LIMB than the first build's 0.55: "At 0.55 they left radially and
                // read as antennae; a prominence is a loop rooted at two feet, not a spike."
                const swp = float(SO.swpB).add(promK.mul(SO.swpK)).toVar();

                // The curve: swept along the limb by +/- swp and lifted radially by a parabola that is exactly
                // zero at both feet, so a tongue is rooted rather than floating.
                const curve = (uNode) => {
                    const an = swp.mul(uNode).toVar();
                    const C = dir.mul(cos(an)).add(tang.mul(sin(an)))
                        .mul(Rs.add(hk.mul(float(1.0).sub(uNode.mul(uNode))))).toVar();
                    const D = C.sub(P).toVar();
                    const sc = dot(D, rd).toVar();
                    return { C, D, sc, g: dot(D, D).sub(sc.mul(sc)).toVar(), an };
                };
                let bG = null, bU = null;
                for (let i = 0; i < NP; i++) {
                    const uc = float(-1 + 2 * (i / (NP - 1))).toVar();
                    const g = curve(uc).g;
                    if (bG === null) { bG = g.toVar(); bU = uc.toVar(); }
                    else {
                        const better = g.lessThan(bG);
                        const nG = select(better, g, bG).toVar(), nU = select(better, uc, bU).toVar();
                        bG.assign(nG); bU.assign(nU);
                    }
                }
                // ONE parabolic refinement, RE-EVALUATING the curve at the winner's two neighbours rather than
                // reading stored samples -- which is what sol.ts does and what arc.ts does not, because sol's
                // winner is not clamped into the array's interior and its neighbours may fall outside it.
                const du = 2 / (NP - 1);
                const gm = curve(clamp(bU.sub(du), -1.0, 1.0)).g.toVar();
                const gp = curve(clamp(bU.add(du), -1.0, 1.0)).g.toVar();
                const denS = gm.sub(bG.mul(2.0)).add(gp).toVar();
                const offS = select(abs(denS).greaterThan(1e-7),
                    clamp(gm.sub(gp).mul(0.5).div(select(abs(denS).greaterThan(1e-7), denS, float(1.0))), -1.0, 1.0),
                    float(0.0)).toVar();
                const uu = clamp(bU.add(offS.mul(du)), -1.0, 1.0).toVar();
                const hitS = curve(uu);
                const scS = hitS.sc.toVar();
                const pp = max(dot(hitS.D, hitS.D).sub(scS.mul(scS)), float(0.0)).toVar();
                const liveS = scS.greaterThan(0.0).and(scS.lessThan(L)).and(lift.greaterThan(0.02))
                    .and(wk.greaterThan(0.002));

                const profS = pow(max(float(1.0).sub(uu.mul(uu).mul(SO.profFall)), float(0.0)), float(SO.profPow)).toVar();
                const wlS = promW.mul(float(SO.wlFloor).add(profS.mul(SO.wlRide))).toVar();
                const TS = normalize(dir.mul(sin(hitS.an).negate()).add(tang.mul(cos(hitS.an)))
                    .mul(Rs.add(hk.mul(float(1.0).sub(uu.mul(uu)))))
                    .sub(dir.mul(cos(hitS.an)).add(tang.mul(sin(hitS.an))).mul(hk.mul(uu).mul(2.0)))
                    .add(1e-5)).toVar();
                const sinAS = max(length(cross(rd, TS)), float(SO.sinFloor)).toVar();

                // *** THE CORE OCCLUDES, and this is the cue that makes it a BODY. *** A tongue whose nearest
                // point lies behind the core's front surface, within the disc, is hidden -- "which is the cue
                // that makes the core read as a solid body rather than as a bright patch." At 0.94 rather than
                // 1.0, so it goes dark rather than absent.
                const hidden = select(scS.greaterThan(sFront), disc, float(0.0)).toVar();
                const visS = KIT.mhInside(P.add(rd.mul(scS))).mul(exp(scS.mul(-MH_EXT)))
                    .mul(float(1.0).sub(hidden.mul(SO.occlude))).toVar();
                const coreT = KIT.mhTube(wlS, sinAS, pp).toVar();
                const haloT = KIT.mhTube(wlS.mul(SO.haloW), sinAS, pp.div(SO.haloSpread)).mul(SO.haloK).toVar();
                promE.addAssign(select(liveS, coreT.add(haloT).mul(profS).mul(lift).mul(visS).mul(wk), float(0.0)));
            }

            const medAmtS = mix(float(SO.medB), float(SO.medS), smallK).toVar();
            const accS = float(0.0).toVar();
            const transS = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pS = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eS = KIT.mhMedium(pS, uniforms.time, float(2.0)).mul(medAmtS).mul(KIT.mhInside(pS)).toVar();
                accS.addAssign(eS.mul(transS).mul(ds));
                transS.assign(transS.mul(exp(eS.mul(SO.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            // THE PROMINENCE GAIN IS 6.60 AND ARC'S IS 35.0, and the five-fold difference is the formula's
            // meaning rather than a taste setting -- see the kit's note on mhTube.
            const outer = coronaE.add(promE.mul(SO.promGain)).toVar();
            const solDensity = accS.mul(SO.medGain).add(coreE).add(outer).mul(uniforms.depth);
            return { density: solDensity, coreE, outer };
        };

        // *** ONE CALL, AND IT IS THE ONLY SPECIES BLOCK THAT RUNS. *** The seven closures above are
        // declared and six of them are never invoked, so their nodes are never built and never reach the
        // WGSL. Everything below reads `SP`, whose shape is each hero's own contract: always a density, plus
        // the energy and hue terms that hero's rail needs and no others.
        const SP = species === "limn" ? buildLimn()
            : species === "comet" ? buildComet()
            : species === "droplet" ? buildDroplet()
            : species === "opal" ? buildOpal()
            : species === "abyss" ? buildAbyss()
            : (species === "nebula" || species === "tempest") ? buildMist()
            : species === "fathom" ? buildFathom()
            : species === "geode" ? buildGeode()
            // THE TWO LINE-DRAWING HEROES. They share the kit's closed-form tube and nothing else: arc solves
            // ONE filament in a rolled frame, sol solves an analytic disc plus THREE short arches on its limb.
            : species === "arc" ? buildArc()
            : species === "sol" ? buildSol() : buildStill();
        const density = SP.density;

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
        const surfB = { m: bodyMask, P: dP, N, Rd: bodyRd, rho: bodyRho, fres };
        // tilt is not wired to a uniform in this port (mh_look is given vec2(0,0) above for the same reason),
        // so the counter-move term is exercised at zero here and by the gate at nonzero.
        const sf = KIT.mhSurface(surfB, uniforms.time, smallK,
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
        const hueRaw = species === "opal"
            // opal's hue rides its FLASHES, and at 1.30 x MH_SPREAD -- the one internal multiplier in the
            // collection above the family cap. Its four flashes sit at four points across the spread, two
            // either side of the anchor, so the extremes reach about 37 degrees of OKLab hue at spread 1.
            ? select(SP.flashE.greaterThan(1e-4), SP.flashH.div(SP.flashE), float(0.0)).mul(SP.spreadAmt)
            : species === "abyss"
            // abyss's three lanes take one hue step each: -1, 0, +1 across the spread.
            ? select(SP.glowE.greaterThan(1e-5), SP.glowH.div(SP.glowE), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
            : species === "fathom"
            // fathom's hue rides its SHELL CROSSINGS and their own outward z, weighted by the same
            // transmittance the brightness is -- so a near shell that occludes the one behind it occludes
            // that shell's hue too. fathom.ts: "the near faces one way, the far the other, so the layers are
            // told apart by colour as well as by brightness".
            ? select(SP.shellE.greaterThan(1e-4), SP.shellH.div(SP.shellE), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
            : species === "geode"
            // geode's hue is a property of the FACE, not of depth: "faces take hue by which way they point,
            // so neighbouring faces of the stone are neighbouring hues". It is the only ported hero whose
            // colour comes from a surface NORMAL rather than from where the light sits in the volume.
            ? select(SP.crystalE.greaterThan(1e-5), SP.crystalH.div(SP.crystalE), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
            : (species === "nebula" || species === "tempest")
            // *** THE MIST HEROES CARRY THEIR HUE ON DEPTH, WHICH IS THE ONE CHANNEL A CLOUD HAS. ***
            // nebula.ts: "the near folds one way, the deep glow the other, so the cloud has two hues in
            // conversation through its thickness". The accumulator is e * clamp(p.z, -1, 1), weighted by the
            // SAME transmittance the luminance is -- so a fold that occludes the glow behind it occludes
            // that glow's hue too, which is what stops the far half from tinting a near silhouette.
            ? select(SP.accM.greaterThan(1e-4), SP.accMH.div(SP.accM), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
            : species === "limn"
            ? SP.tailShare.negate().mul(spreadK).mul(KIT.MH_SPREAD)
            : species === "comet"
                ? select(SP.accC.greaterThan(1e-4), SP.accHC.div(SP.accC), float(0.0)).negate().mul(spreadK).mul(KIT.MH_SPREAD).mul(1.4)
                : species === "droplet"
                    ? select(SP.accD.greaterThan(1e-4), SP.accHD.div(SP.accD), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    // arc's hue runs ALONG THE FILAMENT'S LENGTH -- th/span, signed, so one tip sits warm of
                    // the anchor and the other cool of it and the stroke carries a gradient rather than a
                    // colour. Its own file spells hue = (filH / filE) * spreadK * MH_SPREAD, with the ratio
                    // guarded at 1e-5 rather than the family's 1e-4 because a closed-form line integral
                    // returns much smaller numbers than a march does.
                    : species === "arc"
                    ? select(SP.filE.greaterThan(1e-5), SP.filH.div(SP.filE), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    // *** sol's hue RUNS OUTWARD, and it is the only hero in the port whose hue argument is a
                    // SHARE rather than a weighted mean: outer / (coreE + outer). *** The core sits on the
                    // anchor and the corona and the tongues walk to the neighbour, so the colour is a function
                    // of how far out the light is coming from rather than of which way anything points.
                    : species === "sol"
                    ? select(SP.coreE.add(SP.outer).greaterThan(1e-4), SP.outer.div(max(SP.coreE.add(SP.outer), float(1e-4))), float(0.0))
                        .mul(spreadK).mul(KIT.MH_SPREAD)
                    : select(SP.acc.greaterThan(1e-4), SP.accH.div(SP.acc), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD);
        // mh_present's own hueMix: the hue scaled by the share of THIS pixel's energy that the species says
        // carries colour. still and comet count the interior plus 0.7 of the rim, droplet 0.6 of it, limn the
        // rim energy plus the interior -- four different numerators, transcribed rather than averaged.
        const eTotal = interior.add(sf.rim).add(sf.spec).add(sf.glow).toVar();
        const hueNum = species === "limn" ? SP.rimE.add(interior)
            : species === "droplet" ? interior.add(sf.rim.mul(0.6))
            // opal and abyss weight by their OWN event energy alone -- the flashes and the passing glows --
            // rather than by the interior, because in both the event IS the colour and the medium is night.
            : species === "opal" ? SP.flashE
            : species === "abyss" ? SP.glowE
            // geode weights by the CRYSTAL alone at its own gain -- its file spells hueMix with
            // crystalE * 0.92 as the numerator, not the interior -- while fathom takes the default.
            : species === "geode" ? SP.crystalE.mul(MH_GEODE.crystalGain)
            // arc and sol both spell hueMix with the WHOLE interior as the numerator and no rim share at all
            // -- arc's own line is hueMix = hue * (filE * 35.0 * smallGain) / max(e, 1e-4), which is the
            // filament's contribution to the interior rather than the interior itself, and sol's is
            // hue * interior / max(e, 1e-4). Two different numerators on two species that share a solver,
            // transcribed from each file rather than unified because they share one.
            : species === "arc" ? SP.filE.mul(MH_ARC.filGain)
            : species === "sol" ? interior
            // nebula and tempest take the DEFAULT, and that is transcribed rather than fallen into: both
            // their files spell hueMix = hue * (interior + sf.rim * 0.7) / max(e, 1e-4), the same numerator
            // still and comet use. Checked against the source, not assumed from the branch order.
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
