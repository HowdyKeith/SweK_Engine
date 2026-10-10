// WebGLEngine/tools/ship/murmurParity-selfcheck.mjs -- v4826
//
// *** THE PARITY ROUND: EVERY GAP A FULL READ OF murmur-web AT 1c23b99 FOUND, HELD AGAINST ITS OWN LINE. ***
//
// The rounds before this one took murmur a site at a time, each from a note the previous round left. v4826 read
// all eighteen shaders and kit.ts against the port side by side and found twenty-two differences the notes had
// never named. Three were port-wide, and the first of them touched every pixel the orb draws:
//
//   (1) DEPTH WAS COUNTED TWICE. murmur spends u_depth in exactly one place -- mh_palette(..., depth), where it
//       bends the ink rail -- and this port ALSO multiplied every species' interior by it. A state with depth
//       1.25 (thinking, responding) drew every interior 25% hot on top of the palette's own answer, and idle's
//       0.75 drew it 25% cold. Every builder's `density` dropped the factor; the palette keeps it.
//   (2) ONE DEFAULT PER KNOB NAME. murmur's styles.ts:35-52 gives each species its own four defaults; the port
//       had one table for all of them, so every species drew at spread 0.4 where murmur gives still 0.2 and
//       opal 0.7, and opal and abyss shared a `drift` murmur sets separately.
//   (3) A SOFT MASK WHERE murmur SKIPS. Every march writes `if (fade <= 0.001) continue;` -- a tap outside the
//       body adds nothing and ABSORBS nothing. The port multiplied emission by the soft mask and let the
//       extinction run on every tap, so the edge of every body lost light to taps murmur never takes.
//
// Then eleven per-species terms (drive and cadence factors murmur carries and the port did not), five shapes
// (limn's lap and band, comet's head and radius, sol's halo, gesture and range test, helix's hue), and three
// clocks whose rate is not a sum of the conditioned signals (chorus's breath period, sol's granulation,
// tempest's floored lane 0 -- the 1.7% v4825 recorded and left).
//
// *** murmur IS NOT ON THE RIG, SO ITS LINES ARE QUOTED HERE, BY FILE AND LINE, AND THE PORT IS READ AGAINST
// THE QUOTE. *** A row that read murmur's file would pass on a box without it by skipping, and a skipped row
// is the one that hides a regression. The quotes are the v4579 discipline: written out by hand, so this file
// can disagree with the port rather than restate it.
//
// SABOTAGES, each restored, each RED on its own row: .mul(uniforms.depth) put back on stillDensity (section 1);
// opal's spread default typed 0.4 (section 1); helix's medium tap handed KIT.mhInside(pM) in place of
// tapGate(pM) (section 1); duet's braid lost DRIVE.mul(DU.braidDrive) (section 2); tempest's drift wobble put
// back on float(0.45) (section 2); limn's lap deleted (section 3); comet's r0 back on VOICE (section 3); sol's
// halo back on mhTube(wl * 3.19, sinA, pp / 10.2) (section 3); comet's head put back into its density (section 3);
// chorus's breath back on uniforms.time / per (section 4).
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as K from "../../render/murmurKit.mjs";
import { createPresenceState } from "../../render/aiPresenceOrbState.mjs";
import { codeOnly } from "./sourceScan.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurParity-selfcheck -- the full read of murmur-web, held line by line\n");

const raw = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbTsl.mjs"), "utf8");
const code = codeOnly(raw);
const host = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
// A builder's body, from its own declaration to the next builder's -- so a term found here is in THAT species.
const bodyOf = (b) => { const i = raw.indexOf(`const build${b} = () => {`); if (i < 0) return "";
    const j = raw.indexOf("const build", i + 20); return raw.slice(i, j < 0 ? raw.length : j); };

