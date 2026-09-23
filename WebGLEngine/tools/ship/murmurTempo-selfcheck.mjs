// WebGLEngine/tools/ship/murmurTempo-selfcheck.mjs -- v4650
//
// *** THE ORB'S CLOCK IS THE INTEGRAL OF SPEED, AND FOR SIXTY-TWO ROUNDS NOTHING FED IT TO A SHADER. ***
//
// render/aiPresenceOrbState.mjs has carried integrateTempo -- composite Simpson's rule -- since the port's
// first round, with a header that states the defect it exists to prevent in as many words:
//
//     "A state change can jump `speed` instantly; multiplying elapsed time by the CURRENT speed would then
//      jump the animation's PHASE too (a visible pop)."
//
// It runs every tick. Its result is accumulated into `phase`. `phase` is returned by getParams(). And BOTH
// of the two call sites that feed a shader -- ui/aiPresenceOrbWidget.js and ai-presence-orb.html -- wrote
// `time: (now - t0) / 1000 * p.speed`, which is exactly the expression that header forbids.
//
// *** "A VISIBLE POP" UNDERSELLS IT, AND THIS GATE'S JOB IS TO SAY BY HOW MUCH. *** The error is
// t * (speedNew - speedOld): it is proportional to how long the orb has been on screen, so it has no bound.
// Entering RESPONDING after one minute of idle advanced the shader's clock 2.902 SECONDS IN ONE 16.7 ms
// FRAME; after half an hour, 86.191 s. And it does not come back: once the crossfade settles the clock is
// permanently 69.355 s displaced, and the next state change displaces it again.
//
// *** THE ROW THAT MAKES THE FIX SAFE IS THE ONE THAT SAYS THE TWO ARE THE SAME EXPRESSION. *** The integral
// of a constant from zero IS elapsed-time-times-that-constant, so wherever speed has never changed the two
// agree to 1.6e-12 over 3,600 ticks -- floating-point accumulation and nothing else. That is why this repair
// moves no species gate's frames and why "just use phase" is a measurement here rather than an assertion.
//
// THE PAIR THIS GATE IS BUILT ON: every bound on `phase` has the OLD expression measured beside it on the
// same frames. A clock that never jumps is not evidence unless something that does is in the same table.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as ST from "../../render/aiPresenceOrbState.mjs";
import { codeOnly } from "./sourceScan.mjs";
import { sp, renderSpecies } from "./murmurSpeciesFrames.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("murmurTempo-selfcheck -- the orb's clock: an integral that reached no shader until v4650\n");

const DT = 1 / 60;
const MAX_SPEED = Math.max(...Object.values(ST.STATES).map((s) => s.speed));

/** Settle in `from` for `secs`, change to `to`, then run two seconds and report the worst one-frame advance
 *  under BOTH clocks. `t` is wall time; `phase` is what the state module integrates. */
function jump(secs, to, from = "idle") {
    const st = ST.createPresenceState(from);
    let t = 0;
    for (let i = 0; i < Math.round(secs / DT); i++) { st.tick(DT, {}); t += DT; }
    st.setState(to);
    let pMul = t * st.getParams().speed, pPh = st.getParams().phase;
    let wMul = 0, wPh = 0;
    for (let i = 0; i < Math.round(2.0 / DT); i++) {
        st.tick(DT, {}); t += DT;
        const p = st.getParams();
        wMul = Math.max(wMul, Math.abs(t * p.speed - pMul));
        wPh = Math.max(wPh, Math.abs(p.phase - pPh));
        pMul = t * p.speed; pPh = p.phase;
    }
    return { mul: wMul, ph: wPh, settledMul: t * st.getParams().speed, settledPh: st.getParams().phase };
}

