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
    // *** THE LIVE INPUTS. *** `voice` and `activity` are the RAW host signals -- a microphone level and a
    // cadence -- and `stateIndex` is which of murmur's five states the orb is in (0 idle, 1 listening,
    // 2 thinking, 3 responding, 4 success). None of the three is read by a species directly: the kit's
    // mh_live conditions them ONCE at the top of main and the species read the conditioned pair. Before
    // v4641 `voice` went in raw at 44 sites and there was no `activity` at all, so eight species read
    // still's STYLE knob `glintRate` where murmur reads live.pace.
    "activity", "stateIndex",
    // *** AND `stateTau` -- SECONDS SINCE THE STATE CHANGED, which v4644 made a uniform because something
    // finally reads it. *** mh_state turns the pair (stateIndex, stateTau) into four windows and this round
    // wires two of them: `settled` on all eighteen interiors and the ignition shell on the seven marched
    // heroes. The comment that stood here said a knob nothing reads is a row that cannot fail, and that was
    // right: the knob arrives in the same round as the pixels it moves, not before them.
    "stateTau",
    // *** THE THREE SIGNAL INTEGRALS -- v4654, and they are what let a modulated clock exist at all. ***
    // murmur's species build a local rate out of the live signals and hand it to mh_drift, whose phase is
    // rate * t. A rate that MOVES makes that expression jump by t * dRate -- no ceiling, growing with how
    // long the orb has been on screen -- which is the defect v4650 repaired one level up on this same orb.
    // A shader has no memory, so the host supplies the running integrals instead and the secular phase
    // becomes base * (t + a*P + b*V + c*D), which is the exact integral and costs three numbers.
    "paceInt", "voiceInt", "driveInt",
    // ...and three more at v4657, for the two rates v4654 recorded as out of reach. paceDriveInt and
    // voiceDriveInt are limn's, whose rate is a PRODUCT so its expansion needs the integral of each product
    // rather than of each signal; duetFlourishInt is duet's own gesture envelope, integrated host-side
    // because its lane and slot are style constants and the envelope is therefore a function of the clock
    // this host already keeps. See render/aiPresenceOrbState.mjs, which explains why the record that called
    // that impossible was wrong.
    "paceDriveInt", "voiceDriveInt", "duetFlourishInt",
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
    // aura's three and flux's three. *** AND AURA IS THE ONE HERO WHOSE SPREAD IS NOT c3. *** Seventeen of
    // the eighteen put the hue knob last; aura puts `spread` at c2 and `depth3d` at c3, so a port that
    // mapped slots positionally would have swapped its colour for its parallax and left every other species
    // correct. The port names knobs rather than numbering them, which makes that hazard unreachable instead
    // of merely documented -- and this is the first species in twelve where it would have fired.
    "ribbon", "swirl", "depth3d", "stream", "bend", "height",
    // duet's three and chorus's three -- the last six, and the sixteenth species closes the roster this
    // port carries. `breath` rather than chorus's own `depth` because THIS FILE ALREADY HAS a `depth`
    // uniform, the shared one every species multiplies its density by. Two knobs with one name is the
    // hazard the naming convention exists to prevent, and it would have fired silently here: chorus's c2
    // would have been read as the family depth and its breath would have had no knob at all.
    "sep", "orbit", "ratio", "voices", "sync", "breath",
    // prism's three and helix's three -- and with them ALL EIGHTEEN of murmur's species are named here.
    // `swing` rather than prism's own `drift` and `strand` rather than helix's `glow`, both for the reason
    // chorus's `breath` was renamed last round: this file already has a `glow` uniform (mh_present's, which
    // every species passes to the tone curve) and `drift` reads as the kit's mhDrift. Three renames in
    // eighteen species, each one a collision that naming rather than numbering made visible.
    "beams", "split", "swing", "turns", "rise", "strand",
]);