// =============================================================================================================
sec("1. *** THE THREE PORT-WIDE GAPS: depth once, each species' own defaults, and the skipped tap ***");
{
    // (1) u_depth: murmur's every shader reads it once, as mh_palette's last argument (still.ts:134, duet.ts:158,
    // ... sol.ts:218 -- eighteen identical lines). The port reads it once, in the same call, and nowhere else.
    const depthReads = (code.match(/\buniforms\.depth\b/g) || []).length;
    const inPalette = /KIT\.mhPalette\(uniforms\.ink, uniforms\.tone, uniforms\.tone2, uniforms\.hueShift, uniforms\.depth\)/.test(code);
    ok("!! *** u_depth IS READ ONCE, BY THE PALETTE, AS murmur READS IT -- no interior multiplies it as well ***",
        depthReads === 1 && inPalette,
        `uniforms.depth read ${depthReads} time(s) in code, ${inPalette ? "as" : "NOT as"} mhPalette's depth. Until ` +
        `v4826 every builder's density carried .mul(uniforms.depth) as well -- eighteen sites -- so the ` +
        `states' depth (0.75 idle, 1.25 thinking and responding) scaled every interior on top of the rail it ` +
        `already bends. sol's core sits at the rail's top once the double count is gone, and murmurComplete's ` +
        `core row reads its gain on the limb for that reason.`);

    // (2) styles.ts:35-52, positional c0..c3, written out in the PORT's names for each builder's knobs.
    const MURMUR_STYLES = {
        still:   { glintRate: 0.3, clarity: 0.6, presence: 0.5, spread: 0.2 },
        droplet: { wobble: 0.5, tension: 0.5, sheen: 0.5, spread: 0.3 },
        nebula:  { density: 0.5, fold: 0.5, glint: 0.4, spread: 0.4 },
        prism:   { beams: 0.4, split: 0.5, swing: 0.5, spread: 0.6 },
        limn:    { rimWidth: 0.4, travel: 0.5, innerHint: 0.3, spread: 0.4 },
        duet:    { sep: 0.5, orbit: 0.5, ratio: 0.5, spread: 0.6 },
        fathom:  { layers: 0.5, parallax: 0.5, murk: 0.4, spread: 0.4 },
        arc:     { bow: 0.5, sway: 0.5, pin: 0.5, spread: 0.3 },
        opal:    { flashes: 0.5, drift: 0.4, softness: 0.6, spread: 0.7 },
        comet:   { orbitTilt: 0.5, trail: 0.5, pointSize: 0.4, spread: 0.3 },
        flux:    { stream: 0.5, bend: 0.5, height: 0.5, spread: 0.6 },
        tempest: { density: 0.5, fold: 0.5, glint: 0.3, spread: 0.5 },
        helix:   { turns: 0.5, rise: 0.4, strand: 0.5, spread: 0.6 },
        geode:   { facet: 0.5, glim: 0.4, stone: 0.5, spread: 0.5 },
        sol:     { corona: 0.5, prom: 0.5, simmer: 0.4, spread: 0.4 },
        abyss:   { creatures: 0.4, rarity: 0.6, drift: 0.5, spread: 0.4 },
        chorus:  { voices: 0.5, sync: 0.5, breath: 0.4, spread: 0.5 },
        aura:    { ribbon: 0.5, swirl: 0.5, depth3d: 0.5, spread: 0.5 },
    };
    const D = K.MH_STYLE_DEFAULTS || {};
    const bad = [];
    for (const [s, want] of Object.entries(MURMUR_STYLES)) {
        const got = D[s] || {};
        if (Object.keys(got).length !== 4) bad.push(`${s}: ${Object.keys(got).length} keys`);
        for (const [k, v] of Object.entries(want)) if (got[k] !== v) bad.push(`${s}.${k} ${got[k]} vs ${v}`);
        for (const k of Object.keys(got)) if (!new RegExp(`\\buniforms\\.${k}\\b`).test(code)) bad.push(`${s}.${k} is no uniform the shader reads`);
    }
    const merged = /\.\.\.\(MH_STYLE_DEFAULTS\[species\] \|\| \{\}\), \.\.\.knobs \};/.test(raw);
    ok("!! *** EACH SPECIES DRAWS AT ITS OWN FOUR DEFAULTS -- styles.ts:35-52 -- and a caller's knobs still win ***",
        bad.length === 0 && Object.keys(D).length === 18 && merged,
        bad.length ? bad.join("; ") : `18 species x 4, every key a knob the shader reads; merged after the shared ` +
        `defaults and before the caller's own. spread alone ran 0.2 to 0.7 across murmur's roster where the ` +
        `port drew all eighteen at 0.4.`);

    // (3) every march: `float fade = mh_inside(p); if (fade <= 0.001) continue;` -- no light AND no extinction.
    const tapDef = /const tapGate = \(p\) => select\(KIT\.mhInside\(p\)\.greaterThan\(0\.001\), float\(1\.0\), float\(0\.0\)\);/.test(raw);
    const ext = raw.split("\n").filter((l) => /\.add\(MH_EXT\)\.mul\(dsH?\)/.test(l));
    const gated = ext.filter((l) => /\.mul\(dsH?\)\.mul\((tapGate\(\w+\)|liveH)\)\.negate\(\)/.test(l));
    const liveH = /const liveH = tapGate\(pH\)\.mul\(select\(prof\.greaterThan\(0\.002\), float\(1\.0\), float\(0\.0\)\)\)/.test(raw);
    ok("!! *** A TAP OUTSIDE THE BODY ADDS NOTHING AND ABSORBS NOTHING -- every extinction is skipped where murmur's `continue` skips ***",
        tapDef && ext.length === 18 && gated.length === ext.length && liveH,
        `${gated.length} of ${ext.length} extinctions carry the tap gate (helix's strands carry liveH, which ` +
        `also skips helix.ts's prof <= 0.002 taps). EMISSION keeps the soft mask exactly where murmur's own file ` +
        `multiplies by fade (fathom's and limn's media, and comet, ` +
        `droplet, nebula, tempest, aura, flux, prism and helix's strands, which scale the whole emission). ` +
        `Until v4826 every one of the eighteen absorbed on taps murmur never takes, and the edge of each body ` +
        `lost light to them.`);
}