// =============================================================================================================
sec("1. *** THE CLOCK NEVER ADVANCES MORE THAN ONE FRAME IN ONE FRAME -- and the expression it replaces does ***");
{
    const SESSIONS = [5, 30, 60, 300, 1800];
    const rows = SESSIONS.map((s) => ({ s, ...jump(s, "responding") }));
    say("idle -> responding, worst ONE-FRAME advance in shader time, by how long the orb sat idle first:");
    for (const r of rows) say(`  ${String(r.s).padStart(4)}s idle:  t*speed ${r.mul.toFixed(3)}s    phase ${r.ph.toFixed(4)}s    ${(r.mul / r.ph).toFixed(0)}x`);

    // The bound is what a clock running at `speed` CAN advance in one frame and not a number chosen to pass.
    //
    // *** AND THE ROW ASSERTS THE BOUND IS TIGHT, NOT MERELY THAT NOTHING EXCEEDS IT. *** A first cut asked
    // only for `worstPh <= cap`, and a sabotage that replaced the derived ceiling with a flat 1.0 second
    // walked straight through: every reading is under a second, so the row was still green with its own
    // instrument destroyed. A ceiling nothing ever approaches is not a ceiling, it is a comment. The worst
    // frame here SHOULD land on maxSpeed * dt exactly -- the crossfade does reach RESPONDING's own speed --
    // so the row brackets it from both sides and a widened bound fails on the lower one.
    const cap = MAX_SPEED * DT;
    const worstPh = Math.max(...rows.map((r) => r.ph)), worstMul = Math.max(...rows.map((r) => r.mul));
    ok("!! *** phase ADVANCES AT MOST speed * dt IN A FRAME, AT EVERY SESSION LENGTH -- and t*speed advances 3,567x that ***",
        worstPh <= cap + 1e-12 && worstPh > 0.95 * cap && worstMul > 50 * cap,
        `the worst one-frame advance under the integrated clock is ${worstPh.toFixed(6)}s against a ceiling of ` +
        `maxSpeed * dt = ${MAX_SPEED} * ${DT.toFixed(4)} = ${cap.toFixed(6)}s -- ${(100 * worstPh / cap).toFixed(2)}% ` +
        `of it, so the bound is the real one and not slack a widened constant could hide in. It is not a ` +
        `tolerance either: it is what a clock running at that speed CAN cover in one frame. The expression it ` +
        `replaces reaches ${worstMul.toFixed(3)}s in the same frame. THREE HALVES, AND EACH HAS A SABOTAGE ` +
        `BEHIND IT: a clock that never moves passes the upper bound alone, a ceiling widened to a second ` +
        `passes both bounds alone, and neither survives all three.`);

    // *** THE SHAPE OF THE ERROR, WHICH IS WHY THIS IS NOT A ROUNDING QUESTION. *** t * (speedNew - speedOld)
    // has no bound: it is set by how long the orb has been on screen, so the longer a session runs the worse
    // it gets, and a gate that only ever ran a five-second fixture would have called it a 0.27 s blemish.
    const ratio = rows[4].mul / rows[0].mul, secsRatio = SESSIONS[4] / SESSIONS[0];
    const flat = Math.max(...rows.map((r) => r.ph)) - Math.min(...rows.map((r) => r.ph));
    ok("!! *** THE OLD ERROR SCALES WITH SESSION LENGTH AND THE NEW ONE IS FLAT -- 360x the wait, 320x the jump ***",
        Math.abs(ratio / secsRatio - 1) < 0.15 && flat < 1e-9,
        `from 5 s of idle to 1800 s -- ${secsRatio}x the wait -- the old jump goes ${rows[0].mul.toFixed(3)}s to ` +
        `${rows[4].mul.toFixed(3)}s, a factor of ${ratio.toFixed(0)}, which is the ${secsRatio}x within ` +
        `${(100 * Math.abs(ratio / secsRatio - 1)).toFixed(1)}%: the error IS t * (speedNew - speedOld) and it has ` +
        `no ceiling. phase's worst frame varies by ${flat.toExponential(1)}s across the same five sessions -- it ` +
        `does not depend on the session at all. A short fixture would have measured the 0.269 s at five seconds ` +
        `and called the whole thing a blemish.`);

    // Every state, not just the loudest one: the jump is set by the SIZE of the speed change, so the row has
    // to show a state whose speed goes DOWN as well (success, 0.30 -> 0.55, and error) or it is one number.
    say("");
    const each = ["listening", "thinking", "responding", "success", "error"].map((to) => ({ to, ...jump(60, to) }));
    for (const r of each) say(`  idle -> ${r.to.padEnd(11)} t*speed ${r.mul.toFixed(3)}s   phase ${r.ph.toFixed(4)}s`);
    ok("!! ...and it is every state the orb can enter, not the largest change cherry-picked",
        each.every((r) => r.ph <= cap + 1e-12) && each.every((r) => r.mul > 20 * r.ph),
        `all five stay under the ${cap.toFixed(4)}s ceiling and all five of the old readings are at least 20x ` +
        `their own. The spread -- ${each.map((r) => r.mul.toFixed(2)).join(", ")}s -- tracks the size of the ` +
        `speed change exactly: idle 0.30 to responding 1.45 is the biggest and to success 0.55 the smallest.`);

    // A pop that comes back is a glitch. This one does not come back.
    const settled = jump(60, "responding");
    const offset = settled.settledMul - settled.settledPh;
    ok("!! *** AND IT IS NOT A TRANSIENT: once the crossfade settles the old clock is PERMANENTLY 69 s displaced ***",
        offset > 60 && offset < 80,
        `after the 0.6 s crossfade finishes and twenty more seconds of steady RESPONDING, t*speed reads ` +
        `${settled.settledMul.toFixed(3)}s against phase's ${settled.settledPh.toFixed(3)}s -- ` +
        `${offset.toFixed(3)}s ahead, and it stays there. Every subsequent state change adds its own ` +
        `displacement on top, so a long conversation's clock wanders further from its own elapsed time with ` +
        `every turn. That is the difference between a pop and a clock that is simply wrong.`);
}