/** The species this file can build: murmur's eighteen, all of them, since v4651. The line here said "the six that are ported" until v4660 -- a record that outlived its own repair by nine rounds, in the declaration of the array that disproves it. */
export const ORB_SPECIES = Object.freeze(["still", "limn", "comet", "droplet", "opal", "abyss",
                                          "nebula", "tempest", "fathom", "geode", "arc", "sol",
                                          "aura", "flux", "duet", "chorus", "prism", "helix"]);

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
         MH_TEMPEST_BOLT, MH_SLOT_SIGNAL, MH_LIMN_RATE, MH_COMPLETE_INTERIOR, MH_COMPLETE_LIFT, MH_COMPLETE_SOL_CORE, MH_IGNITE_AXIS, MH_IGNITE_LAP, MH_IGNITE_TURN, MH_IGNITE_FLAT_GEODE, MH_COMET_TRAIL, MH_COMPLETE_SINGLE, MH_FATHOM, MH_GEODE, MH_ARC, MH_SOL, MH_AURA, MH_FLUX, MH_DUET, MH_CHORUS,
         MH_PRISM, MH_HELIX, MH_TAPS_HI, MH_R, MH_SETTLED, MH_SETTLED_INTERIOR, MH_SETTLED_COMET_HEAD, MH_IGNITE,
         MH_DRIVE_HEADING, MH_DRIVE_FORM,
         mhAa } from "./murmurKit.mjs";

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

    const k0 = { time: 0, speed: 1, glow: 1, depth: 1, hueShift: 0, presence: 0.5, clarity: 0.6, glintRate: 0.3, voice: 0, aspect: 1, activity: 0, stateIndex: 0, stateTau: 0, paceInt: 0, voiceInt: 0, driveInt: 0, paceDriveInt: 0, voiceDriveInt: 0, duetFlourishInt: 0,
                 rimWidth: 0.4, travel: 0.5, innerHint: 0.3, spread: 0.4,
                 orbitTilt: 0.5, trail: 0.5, pointSize: 0.4,
                 wobble: 0.5, tension: 0.5, sheen: 0.5,
                 flashes: 0.5, softness: 0.6, drift: 0.4, creatures: 0.4, rarity: 0.6,
                 density: 0.5, fold: 0.5, glint: 0.5,
                 layers: 0.5, parallax: 0.5, murk: 0.4, facet: 0.5, glim: 0.5, stone: 0.5,
                 bow: 0.5, sway: 0.5, pin: 0.5, corona: 0.5, prom: 0.5, simmer: 0.5,
                 ribbon: 0.5, swirl: 0.5, depth3d: 0.5, stream: 0.5, bend: 0.5, height: 0.5,
                 sep: 0.5, orbit: 0.5, ratio: 0.5, voices: 0.5, sync: 0.5, breath: 0.5,
                 beams: 0.5, split: 0.5, swing: 0.5, turns: 0.5, rise: 0.5, strand: 0.5, ...knobs };
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
    const floorAmt = Fn(([vc]) => {
        const base = float(0.016).add(uniforms.presence.mul(0.085));
        return base.mul(float(1.0).sub(uniforms.clarity.mul(0.5))).mul(float(1.0).add(vc.mul(0.55)));
    });
    // *** THE TIME-ONLY GLINT IS GONE, NOT KEPT AS A FALLBACK. *** It was exp(-(t mod period)^2 / w^2): one
    // number per FRAME, the same value at every pixel of the orb, where still.ts puts the light on a path
    // through the volume and solves it at the ray's closest approach. Leaving it here behind a flag would
    // leave two answers to one question in the file, and the gate would then be free to check the easy one.

    const main = Fn(() => {
        // *** THE LIVE SIGNALS ARE CONDITIONED HERE, ONCE, BEFORE ANY SPECIES SEES THEM -- v4641. ***
        //
        // kit.ts opens mh_live with its reason: "so 'loud' and 'busy' mean the same thing across the family".
        // Every one of murmur's eighteen shaders reads `live.voice`; NOT ONE of them reads a raw level. This
        // file read the raw uniform at 44 sites, and at 8 more it read `glintRate` -- which is still.ts's OWN
        // STYLE KNOB out of murmur's styles.ts roster, a fixed dial the user sets -- in the place murmur reads
        // `live.pace`, a signal that moves with what the host is actually doing. Two different substitutions
        // of an unconditioned number for a conditioned one, in every species that ships.
        //
        // THE SIZE OF IT IS NOT UNIFORM AND THAT IS THE WORST PART. At the gates' own VOICE of 0.3, idle,
        // murmur's live.voice is 0.3^0.65 * 0.55 = 0.2504 where this file passed 0.3000 -- 20% hot. At 1.0 it
        // is 0.5500 against 1.0000 -- 45% hot. The error GROWS with the knob, so every species was loudest
        // exactly where it was least faithful, and no single scale factor anywhere could have absorbed it.
        //
        // DECLARED AS VARS AT THE TOP OF main AND NOT AS EXPRESSIONS, deliberately: a .toVar() is emitted
        // where it is first BUILT, and several of the 52 sites below sit inside a Loop body. An expression
        // would either be re-inlined 52 times or land its declaration inside a loop scope that closes before
        // the next reader. Here both vars are declared in main's outermost scope, before the first species
        // line, so every reader sees the same one.
        //
        // *** AND mh_state IS CALLED HERE NOW, FOR THE SAME REASON AND ON THE SAME TERMS -- v4644. *** Its
        // four outputs are 128 transcribed references across murmur's eighteen sources; this round spends
        // TWO of them, `settled` and the pair (complete, sweep) the ignition shell runs on, and leaves
        // `drive` -- the RESPONDING lean, 45 references -- for its own round. SETTLED and COMPLETE are
        // declared as vars for the same reason VOICE and PACE are: several readers sit inside a Loop body.
        const LIVE = KIT.mhLive(uniforms.voice, uniforms.activity, uniforms.stateIndex);
        const VOICE = LIVE.voice.toVar();
        const PACE = LIVE.pace.toVar();
        const STATE = KIT.mhState(uniforms.stateIndex, uniforms.stateTau);
        const SETTLED = STATE.settled.toVar();
        const COMPLETE = STATE.complete.toVar();
        const SWEEP = STATE.sweep.toVar();
        // *** AND `drive` ARRIVES AT v4653, THE LAST OF mh_state's FOUR. *** It ramps in over half a second
        // in RESPONDING alone "so entering the state is a lean and not a jolt", and its 45 references across
        // murmur's eighteen sources do three different things: they point a wander at a heading, they
        // collapse the scatter around it, and they run sixteen local clocks faster. THIS ROUND WIRES THE
        // FIRST TWO AND NOT THE THIRD, and the line is not where the work got tiring -- every term below is
        // a DIRECTION or a SIZE, and not one of them multiplies t. The rate family does: murmur hands
        // rate * (1 + k * st.drive) to mh_drift, whose phase is rate * t, so a drive ramping while t is
        // large teleports the phase -- the same shape v4650 repaired on this orb's HOST clock, where
        // entering RESPONDING after a minute of idle moved it 2.902 s in one frame. That needs a decision
        // about faithfulness rather than a transcription, and it is recorded in tools/ship/nextRounds.mjs.
        const DRIVE = STATE.drive.toVar();
        // *** THE MODULATED CLOCK'S SECULAR PHASE -- v4654. *** base * (t + a*P + b*V + c*D) is the EXACT
        // integral of base * (1 + a*pace + b*voice + c*drive), because base and the coefficients come from
        // style knobs and do not move. It reduces to murmur's own base * (1 + a*pace) * t wherever the
        // signals are held, so it changes nothing at a fixed operating point and everything while a signal
        // is in motion -- which is the only place murmur's spelling is wrong. See render/murmurKit.mjs's
        // mhRatePhase for the factoring and the 28.14-radian measurement behind it.
        const ratePhase = (base, kPace, kVoice, kDrive) => KIT.mhRatePhase(
            base, uniforms.time, float(kPace), uniforms.paceInt,
            float(kVoice), uniforms.voiceInt, float(kDrive), uniforms.driveInt);
        const HEAD = MH_DRIVE_HEADING[species] || null;
        const FORM = MH_DRIVE_FORM[species] || null;
        // The heading target as the shader will read it: murmur pre-normalizes sol's and droplet's and not
        // still's or abyss's, and none of the six is a unit vector, so `pre` changes the direction at every
        // point of the ramp strictly between 0 and 1. See MH_DRIVE_HEADING's own note.
        const headV = HEAD ? (() => {
            const v = HEAD.pre ? (() => { const n = Math.hypot(...HEAD.v); return HEAD.v.map((c) => c / n); })() : HEAD.v;
            return vec3(v[0], v[1], v[2]);
        })() : null;
        // Each hero's own ignition constants, or null for the eleven that spend `complete` on their own
        // figures instead. Read at BUILD time off the kit's table, so a species without an entry builds no
        // shell nodes at all rather than building one multiplied by zero.
        const IG = MH_IGNITE[species] || null;
        // *** THE SHELL, IN ONE PLACE, BECAUSE SEVEN SPECIES SPELL IT IDENTICALLY. *** murmur writes it out
        // per file as sr = (length(p) - mix(lo, hi, st.sweep)) / width; e += st.complete * gain * exp(-sr*sr)
        // -- the same four lines seven times with four numbers changed. The kit owns the profile and the gain
        // stays here, because nebula and tempest spend theirs `* dens` and folding it into mh_ignite would
        // make those two look like the other five with a different number rather than like what they are.
        //
        // TAKES THE RADIUS AND NOT THE POINT: the two mist heroes already have length(p) in hand as `rp`, and
        // a second length() in the same loop body is a square root per tap per species for nothing.
        const igniteAt = (lenNode) => KIT.mhIgnite(lenNode, COMPLETE, SWEEP,
            float(IG.lo), float(IG.hi), float(IG.width)).mul(IG.gain);
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
            ? float(0.22).add(KIT.mhBreath(uniforms.time, float(0.9)).mul(0.78)).mul(VOICE).toVar()
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
        // *** THE FLOW DEFORMATION WAS PORTED ON BOTH HALVES OF THE KIT AND NOTHING EVER SET IT -- v4653. ***
        // render/murmurKit.mjs's mhDeform and render/murmurKitTsl.mjs's both carry kit.ts's travelling wave
        // -- "d += flowAmp * sin(3.20 * dot(n, flowDir) + flowPhase)", with its exact gradient -- and every
        // call site in this file passed (0,0,1), 0, 0. droplet.ts is its only caller in murmur's eighteen:
        // "RESPONDING: the wobble acquires a heading." It is the same defect shape as mh_live before v4641
        // and mh_state before v4644, one layer deeper: the mechanism was transcribed, graded and unreachable.
        //
        // THE HEADING GOES INTO THE SILHOUETTE HERE, NOT INTO A DIRECTION ANYTHING MARCHES ALONG, which is
        // why droplet is in MH_DRIVE_HEADING but is not a caller of mhDriveHeading. flowPhase runs on a
        // FIXED-rate drift (2.05), not a drive-modulated one, so nothing in this round multiplies a clock.
        const DROPLET_FLOW = species === "droplet" && HEAD ? (() => {
            const n = Math.hypot(...HEAD.v);
            return { dir: vec3(HEAD.v[0] / n, HEAD.v[1] / n, HEAD.v[2] / n),
                     amp: DRIVE.mul(HEAD.k),
                     phase: KIT.mhDrift(uniforms.time, float(2.05), float(0.30), float(7.0)).negate() };
        })() : null;
        const bodyV = KIT.mhBody(uvM, uniforms.time, float(0.004), shapeAmp, float(0.0), shapeGain,
                                 DROPLET_FLOW ? DROPLET_FLOW.dir : vec3(0.0, 0.0, 1.0),
                                 DROPLET_FLOW ? DROPLET_FLOW.amp : float(0.0),
                                 DROPLET_FLOW ? DROPLET_FLOW.phase : float(0.0), dP, dN).toVar();
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
        // *** still's SLOT READS THE CADENCE AND THE LEAN -- v4656, and this port carried neither. ***
        // still.ts: slot = mix(11.5, 7.0, glintK) / (1 + 0.30*live.pace + 1.70*st.drive), with its own note
        // "about eleven and a half seconds at glintRate 0, seven at 1". The divisor was simply absent here,
        // so the one event in still's frame arrived at the same rate whether or not anybody was talking to
        // it -- on the species whose whole brief is that the single glint IS the content.
        //
        // IT GOES IN AS AN INTEGRATED SLOT COUNT AND NOT AS A DIVISOR, because mh_flourish keys every hash
        // on floor(t / SLOT) and a divisor that moves makes that index JUMP -- which replaces the gesture
        // rather than advancing it. See render/murmurKit.mjs's mhFlourishPhase. The base is a style knob and
        // does not move, so the integral is (t + a*P + c*D) / B and costs no new uniform.
        const SLS = MH_SLOT_SIGNAL.still;
        const stillBase = float(11.5).sub(uniforms.glintRate.mul(4.5)).toVar();
        const stillSlotNow = stillBase.div(float(1.0).add(PACE.mul(SLS.pace)).add(DRIVE.mul(SLS.drive))).toVar();
        const fl = KIT.mhFlourishPhase(
            KIT.mhRatePhase(float(1.0).div(stillBase), uniforms.time,
                float(SLS.pace), uniforms.paceInt, float(SLS.voice), uniforms.voiceInt,
                float(SLS.drive), uniforms.driveInt),
            stillSlotNow, float(5.0)).toVar();
        const ga = fl.z.mul(6.2831853).toVar();
        // *** THE PATH TAKES A HEADING UNDER DRIVE -- v4653. *** still.ts: "Under drive the lines converge on
        // one axis, so an occasional wander becomes a traverse." THE RAW WANDER GOES INTO THE MIX AND THE
        // NORMALIZE HAPPENS ONCE, AFTER, which is murmur's spelling and not this file's previous one: it
        // normalized the wander alone. The two agree exactly at drive 0 -- normalize(mix(w, V, 0)) is
        // normalize(w) -- so every frame outside RESPONDING is byte-identical, and they differ everywhere
        // else, because mixing a unit vector toward V is not mixing the raw one toward V.
        const wander = vec3(cos(ga), sin(ga.mul(1.3)).mul(0.42), sin(ga)).toVar();
        const dir = KIT.mhDriveHeading(wander, headV, DRIVE, float(HEAD.k)).toVar();
        const side = normalize(vec3(
            dir.y.mul(0.12).sub(dir.z),
            dir.z.mul(0.06).sub(dir.x.mul(0.12)),
            dir.x.sub(dir.y.mul(0.06)))).toVar();
        const along = float(-0.62).add(smoothstep(float(0.0), float(1.0), fl.y).mul(1.24));
        // ...and the scatter collapses around it. A heading alone is a swarm that happens to face one way;
        // what makes RESPONDING read as intent is that the sideways offset closes at the same time.
        const lateral = float(0.34).mul(fl.z.mul(2.0).sub(1.0))
            .mul(float(1.0).sub(DRIVE.mul(FORM.lateral)));
        const gp = side.mul(lateral).add(dir.mul(along)).toVar();
        const gw = float(0.085).add(uniforms.glintRate.mul(0.055)).toVar();

        const toG = gp.sub(P).toVar();
        const sG = dot(toG, rd).toVar();
        const argG = max(dot(toG, toG).sub(sG.mul(sG)), float(0.0)).div(max(gw.mul(gw), float(1e-6))).toVar();
        const atG = P.add(rd.mul(sG));
        const visG = KIT.mhInside(atG).mul(exp(sG.mul(-MH_EXT)));
        // *** still's SUCCESS IS ON THE GLINT AND NOWHERE ELSE -- v4661. *** still.ts spends its complete on
        // the glint's BRIGHTNESS, which is the species' own argument for where a flash belongs: "the single
        // glint IS the content", so brightening the medium around it would say nothing. Multiplied onto the
        // solved light rather than added, so it is 0 at complete 0 for every ray and the branchless form is
        // exact outside SUCCESS.
        const glintLive = select(sG.greaterThan(0.0).and(sG.lessThan(L)),
            exp(negate(argG)).mul(1.05).add(KIT.mhScatter(argG, float(0.38))).mul(visG).mul(fl.x)
                .mul(float(1.0).add(COMPLETE.mul(MH_COMPLETE_SINGLE.stillGlint))),
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
        const fAmt = floorAmt(VOICE).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sMarch = float(i).add(0.5).mul(ds);
            const p = P.add(rd.mul(sMarch));
            // *** SUCCESS: "a soft bloom out of the middle. The quietest arrival here." *** still.ts adds the
            // shell to `e` before the accumulation, so the ring is absorbed and hue-weighted like the medium
            // around it rather than composited over the top -- which is the whole difference between an
            // arrival travelling through a material and a white overlay, the thing the family law forbids.
            //
            // ONE TRANSCRIPTION NOTE THAT APPLIES TO ALL SEVEN, AND IT PREDATES THIS ROUND: murmur skips a
            // tap outright when mh_inside(p) <= 0.001 and leaves `e` unattenuated otherwise; this file has
            // always multiplied by the membership instead, a soft mask where the source has a hard cut. The
            // shell goes INSIDE that multiply, with the medium, so both terms are masked the same way -- the
            // alternative would have let the ring escape the silhouette at exactly the radius it ends at.
            const e = KIT.mhMedium(p, uniforms.time, float(1.9)).mul(fAmt)
                .add(igniteAt(length(p))).mul(KIT.mhInside(p)).toVar();
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
        // limn.ts: rate = (0.34 + 0.40*travelK) * (1 + 0.95*live.pace + 0.30*live.voice) * (1 + 1.05*drive).
        // This file had the VOICE term and not the PACE one -- and pace carries the LARGER coefficient, so
        // the dominant half of limn's cadence response was missing. The sum factor is repaired and
        // integrated here.
        //
        // *** THE DRIVE FACTOR ARRIVES AT v4657, AND IT COST EXACTLY WHAT v4654 SAID IT WOULD. *** limn's
        // rate is a PRODUCT of two modulated factors, so expanding it gives cross terms in pace*drive and
        // voice*drive and the integral needs each PRODUCT rather than each signal -- two more accumulators
        // for one species. v4654 named that price and passed 0.0 rather than fold a product in as if it
        // were a sum; this round pays it. It is the only rate in the roster shaped this way.
        //
        // THE CROSS COEFFICIENTS ARE FORMED HERE AS PRODUCTS OF THE TWO FACTORS and not read from a third
        // pair of numbers, because 0.95 * 1.05 IS the expansion and a table carrying 0.9975 beside them
        // would be two spellings of one fact. Held signals make the whole thing murmur's own product again
        // to 3.6e-12; moving ones are where murmur's spelling advances this travel 68.3121 rad in a single
        // 1/60 s frame after half an hour, which is nearly eleven whole turns.
        const LR = MH_LIMN_RATE;
        const limnBase = float(LR.base).add(uniforms.travel.mul(LR.travelK)).toVar();
        const limnRate = limnBase.mul(float(1.0).add(PACE.mul(LR.pace)).add(VOICE.mul(LR.voice)))
            .mul(float(1.0).add(DRIVE.mul(LR.drive))).toVar();
        const phi0 = KIT.mhDriftPhase(
            KIT.mhRatePhase(limnBase, uniforms.time, float(LR.pace), uniforms.paceInt,
                float(LR.voice), uniforms.voiceInt, float(LR.drive), uniforms.driveInt)
                .add(KIT.mhCrossPhase(limnBase, float(LR.pace * LR.drive), uniforms.paceDriveInt,
                                      float(LR.voice * LR.drive), uniforms.voiceDriveInt)),
            // ...and the EASE flattens as the sweep decides: limn.ts's wobble is mix(0.62, 0.14, st.drive)
            // and this port carried the resting 0.62 alone. A bounded amplitude, so it reads the
            // instantaneous drive exactly as murmur does -- no integral, nothing to teleport.
            limnRate, mix(float(LR.wobLo), float(LR.wobHi), DRIVE), float(LR.lane), uniforms.time).toVar();
        const phi = TSL.atan(pc.y, pc.x).toVar();
        // limn.ts wraps by subtracting a ROUNDED turn, which is exact at the seam; an atan round-trip is not.
        const aw = phi.sub(phi0).toVar();
        const awW = aw.sub(float(6.2831853).mul(TSL.floor(aw.div(6.2831853).add(0.5)))).toVar();
        const kHead = float(9.0).div(float(1.0).add(VOICE.mul(0.60))).toVar();
        // limn's half of the lean, and it is the only species whose narrowing is a DIVISOR and a SUBTRACTION
        // rather than a scale. kTail is the tail lobe's CONCENTRATION, so dividing it broadens the tail;
        // offT is where the tail sits in angle, so subtracting swings it round. The arc does not get
        // smaller -- it spreads and turns, which is what a stroke does when it is finishing a word.
        const kTail = float(1.6).div(float(1.0).add(VOICE.mul(0.35)).add(DRIVE.mul(FORM.tailK))).toVar();
        const offT = float(-1.05).sub(DRIVE.mul(FORM.tailOff));
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
        const bw = min(float(0.070).add(uniforms.rimWidth.mul(0.055)).mul(float(1.0).add(VOICE.mul(0.55))), float(0.30)).toVar();
        const dband = rho.div(R).sub(0.965).div(max(bw, float(1e-3))).toVar();
        const band = exp(negate(dband.mul(dband))).toVar();
        // Fresnel keeps the light physically ON the edge, so the arc bends around the curvature.
        const rimlight = band.mul(float(0.30).add(pow(fres, float(1.6)).mul(0.70))).toVar();
        // *** limn's SUCCESS LANDS ON THE RING, GATED BY THE BAND ITSELF -- v4661. *** limn.ts adds
        // complete * band * 1.20 rather than scaling rimE, and the difference is the whole point: `band` is
        // the gaussian that says WHERE the edge is, so the flash is confined to the arc and cannot leak into
        // the interior. Scaling rimE instead would have multiplied the fresnel and the arc profile too --
        // the same number, a different picture, and a brighter everything rather than a brighter EDGE.
        const rimE = rimlight.mul(arcProfile).mul(float(1.70).add(VOICE.mul(1.15)))
            .add(COMPLETE.mul(band).mul(MH_COMPLETE_SINGLE.limnRing)).toVar();

        // THE INTERIOR HINT: the arc as a direction in three dimensions, the volume glowing faintly where
        // that light entered. limn.ts: "It costs one line and it is the difference between a rim drawn ON a
        // dark disc and a rim lighting a dark VOLUME." The exponent is 2.2, down from 3 on murmur's own note
        // that a lower power is a wider wash.
        const arcDir = vec3(cos(phi0), sin(phi0), float(0.0)).toVar();
        // *** AND limn IS THE ONLY SPECIES WITH THREE complete SITES -- v4661. *** 1.60 on the shared
        // interior line since v4658, the ring above, and 0.90 here on the interior HINT: the volume glowing
        // faintly where the arc's light entered. They are three because they are three different things --
        // the whole interior, the edge, and the wash the edge throws inward -- and a port that folded them
        // into one number would brighten the disc uniformly and lose the arc.
        const hintAmt = float(0.22).add(uniforms.innerHint.mul(0.38)).mul(float(1.0).add(VOICE.mul(0.9)))
            .mul(float(1.0).add(COMPLETE.mul(MH_COMPLETE_SINGLE.limnHint))).toVar();
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
        const r0 = clamp(float(0.54).mul(float(1.0).sub(VOICE.mul(0.24))), 0.20, 0.70).toVar();
        // *** THIS CLOCK WAS ON THE WRONG SIGNAL, AND THE WHOLE CLOSURE NEVER READ PACE ONCE. *** comet.ts:
        // "float rate = 1.05 * (1.0 + 0.85 * live.pace + 0.95 * st.drive)" -- no voice term at all. This
        // file read VOICE at 0.85 and had no cadence and no drive, so the one hero whose subject is a point
        // TRAVELLING sped up when the user spoke and ignored how busy the exchange was. v4641 moved eight
        // sites off still's glintRate onto PACE and could not have caught this one: it was not reading
        // glintRate, it was reading the wrong live signal, which that round's census had no row for.
        //
        // AND THE REPAIR HAD TO WAIT FOR THE MECHANISM. Adding a cadence term to rate * t would have shipped
        // a NEW teleport -- pace moves constantly -- so the integrated form is not a refinement on top of the
        // fix, it is what makes the fix safe to make.
        const rate = float(1.05).mul(float(1.0).add(PACE.mul(0.85)).add(DRIVE.mul(0.95))).toVar();
        const psi = KIT.mhDriftPhase(ratePhase(float(1.05), 0.85, 0.0, 0.95),
            rate, float(0.38), float(3.0), uniforms.time).toVar();
        // Head width: comet.ts's first cut ran at 0.086 and "the head was a soft blob half the size of the core
        // it was supposed to be orbiting inside: a point of light has to be a POINT or the trail behind it has
        // nothing to have come from." The tube is deliberately WIDER than the nucleus -- true of comets, and
        // necessary because a tube thinner than the march step aliases the way the head did.
        const hw = float(0.028).add(uniforms.pointSize.mul(0.030)).mul(float(1.0).add(VOICE.mul(0.45))).toVar();
        const tubeW = hw.mul(1.45).toVar();
        // *** comet's IGNITION ADDS NO LIGHT: IT LENGTHENS THE TRAIL -- v4660. *** comet.ts:
        // decay = mix(decay, 9.0, st.sweep) inside the complete guard, and `decay` sits in the DENOMINATOR
        // of exp(-age / decay), so a larger one fades SLOWER and "the orbit fills in behind the head, out to
        // wherever the sweep has reached". The flash is the path becoming visible, which is the one thing
        // comet has that nothing else does. No guard is needed: mh_state's sweep is identically 0 outside
        // SUCCESS, and mix(decay, 9.0, 0) IS decay, so the branchless form is the same number everywhere.
        //
        // *** AND TWO MORE TERMS ON THE SAME LINE THAT THIS PORT NEVER CARRIED. *** comet.ts spells the base
        // as (1.30 + 2.60*trailK) * (1 + 1.25*st.drive) * mix(1.0, 0.40, small): the lean LENGTHENS the
        // trail and the small mounts shorten it to two fifths -- "a full lap of smear on a 44 px badge".
        // Both are bounded multipliers on a decay rather than on a clock, so neither can teleport anything.
        const CT = MH_COMET_TRAIL;
        const decay = mix(float(1.30).add(uniforms.trail.mul(2.60))
            .mul(float(1.0).add(DRIVE.mul(CT.driveK)))
            .mul(mix(float(1.0), float(CT.small), smallK)), float(CT.to), SWEEP).toVar();

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
        // comet's SECOND settle, and the reason MH_SETTLED_COMET_HEAD exists as its own constant: comet.ts
        // spends 0.25 here, on the point of light, and 0.20 on the interior -- the species whose subject IS
        // one bright point settles the point harder than the body around it. The (1 + 2.2 * st.complete)
        // factor its file also carries is comet's OWN ignition figure, not the shared shell, and belongs to
        // the per-species round that follows this one.
        // *** AND comet's complete IS ON THE SAME POINT OF LIGHT, AT 2.20 -- THE LARGEST IN THE ROSTER --
        // v4661. *** The settle above is 0.25 on this brightness and the flash is nearly nine times it, which
        // is comet's whole shape written in two numbers: the head FLARES and then keeps a quarter of it.
        // v4660 gave comet's sweep the trail's length; this is the only light comet's complete touches.
        const headBright = float(1.0).add(VOICE.mul(1.30))
            .mul(float(1.0).add(SETTLED.mul(MH_SETTLED_COMET_HEAD)))
            .mul(float(1.0).add(COMPLETE.mul(MH_COMPLETE_SINGLE.cometHead)));
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
        const swellD = float(0.22).add(KIT.mhBreath(uniforms.time, float(0.9)).mul(0.78)).mul(VOICE).toVar();
        const coreC = vec3(
            sin(uniforms.time.mul(0.213).add(0.6)).mul(0.028),
            sin(uniforms.time.mul(0.167).add(2.4)).mul(0.026),
            sin(uniforms.time.mul(0.139).add(4.1)).mul(0.024)).toVar();
        // THE CORE IS SMALL, and has to be: "a core that fills the body is not a light inside glass, it is a
        // lamp with a shade." At a quarter of the radius it occupies a sixtieth of the volume, leaving the
        // rest for the refraction to be visible in -- and the refraction is the species.
        const coreR = float(0.17).add(float(1.0).sub(uniforms.tension).mul(0.10)).mul(float(1.0).add(swellD.mul(0.22))).toVar();
        // *** THE ONE SETTLE IN THE ROSTER THAT IS NOT AN INTERIOR GAIN. *** droplet.ts:
        // coreBright = 1.0 + 0.85 * live.voice + 0.35 * st.settled -- ADDED beside the voice rather than
        // multiplying a marched accumulation, so it is transcribed here and droplet is excluded from the
        // shared interior factor at the bottom of main. Normalising it into the others' shape would have been
        // tidier and would have been a different species.
        // *** AND THE complete LANDS ON THE SAME LINE, ADDITIVELY, AT 0.26 -- v4661. *** droplet.ts spells
        // coreBright as 1 + 0.85*live.voice + 0.35*st.settled + 0.26*st.complete: three signals ADDED to a
        // brightness rather than multiplying an interior, which is the shape this species keeps for the same
        // reason MH_SETTLED.droplet is carried outside MH_SETTLED_INTERIOR. The flash is the smallest in the
        // roster and that is the species: droplet's success is a body that swells, not a lamp that flares.
        const coreBright = float(1.0).add(VOICE.mul(0.85)).add(SETTLED.mul(MH_SETTLED.droplet))
            .add(COMPLETE.mul(MH_COMPLETE_SINGLE.dropletCore)).toVar();
        const accD = float(0.0).toVar();
        // droplet weights by depth like still, and carries the `fade` a SECOND time -- its e already includes
        // mh_inside and the hue term multiplies by it again. That is droplet.ts as written ("the near half of
        // the ray one way, the far half the other"), ported rather than tidied.
        const accHD = float(0.0).toVar();
        const transD = float(1.0).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const sM = float(i).add(0.5).mul(ds);
            const pD = P.add(rd.mul(sM));
            // droplet.ts: "a shell of light leaves the heart and reaches the surface. It is a TRAVELLING term
            // only -- the first cut added a flat lift alongside it and success rendered as a solid white
            // disc, which is precisely the white overlay the family law forbids." Its `e = (shell + med) *
            // fade` is the one of the seven where the source ALSO multiplies the shell by the membership,
            // which is the shape this file already had for all seven.
            const eD = KIT.mhMedium(pD, uniforms.time, float(2.1)).mul(0.090)
                .add(igniteAt(length(pD))).mul(KIT.mhInside(pD)).toVar();
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
            .mul(mix(float(1.0), float(1.70), smallK)).mul(float(1.0).add(VOICE.mul(0.30))).toVar();
        const opalBright = float(0.82).add(uniforms.flashes.mul(0.55)).mul(float(1.0).add(VOICE.mul(0.85))).toVar();
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
            // opal.ts pulls each flash toward FULL on the flash: life = mix(life, 1.0, st.complete * 0.85).
            // A saturation, not a gain -- at the peak the four lives arrive together whatever they were.
            const life = KIT.mhCompleteLift(KIT.mhOpalLife(float(fk), uniforms.time), COMPLETE,
                float(MH_COMPLETE_LIFT.opal.k), float(MH_COMPLETE_LIFT.opal.over)).toVar();
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
            const eM = KIT.mhMedium(pO, uniforms.time, float(2.1)).mul(medO)
                .add(igniteAt(length(pO))).mul(KIT.mhInside(pO)).toVar();
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
        // *** abyss's SLOT GAINS murmur's CADENCE AND LEAN, AND ITS DIVISOR MOVES INTO THE PHASE -- v4656. ***
        // abyss.ts divides by (1 + 0.55*voice + 0.35*pace + 1.60*drive); the shader twin of mhAbyssSlot
        // carried the voice term alone until this round, while render/murmurKit.mjs's abyssSlot had all
        // three from the start. TWO CALLS OF ONE FUNCTION: the BASE, with every signal at zero, is what the
        // slot count integrates against, and the instantaneous length is what murmur's 0.9 s lead-in and the
        // returned duration are measured in. Their ratio IS the signal sum, which is what makes the pair
        // checkable rather than two numbers that have to agree by inspection.
        const SLA = MH_SLOT_SIGNAL.abyss;
        const abyssBase = KIT.mhAbyssSlot(uniforms.rarity, float(0.0), float(0.0), float(0.0), smallK).toVar();
        const abyssSlotNow = KIT.mhAbyssSlot(uniforms.rarity, VOICE, PACE, DRIVE, smallK).toVar();
        const thirdC = float(1.0).sub(smoothstep(float(0.30), float(0.72), smallK)).toVar();
        const abyssRad = float(0.155).add(uniforms.creatures.mul(0.075)).mul(mix(float(1.0), float(1.80), smallK)).toVar();
        const abyssBright = float(0.85).add(uniforms.creatures.mul(0.75))
            .mul(float(1.0).add(VOICE.mul(0.95))).mul(mix(float(1.0), float(1.45), smallK)).toVar();
        const abyssReach = float(0.62).add(uniforms.drift.mul(0.30)).toVar();
        const glowE = float(0.0).toVar();
        const glowH = float(0.0).toVar();
        for (let k = 0; k < 3; k++) {
            const seed = [31.0, 37.0, 41.0][k], slot = [1.0, 1.37, 1.81][k];
            const f = KIT.mhFlourishPhase(
                KIT.mhRatePhase(float(1.0).div(abyssBase.mul(slot)), uniforms.time,
                    float(SLA.pace), uniforms.paceInt, float(SLA.voice), uniforms.voiceInt,
                    float(SLA.drive), uniforms.driveInt),
                abyssSlotNow.mul(slot), float(seed)).toVar();
            const wk = k < 2 ? float(1.0) : thirdC;
            const fk = k;
            const ga = f.z.mul(6.2831853).add(fk * 1.7).toVar();
            // abyss.ts: "under drive they all take one heading and the abyss becomes a current" -- all THREE
            // lanes, which is why this sits inside the loop and takes the same mix still's single path does.
            const wanderA = vec3(cos(ga), sin(ga.mul(1.6).add(fk)).mul(0.40), sin(ga.mul(0.8).add(1.3))).toVar();
            const dirA = KIT.mhDriveHeading(wanderA, headV, DRIVE, float(HEAD.k)).toVar();
            const sideA = normalize(TSL.cross(dirA, vec3(0.08, 1.0, 0.14))).toVar();
            const gp = sideA.mul(f.z.mul(2.0).sub(1.0).mul(0.42).mul(float(1.0).sub(DRIVE.mul(FORM.lateral))))
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
        const medA = mix(float(0.022), float(0.014), smallK).mul(float(1.0).add(VOICE.mul(0.60))).toVar();
        Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
            const pA = P.add(rd.mul(float(i).add(0.5).mul(ds)));
            const eM = KIT.mhMedium(pA, uniforms.time, float(1.9)).mul(medA)
                .add(igniteAt(length(pA))).mul(KIT.mhInside(pA)).toVar();
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
        const energy = species === "tempest" ? clamp(VOICE.mul(0.85), 0.0, 1.6).toVar() : float(0.0).toVar();
        const mScale = float(MIST.scale).mul(mix(float(1.0), float(MIST.small), smallK)).toVar();
        const mWarp = float(MIST.warp).mul(mix(float(1.0), float(0.60), smallK)).toVar();
        const mFold = float(MIST.foldB).add(foldK.mul(MIST.foldK)).mul(float(1.0).add(energy.mul(0.85)))
            .mul(mix(float(1.0), float(0.55), smallK)).toVar();
        // *** THE OUTPUT-MULTIPLIED CLOCK, INTEGRATED -- v4655. *** murmur scales the WHOLE drift result by
        // (1 + ...), which scales the secular term and the wobble alike. Only the secular one grows without
        // limit, so the repair puts the signal integrals there and leaves the wobble's amplitude reading the
        // instantaneous factor, exactly as the rate-into-drift family does. Held signals make the two
        // spellings identical: base*(t + k*s*t) + (k*base*(1+k*s)/w2)*sin IS (base*t + (k*base/w2)*sin) *
        // (1 + k*s), which is why this migration moves no recorded frame.
        //
        // THE COEFFICIENT IS FOLDED AT BUILD TIME AND THE CLAMP IS PROVEN INERT. `energy` is
        // clamp(0.85 * VOICE, 0, 1.6) and the conditioned voice tops out at 0.999350 across every state and
        // level, so energy reaches 0.849 and the clamp NEVER bites -- measured, not assumed, because a live
        // clamp would make the integral of energy something other than 0.85 times the integral of VOICE and
        // this whole factoring would stop being exact.
        const mistBase = float(MIST.drB).add(foldK.mul(MIST.drK)).toVar();
        const mistKV = (species === "tempest" ? 0.85 * 0.95 : 0) + 0.35;
        const mDrFactor = float(1.0).add(energy.mul(0.95)).add(VOICE.mul(0.35)).toVar();
        const mDr = KIT.mhDriftPhase(
            KIT.mhRatePhase(mistBase, uniforms.time, float(0.0), uniforms.paceInt,
                float(mistKV), uniforms.voiceInt, float(0.0), uniforms.driveInt),
            mistBase.mul(mDrFactor), float(0.45), float(MIST.drLane), uniforms.time).toVar();
        const mAbsorb = float(MIST.absorb).mul(float(0.55).add(densityK.mul(0.85))).toVar();
        const mEmit = float(MIST.emitB).add(densityK.mul(MIST.emitK)).toVar();

        // THE BURIED GESTURE. nebula gets ONE glint on a 7.2 s slot and no depth mask; tempest gets TWO
        // lightning lanes on 2.9 and 4.3 s slots that "interleave without ever landing together", each
        // depth-MASKED to the inner two thirds. That mask is the species' one inviolable rule.
        // *** tempest's TWO LIGHTNING LANES WERE RE-INDEXING ON EVERY CHANGE OF VOICE -- v4656. *** This is
        // the one of the three that was LIVE: the divisor was already wired, so `floor(t / SLOT)` already
        // jumped, and MEASURED after half an hour of running it moved TWENTY-ONE SLOTS in a single frame
        // while the envelope stepped 0.9614 of its range. A bolt does not brighten into that: it is a
        // different bolt, with a different direction, appearing where the last one was.
        //
        // The coefficient is folded at build time for the reason mist's drift one is: `energy` is
        // clamp(0.85*VOICE, 0, 1.6) and the clamp is inert by 1.88x, so 1.30 * 0.85 is a constant and the
        // slot count is an exact integral. nebula keeps its fixed 7.2 s slot and the PLAIN clock, because a
        // slot that does not move has no index to re-roll and migrating it would move a frame for nothing.
        const SLT = MH_SLOT_SIGNAL.tempest;
        const mistRate = float(1.0).div(float(1.0).add(energy.mul(1.30))).toVar();
        // The two lanes are spelled out rather than built by a helper: tools/ship/murmurGesture-selfcheck.mjs
        // reads these call sites to check that the slot COUNT integrates against a style base while the
        // LENGTH carries the live signal, and a census cannot see through a closure.
        const flA = species === "tempest"
            ? KIT.mhFlourishPhase(
                KIT.mhRatePhase(float(1.0).div(float(MH_TEMPEST_BOLT.lanes[0].slot)), uniforms.time,
                    float(SLT.pace), uniforms.paceInt, float(SLT.voice), uniforms.voiceInt,
                    float(SLT.drive), uniforms.driveInt),
                float(MH_TEMPEST_BOLT.lanes[0].slot).mul(mistRate),
                float(MH_TEMPEST_BOLT.lanes[0].seed)).toVar()
            : KIT.mhFlourish(uniforms.time, float(3.0), float(7.2)).toVar();
        const flB = KIT.mhFlourishPhase(
            KIT.mhRatePhase(float(1.0).div(float(MH_TEMPEST_BOLT.lanes[1].slot)), uniforms.time,
                float(SLT.pace), uniforms.paceInt, float(SLT.voice), uniforms.voiceInt,
                float(SLT.drive), uniforms.driveInt),
            float(MH_TEMPEST_BOLT.lanes[1].slot).mul(mistRate),
            float(MH_TEMPEST_BOLT.lanes[1].seed)).toVar();
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
            const eM = dens.mul(glowIn).mul(mEmit).mul(float(1.0).add(VOICE.mul(MIST.voiceE))).toVar();
            // *** THE TWO CLOUDS IGNITE WHOLE AND THEN THE RING TRAVELS THROUGH WHAT IS ALREADY LIT. ***
            // nebula.ts: "the cloud ignites from the inside and a front travels out through it, brightening
            // what is already there" -- which is two statements, e *= 1 + preK * complete and then the shell,
            // and it is why nebula and tempest are the only two of the seven with a preK at all. The ring is
            // weighted by the LOCAL DENSITY for the same reason tempest's lightning is: a front inside a cloud
            // is seen as the cloud lighting up.
            //
            // *** AND THE TWO PUT IT ON OPPOSITE SIDES OF THEIR OWN GESTURE, WHICH IS NOT A TIDYING MATTER. ***
            // nebula's ignition block sits ABOVE its gesture (nebula.ts lines 111-117, gesture at 119) and
            // tempest's sits BELOW its bolts (tempest.ts line 120, ignition at 123), so tempest's pre-multiply
            // brightens its lightning and nebula's does not. Transcribed as shipped: normalising the two onto
            // one order would have been one line shorter and would have moved tempest's brightest pixels.
            const igniteMist = () => {
                eM.mulAssign(float(1.0).add(COMPLETE.mul(IG.preK)));
                eM.addAssign(igniteAt(rp).mul(dens));
            };
            if (species === "nebula") igniteMist();
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
                igniteMist();   // BELOW the bolts, per tempest.ts -- see igniteMist's note
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
            const spanK = float(1.0).add(VOICE.mul(0.22)).add(flF.x.mul(0.16)).toVar();
            const third = float(1.0).sub(smoothstep(float(0.28), float(0.68), smallK)).toVar();
            const thick = float(FA.thickB).add(layersK.mul(FA.thickK)).mul(mix(float(1.0), float(1.90), smallK)).toVar();
            const foldAmp = float(FA.foldB).add(parallaxK.mul(FA.foldK))
                .mul(float(1.0).add(VOICE.mul(0.55))).mul(mix(float(1.0), float(0.50), smallK)).toVar();
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
                    // *** fathom's SHELLS LIGHT IN SEQUENCE -- v4660. *** fathom.ts: "SUCCESS travels outward
                    // one layer at a time: shell 2 lights first, then 1, then 0, as the sweep passes each
                    // one's turn." turn = (2 - k) * 0.33, so k = 2 -- the INNERMOST, since MH_FATHOM's
                    // weights fall away inward -- has turn 0 and its window is centred at sweep 0.16. The
                    // flash starts in the middle of the nest and travels out, the same direction the shell
                    // runs for the seven species that have one.
                    const TRN = MH_IGNITE_TURN;
                    const en = graze.mul(float(FA.eB).add(foldOf(dir, k).mul(0.5).add(0.5).mul(FA.eK)))
                        .mul(lit).mul(WGT[k])
                        .mul(float(1.0).add(KIT.mhIgniteTurn(float(2 - k), COMPLETE, SWEEP,
                            float(TRN.step), float(TRN.lead), float(TRN.edge),
                            float(TRN.flat), float(TRN.gain)))).toVar();
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
            const sharp = max(float(GE.sharpB).add(facetK.mul(GE.sharpK)).sub(VOICE.mul(GE.sharpV)), float(0.7)).toVar();
            const face = pow(clamp(dot(nrm, keyG), 0.0, 1.0), sharp).toVar();
            // *** geode's IGNITION IS FLAT, AND THAT IS THE SPECIES RATHER THAN AN OMISSION -- v4660. ***
            // geode.ts: `if (st.complete > 0.001) lit += st.complete * 0.70;` -- no sweep anywhere in it.
            // geode's light is a facet term on a NORMAL; there is no path for a front to travel along, so
            // the stone simply brightens. It is in MH_IGNITE_FLAT_GEODE rather than left inline because a
            // reader who found three travelling figures and one absence would assume the fourth was missing.
            const litG = float(GE.litB).add(face.mul(GE.litK))
                .add(flG.x.mul(1.70).mul(pow(clamp(dot(nrm, normalize(vec3(...GE.axes[0]).add(vec3(...GE.axes[2])))), 0.0, 1.0), float(3.0))))
                .add(COMPLETE.mul(MH_IGNITE_FLAT_GEODE)).toVar();
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
            // arc.ts: "Responding stills the wander and takes the bow out." TWO terms, and they are
            // different verbs: sway is the amplitude of the frame's own rocking, pin is how far the arc's
            // midpoint sits off centre. Stilling one without flattening the other would be a steady comma.
            const sway = float(AR.swayB).add(swayKn.mul(AR.swayK))
                .mul(float(1.0).sub(DRIVE.mul(FORM.sway))).toVar();
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
                .mul(float(1.0).add(VOICE.mul(AR.pinVoice)).add(flA.x.mul(AR.pinFlourish)))
                .mul(float(1.0).sub(DRIVE.mul(FORM.pin))).toVar();
            const Rc = float(AR.rcB).add(bowK.mul(AR.rcK)).toVar();
            const span = float(AR.spanB).add(bowK.mul(AR.spanK))
                .mul(mix(float(1.0), float(AR.spanSmall), smallK)).toVar();
            const cz = pin.sub(Rc).toVar();

            // A THREAD, and its width is a FREE DESIGN DECISION now rather than a sampling constraint --
            // arc.ts: "Once the sampling constraint is gone the width is a free design decision again: 0.052
            // is five per cent of the sphere's radius, and it is that because that is what reads as
            // calligraphic." That sentence is the entire justification for the machinery above it.
            const w = float(AR.wB).add(bowK.mul(AR.wK)).mul(mix(float(1.0), float(AR.wSmall), smallK)).toVar();
            const bright = float(AR.brightB).add(VOICE.mul(AR.brightVoice))
                .mul(float(1.0).add(flA.x.mul(AR.brightFlourish))).toVar();
            // The moire gate, evaluated through the kit rather than baked: at this port's nominal 120 pt mount
            // arc's 4.2 cycles are comfortably resolved and it returns 1, but it is COMPUTED, so a reader can
            // check it against kit.ts instead of taking a 1 on trust.
            const shimAmt = float(KIT_AA(AR.shimCycles)).mul(float(1.0).sub(smallK))
                .mul(PACE.mul(AR.shimPace)).toVar();

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
                // *** AND THE IGNITION RUNS THE SAME FIGURE ALONG THE SAME AXIS -- v4659. *** arc.ts runs
                // its flash as this species' own gesture pulse driven by st.sweep instead of the gesture's
                // own position, and drawn tighter: 0.34 for the gesture against 0.30 for the ignition. The
                // success is the thing the species already does, once, travelling the whole length.
                const IA_A = MH_IGNITE_AXIS.arc;
                const pulse = flA.x.mul(0.95).mul(exp(pr.mul(pr).negate()))
                    .add(KIT.mhIgniteAxis(th, COMPLETE, SWEEP, span.mul(IA_A.lo), span.mul(IA_A.hi),
                        float(IA_A.width), float(IA_A.gain), float(IA_A.flat))).toVar();

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
                    .add(VOICE.mul(SO.rsVoice))).toVar();

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
                .mul(float(SO.simPaceB).add(PACE.mul(SO.simPaceK))).toVar();
            const sp3 = P.add(rd.mul(max(sFront, float(0.0)))).toVar();
            const gran = float(1.0).add(simAmt.mul(SO.granK)
                .mul(smoothstep(float(SO.granIn), float(SO.granOut), disc))
                .mul(KIT.mhNoise3(sp3.mul(SO.granScale).add(vec3(float(0.0), float(0.0),
                    uniforms.time.mul(float(SO.granRateB).add(PACE.mul(SO.granRateK))))))))
                .toVar();
            // sol.ts line 91 gives the core a SECOND complete, beside its voice: a gain on the brightness
            // itself, where the lift above is a saturation on each prominence.
            const coreE = disc.mul(gran).mul(float(SO.coreB).add(coronaK.mul(SO.coreK))
                .mul(float(1.0).add(VOICE.mul(SO.coreVoice)))
                .mul(float(1.0).add(COMPLETE.mul(MH_COMPLETE_SOL_CORE)))).toVar();

            const coronaW = float(SO.coronaWB).add(coronaK.mul(SO.coronaWK))
                .mul(float(1.0).add(VOICE.mul(SO.coronaWVoice))).toVar();
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
                // sol.ts: lift = mix(lift, 1.0, st.complete * 0.85) -- the same saturation opal uses, on the
                // prominences rather than the flashes.
                const lift = KIT.mhCompleteLift(sn.mul(sn), COMPLETE,
                    float(MH_COMPLETE_LIFT.sol.k), float(MH_COMPLETE_LIFT.sol.over)).toVar();
                const a1 = uniforms.time.mul(SO.rootA1 + SO.rootA1K * k).add(k * SO.rootPh1).toVar();
                const a2 = uniforms.time.mul(SO.rootA2 + SO.rootA2K * k).add(k * SO.rootPh2).toVar();
                // sol's tumbling root direction, leaned under drive. Its wander IS exactly unit already --
                // cos^2(a1)cos^2(a2) + sin^2(a2) + sin^2(a1)cos^2(a2) is 1 identically -- so murmur's
                // normalize on it is redundant and kept, and the mix is what does the work. sol is one of
                // the two species whose TARGET is pre-normalized; see MH_DRIVE_HEADING's note on why that
                // is not cosmetic.
                const dirW = normalize(vec3(cos(a1).mul(cos(a2)), sin(a2), sin(a1).mul(cos(a2)))).toVar();
                const dir = KIT.mhDriveHeading(dirW, headV, DRIVE, float(HEAD.k)).toVar();
                const tang = normalize(cross(dir, vec3(0.13, 0.97, 0.21)).add(1e-4)).toVar();
                const hk = float(SO.hkB).add(promK.mul(SO.hkK)).mul(lift)
                    .mul(float(1.0).add(VOICE.mul(SO.hkVoice))).toVar();
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

        // =====================================================================================================
        // *** AURA -- THE THIRTEENTH. "Ribbons of coloured light, drifting slowly INSIDE the glass." ***
        //
        // *** THE SPECIES IS ABOUT DEPTH, AND ITS TEST IS ONE SENTENCE: *** aura.ts -- "the ribbons cross in
        // front of and behind one another rather than sliding past each other in a plane."
        //
        // WHICH IS WHY THIS HERO GETS THE MARCH IT WOULD OTHERWISE BE APOLOGISING FOR. The three heroes before
        // it solved their interiors precisely to escape the five taps; this one needs them. "The interior
        // march then does the rest for FREE -- a tap that lands in a near sheet attenuates what the far ones
        // contribute behind it, so the crossings resolve as OCCLUSION rather than as ADDITION." A closed form
        // would have to sort the sheets to get that; a march gets the ordering from the marching.
        //
        // AND SHEETS RATHER THAN LOOPS, for the reason the kit's MH_AURA note quotes in full: a band on an
        // ellipse pinches to nothing twice per turn, and a pinch is a corner. "A sheet has no turns because it
        // has no ends inside the volume: it enters one side of the glass and leaves the other, the way a
        // length of silk hanging in water does."
        const buildAura = () => {
            const AU = MH_AURA;
            const ribbonK = clamp(uniforms.ribbon, 0.0, 1.0).toVar();
            const swirlK = clamp(uniforms.swirl, 0.0, 1.0).toVar();
            const d3K = clamp(uniforms.depth3d, 0.0, 1.0).toVar();

            // THE COUNT COMES DOWN TWICE RATHER THAN ONCE, and both are crossfades: "a count that pops is a
            // count the eye catches." The third goes by the knob, the second follows it down to a third of
            // its weight at the smallest mount.
            const third = smoothstep(float(AU.thirdIn), float(AU.thirdOut), ribbonK)
                .mul(float(1.0).sub(smoothstep(float(AU.thirdSmallIn), float(AU.thirdSmallOut), smallK))).toVar();
            const second = mix(float(1.0), float(AU.secondSmall),
                smoothstep(float(AU.secondSmallIn), float(AU.secondSmallOut), smallK)).toVar();
            const w3 = float(AU.w3B).add(ribbonK.mul(AU.w3K)).toVar();
            const WT = [float(1.0).toVar(), second, third];

            const wh = float(AU.whB).add(ribbonK.mul(AU.whK)).mul(mix(float(1.0), float(AU.whSmall), smallK)).toVar();
            const bw = float(AU.bwB).add(ribbonK.mul(AU.bwK)).mul(mix(float(1.0), float(AU.bwSmall), smallK)).toVar();

            // aura.ts: rate = (0.17 + 0.24*swirlK) * (1 + 0.85*live.voice + 0.45*live.pace + 1.05*st.drive).
            // This file carried the voice term alone, so the ribbons answered a raised voice and not a busy
            // exchange. The base is the same for all three lanes and each lane scales it, so ONE secular
            // phase is built and scaled the same way -- which is also why the three stay in formation.
            const rateBase = float(AU.rateB).add(swirlK.mul(AU.rateK)).toVar();
            const rate = rateBase.mul(float(1.0).add(VOICE.mul(AU.rateVoice))
                .add(PACE.mul(AU.ratePace)).add(DRIVE.mul(AU.rateDrive))).toVar();
            const rateSec = KIT.mhRatePhase(rateBase, uniforms.time,
                float(AU.ratePace), uniforms.paceInt, float(AU.rateVoice), uniforms.voiceInt,
                float(AU.rateDrive), uniforms.driveInt).toVar();
            // THE RIPPLE IS KEPT LOW DELIBERATELY: "past about 0.3 the sheet folds back on itself along the
            // view ray and draws a bright seam where a fold is edge-on -- the loop's cusp problem returning by
            // another road."
            const amp = float(AU.ampB).add(d3K.mul(AU.ampK))
                .mul(float(1.0).add(VOICE.mul(AU.ampVoice)))
                .mul(mix(float(1.0), float(AU.ampSmall), smallK)).toVar();

            // The three frames, built once outside the march rather than three times inside it.
            const PH = [], RO = [], AY = [], AX = [], OF = [];
            for (let k = 0; k < 3; k++) {
                PH.push(KIT.mhDriftPhase(rateSec.mul(AU.rateLane[k]), rate.mul(AU.rateLane[k]),
                    float(AU.driftWob[k]), float(k + 1), uniforms.time).add(AU.driftPhase[k]).toVar());
                RO.push(float(AU.rollB[k]).add(sin(uniforms.time.mul(AU.rollRate[k]).add(AU.rollPhase[k])).mul(AU.rollAmp[k])).toVar());
                AY.push(KIT.mhDrift(uniforms.time, float(AU.yawRate[k]), float(AU.yawWob[k]), float(AU.yawLane[k]))
                    .add(AU.yawPhase[k]).toVar());
                AX.push(float(AU.tiltB[k]).add(sin(uniforms.time.mul(AU.tiltRate[k]).add(AU.tiltPhase[k])).mul(AU.tiltAmp[k])).toVar());
                OF.push(mix(float(AU.offsets[k]), float(AU.offsetsSmall[k]), smallK).toVar());
            }
            const shimAmt = float(KIT_AA(AU.shimCycles)).mul(float(1.0).sub(smallK))
                .mul(float(AU.shimB).add(PACE.mul(AU.shimK))).toVar();

            const accA = float(0.0).toVar(), accAH = float(0.0).toVar();
            const transA = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pA = P.add(rd.mul(float(i).add(0.5).mul(ds))).toVar();
                const fade = KIT.mhInside(pA).toVar();
                // ONE SHEET, THREE TIMES. In the ribbon's own rolled and tilted frame the surface is
                // q.y = a ripple in q.x and q.z, offset along the frame's normal; dh is the signed distance to
                // it and q.z is how far across its face this point is. Both go into ONE squared argument, so
                // the ribbon is a gaussian slab in one direction and a gaussian band in the other, "and every
                // edge it has is diffuse in both".
                const E = [];
                for (let k = 0; k < 3; k++) {
                    const R = AU.ripple[k];
                    const q = KIT.mhSpin(KIT.mhRoll(pA, RO[k]), AY[k], AX[k]).toVar();
                    const dh = q.y.sub(OF[k]).sub(amp.mul(R.am).mul(
                        sin(q.x.mul(R.fx).add(PH[k]))
                            .add(sin(q.z.mul(R.fz).sub(PH[k].mul(R.pk)).add(R.ph)).mul(R.cw)))).toVar();
                    const aK = dh.mul(dh).div(wh.mul(wh))
                        .add(q.z.mul(q.z).div(bw.mul(bw).mul(AU.faceMul[k]))).toVar();
                    // THE GRADIENT ALONG THE LENGTH, floored at 0.58 and never zero: "a ribbon that goes fully
                    // dark has been cut into pieces, and pieces are not silk."
                    const g = float(AU.gFloor).add(float(AU.gRide).mul(
                        float(0.5).add(sin(q.x.mul(AU.gFreq[k]).sub(uniforms.time.mul(AU.gRate[k])).add(AU.gPhase[k])).mul(0.5)))).toVar();
                    E.push(exp(aK.negate()).add(KIT.mhScatter(aK, float(AU.scatterAmp))).mul(g).mul(WT[k]).toVar());
                }
                // *** aura's IGNITION TRAVELS ROUND THE RIBBONS, AND IT IS A VON MISES -- v4660. *** aura.ts:
                // "A von Mises bump in the angle rather than a gaussian, because it wraps with no seam: a
                // seam here would be a dark notch running across all three ribbons at once." It is the only
                // figure in the roster that spends `sweep` as a position going ROUND something rather than
                // along it, which is why it is not in MH_IGNITE_AXIS with the four that travel.
                const LAP = MH_IGNITE_LAP;
                const angA = TSL.atan(pA.z, pA.x).toVar();
                const lap = float(1.0).add(KIT.mhIgniteLap(angA, COMPLETE, SWEEP,
                    float(LAP.flat), float(LAP.gain), float(LAP.k))).toVar();
                const ribbons = E[0].add(E[1]).add(E[2]).mul(w3).mul(lap)
                    .mul(float(1.0).add(shimAmt.mul(KIT.mhNoise3(pA.mul(AU.shimScale)
                        .add(vec3(float(0.0), float(0.0), uniforms.time.mul(AU.shimRate))))))).toVar();
                // THE HUE CONVERSATION, weighted by which ribbon is actually at this tap, "so a pixel where
                // two ribbons cross gets the average and the crossing reads as a blend rather than as a hard
                // seam between two colours".
                // ...and the hue takes the lap too. aura.ts: ribbons = (e0+e1+e2) * w3 * lap and
                // hueW = (e0*-0.70 + e1*0.55 + e2*1.0) * w3 * lap -- the same factor on both, for the reason
                // helix's has it on both: the hue this species reports is acc.y / acc.x, so lifting one
                // without the other drifts the colour through the flash.
                const hueW = E[0].mul(AU.hueW[0]).add(E[1].mul(AU.hueW[1])).add(E[2].mul(AU.hueW[2])).mul(w3).mul(lap).toVar();
                const med = KIT.mhMedium(pA, uniforms.time, float(AU.medLane)).mul(AU.medAmt).toVar();
                const eA = ribbons.mul(AU.ribbonGain).add(med).mul(fade).toVar();
                accA.addAssign(eA.mul(transA).mul(ds));
                accAH.addAssign(hueW.mul(AU.ribbonGain).mul(fade).mul(transA).mul(ds));
                // *** RIBBONS OCCLUDE: THIS IS THE LINE THAT TURNS THREE CURVES INTO THREE DEPTHS. *** The
                // coefficient is fitted against a capture and both its failure modes are named -- "at 9 the
                // far ribbon vanishes entirely and the body loses its sense of fullness, at 1.5 nothing
                // occludes anything and it is smoke again."
                transA.assign(transA.mul(exp(eA.mul(AU.absorb).add(MH_EXT).mul(ds).negate())));
            });
            const auraDensity = accA.mul(AU.gain).mul(mix(float(1.0), float(AU.gainSmall), smallK)).mul(uniforms.depth);
            return { density: auraDensity, accA, accAH };
        };

        // =====================================================================================================
        // *** FLUX -- THE FOURTEENTH. "An aurora streaming inside the glass." ***
        //
        // *** THE ONE HERO ALLOWED A BROAD FLOWING FIELD, and flux.ts says why the permission is needed: "an
        // aurora is not an object. Everything else in this collection is something IN the glass; this is the
        // only one whose interior is a field with a DIRECTION." ***
        //
        // AURORAE ARE BRIGHT AT THE BOTTOM AND FADE UPWARD, and that one profile is most of the species: "The
        // lower edge is where the atmosphere is dense enough to glow hard; above it the light thins out over
        // several times that height. So the vertical term is a sharp rise at the foot and a long exponential
        // decay above it, ASYMMETRIC ON PURPOSE -- a symmetric profile reads as a band of light and not as a
        // curtain hanging."
        //
        // *** AND UP IS NEGATIVE Y, WHICH IS A BUG THE SOURCE SHIPPED, FOUND AND WROTE DOWN. *** "A
        // colorEffect's y runs DOWN the screen, so the body frame's +y is the bottom of the picture -- and the
        // first cut hung its curtains from that, which put the bright foot along the TOP and the fade going
        // down. An upside-down aurora is not a subtle mistake; it reads as light pouring in from above rather
        // than as curtains standing on something." One negation fixes it, and it is the FIRST line of the
        // march below for exactly that reason.
        const buildFlux = () => {
            const FX = MH_FLUX;
            const streamK = clamp(uniforms.stream, 0.0, 1.0).toVar();
            const bendK = clamp(uniforms.bend, 0.0, 1.0).toVar();
            const heightK = clamp(uniforms.height, 0.0, 1.0).toVar();
            const flX = KIT.mhFlourish(uniforms.time, float(FX.flourishSlot), float(FX.flourishDur)).toVar();

            const ayF = KIT.mhDrift(uniforms.time, float(FX.yawRate), float(FX.yawWob), float(FX.yawLane)).toVar();
            const axF = float(FX.tiltB).add(sin(uniforms.time.mul(FX.tiltRate)).mul(FX.tiltAmp)).toVar();
            // flux's stream clock, on the same treatment as mist's -- its output multiplier reads the
            // cadence, so it teleported by t * dPace every time the exchange got busier.
            const fluxBase = float(FX.flowB).add(streamK.mul(FX.flowK)).toVar();
            const flow = KIT.mhDriftPhase(
                KIT.mhRatePhase(fluxBase, uniforms.time, float(FX.flowPace), uniforms.paceInt,
                    float(0.0), uniforms.voiceInt, float(0.0), uniforms.driveInt),
                fluxBase.mul(float(1.0).add(PACE.mul(FX.flowPace))),
                float(FX.flowWob), float(FX.flowLane), uniforms.time).toVar();
            const bend = float(FX.bendB).add(bendK.mul(FX.bendK))
                .mul(float(1.0).add(PACE.mul(FX.bendPace)))
                .mul(mix(float(1.0), float(FX.bendSmall), smallK)).toVar();
            const wF = float(FX.wB).add(bendK.mul(FX.wK)).mul(mix(float(1.0), float(FX.wSmall), smallK)).toVar();
            const hi = float(FX.hiB).add(heightK.mul(FX.hiK))
                .mul(float(1.0).add(VOICE.mul(FX.hiVoice))).toVar();
            const secondF = float(1.0).sub(smoothstep(float(FX.secondSmallIn), float(FX.secondSmallOut), smallK)).toVar();
            const thirdF = float(1.0).sub(smoothstep(float(FX.thirdSmallIn), float(FX.thirdSmallOut), smallK)).toVar();
            const WF = [float(1.0).toVar(), secondF, thirdF];
            const brightF = float(FX.brightB).add(VOICE.mul(FX.brightVoice)).toVar();
            const striGate = float(KIT_AA(FX.striCycles)).mul(float(1.0).sub(smallK)).toVar();
            const medAmtF = mix(float(FX.medB), float(FX.medS), smallK).toVar();

            const accF = float(0.0).toVar(), accFH = float(0.0).toVar();
            const transF = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pF = P.add(rd.mul(float(i).add(0.5).mul(ds))).toVar();
                const fadeF = KIT.mhInside(pF).toVar();
                const q = KIT.mhSpin(pF, ayF, axF).toVar();
                // *** UP IS POSITIVE Y HERE, AND TRANSCRIBING murmur's NEGATION LITERALLY PUT THE AURORA
                // UPSIDE DOWN -- the exact bug flux.ts's own comment is about, arrived at from the opposite
                // direction. *** flux.ts negates because "a colorEffect's y runs DOWN the screen, so the body
                // frame's +y is the bottom of the picture". THIS PORT'S FRAME IS NOT A colorEffect'S: the quad
                // is built from three's uv(), whose v is 0 at the BOTTOM (the note on `p` at the top of this
                // file says so), so +P.y is the TOP of the picture and already means UP.
                //
                // MEASURED BEFORE IT WAS BELIEVED: with the negation transcribed, the row-by-row light
                // profile peaked at y = -0.396 of the half-frame -- the upper third -- and fell away
                // downward, reading 0.443 as a lower-half-to-upper-half ratio. The foot was along the top.
                // "An upside-down aurora is not a subtle mistake; it reads as light pouring in from above
                // rather than as curtains standing on something."
                //
                // So the negation is DROPPED, and dropping it is what makes this port agree with murmur's
                // PICTURE rather than with murmur's SOURCE LINE. A port that copies a frame convention it
                // does not share has transcribed the letter and lost the thing.
                const yy = q.y.toVar();
                // THE VERTICAL PROFILE, shared by all three curtains: a sharp foot and a long fade upward.
                const foot = smoothstep(float(FX.footIn), float(FX.footOut), yy).toVar();
                // riseFrom is -0.52, so yy.sub(riseFrom) is the source's (yy + 0.52): how far ABOVE the foot
                // this tap is, clamped at zero so nothing below the foot decays.
                const rise = exp(max(yy.sub(float(FX.riseFrom)), float(0.0))
                    .div(max(hi, float(1e-3))).negate()).toVar();
                const vert = foot.mul(rise).toVar();

                // THREE SHEETS, AND THE WANDER IS WEIGHTED TOWARD DEPTH RATHER THAN HEIGHT. "A sheet whose
                // position swings hard with height LEANS, and three leaning sheets read as diagonal streaks
                // rather than as curtains hanging; the same swing read in z folds the curtain toward and away
                // from the viewer, which is what an aurora does."
                const EF = [];
                for (let k = 0; k < 3; k++) {
                    const S3 = FX.sheets[k];
                    const d = q.x.sub(float(S3.x).add(bend.mul(
                        sin(yy.mul(S3.fy).add(flow.mul(S3.ky)).add(S3.phy)).mul(S3.wy)
                            .add(sin(q.z.mul(S3.fz).sub(flow.mul(S3.kz)).add(S3.phz)).mul(S3.wz))))).toVar();
                    const aF = d.mul(d).div(wF.mul(wF).mul(S3.wm)).toVar();
                    EF.push(exp(aF.negate()).add(KIT.mhScatter(aF, float(FX.scatterAmp))).mul(WF[k]).toVar());
                }
                // THE STRIATION: the fine vertical structure real curtains have, gated so it retires itself
                // "the moment a cycle would be under two pixels".
                const stri = float(1.0).add(striGate.mul(FX.striK)
                    .mul(sin(q.z.mul(FX.striZ).add(yy.mul(FX.striY)).sub(flow.mul(FX.striFlow))))).toVar();
                // THE SURGE: "a brightening surge travels across the curtains from one side to the other.
                // Auroral substorm, in miniature."
                const sr = q.x.sub(mix(float(-0.9), float(0.9), flX.y)).div(0.42).toVar();
                // *** AND THE IGNITION RUNS THE SAME FIGURE ALONG THE SAME AXIS -- v4659. *** flux.ts runs
                // its flash as this species' own gesture pulse driven by st.sweep instead of the gesture's
                // own position, and drawn tighter: 0.42 for the gesture against 0.38 for the ignition. The
                // success is the thing the species already does, once, travelling the whole length.
                const IA_F = MH_IGNITE_AXIS.flux;
                const surge = flX.x.mul(0.85).mul(exp(sr.mul(sr).negate()))
                    .add(KIT.mhIgniteAxis(q.x, COMPLETE, SWEEP, float(IA_F.lo), float(IA_F.hi),
                        float(IA_F.width), float(IA_F.gain), float(IA_F.flat))).toVar();

                const curtains = EF[0].add(EF[1]).add(EF[2]).mul(vert).mul(brightF).mul(stri)
                    .mul(float(1.0).add(surge)).toVar();
                const hueWF = EF[0].mul(FX.hueW[0]).add(EF[1].mul(FX.hueW[1])).add(EF[2].mul(FX.hueW[2]))
                    .mul(vert).mul(brightF).mul(stri).toVar();
                const medF = KIT.mhMedium(pF, uniforms.time, float(FX.medLane)).mul(medAmtF).toVar();
                const eF = curtains.mul(FX.curtainGain).add(medF).mul(fadeF).toVar();
                accF.addAssign(eF.mul(transF).mul(ds));
                accFH.addAssign(hueWF.mul(FX.curtainGain).mul(fadeF).mul(transF).mul(ds));
                transF.assign(transF.mul(exp(eF.mul(FX.absorb).add(MH_EXT).mul(ds).negate())));
            });
            const fluxDensity = accF.mul(FX.gain).mul(uniforms.depth);
            return { density: fluxDensity, accF, accFH };
        };

        // =====================================================================================================
        // *** DUET -- THE FIFTEENTH. "Two lights orbiting a common centre inside the glass: the conversation." ***
        //
        // duet.ts: "TWO THINGS IN ONE VOLUME IS A DEPTH PROBLEM, and solving it properly is the whole species.
        // Two bright blobs going round each other on a flat disc is a loading spinner; two bodies passing in
        // front of and behind one another with the far one visibly dimmer and partly eaten by the near one is
        // a conversation happening in a space."
        //
        // BOTH BODIES ARE SOLVED AT THE RAY'S CLOSEST APPROACH, which is what lets the occlusion be EXACT
        // rather than sampled: the two distances sA and sB are known in closed form, so "which is in front"
        // is a comparison and not a guess. chorus next door solves its seven the same way, which is why the
        // two ship together.
        const buildDuet = () => {
            const DU = MH_DUET;
            const sepK = clamp(uniforms.sep, 0.0, 1.0).toVar();
            const orbitK = clamp(uniforms.orbit, 0.0, 1.0).toVar();
            const ratioK = clamp(uniforms.ratio, 0.0, 1.0).toVar();
            const flD = KIT.mhFlourish(uniforms.time, float(DU.flourishSlot), float(DU.flourishDur)).toVar();

            // THE PLANE, bounded away from both failures: "Face-on is the spinner; edge-on is a line."
            const lean = float(DU.leanB).add(sin(uniforms.time.mul(DU.leanRate)).mul(DU.leanAmp)).toVar();
            const prec = KIT.mhDrift(uniforms.time, float(DU.precRate), float(DU.precWob), float(DU.precLane)).toVar();
            const e1 = KIT.mhSpin(vec3(1.0, 0.0, 0.0), prec, float(0.0)).toVar();
            const e2 = KIT.mhSpin(vec3(float(0.0), sin(lean), cos(lean)), prec, float(0.0)).toVar();
            const nrm = cross(e1, e2).toVar();

            // duet.ts: "Cadence closes it a little, responding a lot, the gesture briefly, and success all
            // the way in." Four terms on one separation, and this round adds the second of them.
            // *** AND v4661 ADDS THE FOURTH AND LAST: "success all the way in". *** It is the only
            // SUBTRACTION st.complete makes anywhere in the roster -- every other site in eighteen species
            // makes something brighter or larger, and duet's brings the pair TOGETHER. At complete 1 the
            // separation is 38% of what it was, and the flare on the next line runs at the same instant, so
            // duet's success is two lights getting brighter as they converge.
            const rSep = mix(float(DU.rNear), float(DU.rFar), sepK)
                .mul(mix(float(1.0), float(DU.rSmall), smallK))
                .mul(float(1.0).sub(DRIVE.mul(FORM.sep)))
                .mul(float(1.0).sub(flD.x.mul(0.30)))
                .mul(float(1.0).sub(COMPLETE.mul(MH_COMPLETE_SINGLE.duetShrink))).toVar();
            // *** duet's RATE WAS TELEPORTING ON ITS OWN GESTURE, AND v4654 RECORDED THAT AS UNREACHABLE. ***
            // duet.ts: rate = (0.40 + 0.55*orbitK) * (1 + 0.55*live.pace + 0.90*st.drive + 0.85*fl.x). This
            // port carried the FLOURISH term and neither of the other two -- so the pair sped up for its own
            // gesture and ignored the exchange -- and mh_drift's phase is rate * t, so every time a gesture
            // fired the orbit jumped by t * dRate. MEASURED at 1.8152 rad in one 1/60 s frame after half an
            // hour, which is 29% of a whole turn of the shared orbit, against a flat 0.006244 integrated.
            //
            // *** THE RECORD SAID THE HOST COULD NOT SEE fl.x. IT CAN. *** mh_flourish is a pure function of
            // shader time, a lane and a slot LENGTH, and duet's two are style constants out of MH_DUET. So
            // the envelope is a deterministic function of the clock the host already integrates, and
            // render/aiPresenceOrbState.mjs accumulates it like any other signal. A signal the host does not
            // know has no integral to send -- but this was never one of those.
            const rateBase = float(DU.rateB).add(orbitK.mul(DU.rateK)).toVar();
            const rate = rateBase.mul(float(1.0).add(PACE.mul(DU.ratePace)).add(DRIVE.mul(DU.rateDrive))
                .add(flD.x.mul(DU.rateFlourish))).toVar();
            const psi = KIT.mhDriftPhase(
                KIT.mhRatePhase(rateBase, uniforms.time, float(DU.ratePace), uniforms.paceInt,
                    float(DU.rateFlourish), uniforms.duetFlourishInt, float(DU.rateDrive), uniforms.driveInt),
                rate, float(DU.orbitWob), float(DU.orbitLane), uniforms.time).toVar();
            // THE BRAID: "two things becoming one line without merging." Off at rest; the gesture alone
            // reaches it here, because this port has no drive signal wired.
            const braid = flD.x.mul(DU.braidFlourish).mul(sin(psi.mul(DU.braidRate))).toVar();
            const spoke = e1.mul(cos(psi)).add(e2.mul(sin(psi))).toVar();
            const A = spoke.mul(rSep).add(nrm.mul(braid)).toVar();
            const B = spoke.mul(rSep.negate()).sub(nrm.mul(braid)).toVar();

            const wA = float(DU.wAB).add(sepK.mul(DU.wAK)).mul(mix(float(1.0), float(DU.wASmall), smallK)).toVar();
            const wB = wA.mul(mix(float(DU.ratioLo), float(DU.ratioHi),
                mix(ratioK, float(1.0), smallK.mul(DU.ratioSmall)))).toVar();

            // *** THE BALANCE IS A SPLIT AND NOT A GAIN, AND THAT IS THE MEASURABLE FORM OF THE DESIGN. ***
            // brA + brB is 2 for every value of bal, so voice moves WHICH body has the floor without moving
            // how much floor there is. duet.ts: "Not both brighter, which would say nothing; brighter THERE
            // and dimmer here."
            const sway = float(DU.swayB).add(sin(KIT.mhDrift(uniforms.time, float(DU.swayRate),
                float(DU.swayWob), float(DU.swayLane))).mul(DU.swayAmp)).toVar();
            const bal = clamp(sway.add(VOICE.mul(DU.balVoice)), DU.balLo, DU.balHi).toVar();
            const brA = bal.mul(2.0).toVar(), brB = float(1.0).sub(bal).mul(2.0).toVar();

            // BOTH BODIES, AT THE RAY'S CLOSEST APPROACH. Two dot products each, no march.
            const toA = A.sub(P).toVar(), toB = B.sub(P).toVar();
            const sA = dot(toA, rd).toVar(), sB = dot(toB, rd).toVar();
            const argA = max(dot(toA, toA).sub(sA.mul(sA)), float(0.0)).div(max(wA.mul(wA), float(1e-6))).toVar();
            const argB = max(dot(toB, toB).sub(sB.mul(sB)), float(0.0)).div(max(wB.mul(wB), float(1e-6))).toVar();
            const visA = select(sA.greaterThan(0.0).and(sA.lessThan(L)),
                KIT.mhInside(P.add(rd.mul(sA))).mul(exp(sA.mul(-MH_EXT))), float(0.0)).toVar();
            const visB = select(sB.greaterThan(0.0).and(sB.lessThan(L)),
                KIT.mhInside(P.add(rd.mul(sB))).mul(exp(sB.mul(-MH_EXT))), float(0.0)).toVar();
            const coreA = exp(argA.negate()).mul(visA).toVar();
            const coreB = exp(argB.negate()).mul(visB).toVar();

            // *** THE OCCLUSION, AND IT IS THE LINE THAT TURNS "DIMMER" INTO "BEHIND". *** Whichever the ray
            // reaches first eats the other by its own density at this pixel. The branch is written as a pair
            // of selects because the shader has no branches -- and it is EXACT, because sA and sB are solved
            // rather than sampled. Without it "the pair reads as two lamps at different brightnesses rather
            // than as two objects at two depths".
            const aFirst = sA.lessThan(sB);
            const occA = select(aFirst, float(1.0), exp(coreB.mul(-DU.occlude))).toVar();
            const occB = select(aFirst, exp(coreA.mul(-DU.occlude)), float(1.0)).toVar();

            // *** THE FLARE, ON BOTH LIGHTS AND NOT ON THE BALANCE -- v4661. *** brA + brB is exactly 2 for
            // every value of bal, which is the measurable form of duet's "brighter THERE and dimmer here",
            // and a gate asserts it. Folding the flash into the balance would have broken that sum; putting
            // it on each solved light leaves the SPLIT alone and brightens the pair, which is what a flare
            // is. Two sites for one constant, for that reason.
            const flare = float(1.0).add(COMPLETE.mul(MH_COMPLETE_SINGLE.duetFlare)).toVar();
            const eA = coreA.mul(DU.coreGain).add(KIT.mhScatter(argA, float(DU.scatterAmp)).mul(visA))
                .mul(brA).mul(occA).mul(flare).toVar();
            const eB = coreB.mul(DU.coreGain).add(KIT.mhScatter(argB, float(DU.scatterAmp)).mul(visB))
                .mul(brB).mul(occB).mul(flare).toVar();

            const medAmtD = mix(float(DU.medB), float(DU.medS), smallK).toVar();
            const accD = float(0.0).toVar();
            const transD = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pD = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eD = KIT.mhMedium(pD, uniforms.time, float(DU.medLane)).mul(medAmtD)
                    .add(igniteAt(length(pD))).mul(KIT.mhInside(pD)).toVar();
                accD.addAssign(eD.mul(transD).mul(ds));
                transD.assign(transD.mul(exp(eD.mul(DU.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const duetDensity = accD.mul(DU.medGain).add(eA).add(eB).mul(uniforms.depth);
            return { density: duetDensity, eA, eB };
        };

        // =====================================================================================================
        // *** CHORUS -- THE SIXTEENTH. "Many faint lights breathing loosely, falling into alignment." ***
        //
        // *** THE SPECIES IS NOT THE BREATHING. *** chorus.ts spends its opening refusing that reading: "THE
        // ONE HERO LICENSED A RHYTHM, and the licence is narrow. The family's verbs are FLOW and SETTLE, and
        // breathing luminance is banned as a default motif precisely because it is the first thing everyone
        // reaches for. The carve-out is for a species whose concept literally IS a rhythm ... the thing the
        // species is actually about is not the breathing at all but the PHASE RELATIONSHIP between the
        // breaths."
        //
        // SO THE DESIGN IS SYNC, NOT PULSE: "At rest the voices are scattered across the cycle ... and what
        // the eye reads is a loose, uncountable shimmer with no beat in it, because nothing ever coincides. As
        // sync rises they gather, and at one they breathe as a single body. That transition from many rhythms
        // to one is the whole species, and it is why the rhythm had to be allowed: you cannot show alignment
        // without something to align."
        const buildChorus = () => {
            const CH = MH_CHORUS;
            const voicesK = clamp(uniforms.voices, 0.0, 1.0).toVar();
            const syncKn = clamp(uniforms.sync, 0.0, 1.0).toVar();
            const depthKn = clamp(uniforms.breath, 0.0, 1.0).toVar();
            const flC = KIT.mhFlourish(uniforms.time, float(CH.flourishSlot), float(CH.flourishDur)).toVar();

            // *** chorus's SUCCESS IS NOT LIGHT AT ALL: IT IS THE SYNC -- v4661. *** The only site in
            // eighteen species where st.complete moves a PARAMETER of the species rather than an intensity.
            // chorus.ts: "At rest the voices are scattered across the cycle ... As sync rises they gather,
            // and at one they breathe as a single body. That transition from many rhythms to one is the
            // whole species." So its flash is the ensemble ARRIVING at alignment, and the clamp is what
            // makes 0.55 enough: a species already near sync is pushed to exactly one and no further.
            const sync = clamp(syncKn.mul(CH.syncK).add(COMPLETE.mul(MH_COMPLETE_SINGLE.chorusSync)), 0.0, 1.0).toVar();
            const per = float(CH.perB).sub(PACE.mul(CH.perPace)).toVar();
            const breathe = float(CH.breatheB).add(depthKn.mul(CH.breatheK))
                .mul(mix(float(1.0), float(CH.breatheSmall), smallK)).toVar();
            const mid = float(1.0).sub(smoothstep(float(CH.midIn), float(CH.midOut), smallK)).toVar();
            const far = float(1.0).sub(smoothstep(float(CH.farIn), float(CH.farOut), smallK)).toVar();
            // THE RADIUS IS SET BY COUNTABILITY, not by taste: "at 0.14 against a spacing of about 0.35 the
            // seven ran together into one lobed mass and the ensemble stopped being countable, which is the
            // one thing an ensemble has to be."
            const rad = float(CH.radB).add(voicesK.mul(CH.radK)).mul(mix(float(1.0), float(CH.radSmall), smallK)).toVar();
            const brightC = float(CH.brightB).add(voicesK.mul(CH.brightK)).toVar();
            const turn = KIT.mhDrift(uniforms.time, float(CH.turnRate), float(CH.turnWob), float(CH.turnLane)).toVar();

            const voiceE = float(0.0).toVar(), voiceH = float(0.0).toVar();
            for (let k = 0; k < CH.count; k++) {
                const wk = k < 3 ? float(1.0).toVar() : (k < 5 ? mid : far);
                // A FIBONACCI SHELL: "evenly spread, never in a row or a ring." zc and the golden angle are
                // compile-time for zc and a node for the angle, because the shell TURNS.
                const zc = 1.0 - 2.0 * (k + 0.5) / CH.count;
                const rc = Math.sqrt(Math.max(1 - zc * zc, 0));
                const ang = turn.add(k * CH.golden).toVar();
                const dirk = vec3(cos(ang).mul(rc), float(zc), sin(ang).mul(rc)).toVar();
                const c = dirk.mul(float(CH.shellR).add(
                        sin(uniforms.time.mul(CH.shellRate + CH.shellRateK * k).add(k * CH.shellPhase)).mul(CH.shellWob)))
                    .add(vec3(sin(uniforms.time.mul(CH.driftRateX).add(k)).mul(CH.driftAmp),
                              sin(uniforms.time.mul(CH.driftRateY).add(k * CH.driftPhaseY)).mul(CH.driftAmp),
                              float(0.0))).toVar();

                // *** THE BREATH, AND THE PHASE LADDER SYNC CLOSES. *** At sync 0 voice k sits at
                // k * 0.897 of a turn -- seven phases spread over the whole cycle, so nothing ever coincides
                // and the ensemble's TOTAL barely moves. At sync 1 every phase is 0 and the seven swell
                // together. FLOORED AT 1 - breathe so "no voice ever goes out and the ensemble never blinks".
                const phase = mix(float(k * CH.phaseStep), float(0.0), sync).mul(2 * Math.PI).toVar();
                const sn = sin(uniforms.time.mul(2 * Math.PI).div(max(per, float(1e-3))).add(phase)).toVar();
                const life = float(1.0).sub(breathe).add(breathe.mul(sn).mul(sn)).toVar();
                // chorus.ts: life = mix(life, 1.0 + 0.45 * st.complete, st.complete * 0.9) -- the one target
                // in the roster that goes PAST full, so the seven voices overshoot together at the peak.
                const lifeF = KIT.mhCompleteLift(
                    life.add(select(flC.z.mul(6.999).floor().equal(float(k)), flC.x.mul(0.85), float(0.0))),
                    COMPLETE, float(MH_COMPLETE_LIFT.chorus.k), float(MH_COMPLETE_LIFT.chorus.over)).toVar();

                const to = c.sub(P).toVar();
                const s = dot(to, rd).toVar();
                const arg = max(dot(to, to).sub(s.mul(s)), float(0.0)).div(max(rad.mul(rad), float(1e-6))).toVar();
                const vis = KIT.mhInside(P.add(rd.mul(s))).mul(exp(s.mul(-MH_EXT))).toVar();
                // LEVEL PICKS OUT THE NEAREST rather than brightening everybody: "An ensemble where the front
                // row answers is a much better picture of being listened to than one where everybody gets
                // louder."
                const front = float(0.5).add(clamp(c.z, -1.0, 1.0).mul(0.5)).toVar();
                const lift = float(1.0).add(VOICE.mul(float(CH.liftB).add(front.mul(CH.liftFront)))).toVar();
                const eK = exp(arg.negate()).mul(CH.coreAmp).add(KIT.mhScatter(arg, float(CH.scatterAmp)))
                    .mul(vis).mul(lifeF).mul(lift).mul(brightC).mul(wk).toVar();
                const liveK = s.greaterThan(0.0).and(s.lessThan(L));
                voiceE.addAssign(select(liveK, eK, float(0.0)));
                voiceH.addAssign(select(liveK, eK.mul((k - 3) / 3), float(0.0)));
            }

            const medAmtC = mix(float(CH.medB), float(CH.medS), smallK).toVar();
            const accC = float(0.0).toVar();
            const transC = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pC = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eC = KIT.mhMedium(pC, uniforms.time, float(CH.medLane)).mul(medAmtC).mul(KIT.mhInside(pC)).toVar();
                accC.addAssign(eC.mul(transC).mul(ds));
                transC.assign(transC.mul(exp(eC.mul(CH.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const chorusDensity = accC.mul(CH.medGain).add(voiceE).mul(uniforms.depth);
            return { density: chorusDensity, voiceE, voiceH };
        };

        // =====================================================================================================
        // *** PRISM -- THE SEVENTEENTH. "Light entering the glass and softly splitting inside it." ***
        //
        // *** THE ENTRY POINT IS NOT ARBITRARY, AND IT IS THE SPECIES' ONE NON-NEGOTIABLE. *** prism.ts: "The
        // shafts begin where the specular highlight is, because that is where the picture already says the
        // light is coming from, and a prism whose beams enter somewhere else is a prism nobody believes for a
        // second. mh_key is a shared function for exactly this reason: the highlight and the entry point read
        // the same direction, including its slow drift." So this hero and mh_surface's specular read ONE
        // function, and the kit has carried it since v4629 for exactly this arrival.
        const buildPrism = () => {
            const PR = MH_PRISM;
            const beamsK = clamp(uniforms.beams, 0.0, 1.0).toVar();
            const splitK = clamp(uniforms.split, 0.0, 1.0).toVar();
            const driftK = clamp(uniforms.swing, 0.0, 1.0).toVar();
            const flP = KIT.mhFlourish(uniforms.time, float(PR.flourishSlot), float(PR.flourishDur)).toVar();

            const sw = KIT.mhDrift(uniforms.time, float(PR.swRate).add(driftK.mul(PR.swRateK)),
                float(PR.swWob), float(PR.swLane)).toVar();
            const O = normalize(KIT.mhKey(uniforms.time).add(
                vec3(sin(sw), cos(sw.mul(0.83)), sin(sw.mul(0.61)))
                    .mul(float(PR.entryJitter).add(driftK.mul(PR.entryJitterK))))).mul(PR.entryR).toVar();

            // *** NOT AIMED AT THE CENTRE, AND THAT IS THE DIFFERENCE BETWEEN SHAFTS AND TADPOLES. *** "their
            // length then foreshortens to barely more than their width and three shafts render as three
            // blobs."
            const axis = normalize(vec3(...PR.aim).sub(O)).toVar();
            // *** THE FAN OPENS ACROSS THE SCREEN BY CONSTRUCTION. *** u1 is the cross of the axis with the
            // VIEW direction, so it lies in the screen plane whatever the axis does -- "the fan is always
            // seen side-on and the split is always visible". u2 is then depth, and carries only the wobbles
            // that keep the three beams from being coplanar.
            const u1 = normalize(cross(axis, vec3(0.0, 0.0, 1.0)).add(vec3(1e-4, 0.0, 0.0))).toVar();
            const u2 = normalize(cross(axis, u1)).toVar();

            // prism.ts: "THE FAN. Responding closes it; the gesture opens it wider than it ever otherwise
            // goes." The two pull opposite ways on the same number, which is the species in one line.
            const div = float(PR.divB).add(splitK.mul(PR.divK)).mul(mix(float(1.0), float(PR.divSmall), smallK))
                .mul(float(1.0).sub(DRIVE.mul(FORM.fan)))
                .mul(float(1.0).add(flP.x.mul(PR.divFlourish))).toVar();
            const wob = (k) => sin(uniforms.time.mul(PR.wobRate[k]).add(PR.wobPhase[k])).mul(PR.wobble[k]);
            const D = [
                normalize(axis.sub(u1.mul(div)).add(u2.mul(wob(0)))).toVar(),
                normalize(axis.add(u2.mul(wob(1)))).toVar(),
                normalize(axis.add(u1.mul(div)).sub(u2.mul(wob(2)))).toVar(),
            ];

            // SHAFTS, NEVER RAYS: the width GROWS with distance from the entry. "A beam of constant width is
            // a laser; a beam that opens as it travels is a shaft of light in a medium."
            const w0 = float(PR.w0B).add(beamsK.mul(PR.w0K)).mul(mix(float(1.0), float(PR.w0Small), smallK))
                .mul(float(1.0).add(VOICE.mul(PR.w0Voice))).toVar();
            const wGrow = float(PR.wGrowB).add(beamsK.mul(PR.wGrowK)).toVar();
            const third = float(1.0).sub(smoothstep(float(PR.thirdIn), float(PR.thirdOut), smallK)).toVar();
            // *** prism's SECOND complete GOES ON brightP AND NOT ON `beams` -- v4661, and the site is the
            // claim. *** beams and hueWP BOTH read brightP, and only beams reads the pulse -- so a gain
            // spelled on `beams` would lift the energy and leave the hue numerator behind, and prism's hue
            // is the SPLIT between the outer beams and the anchor. v4660 found exactly that pairing twice in
            // one round, on aura's ribbons and helix's strands. Spelled here it reaches both by
            // construction rather than by remembering to write it twice.
            const brightP = float(PR.brightB).add(VOICE.mul(PR.brightVoice))
                .mul(float(1.0).add(COMPLETE.mul(MH_COMPLETE_SINGLE.prismBeam))).toVar();
            const shimAmt = float(KIT_AA(PR.shimCycles)).mul(float(1.0).sub(smallK))
                .mul(PACE.mul(PR.shimK)).toVar();
            const WT = [float(1.0).toVar(), float(1.0).toVar(), third];
            const WIDE = [1.0, PR.midWide, 1.0];

            const medAmtP = mix(float(PR.medB), float(PR.medS), smallK).toVar();
            const accP = float(0.0).toVar(), accPH = float(0.0).toVar();
            const transP = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pP = P.add(rd.mul(float(i).add(0.5).mul(ds))).toVar();
                const fadeP = KIT.mhInside(pP).toVar();
                const v = pP.sub(O).toVar();
                const vv = dot(v, v).toVar();
                const E = [], S1 = [];
                for (let k = 0; k < 3; k++) {
                    const sk = dot(v, D[k]).toVar();
                    const ww = w0.mul(WIDE[k]).add(wGrow.mul(max(sk, float(0.0)))).toVar();
                    const ak = max(vv.sub(sk.mul(sk)), float(0.0)).div(ww.mul(ww)).toVar();
                    // The beam STARTS after the entry and STOPS before the far wall, so a shaft is a length of
                    // light rather than a line to the edge of the glass.
                    const al = smoothstep(float(PR.alphaIn[0]), float(PR.alphaIn[1]), sk)
                        .mul(float(1.0).sub(smoothstep(float(PR.alphaOut[0]), float(PR.alphaOut[1]), sk))).toVar();
                    E.push(exp(ak.negate()).add(KIT.mhScatter(ak, float(PR.scatterAmp))).mul(al).mul(WT[k]).toVar());
                    S1.push(sk);
                }
                const run = float(1.0).add(shimAmt.mul(sin(S1[1].mul(PR.runFreq).sub(uniforms.time.mul(PR.runRate))))).toVar();
                const pr = S1[1].sub(flP.y.mul(PR.pulseFrom)).div(PR.pulseW).toVar();
                // *** AND THE IGNITION RUNS THE SAME FIGURE ALONG THE SAME AXIS -- v4659. *** prism.ts runs
                // its flash as this species' own gesture pulse driven by st.sweep instead of the gesture's
                // own position, and drawn tighter: 0.28 for the gesture against 0.26 for the ignition. The
                // success is the thing the species already does, once, travelling the whole length.
                const IA_P = MH_IGNITE_AXIS.prism;
                const pulse = flP.x.mul(PR.pulseAmp).mul(exp(pr.mul(pr).negate()))
                    .add(KIT.mhIgniteAxis(S1[1], COMPLETE, SWEEP, float(IA_P.lo), float(IA_P.hi),
                        float(IA_P.width), float(IA_P.gain), float(IA_P.flat))).toVar();
                const beams = E[0].add(E[1]).add(E[2]).mul(brightP).mul(run).mul(float(1.0).add(pulse)).toVar();
                // THE SPLIT IS THE HUE: outer beams either side of the anchor, the middle one on it.
                const hueWP = E[0].mul(PR.hueW[0]).add(E[2].mul(PR.hueW[2])).mul(brightP).mul(run).toVar();
                const medP = KIT.mhMedium(pP, uniforms.time, float(PR.medLane)).mul(medAmtP).toVar();
                const eP = beams.mul(PR.beamGain).add(medP).mul(fadeP).toVar();
                accP.addAssign(eP.mul(transP).mul(ds));
                accPH.addAssign(hueWP.mul(PR.beamGain).mul(fadeP).mul(transP).mul(ds));
                transP.assign(transP.mul(exp(eP.mul(PR.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const prismDensity = accP.mul(PR.gain).mul(uniforms.depth);
            return { density: prismDensity, accP, accPH };
        };

        // =====================================================================================================
        // *** HELIX -- THE EIGHTEENTH, AND THE LAST. "Two strands winding a vertical axis: the double helix." ***
        //
        // *** THE GESTALT TEST IS THE SPEC: *** helix.ts -- "somebody says DNA inside three seconds or the
        // species has failed -- and the first build failed it by being a cousin of flux: broad soft strands on
        // a leaning axis read as crossing horizontal streaks. Three things were wrong and all three are
        // structural." The three repairs are the upright, the counted crossing rhythm, and threads instead of
        // bands -- and all three are in the kit's MH_HELIX note, quoted whole.
        //
        // *** THIS IS THE ONE HERO WHOSE FIGURE LIVES IN THE MARCH, so it gets its own tap count. *** murmur
        // declares a second uniform for it alone: u_tapsHi, "helix's twenty ... its strands ARE the march".
        // This port transcribes the RATIO rather than the number -- see MH_TAPS_HI -- so helix marches 96
        // steps where the family marches 24, and "twenty steps is what lets the strand be 0.062 wide instead
        // of 0.11". arc escaped the march to draw a line; helix pays for a finer one. Both answers are in
        // this file now, four species apart.
        const buildHelix = () => {
            const HX = MH_HELIX;
            const turnsK = clamp(uniforms.turns, 0.0, 1.0).toVar();
            const riseK = clamp(uniforms.rise, 0.0, 1.0).toVar();
            const glowK = clamp(uniforms.strand, 0.0, 1.0).toVar();
            const flH = KIT.mhFlourish(uniforms.time, float(HX.flourishSlot), float(HX.flourishDur)).toVar();

            // THE UPRIGHT. "Yaw turns the pair to face you; the tilt is a whisper" -- 0.06 + 0.05, which is
            // 6.3 degrees at most, against the twenty that "is enough to destroy the read".
            const ayH = KIT.mhDrift(uniforms.time, float(HX.yawRate), float(HX.yawWob), float(HX.yawLane)).toVar();
            const axH = float(HX.tiltB).add(sin(uniforms.time.mul(HX.tiltRate)).mul(HX.tiltAmp)).toVar();

            // THE CROSSING RHYTHM IS COUNTED: "about one and three quarter turns inside the visible height:
            // three or four crossings, which is the count the eye reads as a helix rather than as a spring."
            // *** THE ONE PLACE IN THIS ROUND WHERE DRIVE MAKES SOMETHING BIGGER. *** helix gains turns
            // (+0.35) while its radius draws in (-0.14): a spring compressing, not a thing shrinking. A
            // table of "how much smaller" could not have said that, which is why MH_DRIVE_FORM keeps the
            // operation beside each coefficient instead of a magnitude.
            const turns = float(HX.turnsB).add(turnsK.mul(HX.turnsK)).mul(mix(float(1.0), float(HX.turnsSmall), smallK))
                .mul(float(1.0).add(DRIVE.mul(FORM.turns)).add(flH.x.mul(0.20))).toVar();
            // *** helix's CLIMB HAD NO SIGNAL ON IT AT ALL, AND helix.ts SCALES IT BY BOTH. *** murmur:
            // climb = mh_drift(t, ..., 0.44, 5.0) * (1.0 + 0.75*live.pace + 0.85*st.drive). This file
            // carried the bare drift, so the strands rose at one speed whatever the exchange was doing --
            // on the one species whose own brief is that somebody says "DNA" within three seconds. Added in
            // the integrated form, because adding it as murmur spells it would have shipped a new teleport.
            const climbBase = float(HX.climbB).add(riseK.mul(HX.climbK)).mul(mix(float(1.0), float(HX.climbSmall), smallK)).toVar();
            const climb = KIT.mhDriftPhase(
                KIT.mhRatePhase(climbBase, uniforms.time, float(HX.climbPace), uniforms.paceInt,
                    float(0.0), uniforms.voiceInt, float(HX.climbDrive), uniforms.driveInt),
                climbBase.mul(float(1.0).add(PACE.mul(HX.climbPace)).add(DRIVE.mul(HX.climbDrive))),
                float(HX.climbWob), float(HX.climbLane), uniforms.time).toVar();
            const r0 = float(HX.r0B).add(turnsK.mul(HX.r0K))
                .mul(float(1.0).sub(DRIVE.mul(FORM.r0)).sub(flH.x.mul(0.10))).toVar();
            const wH = float(HX.wB).add(glowK.mul(HX.wK)).mul(mix(float(1.0), float(HX.wSmall), smallK))
                .mul(float(1.0).add(VOICE.mul(HX.wVoice))).toVar();
            const brightH = float(HX.brightB).add(glowK.mul(HX.brightK))
                .mul(float(1.0).add(VOICE.mul(HX.brightVoice))).toVar();

            const dsH = L.div(MH_TAPS_HI).toVar();
            const accH = float(0.0).toVar(), accHH = float(0.0).toVar();
            const transH = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS_HI }, ({ i }) => {
                const pH = P.add(rd.mul(float(i).add(0.5).mul(dsH))).toVar();
                const fadeH = KIT.mhInside(pH).toVar();
                const q = KIT.mhSpin(pH, ayH, axH).toVar();

                const u = clamp(abs(q.y).div(HX.profSpan), 0.0, 1.0).toVar();
                const prof = pow(max(float(1.0).sub(u.mul(u)), float(0.0)), float(HX.profPow)).toVar();
                const wl = wH.mul(float(HX.wlFloor).add(prof.mul(HX.wlRide))).toVar();

                // *** WHERE THE TWO STRANDS ARE AT THIS HEIGHT, AS TWO POINTS IN THE HORIZONTAL PLANE. *** The
                // phase advances with HEIGHT, which is what makes it a helix rather than a ring; and the
                // second strand is the NEGATION of the first's offset, so one sincos serves both. That is not
                // an optimisation with a cost -- exactly antipodal is what a double helix IS. Measuring the
                // distance in the plane rather than as an angle is what "gave up the atan2" and what makes
                // ninety-six steps affordable.
                const phi = turns.mul(q.y).mul(Math.PI).add(climb).toVar();
                const c0p = vec2(cos(phi), sin(phi)).mul(r0).toVar();
                const qxz = vec2(q.x, q.z).toVar();
                const d0v = qxz.sub(c0p).toVar(), d1v = qxz.add(c0p).toVar();
                const a0 = dot(d0v, d0v).div(wl.mul(wl)).toVar();
                const a1 = dot(d1v, d1v).div(wl.mul(wl)).toVar();
                const e0 = exp(a0.negate()).add(KIT.mhScatter(a0, float(HX.scatterAmp))).mul(prof).toVar();
                const e1 = exp(a1.negate()).add(KIT.mhScatter(a1, float(HX.scatterAmp))).mul(prof).toVar();
                // *** helix's IGNITION IS THE ONLY ONE WITH A FLAT TERM, AND IT MULTIPLIES. *** helix.ts:
                // lift = 1 + st.complete * (0.35 + 2.10 * exp(-sr*sr)), with sr along q.y -- the height of
                // the strands. So 0.35 of the flash reaches the WHOLE helix whether the front is there or
                // not, and the front brightens hardest: the pair reads as the whole figure lighting up with
                // a wave running its length, rather than only a band moving over a dark strand.
                const IA_H = MH_IGNITE_AXIS.helix;
                const liftH = float(1.0).add(KIT.mhIgniteAxis(q.y, COMPLETE, SWEEP,
                    float(IA_H.lo), float(IA_H.hi), float(IA_H.width), float(IA_H.gain), float(IA_H.flat))).toVar();
                const eH = e0.add(e1).mul(brightH).mul(HX.strandGain).mul(fadeH).mul(liftH).toVar();
                accH.addAssign(eH.mul(transH).mul(dsH));
                // ...and the HUE channel takes the same lift. helix.ts: strands = (e0+e1)*bright*lift and
                // hueW = (e1-e0)*bright*lift -- both factors, one number. Lifting the energy and not the hue
                // would make the pair's colour drift toward the anchor through the flash, because the hue
                // this species reports is acc.y / acc.x and only the denominator would have grown.
                accHH.addAssign(e1.sub(e0).mul(brightH).mul(HX.strandGain).mul(fadeH).mul(liftH).mul(transH).mul(dsH));
                transH.assign(transH.mul(exp(eH.mul(HX.absorb).add(MH_EXT).mul(dsH).negate())));
            });

            // THE MEDIUM, AT A THIRD OF THE FAMILY'S USUAL and on the family's OWN tap count, not helix's:
            // "nothing may compete with two thin lines", and a medium does not need ninety-six steps to be
            // honest. Two marches, two step counts, which is what murmur's two uniforms are for.
            const medAmtH = mix(float(HX.medB), float(HX.medS), smallK).toVar();
            const medE = float(0.0).toVar();
            const mtrans = float(1.0).toVar();
            Loop({ start: 0, end: MH_TAPS }, ({ i }) => {
                const pM = P.add(rd.mul(float(i).add(0.5).mul(ds)));
                const eM = KIT.mhMedium(pM, uniforms.time, float(HX.medLane)).mul(medAmtH).mul(KIT.mhInside(pM)).toVar();
                medE.addAssign(eM.mul(mtrans).mul(ds));
                mtrans.assign(mtrans.mul(exp(eM.mul(HX.medAbsorb).add(MH_EXT).mul(ds).negate())));
            });
            const helixDensity = accH.add(medE).mul(HX.gain).mul(uniforms.depth);
            return { density: helixDensity, accH, accHH };
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
            : species === "sol" ? buildSol()
            // THE TWO SHEET HEROES. They are the pair that WANTS the march the three before them were built
            // to escape: aura's crossings resolve as occlusion because the taps arrive in depth order.
            : species === "aura" ? buildAura()
            : species === "flux" ? buildFlux()
            // THE LAST TWO, and they close the roster: both solve their lights at the ray's CLOSEST
            // APPROACH -- duet two of them with an exact depth comparison between, chorus seven of them on
            // a Fibonacci shell -- so neither marches anything but its medium.
            : species === "duet" ? buildDuet()
            : species === "chorus" ? buildChorus()
            // THE LAST TWO, AND THEY CLOSE murmur's EIGHTEEN. Both are marched -- prism's three shafts on
            // the family's taps, helix's two strands on FOUR TIMES that many, which is the only place in
            // the collection where a species buys its own march.
            : species === "prism" ? buildPrism()
            : species === "helix" ? buildHelix() : buildStill();
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
        const rimK = float(SK[0]).add(VOICE.mul(SK[1]))
            .add(species === "droplet" ? sheenK.mul(0.55) : float(0.0)).toVar();
        const specK = float(SK[2]).add(VOICE.mul(SK[3]))
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
        // *** THE SETTLE, AT THE ONE SITE ALL EIGHTEEN INTERIORS PASS THROUGH -- v4644. *** Seventeen of
        // murmur's eighteen spell it identically, as the last factor on `interior`:
        //
        //     interior = acc.x * GAIN * b.m * mh_transmit(b.fres) * (1.0 + K * st.settled)
        //
        // and K is the hero's own number (0.20 to 0.30 across the roster, in MH_SETTLED). `density` already
        // carries that hero's GAIN, so appending the factor here is that line and not an approximation of it.
        //
        // *** DROPLET IS THE ONE EXCEPTION AND IT IS DELIBERATELY NOT HERE. *** droplet.ts spends its settle
        // on `coreBright = 1.0 + 0.85 * live.voice + 0.35 * st.settled` -- an ADDITIVE term beside the voice,
        // in the brightness of the core itself, with no interior factor anywhere in the file. It is wired at
        // its own site inside buildDroplet. MH_SETTLED.droplet is 0.35 and it is the only entry in that table
        // that is not an interior gain, which is a trap for the next reader and is why both the table's note
        // and this one say so. comet has TWO and the second one -- 0.25 on its headBright, the point of light
        // itself -- is likewise at its own site.
        // MH_SETTLED_INTERIOR is MH_SETTLED without droplet, and the exclusion is a MISSING KEY rather than a
        // conditional here on purpose -- see that table's own note, and the sabotage that deleted the ternary
        // this line used to be and gave droplet its settle twice with nothing red.
        const settleK = MH_SETTLED_INTERIOR[species] ?? 0.0;
        const settleF = settleK === 0.0 ? float(1.0) : float(1.0).add(SETTLED.mul(settleK));
        // *** AND THE FLASH's OWN FACTOR, ON THE SAME LINE -- v4658. *** kit.ts: "The light in a success is
        // NOT an overlay: every species multiplies its own interior energy by (1 + complete), which
        // brightens exactly what is already there and leaves the dark dark." v4644 ported the travelling
        // SHELL and this factor was missed, because MH_IGNITE's note said the species outside its table
        // "spend complete on their own figures instead" -- true of most of them, and not of these four,
        // which spend it HERE, one line along from the settle this file already carried.
        //
        // THE FOUR ARE NOT A CHOICE: they are exactly the species whose complete factor sits on the same
        // source line as their settled factor in murmur, which is a rule a census can check rather than a
        // list somebody drew up. A MISSING KEY and not a zero, for MH_SETTLED_INTERIOR's reason.
        const compK = MH_COMPLETE_INTERIOR[species] ?? 0.0;
        const compF = compK === 0.0 ? float(1.0) : float(1.0).add(COMPLETE.mul(compK));
        const interior = density.mul(surfB.m).mul(KIT.mhTransmit(fres)).mul(compF).mul(settleF).toVar();
        const railE = interior.add(sf.rim).add(sf.spec.add(sf.glow).mul(dark)).toVar();
        // *** THE HUE ARGUMENT WAS ZERO UNTIL v4631, AND THIS NOTE STAYED PAST ITS OWN REPAIR. *** It read
        // "THE HUE ARGUMENT IS STILL ZERO, AND THAT IS A KNOWN GAP" -- true when written, and contradicted
        // three lines later by the paragraph below, which the round that CLOSED the gap added without
        // deleting the one it replaced. Both were in the file for twelve rounds, the stale one first.
        // Kept in this shortened form because the gap it describes is real history and the numerator work
        // below is what closed it: murmur's species each compute hueMix = hue * <their own numerator> /
        // max(e, 1e-4), where `hue` comes from a SECOND channel the march accumulates (acc.y += e *
        // clamp(p.z,-1,1) * trans * ds, then hue = acc.y/acc.x * spreadK * MH_SPREAD), and this file
        // accumulated only the scalar.
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
                    // *** aura's AND flux's hue rails ARE the family default -- weighted mean of the
                    // per-sheet offsets over the accumulated light -- and that is transcribed rather than
                    // fallen into by branch order. Both files spell exactly
                    // hue = (acc.x > 1e-4 ? acc.y / acc.x : 0.0) * spreadK * MH_SPREAD. What differs is the
                    // WEIGHTS each sheet carries: aura's ribbons run (-0.70, 0.55, 1.00) and flux's curtains
                    // (-1.00, 0.15, 1.00), so flux spans the full offset range and puts its middle curtain
                    // almost on the anchor while aura keeps all three off it.
                    : species === "aura"
                    ? select(SP.accA.greaterThan(1e-4), SP.accAH.div(SP.accA), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    : species === "flux"
                    ? select(SP.accF.greaterThan(1e-4), SP.accFH.div(SP.accF), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    // *** duet's HUE IS THE ONLY ASYMMETRIC TWO-BODY RAIL IN THE COLLECTION: *** A rides
                    // +0.85 of the spread and B rides -1.00, so the pair is not a mirror about the anchor.
                    // Its own file spells hue = (eA * 0.85 - eB * 1.0) / (eA + eB), guarded on the INTERIOR
                    // but divided by the two bodies -- two different quantities in one expression, which is
                    // transcribed rather than tidied.
                    : species === "duet"
                    ? select(SP.eA.add(SP.eB).greaterThan(1e-4),
                             SP.eA.mul(MH_DUET.hueA).add(SP.eB.mul(MH_DUET.hueB)).div(max(SP.eA.add(SP.eB), float(1e-4))),
                             float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    // chorus walks its seven across the spread by INDEX -- (k - 3)/3, so voice 0 sits a full
                    // step cool, voice 3 on the anchor and voice 6 a full step warm. The ensemble is a chord
                    // in the literal sense, and the guard is 1e-5 rather than the family's 1e-4 because seven
                    // small lights sum to less than one big one.
                    : species === "chorus"
                    ? select(SP.voiceE.greaterThan(1e-5), SP.voiceH.div(SP.voiceE), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    // *** prism IS "THE MOST LITERAL USE OF THE KNOB IN THE COLLECTION" -- its own words. ***
                    // The outer two shafts sit either side of the anchor and the middle one on it, so the
                    // spread is three neighbouring hues SEPARATED IN SPACE rather than mixed: the split IS
                    // the colour. helix runs its two strands either side by (e1 - e0), which is the same
                    // shape duet uses for its two bodies and the same shape the family default uses -- both
                    // transcribed, not inherited.
                    : species === "prism"
                    ? select(SP.accP.greaterThan(1e-4), SP.accPH.div(SP.accP), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
                    : species === "helix"
                    ? select(SP.accH.greaterThan(1e-4), SP.accHH.div(SP.accH), float(0.0)).mul(spreadK).mul(KIT.MH_SPREAD)
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
            // duet weights by its TWO BODIES alone and chorus by its SEVEN -- neither by the interior, and
            // neither by the rim. Both transcribed: duet's line is hueMix = hue * (eA + eB) / max(e, 1e-4)
            // and chorus's is hue * voiceE / max(e, 1e-4).
            // prism weights by interior + 0.6 of the rim -- the ONLY species of the eighteen using 0.6 -- and
            // helix by 0.7, the family's. Two numbers a tidier port would have unified; both transcribed.
            : species === "prism" ? interior.add(sf.rim.mul(0.6))
            : species === "helix" ? interior.add(sf.rim.mul(0.7))
            : species === "duet" ? SP.eA.add(SP.eB)
            : species === "chorus" ? SP.voiceE
            : species === "arc" ? SP.filE.mul(MH_ARC.filGain)
            : species === "sol" ? interior
            // aura and flux take the DEFAULT TOO, checked the same way: both files spell
            // hueMix = hue * (interior + sf.rim * 0.7) / max(e, 1e-4). aura's own comment says why the rim is
            // in the numerator at all -- "The rim borrows the interior's colour, because it IS the interior
            // seen edge-on through more glass. The specular does not: it is the key light."
            // nebula and tempest take the DEFAULT, and that is transcribed rather than fallen into: both
            // their files spell hueMix = hue * (interior + sf.rim * 0.7) / max(e, 1e-4), the same numerator
            // still and comet use. Checked against the source, not assumed from the branch order.
            : interior.add(sf.rim.mul(0.7));
        const hueMix = hueRaw.mul(hueNum).div(max(eTotal, float(1e-4))).toVar();
        const railColor = max(KIT.mhLit(pal, railE, uniforms.glow, float(0.0), float(1.0), float(0.34), hueMix),
                              vec3(0.0));
        // *** AND NOW mh_present's TAIL, WHICH THIS FILE HAD NONE OF UNTIL v4643. *** v4627 took mh_present's
        // arrangement -- railE = body + (spec + contact) * dark, the rail, the containment -- and stopped
        // there. On ink that cost exactly one term, the knee. ON PAPER IT COST THREE, and two of them are
        // what make paper a different GROUND rather than a lighter one:
        //
        //   THE CATCHLIGHT. `dark` subtracts the specular from the energy on a light ground, and murmur adds
        //   it back as a small mix toward a warm white. This file did the subtracting and not the adding, so
        //   a paper-ground orb LOST its highlight instead of gaining a white one -- measured below as the
        //   page climbing 69 counts of 255 across the specular sweep where it used to climb none.
        //   THE CONTACT SHADOW. Without it the object floats: mh_surface's contact bloom is light, and on
        //   paper murmur turns it into a neutral darkening pooled beneath.
        //   THE KNEE, which is the one term NOT gated on paper and so the one this file was missing on BOTH
        //   grounds -- a bright field ran straight into the encode instead of compressing into it.
        //
        // THE ARGUMENTS ARE murmur's OWN, in murmur's own units: uv.y in the uv space where the body sits at
        // MH_R, which this quad reaches by the same MH_R/R_BODY scale the containment below uses. The sign is
        // NOT taken from the source -- see the kit twin's comment for how it was measured off the contact
        // glow instead, and v4638 for what the other way costs.
        const inkLin = vec3(KIT.srgbToLinearT(uniforms.ink.x), KIT.srgbToLinearT(uniforms.ink.y),
                            KIT.srgbToLinearT(uniforms.ink.z));
        const uvY = pc.y.mul(KIT.MH_R / R_BODY).toVar();
        // max(.., 0) HERE and not inside the kit: mh_present hands un-clamped light to mh_out and lets THAT
        // clamp after the encode, and the shadow's weight legitimately reaches 1.11 and overshoots past its
        // endpoint. The twin is faithful and the clamp lives at the call site, which is where murmur's is.
        //
        // *** AND THE KNEE IS IN THE SAME BRACKET AS THE sRGB ENCODE, WHICH A GATE HAD TO TEACH THIS ROUND. ***
        // mh_present's finish is catchlight, shadow, knee. The first two read `paper` and must happen here,
        // because nothing downstream of this shader knows which ground it is on. THE KNEE IS DIFFERENT: on the
        // `linear` path this shader feeds render/aiPresenceOrbPresent.mjs, a port of murmur-web's own
        // present.wgsl, whose header says the shape outright -- "exposure, bloom, THE TONE CURVE, the dither
        // and the sRGB encode are WRITTEN ONCE" -- and which already applies knee(x, 0.90). Applying it here
        // too put a SECOND knee on that path. tools/ship/aiPresenceOrbPresent-selfcheck.mjs's Y-flip harness
        // is what found it: the direct render's brightest pixel held at (12,12) while the pipeline's moved to
        // (17,15), because compressing an already-compressed peak flattened the lobe the argmax was reading.
        // So the knee goes exactly where linearToSrgb already goes, and for the same reason.
        const litPaper = KIT.mhPresentPaper(railColor, sf.spec, sf.glow, uvY, pal, inkLin);
        const colorLinear = max(linear ? litPaper : KIT.mhPresentKnee(litPaper, pal.paper), vec3(0.0));
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