// =============================================================================================================
sec("2. *** THE DRIVE AND CADENCE TERMS murmur CARRIES AND THE PORT DID NOT ***");
{
    // [what, murmur's line, the table value(s), the expression the builder must spell]
    const T = [
        ["aura: responding pulls the tilts halfway to a common one", "aura.ts:116-126 alignT = 0.5 * st.drive; mix(.., 0.30, alignT), mix(.., 0.34, alignT)",
            K.MH_AURA.alignK === 0.5 && K.MH_AURA.alignYaw === 0.30 && K.MH_AURA.alignTilt === 0.34,
            "Aura", /float\(AU\.alignYaw\), DRIVE\.mul\(AU\.alignK\)\)[\s\S]*float\(AU\.alignTilt\), DRIVE\.mul\(AU\.alignK\)\)/],
        ["flux: responding stills the turn and leans it", "flux.ts:74 mix(mh_drift(t, 0.047, 0.50, 2.0), 0.42, st.drive * 0.6)",
            K.MH_FLUX.aySteer === 0.42 && K.MH_FLUX.ayDrive === 0.6,
            "Flux", /float\(FX\.aySteer\), DRIVE\.mul\(FX\.ayDrive\)\)/],
        ["flux: the stream takes drive, integrated", "flux.ts:78 * (1.0 + 0.70 * live.pace + 0.95 * st.drive)",
            K.MH_FLUX.flowDrive === 0.95,
            "Flux", /float\(FX\.flowDrive\), uniforms\.driveInt\)[\s\S]*\.add\(DRIVE\.mul\(FX\.flowDrive\)\)/],
        ["flux: the curtains brighten under drive", "flux.ts:87 * (1.0 + 0.35 * st.drive)",
            K.MH_FLUX.brightDrive === 0.35,
            "Flux", /\.mul\(float\(1\.0\)\.add\(DRIVE\.mul\(FX\.brightDrive\)\)\)/],
        ["duet: cadence closes the pair a little", "duet.ts:76 * (1.0 - 0.14 * live.pace)",
            K.MH_DUET.sepPace === 0.14,
            "Duet", /\.mul\(float\(1\.0\)\.sub\(PACE\.mul\(DU\.sepPace\)\)\)/],
        ["duet: the braid is on under drive", "duet.ts:85 (0.16 * st.drive + 0.06 * fl.x) * S * sin(psi * 3.0)",
            K.MH_DUET.braidDrive === 0.16 && K.MH_DUET.braidFlourish === 0.06,
            "Duet", /DRIVE\.mul\(DU\.braidDrive\)\.add\(flD\.x\.mul\(DU\.braidFlourish\)\)/],
        ["prism: the beams brighten under drive", "prism.ts:96 * (1.0 + 0.55 * st.drive)",
            K.MH_PRISM.brightDrive === 0.55,
            "Prism", /\.mul\(float\(1\.0\)\.add\(DRIVE\.mul\(PR\.brightDrive\)\)\)/],
        ["arc: the shimmer runs under drive", "arc.ts:104 shimGate * (0.55 * live.pace + 0.75 * st.drive)",
            K.MH_ARC.shimDrive === 0.75 && K.MH_ARC.shimPace === 0.55,
            "Arc", /PACE\.mul\(AR\.shimPace\)\.add\(DRIVE\.mul\(AR\.shimDrive\)\)/],
        ["the clouds' drift wobble is each file's own", "nebula.ts:69 mh_drift(.., 0.45, 2.0); tempest.ts:66 mh_drift(.., 0.42, 3.0)",
            K.MH_MIST.nebula.drWob === 0.45 && K.MH_MIST.tempest.drWob === 0.42,
            "Mist", /mistBase\.mul\(mDrFactor\), float\(MIST\.drWob\), float\(MIST\.drLane\)/],
    ];
    const bad = [];
    for (const [what, line, valOk, b, re] of T) {
        const body = bodyOf(b);
        if (!valOk) bad.push(`${what}: table value is not ${line}`);
        if (!re.test(body)) bad.push(`${what}: build${b} does not spell ${line}`);
    }
    say(T.map(([what, line]) => `${what} -- ${line}`).join("\n  ----  "));
    ok("!! *** ALL NINE ARE IN, EACH IN ITS OWN BUILDER, EACH ON murmur's NUMBER ***",
        bad.length === 0,
        bad.length ? bad.join("; ") : `${T.length} terms. Five are drive -- RESPONDING's "travel together", "still the ` +
        `turn", "a weave along the orbit's normal", and two brightnesses -- which is mh_state's largest output ` +
        `reaching four species it had not; MH_DUET.braidDrive had been in the table since v4640 with no ` +
        `reader. The drift wobble is not a signal: tempest's 0.42 had been nebula's 0.45 because the two share ` +
        `a builder.`);
}