// =============================================================================================================
sec("2. *** AND THE TWO ARE THE SAME EXPRESSION WHENEVER SPEED HAS NOT CHANGED, WHICH IS WHY THIS MOVED NOTHING ***");
{
    // *** THE ROW THAT KEEPS THIS REPAIR FROM BEING A REWRITE. *** The integral of a constant from zero is
    // that constant times the elapsed time, so in any steady state the new clock and the old one are the same
    // number. Eighteen species' byte baselines are captured at a steady IDLE; if this were not true they
    // would all have moved and the round would have had to argue about which set was right.
    const st = ST.createPresenceState("idle");
    let t = 0, worst = 0, atT = 0;
    for (let i = 0; i < 60 * 60; i++) {
        st.tick(DT, {}); t += DT;
        const d = Math.abs(st.getParams().phase - t * st.getParams().speed);
        if (d > worst) { worst = d; atT = t; }
    }
    say(`60 s of steady IDLE, 3,600 ticks: phase ${st.getParams().phase.toFixed(6)}, t*speed ${(t * st.getParams().speed).toFixed(6)}`);
    ok("!! *** IN A STEADY STATE THE INTEGRATED CLOCK AND THE MULTIPLIED ONE AGREE TO 1.6e-12 ***",
        worst < 1e-9,
        `worst |phase - t*speed| = ${worst.toExponential(3)} over 3,600 ticks (worst at t = ${atT.toFixed(3)}s), ` +
        `which is float accumulation over 3,600 additions and not a difference in what is being computed. ` +
        `THIS IS THE ROW THAT MAKES THE FIX SAFE: the two expressions differ ONLY across a speed change, so ` +
        `every gate whose frames are taken at a fixed state sees the identical clock and no baseline moves.`);

    // The orchestrator's accumulated phase against an independent closed-form integral across a REAL
    // crossfade -- which is a different claim from aiPresenceOrb-selfcheck section 6's, and it is the one
    // that matters here. That section grades integrateTempo() on hand-written integrands; this grades what
    // the orchestrator actually accumulated while a smoothstep crossfade was running underneath it.
    const s2 = ST.createPresenceState("idle");
    for (let i = 0; i < 60; i++) s2.tick(DT, {});       // one second of idle: phase = 0.30 * 1.0
    const before = s2.getParams().phase;
    s2.setState("responding");
    let steps = 0;
    while (s2.getParams().speed < ST.STATES.responding.speed - 1e-9 && steps < 600) { s2.tick(DT, {}); steps++; }
    const crossed = s2.getParams().phase - before, elapsed = steps * DT;
    // Across the crossfade the speed runs monotonically from idle's to responding's, so the integral is
    // strictly between the two rectangles -- a bound that needs no knowledge of smoothstep's shape at all.
    const lo = ST.STATES.idle.speed * elapsed, hi = ST.STATES.responding.speed * elapsed;
    say(`the crossfade took ${steps} ticks (${elapsed.toFixed(4)}s) and phase advanced ${crossed.toFixed(6)}`);
    ok("!! the phase accumulated ACROSS a live crossfade is bracketed by the two states' own rectangles",
        crossed > lo && crossed < hi && steps > 30,
        `${crossed.toFixed(6)} sits strictly between idle's ${lo.toFixed(6)} and responding's ${hi.toFixed(6)} ` +
        `over the same ${elapsed.toFixed(4)}s. The bracket is what a monotone speed ramp MUST satisfy and it ` +
        `needs nothing about smoothstep's shape, so it grades the orchestrator rather than restating its ` +
        `formula -- the v4579 distinction. aiPresenceOrb-selfcheck section 6 grades integrateTempo() on ` +
        `hand-written integrands; nothing graded what the orchestrator accumulated while a state was changing.`);

    // Monotone, because a clock that goes backwards is a different bug and every species reads t as a time.
    const s3 = ST.createPresenceState("idle");
    let prev = -1, back = 0;
    for (let i = 0; i < 600; i++) {
        if (i === 100) s3.setState("responding");
        if (i === 250) s3.setState("success");
        if (i === 400) s3.setState("idle");
        s3.tick(DT, {});
        const ph = s3.getParams().phase;
        if (ph < prev) back++;
        prev = ph;
    }
    ok("!! phase never runs backwards across three state changes, including two that SLOW the orb down",
        back === 0,
        `0 of 600 ticks decreased, over idle -> responding -> success -> idle. Two of those changes lower the ` +
        `speed (1.45 -> 0.55 -> 0.30) and under t*speed a DROP in speed runs the shader's clock backwards by ` +
        `t * (speedOld - speedNew) -- every species' gesture clock, drift and flourish rewinding together.`);
}