// =============================================================================================================
sec("3. *** THE SHAPES: limn's lap and band, comet's head and radius, sol's halo, gesture and range, helix's hue ***");
{
    const limn = bodyOf("Limn"), comet = bodyOf("Comet"), sol = bodyOf("Sol"), helix = bodyOf("Helix");
    const rows = [
        ["limn.ts:73 phi0 += st.sweep * 6.2831853 -- the ignition TRAVELS a lap", /\.add\(SWEEP\.mul\(6\.2831853\)\)\.toVar\(\);\s*const phi = /.test(limn)],
        ["limn.ts:116-117 (b.rho - b.Rd * 0.965) / bw, band * b.m -- the deformed limb, masked",
            /bodyRho\.sub\(bodyRd\.mul\(0\.965\)\)\.div\(max\(bw/.test(limn) && /exp\(negate\(dband\.mul\(dband\)\)\)\.mul\(bodyMask\)/.test(limn)],
        ["comet.ts:73 r0 = mix(0.54, 0.66, small) * (1.0 - 0.24 * live.pace) -- pace, not voice",
            /mix\(float\(0\.54\), float\(0\.66\), smallK\)\.mul\(float\(1\.0\)\.sub\(PACE\.mul\(0\.24\)\)\)/.test(comet) && !/VOICE\.mul\(0\.24\)/.test(comet)],
        ["comet.ts:214-215 e = interior + headE + ...; hueMix over interior + 0.7 rim -- the head joins BESIDE",
            /const cometDensity = accC\.mul\(4\.20\);/.test(comet) &&
            /species === "comet" \? SP\.headE\.mul\(surfB\.m\)/.test(raw) && !/SP\.headE/.test(raw.slice(raw.indexOf("const hueNum ="), raw.indexOf("const hueMix =")))],
        ["sol.ts:182 halo = 0.10 * ((wl * 3.19) * SQRTPI / sinA) * exp(-pp / (wl * wl * 10.2))",
            /const haloT = wlS\.mul\(SO\.haloW\)\.mul\(KIT\.MH_SQRTPI\)\.div\(sinAS\)\s*\.mul\(exp\(pp\.div\(wlS\.mul\(wlS\)\.mul\(SO\.haloSpread\)\)\.negate\(\)\)\)\.mul\(SO\.haloK\)/.test(sol) &&
            K.MH_SOL.haloW === 3.19 && K.MH_SOL.haloSpread === 10.2 && K.MH_SOL.haloK === 0.10],
        ["sol.ts:112 if (fl.x > 0.002 && k == int(fl.z * 2.999)) lift = max(lift, fl.x)",
            /flS\.x\.greaterThan\(0\.002\)\.and\(TSL\.int\(flS\.z\.mul\(2\.999\)\)\.equal\(k\)\)/.test(sol) && /KIT\.mhCompleteLift\(liftG, COMPLETE,/.test(sol)],
        ["sol.ts:135 if (bestS <= 0.0 || bestS >= L) continue; -- the COARSE winner's range",
            /const coarseS = curve\(bU\)\.sc;/.test(sol) && /\.and\(coarseS\.greaterThan\(0\.0\)\)\.and\(coarseS\.lessThan\(L\)\)/.test(sol)],
        ["helix.ts:143 acc.x += medE -- BEFORE the hue divides by it", /accH: accH\.add\(medE\)/.test(helix)],
    ];
    for (const [line, pass] of rows) say(`${pass ? "in " : "OUT"}  ${line}`);
    // THE HALO'S WIDTH, IN NUMBERS: the old spelling's e-folding distance against murmur's, for any wl.
    const wl = 0.03, eFold = (f) => { let lo = 0, hi = 1; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m * m) > Math.exp(-1)) lo = m; else hi = m; } return lo; };
    const murmurHalo = (pp) => Math.exp(-pp / (wl * wl * 10.2));
    const oldHalo = (pp) => Math.exp(-(pp / 10.2) / ((wl * 3.19) * (wl * 3.19)));
    const widen = eFold(oldHalo) / eFold(murmurHalo);
    say(`sol's halo e-folds at ${eFold(murmurHalo).toFixed(4)} in murmur and did at ${eFold(oldHalo).toFixed(4)} -- x${widen.toFixed(3)}`);
    ok("!! *** ALL EIGHT SHAPES ARE murmur's, AND sol's HALO IS ITS OWN WIDTH AGAIN ***",
        rows.every(([, p]) => p) && Math.abs(widen - 3.19) < 0.01,
        `${rows.filter(([, p]) => p).length} of ${rows.length}. THE HALO WAS ${widen.toFixed(2)} TIMES TOO WIDE: ` +
        `mhTube(3.19 wl, sinA, pp / 10.2) divides the exponent by (3.19 wl)^2 again, so 10.2 was spent ` +
        `twice. comet's head had been inside density, which gave it a second mh_transmit, the interior's ` +
        `settle and a share of the trail's hue; limn's band sat on the undeformed sphere with no mask.`);
}

// =============================================================================================================
sec("4. *** THE CLOCKS WHOSE RATE IS NOT A SUM: chorus's breath, sol's granulation (tempest's lane 0 is murmurGesture's) ***");
{
    // chorus.ts:67, 104: per = 8.4 - 2.2 * (live.pace * 0.6); sn = sin(6.2831853 * t / per + phase)
    // sol.ts:88: ... + vec3(0.0, 0.0, t * (0.35 + 0.75 * live.pace))
    const chorus = bodyOf("Chorus"), sol = bodyOf("Sol");
    const chorusSite = /const sn = sin\(uniforms\.chorusBreathInt\.mul\(2 \* Math\.PI\)\.add\(phase\)\)/.test(chorus) &&
        !/uniforms\.time\.mul\(2 \* Math\.PI\)\.div\(/.test(chorus);
    const chorusHost = /chorusBreathInt \+= dPhase \/ \(MH_CHORUS\.perB - MH_CHORUS\.perPace \* lv\.pace\)/.test(host) &&
        K.MH_CHORUS.perB === 8.4 && Math.abs(K.MH_CHORUS.perPace - 2.2 * 0.6) < 1e-12;
    const solSite = /uniforms\.time\.mul\(SO\.granRateB\)\.add\(uniforms\.paceInt\.mul\(SO\.granRateK\)\)/.test(sol) &&
        K.MH_SOL.granRateB === 0.35 && K.MH_SOL.granRateK === 0.75;

    // THE TELEPORT, MEASURED ON THE REAL STATE MODULE. Half an hour idle, then the exchange gets busy in one
    // frame: murmur's spelling moves the breath's phase by t * d(1/per) at once; the integral moves by one
    // frame's worth. The phase is in TURNS of the breath, and the breath is the species.
    const DT = 1 / 60;
    const st = createPresenceState("idle");
    for (let i = 0; i < Math.round(1800 / DT); i++) st.tick(DT, { voice: 0, activity: 0 });
    let p0 = st.getParams();
    let worstRaw = 0, worstInt = 0;
    for (let i = 0; i < 120; i++) {
        st.tick(DT, { voice: 0, activity: 1.0 });
        const p1 = st.getParams();
        const lv0 = K.mhLive(p0.voice, p0.activity, 0), lv1 = K.mhLive(p1.voice, p1.activity, 0);
        const raw0 = p0.phase / (K.MH_CHORUS.perB - K.MH_CHORUS.perPace * lv0.pace);
        const raw1 = p1.phase / (K.MH_CHORUS.perB - K.MH_CHORUS.perPace * lv1.pace);
        worstRaw = Math.max(worstRaw, Math.abs(raw1 - raw0));
        worstInt = Math.max(worstInt, Math.abs(p1.chorusBreathInt - p0.chorusBreathInt));
        p0 = p1;
    }
    say(`chorus's breath after 1800 s idle, the exchange busy in one frame: murmur's t / per moves ${worstRaw.toFixed(4)} turns in one frame, the integral ${worstInt.toFixed(6)}`);
    ok("!! *** chorus's BREATH AND sol's GRANULATION RUN ON INTEGRALS -- and the breath no longer jumps two whole turns in a frame ***",
        chorusSite && chorusHost && solSite && worstInt < 0.01 && worstRaw > 1.0,
        `chorus's sn reads the host's integral of 1 / per (${chorusSite && chorusHost ? "found" : "NOT FOUND"}), and ` +
        `sol's granulation reads time * 0.35 + paceInt * 0.75 (${solSite ? "found" : "NOT FOUND"}) -- linear in pace, ` +
        `so the integral it needs already existed. MEASURED: murmur's spelling moves all seven of chorus's ` +
        `breaths ${worstRaw.toFixed(3)} of a turn in one frame when the exchange quickens after half an hour; ` +
        `the integral moves ${worstInt.toFixed(5)}. A reciprocal is not a sum, so neither paceInt nor any ` +
        `product of the existing integrals could carry it -- it is the second clock in the roster with an ` +
        `accumulator of its own, after duet's gesture.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the gaps a FULL read of murmur-web at 1c23b99 found and no earlier round's note " +
    "had named -- three port-wide (depth counted twice, one default per knob name, a soft mask where murmur " +
    "skips the tap), nine drive and cadence terms, eight shapes and two clocks -- each held against the line " +
    "of murmur it transcribes, quoted here because murmur is not on the rig." +
    "\nWHERE THE PIXELS ARE: murmurComplete (sol's core gain read on the limb, since the double count kept the " +
    "disc off the rail's top), murmurSpecies12 (duet's separation read on the louder body), murmurClock2 (flux " +
    "hears driveInt), murmurLive2 (the conditioning curve on comet's radius, chorus's breath being integrated " +
    "now) and murmurGesture (tempest's lane 0 against murmur's floored slot, exact)." +
    "\nWHAT IS NOT CLAIMED: formScale. murmur multiplies most lengths by S = u_formScale and this port has none, " +
    "which is exact at S = 1 -- the only form the orb draws. The small-mount mixes the port transcribes " +
    "incompletely (still x2, limn x6, comet x2, droplet's core radius, arc's colour) are inert at smallK = 0 " +
    "and recorded in tools/ship/nextRounds.mjs rather than wired for a mount this port never renders.");
process.exit(fails ? 1 : 0);