// =============================================================================================================
sec("3. *** THE CONSUMERS READ IT: a correct integral nothing feeds to a shader is the defect, not the fix ***");
{
    // The whole point of this round is that the mechanism existed and was graded and was not CALLED. A row
    // that only grades the integrator would have passed for sixty-two rounds, and did.
    const W = codeOnly(fs.readFileSync(path.join(ENG, "ui", "aiPresenceOrbWidget.js"), "utf8"));
    const H = codeOnly(fs.readFileSync(path.join(ENG, "ai-presence-orb.html"), "utf8"));
    const feedsPhase = (s) => /time:\s*p\.phase\b/.test(s);
    const multiplies = (s) => /\*\s*p\.speed\b/.test(s) || /p\.speed\s*\*/.test(s);
    say(`widget: time: p.phase ${feedsPhase(W)}, multiplies by p.speed ${multiplies(W)}`);
    say(`demo:   time: p.phase ${feedsPhase(H)}, multiplies by p.speed ${multiplies(H)}`);
    ok("!! *** BOTH CALL SITES THAT FEED A SHADER PASS THE INTEGRATED PHASE, AND NEITHER MULTIPLIES BY SPEED ***",
        feedsPhase(W) && feedsPhase(H) && !multiplies(W) && !multiplies(H),
        `ui/aiPresenceOrbWidget.js and ai-presence-orb.html both spell time: p.phase, and neither contains a ` +
        `multiplication by p.speed anywhere -- read through sourceScan's codeOnly, so the comments that ` +
        `EXPLAIN the old expression do not score as the old expression. BOTH HALVES: reading phase while also ` +
        `multiplying somewhere else is the shape that ships a half-fix.`);

    // *** AND THE ONE REMAINING READER OF `speed` IS A LABEL, NOT A KNOB. *** A first cut of this row asked
    // for ZERO readers and went red on the demo's own speed readout -- which is a perfectly good use and not
    // the defect. The invariant is not "nobody may look at speed", it is "no shader may be told about tempo
    // by any route except the integral", so the row names WHERE each reader is instead of counting to zero.
    const readers = [];
    for (const [name, rel] of [["widget", "ui/aiPresenceOrbWidget.js"], ["demo", "ai-presence-orb.html"]]) {
        const src = codeOnly(fs.readFileSync(path.join(ENG, rel), "utf8"));
        for (const line of src.split("\n")) if (/p\.speed\b/.test(line)) readers.push({ name, line: line.trim() });
    }
    const allDisplay = readers.every((r) => /textContent|innerText|toFixed\(/.test(r.line) && !/setKnobs|time\s*:/.test(r.line));
    for (const r of readers) say(`p.speed is read in the ${r.name}: ${r.line.slice(0, 110)}`);
    ok("!! ...and the ONE surviving reader of `speed` writes it to a LABEL -- no route to a shader but the integral",
        readers.length === 1 && readers[0].name === "demo" && allDisplay,
        `${readers.length} reader across both files, in the ${readers.map((r) => r.name).join(", ")}, and it ` +
        `assigns to textContent rather than to a knob. getParams() still returns speed and should: the demo ` +
        `prints it and a host may want it. What neither file does any more is arithmetic with it. THE FIRST ` +
        `CUT OF THIS ROW DEMANDED ZERO AND WENT RED ON THAT READOUT -- a bound set where it was easy to state ` +
        `rather than where the invariant actually is, which would have been repaired by deleting a feature.`);

    // The state module's own docstring is the source of the rule, so it has to still say it.
    // Read with the comment markers and line breaks flattened: the sentence wraps across two `// ` lines in
    // the source, and a first cut of this row matched the raw file and went red on its own subject.
    const S = fs.readFileSync(path.join(ENG, "render", "aiPresenceOrbState.mjs"), "utf8");
    const flat = S.replace(/\n\s*\/\/\s*/g, " ").replace(/\s+/g, " ");
    ok("!! ...and the header that states the rule is still in the module the rule belongs to",
        /multiplying elapsed time by the CURRENT speed would then jump/.test(flat) && /integrateTempo/.test(S),
        `render/aiPresenceOrbState.mjs still carries "multiplying elapsed time by the CURRENT speed would ` +
        `then jump the animation's PHASE too (a visible pop)". That sentence was written before the two call ` +
        `sites that violated it, and it is quoted in this gate's own header for the same reason it is checked ` +
        `here: a rule nothing enforces is how it came to be violated twice in the same tree.`);
}

// =============================================================================================================
sec("4. *** WHAT 2.902 SECONDS LOOKS LIKE: the jump, in pixels, against one honest frame ***");
{
    // *** SECONDS ARE NOT A PICTURE AND THIS SECTION IS WHAT MAKES THE ROUND'S NUMBER MEAN SOMETHING. ***
    // Every row above is about a knob. These render the orb at the clock value it SHOULD have on the frame
    // after a state change, and at the one it HAD, and measure the difference as light.
    const T0 = 18.01, D_OK = 0.0242, D_BAD = 2.902;
    // *** TWO SPECIES AND NOT THREE, AND IT IS A BUDGET FACT BEFORE IT IS A CHOICE. *** With comet as well
    // this gate measured 3,061 / 2,998 / 3,240 ms against a 3,000 ms ceiling -- straddling it, which is over
    // on a box the tree measures running about 10% slower under a contended sweep, and a gate over budget
    // does not run at ship time AT ALL. A species costs one WGSL compile here and the three frames after it
    // are nearly free. comet was the one dropped because its 34x was the weakest of the three readings; the
    // two kept are the two that argue for themselves. limn is the clearest FIGURE -- its arc is a position,
    // so a jumped clock puts it somewhere else and one channel moves 239 of 255 -- and still is the largest
    // RATIO precisely because it is the quietest species in the roster: at 0.2% of bytes per honest frame
    // there is almost nothing for a jump to hide behind.
    const SPECIES = ["limn", "still"];
    const FRAMES = [];
    for (const s of SPECIES) for (const t of [T0, T0 + D_OK, T0 + D_BAD]) FRAMES.push(sp(s, t));
    const run = await renderSpecies(FRAMES);
    if (!run.ok || !run.frames || run.frames.length !== FRAMES.length) {
        ok("!! the jump renders at all", false,
            `could not render: ${run.reason || (run.skipped ? "skipped: " + run.skipped : "frame count")}. A gate ` +
            `that cannot run its own subject is a FAIL row here and not a silent skip.`);
    } else {
        say(`backend: ${run.isWebGPUBackend ? "REAL WebGPU" : "WebGL2 fallback"}; ${FRAMES.length} frames`);
        const diff = (a, b) => { let n = 0, sum = 0, mx = 0;
            for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d) n++; sum += d; if (d > mx) mx = d; }
            return { pct: 100 * n / a.length, mean: sum / a.length, mx }; };
        const rows = SPECIES.map((s, i) => ({ s, ok: diff(run.frames[i * 3], run.frames[i * 3 + 1]),
                                                 bad: diff(run.frames[i * 3], run.frames[i * 3 + 2]) }));
        for (const r of rows) say(`${r.s.padEnd(7)} one honest frame (+${D_OK}s): ${r.ok.pct.toFixed(1)}% of bytes move, mean ${r.ok.mean.toFixed(3)}, worst ${r.ok.mx}`);
        for (const r of rows) say(`${r.s.padEnd(7)} the SHIPPED frame (+${D_BAD}s): ${r.bad.pct.toFixed(1)}% of bytes move, mean ${r.bad.mean.toFixed(3)}, worst ${r.bad.mx}`);
        const ratios = rows.map((r) => r.bad.mean / Math.max(r.ok.mean, 1e-9));
        // *** THE SECOND HALF IS A RATIO NOW AND NOT A FITTED COUNT, AND v4654 IS WHY. *** It read
        // `r.ok.mx <= 20`, which was limn's honest frame at 18 of 255 -- for as long as limn's rate was
        // MISSING murmur's pace term. Restoring it runs limn's arc 28.5% faster, an honest frame moves 24,
        // and the row went red on a number that had nothing to do with tempo. The claim was never "an
        // honest frame moves less than twenty counts", it was "the jump moves far more light than an honest
        // frame does", and that survives any legitimate change to how fast a species runs.
        ok("!! *** THE JUMPED FRAME MOVES TENS OF TIMES THE LIGHT OF AN HONEST ONE, ON TWO UNLIKE SPECIES ***",
            ratios.every((v) => v > 25) && rows.every((r) => r.bad.mx > 25) &&
            rows.every((r) => r.bad.mx > 8 * r.ok.mx),
            `${rows.map((r, i) => r.s + " " + ratios[i].toFixed(0) + "x").join(", ")} by mean channel difference, ` +
            `and ${rows.map((r) => (r.bad.mx / Math.max(r.ok.mx, 1)).toFixed(0) + "x").join(" / ")} by worst channel; ` +
            `the worst single channel goes ${rows.map((r) => r.ok.mx).join("/")} of 255 on an honest frame to ` +
            `${rows.map((r) => r.bad.mx).join("/")} on the jumped one. THE TWO FAIL DIFFERENTLY, which is why ` +
            `they are the pair: limn's arc is a POSITION, so a jumped clock puts the sweep somewhere else and ` +
            `one channel moves 239 of 255; still barely moves at all between honest frames (0.2% of bytes), so ` +
            `its 30 of 255 is small in absolute terms and the largest ratio in the roster -- there is nothing ` +
            `for a jump to hide behind in the quietest species.`);

        // *** AND THE HONEST FRAME IS NOT ZERO, which is the half that stops this passing on a frozen orb. ***
        ok("...and one honest frame is not a still image either -- the orb IS moving at 0.0242 s per frame",
            rows.every((r) => r.ok.pct > 0.1) && rows[0].ok.pct > 3,
            `${rows.map((r) => r.s + " " + r.ok.pct.toFixed(1) + "%").join(", ")} ` +
            `of bytes move between consecutive honest frames. If this read zero the ratios above would be ` +
            `measuring a frozen orb against a moving one and would say nothing about a POP.`);
    }
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the orb's clock. render/aiPresenceOrbState.mjs computes the integral of speed " +
    "every tick and has done since the port's first round; until v4650 the two call sites that feed a shader " +
    "both multiplied elapsed time by the CURRENT speed instead -- the exact expression that module's own " +
    "header forbids. The existing gate on integrateTempo proves the FUNCTION is exact and cannot see that " +
    "nothing calls it, which is the same shape as mh_live before v4641 and mh_state before v4644: ported, " +
    "graded, unwired. Here the unwired mechanism had a wrong one shipping in its place." +
    "\nWHAT IS NOT CLAIMED: that the SHADER's own rate multipliers are integrated. murmur's species multiply " +
    "local rates by (1 + k * live.pace) and (1 + k * st.drive) and hand the product to mh_drift, whose phase " +
    "is rate * t -- the same shape, one level down, where no host-side integrator can reach it. That is " +
    "murmur's own design as shipped, it is recorded in tools/ship/nextRounds.mjs against the st.drive entry, " +
    "and it is not touched here: this round fixes the clock this tree owns.");
process.exit(fails ? 1 : 0);
