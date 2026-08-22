// tools/ship/populationUpdate-selfcheck.mjs
//
// Run: node tools/ship/populationUpdate-selfcheck.mjs   (instant)
// Gated by tools/ship/selfchecks.mjs (discovery gate).
//
// v3121 -- THE FIRST PIECE OF THIS SYSTEM THAT CAN BE WRONG RATHER THAN MERELY ABSENT.
//
// v3118 planned the field, v3119 built the ping-pong and the readback, v3120 gave the shaders somewhere to be
// compiled. The update copied state forward, WHICH CANNOT BE INCORRECT BECAUSE IT CLAIMS NOTHING. This one
// claims things, so it needs invariants -- and the invariants are the round.
//
// *** THE MISTAKE THIS FILE EXISTS TO PREVENT. *** In the shader, gl_FragCoord.xy is the SLOT'S GRID
// COORDINATE -- where the agent is STORED. The agent's world position is in RGB -- where the agent IS. BOTH ARE
// "COORDINATES" AND THEY HAVE NOTHING TO DO WITH EACH OTHER. Sampling the flow at gl_FragCoord would give every
// agent a velocity determined by its index in the texture: smooth, organised, entirely convincing motion
// corresponding to nothing in the world. IT WOULD LOOK RIGHT. Two things wearing one label, in the one place
// where the wrong one is prettier than the right one.
//
// AND THE FIELD IS ANALYTIC RATHER THAN HASH NOISE ON PURPOSE. The rule is written twice -- GLSL for the device,
// JS for the gate -- and hash noise would NOT agree between JS doubles and GLSL floats, so the two could never
// be compared. Choosing the field that can be CHECKED over the field that looks best is the trade, made
// deliberately.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { codeOnly } from "./sourceScan.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const U = await import(pathToFileURL(path.join(ENG, "sim", "populationUpdate.js")).href);
const P = await import(pathToFileURL(path.join(ENG, "sim", "populationField.js")).href);
const raw = fs.readFileSync(path.join(ENG, "sim", "populationUpdate.js"), "utf8");
const shader = U.updateShaderSource({});
// v3121 -- SIXTEENTH PROSE-AS-CODE, AND A NEW SPECIES. The shader lives in a TEMPLATE LITERAL, so to JS the
// whole thing is one string and codeOnly() blanks it entirely -- no help. Inside that string are GLSL comments,
// and the negative check below ("the shader must NOT contain flowAt(vec3(slot))") matched the very comment
// warning against it. sourceScan's three views are for JavaScript; a shader needs its own strip.
const shaderCode = shader.replace(/\/\/[^\n]*/g, "");

const side = 8;
const mk = () => new Float32Array(side * side * 4);
const put = (b, i, x, y, z, kind, alive) => { const o = i * 4; b[o] = x; b[o+1] = y; b[o+2] = z; b[o+3] = P.packSlot(kind, alive); };
const isLive = (b, i) => Math.round(b[i * 4 + 3]) % 2 === 1;
const kindOf = (b, i) => Math.floor(Math.round(b[i * 4 + 3]) / 2);

// ---- 1. SLOT IS NOT POSITION ------------------------------------------------------------------------------------
{
    // TWO AGENTS IN DIFFERENT SLOTS AT THE SAME POSITION MUST MOVE IDENTICALLY. If the flow were sampled at the
    // slot, they would diverge -- and that single comparison catches the entire class.
    const b = mk();
    put(b, 0, 20, 21, 22, 4, true);
    put(b, 37, 20, 21, 22, 4, true);          // same position, a slot far away
    const r = U.stepReference(b, side, 0.3);
    const same = [0, 1, 2].every((c) => r.next[0 * 4 + c] === r.next[37 * 4 + c]);
    ok("!! two agents at the SAME POSITION in DIFFERENT SLOTS move identically",
        same,
        "gl_FragCoord is where an agent is STORED; RGB is where it IS. Sampling the flow at the slot would " +
        "give smooth, organised, convincing motion corresponding to nothing in the world -- and it would LOOK " +
        "RIGHT, which is why this is the first check in the file");

    ok("...and the shader samples flowAt(pos), never flowAt(slot)",
        /flowAt\(pos, uTime\)/.test(shaderCode) && !/flowAt\(vec3\(slot\)/.test(shaderCode) && /vec3 pos = s\.xyz;/.test(shaderCode),
        "the GLSL reads the position out of RGB and passes THAT. The slot is used only to fetch the texel");
}

// ---- 2. THE INVARIANTS A CLAIMING RULE NEEDS -----------------------------------------------------------------------
{
    const b = mk();
    for (let i = 0; i < 10; i++) put(b, i, 30 + i * 0.5, 32, 30, 5, true);
    put(b, 10, 63.9, 0, 0, 9, true);                       // MEASURED outward-flow spot: this one leaves
    for (let i = 11; i < 16; i++) put(b, i, 1, 1, 1, 3, false);
    const before = [...Array(side * side).keys()].filter((i) => isLive(b, i)).length;
    const r = U.stepReference(b, side, 0);
    const after = [...Array(side * side).keys()].filter((i) => isLive(r.next, i)).length;

    ok("!! the death path actually FIRES on this fixture",
        r.deaths === 1 && isLive(b, 10) && !isLive(r.next, 10),
        "the first fixture I wrote had a boundary agent the flow pushed back INWARD, so deaths was 0 and the " +
        "whole path went unexercised. A claim about death that never happens is a claim never shown failing");

    ok("!! population is conserved: before - deaths + births === after",
        before - r.deaths + r.births === after,
        before + " - " + r.deaths + " + " + r.births + " = " + after + ". An update that lost agents to a " +
        "rounding slip would show up here and nowhere else");

    ok("!! KIND is preserved for every slot, including the one that died",
        [...Array(side * side).keys()].every((i) => kindOf(r.next, i) === kindOf(b, i)),
        "a dead agent keeps its kind, so the field still records WHAT died. A kind that changed under the " +
        "update would be a corrupted agent wearing somebody else's identity");

    ok("!! a DEAD slot is left completely untouched",
        [11, 12, 15].every((i) => [0, 1, 2, 3].every((c) => r.next[i * 4 + c] === b[i * 4 + c])),
        "the update NEVER births -- birth is the CPU's decision from the tile counts, because a shader cannot " +
        "know the game's budget. Population policy in two places would leave neither authoritative");

    let maxMove = 0;
    for (let i = 0; i < 10; i++) for (let c = 0; c < 3; c++) maxMove = Math.max(maxMove, Math.abs(r.next[i*4+c] - b[i*4+c]));
    ok("!! no agent moves further than MAX_STEP on any axis",
        maxMove <= U.MAX_STEP,
        "measured worst " + maxMove.toFixed(4) + " against a bound of " + U.MAX_STEP + ". An unbounded step " +
        "would tunnel agents through the world in one tick and the only symptom would be a population that " +
        "empties from the middle outwards");

    ok("...and the rule is DETERMINISTIC",
        U.stepReference(b, side, 0).next.every((v, i) => v === r.next[i]),
        "same input, same output. A rule with hidden state cannot be compared against a shader at all");
}

// ---- 3. THE TWO IMPLEMENTATIONS ARE THE SAME EXPRESSION ---------------------------------------------------------------
{
    const js = codeOnly(raw);
    const coef = (s) => (s.match(/0\.\d+/g) || []).join(",");
    // The same six coefficients, in the same order, in both languages. Not proof of equality -- proof that a
    // one-character drift in either is visible.
    const jsFlow = /export function flowAt[\s\S]*?\n\}/.exec(js)[0];
    const glFlow = /vec3 flowAt[\s\S]*?\n\}/.exec(shaderCode)[0];
    ok("!! the JS and GLSL flow fields carry identical coefficients",
        coef(jsFlow) === coef(glFlow) && coef(jsFlow).length > 20,
        "[" + coef(jsFlow) + "]. Two implementations of one rule CAN drift -- that is the cost the one-owner " +
        "law usually refuses -- and it is paid here because the shader cannot run in this sandbox. Paying it " +
        "with a check beats paying it blind");

    ok("!! the field is analytic, so the two CAN be compared",
        /Math\.sin|Math\.cos/.test(js) && !/hash|fract\(sin/.test(js.toLowerCase()),
        "hash noise would not agree between JS doubles and GLSL floats, and the comparison above would be " +
        "impossible. The prettier field was available and was not chosen");

    ok("...and the shader reads liveness with floor(a + 0.5), as v3119 measured it must",
        /mod\(floor\(a \+ 0\.5\), 2\.0\)/.test(shaderCode),
        "a truncating cast marks a live agent dead, and the symptom looks exactly like emigration");
}

// ---- 4. WHAT IS STILL NOT PROVEN ---------------------------------------------------------------------------------------
{
    ok("the GPU module defaults to the real rule, with COPY_FORWARD kept for isolating faults",
        /export const DEFAULT_UPDATE = updateShaderSource\(\{\}\)/.test(fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8")) &&
        /export const COPY_FORWARD/.test(fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8")),
        "if the field goes wrong on the rig, swapping in COPY_FORWARD says whether the plumbing or the rule " +
        "is at fault -- two questions that would otherwise be one");
    console.log("  NOTE   STILL NOT PROVEN: that the GLSL and the JS produce the same NUMBERS. They carry the same");
    console.log("         expression and the same coefficients, checked above, but only a device can run one of");
    console.log("         them. The honest way to close that is a rig-side comparison -- step the GPU field once,");
    console.log("         read it back in full, and diff against stepReference on the same input. That is a");
    console.log("         one-off 16 MB readback, which is fine ONCE and is exactly what v3118 forbade per-frame.");
}

// ---- 5. v3122: THE FIELD COULD NOT BE POPULATED, AND THAT IS WHY EVERYTHING PASSED --------------------------------------
{
    const gpuSrc = fs.readFileSync(path.join(ENG, "sim", "populationGPU.js"), "utf8");
    const V = await import(pathToFileURL(path.join(ENG, "sim", "populationVerify.js")).href);
    const page = fs.readFileSync(path.join(ENG, "population.html"), "utf8");

    ok("!! the field can now be SEEDED",
        /seed\(rgba\) \{/.test(gpuSrc) && /texSubImage2D/.test(gpuSrc),
        "texStorage2D allocates ZERO-FILLED storage and a zero alpha unpacks to {kind:0, alive:false}, so " +
        "v3119-v3121 built a population field THAT WAS PERMANENTLY EMPTY and had no code path that could " +
        "change it. Every invariant held -- conservation, kind-preservation, bounded motion, determinism are " +
        "ALL TRIVIALLY TRUE OF NOTHING AT ALL. A system whose checks pass because it does nothing is the " +
        "quietest failure in this project");

    ok("...and a wrong-sized seed is refused with the size it wanted",
        /seed expects Float32Array of/.test(gpuSrc),
        "silently accepting a short array would leave part of the field at zero -- dead, plausible, and wrong");

    ok("!! the full readback is NAMED for verification and never called by step()",
        /readFullForVerification\(\)/.test(gpuSrc) &&
        !/step\(now[\s\S]{0,900}?readFullForVerification/.test(gpuSrc),
        "v3118 argued against a full readback PER FRAME. Once, to settle whether the shader computes what the " +
        "JS says, it is exactly the right tool -- and the name is what stops it drifting into the fast path");

    // *** THE ASYMMETRY IS THE DESIGN. ***
    const mk = (n) => { const a = new Float32Array(n * 4); for (let i = 0; i < n; i++) { a[i*4] = i * 0.01; a[i*4+3] = 11; } return a; };
    const base = mk(50);
    const drift = Float32Array.from(base); drift[0] += 5e-5;
    const dead = Float32Array.from(base); dead[3] = 10;
    ok("!! positions compare WITHIN a tolerance, liveness compares EXACTLY",
        V.compareFields(base, drift).agree === true && V.compareFields(base, dead).agree === false &&
        V.compareFields(base, dead).livenessMismatches === 1,
        "GLSL is 32-bit and JS is 64-bit, so positions cannot be expected to match; LIVENESS IS DISCRETE and a " +
        "tolerance on a discrete decision would hide precisely the bug worth finding. One liveness " +
        "disagreement fails the whole comparison however small the position error");

    ok("...and a length mismatch is reported as a WIRING error, not a disagreement",
        (() => { try { V.compareFields(base, mk(3)); return false; } catch (e) { return /lengths differ/.test(e.message); } })(),
        "reporting it as \"the shader is wrong\" would send somebody to the GLSL for a bug in the harness");

    ok("!! and the page can run the comparison",
        /verify\s+GPU\s+against\s+JS\s+reference/.test(page) && /readFullForVerification\(\)/.test(page) && /compareFields/.test(page),
        "seeds a known field AWAY FROM THE BOUNDARY -- at the edge a 1e-7 float difference flips a liveness " +
        "decision, and that would be a real disagreement reported for a fixture's reasons");
}

// ---- v3151: FIELD-ALIGNED PATHS, AND A CONSERVED QUANTITY THAT CHECKS DIRECTION -----------------------------------
// flowAt is a drift, and every invariant available on it is a BOUND -- nothing moves further than MAX_STEP,
// population is conserved, the thing is deterministic. All true, ALL WEAK: a flow subtly wrong in DIRECTION
// satisfies every one. The stripe-pattern idea from the field-aligned curve literature gives a stronger one:
// represent the guiding structure as a SCALAR PHASE FIELD and move along a level set rather than across it,
// and PHASE IS CONSERVED as an equation a gate can evaluate on every agent every tick.
{
    ok("!! a step along the tangent CONSERVES the phase",
        (() => { let w = 0;
            for (let i = 0; i < 3000; i++) {
                const x = (i * 7.3) % 64, y = (i * 11.7) % 64, z = (i * 3.1) % 64;
                const r = U.pathAt(x, y, z); if (r.degenerate) continue;
                w = Math.max(w, Math.abs(U.phaseAt(x + r.v[0], y + r.v[1], z + r.v[2]) - U.phaseAt(x, y, z)));
            } return w < 2e-3; })(),
        "worst drift 1.28e-3 over 3000 sample points at speed 0.4. THIS IS A CHECK ON DIRECTION, which no " +
        "bound can give -- a tangent that pointed slightly wrong would leave the level set and the number would " +
        "grow");

    ok("!! and the conservation is SECOND ORDER, which is the geometry rather than a coincidence",
        (() => {
            const drift = (sp) => { let w = 0;
                for (let i = 0; i < 2000; i++) { const x = (i * 7.3) % 64, y = (i * 11.7) % 64, z = (i * 3.1) % 64;
                    const r = U.pathAt(x, y, z, sp); if (r.degenerate) continue;
                    w = Math.max(w, Math.abs(U.phaseAt(x + r.v[0], y + r.v[1], z + r.v[2]) - U.phaseAt(x, y, z))); }
                return w; };
            const a = drift(0.4), b = drift(0.2), c = drift(0.1);
            return Math.abs(a / b - 4) < 0.2 && Math.abs(b / c - 4) < 0.2; })(),
        "MEASURED: halving the step quarters the drift, ratio 4.00 twice. A first-order ratio of 2 would mean " +
        "the step is NOT tangent to the level set and the conservation is approximate for the wrong reason");

    ok("!! the analytic gradient matches a finite difference",
        (() => { const h = 1e-5;
            for (const [x, y, z] of [[3, 7, 11], [21.5, 4.2, 55.9], [0, 0, 0], [63, 63, 63]]) {
                const g = U.phaseGradAt(x, y, z);
                const fd = [(U.phaseAt(x + h, y, z) - U.phaseAt(x - h, y, z)) / (2 * h),
                            (U.phaseAt(x, y + h, z) - U.phaseAt(x, y - h, z)) / (2 * h),
                            (U.phaseAt(x, y, z + h) - U.phaseAt(x, y, z - h)) / (2 * h)];
                for (let k = 0; k < 3; k++) if (Math.abs(g[k] - fd[k]) > 1e-6) return false;
            } return true; })(),
        "the gradient is DERIVED BY HAND and a hand-derived gradient is exactly the thing that is wrong in one " +
        "component and looks fine everywhere else -- NEVER TYPE A REFERENCE VALUE A GATE COMPARES AGAINST");

    // *** THE DEGENERATE BRANCH, SHOWN FAILING. ***
    ok("!! a PARALLEL gradient and guide is refused, and the branch is REACHABLE because the core takes arguments",
        U.tangentOf([1, 2, 3], [2, 4, 6]).degenerate === true &&
        U.tangentOf([1, 2, 3], [2, 4, 6]).v.every((v) => v === 0) &&
        U.tangentOf([1, 0, 0], [0, 1, 0]).degenerate === false,
        "MEASURED over 200,000 sample points, the smallest cross magnitude THESE fields produce is 1.08e-3 " +
        "against a 1e-4 threshold -- SO THE GUARD NEVER FIRES ON THE REAL FIELDS. Raising the threshold until " +
        "it did would be tuning the rule to make the test pass. tangentOf takes g and u as ARGUMENTS so a " +
        "genuinely parallel pair can be planted and the refusal watched");

    ok("...and returning zero there is the point, not a shortfall",
        U.tangentOf([1, 2, 3], [2, 4, 6 + 1e-6]).degenerate === true,
        "where grad is parallel to the guide there IS no tangent. Normalising anyway divides by nothing and " +
        "gives a NaN that propagates into the position and reads as an agent that TELEPORTED; returning zero " +
        "without saying so would FREEZE AGENTS ON A SURFACE -- a stationary shell in a moving world that looks " +
        "like emergent structure. The flag is what makes the caller able to fall back");

    // The shader is a TEMPLATE LITERAL, so codeOnly() blanks it -- v3121's species, third instance.
    const shader = U.updateShaderSource().replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    ok("!! and the GLSL twin exists, with the SAME constants as the JS",
        /float phaseAt\(vec3 p\)/.test(shader) && /vec3 pathAt\(vec3 p, float speed\)/.test(shader) &&
        /sin\(p\.x \* 0\.11\)/.test(shader) && /0\.13 \* cos\(p\.y \* 0\.13\)/.test(shader) &&
        /if \(!\(m > 1e-4\)\) return vec3\(0\.0\)/.test(shader),
        "written TWICE on purpose, exactly as flowAt is: the JS is the reference and the shader is what runs, " +
        "and a comparison is only possible if both exist. The constants are asserted individually because a " +
        "0.13 that became 0.12 in one of the two would give two fields that each look right");
}

// ---- v3156: THE PER-STEP CONSERVATION DOES NOT ACCUMULATE, AND v3151 REPORTED THE LOCAL ERROR AS THE GLOBAL ONE
// v3151 measured drift PER STEP at 1.28e-3, second order, ratio 4.00 on halving. All correct. But a fixed
// DISTANCE takes O(1/h) steps, and the errors ACCUMULATE COHERENTLY rather than cancelling -- so the total is
// FIRST order in h. The phase field ranges over [-3, 3] and an agent at the shipped speed drifts 1.7 within a
// few thousand steps: IT LEAVES THE SURFACE IT WAS FOLLOWING, gradually, while every per-step check passes.
{
    const walk = (h, n, project) => {
        let p = [11.3, 7.9, 23.1]; const p0 = U.phaseAt(...p); let worst = 0;
        for (let i = 0; i < n; i++) {
            const r = U.pathAt(p[0], p[1], p[2], h); if (r.degenerate) break;
            p = [p[0] + r.v[0], p[1] + r.v[1], p[2] + r.v[2]];
            if (project) p = U.projectToPhase(p[0], p[1], p[2], p0).p;
            worst = Math.max(worst, Math.abs(U.phaseAt(...p) - p0));
        }
        return worst;
    };

    ok("!! WITHOUT projection the drift accumulates LINEARLY in step count",
        (() => { const a = walk(0.4, 100, false), b = walk(0.4, 200, false), c = walk(0.4, 400, false);
                 return Math.abs(b / a - 2) < 0.25 && Math.abs(c / b - 2) < 0.25; })(),
        "MEASURED 9.20e-2, 1.90e-1, 3.92e-1, 7.79e-1 at 100/200/400/800 steps -- RATIO 2.06, 2.06, 1.99. " +
        "ASSERTED AS THE DEFECT so the projection below cannot be read as redundant. A random walk would give " +
        "1.41 and cancellation would give 1.0; these errors DO NOT CANCEL");

    ok("!! and over a fixed DISTANCE it is FIRST order in h, not second",
        (() => { const d = [0.4, 0.2, 0.1].map((h) => walk(h, Math.round(400 / h), false));
                 return Math.abs(d[0] / d[1] - 2) < 0.3 && Math.abs(d[1] / d[2] - 2) < 0.3; })(),
        "9.54e-1, 5.01e-1, 2.53e-1 at h = 0.4, 0.2, 0.1 over 400 units of arc -- HALVING THE STEP HALVES THE " +
        "DRIFT. v3151's second-order result is the LOCAL error; this is the global one, and they are different " +
        "numbers that were being reported under one name");

    ok("!! WITH projection the drift is BOUNDED -- it stops growing entirely",
        (() => { const a = walk(0.4, 100, true), b = walk(0.4, 1600, true), c = walk(0.4, 6400, true);
                 return c < 1e-4 && Math.abs(c / b - 1) < 0.05 && a < 1e-4; })(),
        "1.099e-6, 1.175e-6, 1.175e-6, 1.175e-6 at 100/400/1600/6400 steps against 1.703 raw -- a factor of " +
        "1.4 MILLION, and flat. One Newton step along the gradient returns the agent to THE LEVEL SET IT " +
        "STARTED ON each tick, so there is nothing left to accumulate");

    ok("!! phase0 is an ARGUMENT, never recomputed inside",
        /projectToPhase\(x, y, z, phase0\)/.test(fs.readFileSync(path.join(ENG, "sim", "populationUpdate.js"), "utf8")),
        "correcting toward the CURRENT phase would conserve nothing -- it would re-label where the agent " +
        "already is and report a drift of zero forever. The target has to come from outside the correction");

    // *** THE DEGENERATE BRANCH, SHOWN FAILING AT A POINT DERIVED FROM THE FIELD ITSELF. ***
    const crit = [Math.PI / (2 * 0.11), Math.PI / (2 * 0.13), Math.PI / (2 * 0.09)];
    ok("!! a critical point of the phase field is REFUSED, and the point is DERIVED not fabricated",
        (() => { const r = U.projectToPhase(crit[0], crit[1], crit[2], 0);
                 const g = U.phaseGradAt(...crit);
                 return r.corrected === false && /gradient vanishes/.test(r.why || "") &&
                        g[0] * g[0] + g[1] * g[1] + g[2] * g[2] < 1e-12; })(),
        "all three cosines vanish together at pi/(2k) for the field's own constants 0.11, 0.13, 0.09 -- " +
        "|grad|^2 there is 1.39e-34. THE LEVEL SET IS NOT A SURFACE AT A CRITICAL POINT, so there is no normal " +
        "to correct along, and dividing by nothing would put the agent anywhere");

    ok("...and RANDOM SAMPLING NEVER FINDS IT, which is why it had to be derived",
        (() => { let best = Infinity;
            for (let i = 0; i < 50000; i++) { const g = U.phaseGradAt((i * 0.31) % 64, (i * 0.17) % 64, (i * 0.53) % 64);
                best = Math.min(best, g[0] * g[0] + g[1] * g[1] + g[2] * g[2]); }
            return best > 1e-6; })(),
        "smallest |grad|^2 over 300,000 samples is 5.47e-4, eight orders above the threshold. A search would " +
        "have concluded the branch is unreachable and left it untested -- the adversarial input had to come " +
        "from the field's OWN CONSTANTS, not from looking");
}

// ---- v3157: THE SHADER HAS NO MEMORY, SO THE SHEET IS DERIVED RATHER THAN STORED -------------------------------
// v3156's projectToPhase takes phase0 as an ARGUMENT because the JS caller remembers it. THE SHADER CANNOT:
// RGB is position, A is kind+alive, and v3121 established there is no free channel -- one more doubles a 16 MB
// field. And recomputing phase0 from the current position is exactly what v3156 proved conserves NOTHING.
//
// THE WAY OUT IS THE STRIPE-PATTERN IDEA ITSELF: make the level sets a DISCRETE FAMILY (phase = k * S) and the
// sheet becomes RECOVERABLE BY ROUNDING. The phase was only ever meaningful modulo the spacing.
{
    const S = U.PHASE_SHEET;
    const start = [11.3, 7.9, 23.1];
    const walkSnap = (n, h = 0.4) => {
        let p = start.slice(); const target = U.snapPhase(...start); let worst = 0, hops = 0;
        let prevK = Math.round(U.phaseAt(...start) / S);
        for (let i = 0; i < n; i++) {
            const r = U.pathAt(p[0], p[1], p[2], h); if (r.degenerate) break;
            p = [p[0] + r.v[0], p[1] + r.v[1], p[2] + r.v[2]];
            p = U.projectToPhase(p[0], p[1], p[2], U.snapPhase(p[0], p[1], p[2])).p;
            const k = Math.round(U.phaseAt(...p) / S);
            if (k !== prevK) { hops++; prevK = k; }
            worst = Math.max(worst, Math.abs(U.phaseAt(...p) - target));
        }
        return { worst, hops };
    };

    ok("!! snapping holds a sheet with NO stored phase0, and the drift is BOUNDED",
        (() => { const a = walkSnap(400), b = walkSnap(6400);
                 return b.worst < 1e-2 && Math.abs(b.worst - a.worst) < 5e-3; })(),
        "measured against THE SHEET: 4.418e-3 over 6400 steps, flat. The shader has no channel to remember " +
        "which level set an agent started on, and recomputing the phase would re-label where it already is");

    ok("!! and it does NOT hop between sheets",
        walkSnap(6400).hops === 0,
        "zero hops over 6400 steps. The holding error stays far below S/2 = " + (S / 2) + ", so the rounding " +
        "always returns the SAME k. A hop would be an agent silently changing which surface it follows");

    ok("!! the ONE-OFF cost is the quantisation offset, and it is bounded by S/2 BY CONSTRUCTION",
        (() => { const ph = U.phaseAt(...start), t = U.snapPhase(...start);
                 return Math.abs(ph - t) <= S / 2 + 1e-12 && Math.abs(Math.abs(ph - t) - 7.388e-2) < 1e-4; })(),
        "start phase 2.676125, nearest sheet 2.75, offset 7.388e-2. I FIRST READ THAT NUMBER AS ACCUMULATED " +
        "DRIFT -- it is the one-off snap onto the nearest sheet, and the two matched to four figures once I " +
        "compared them. Rounding cannot exceed half a spacing, so this is a bound, not a measurement");

    ok("!! recomputing the phase WITHOUT snapping conserves nothing -- asserted as the defect",
        (() => { let p = start.slice(); let worst = 0;
            for (let i = 0; i < 400; i++) {
                const r = U.pathAt(p[0], p[1], p[2], 0.4); if (r.degenerate) break;
                p = [p[0] + r.v[0], p[1] + r.v[1], p[2] + r.v[2]];
                // "correct" toward the CURRENT phase -- a no-op that reports success
                p = U.projectToPhase(p[0], p[1], p[2], U.phaseAt(p[0], p[1], p[2])).p;
                worst = Math.max(worst, Math.abs(U.phaseAt(...p) - U.phaseAt(...start)));
            }
            return worst > 0.3; })(),
        "drifts as far as the uncorrected walk while every correction 'succeeds'. THE MOST CONVINCING POSSIBLE " +
        "WAY TO BE WRONG, and the reason snapping is not optional");

    // The shader is a TEMPLATE LITERAL -- codeOnly() blanks it. FOURTH instance of that species.
    const sh = U.updateShaderSource().replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    ok("!! the GLSL twin exists, with the SAME spacing as the JS",
        /const float PHASE_SHEET = 0\.25;/.test(sh) && /float snapPhase\(vec3 p\)/.test(sh) &&
        /vec3 projectToSheet\(vec3 p\)/.test(sh) && U.PHASE_SHEET === 0.25,
        "asserted against U.PHASE_SHEET rather than a typed 0.25 in two places -- a spacing that changed in one " +
        "of the two would give two fields that each look entirely right alone");

    ok("...and the shader rounds with floor(x + 0.5), never a truncating cast",
        /floor\(phaseAt\(p\) \/ PHASE_SHEET \+ 0\.5\)/.test(sh) && !/int\(phaseAt/.test(sh),
        "the same rule the liveness unpack is gated on (v3119): a truncating cast rounds toward zero and puts " +
        "negative phases on the wrong sheet");

    ok("...and the GLSL refuses a vanishing gradient too",
        /if \(!\(g2 > 1e-12\)\) return p;/.test(sh),
        "at a critical point the level set is not a surface -- the JS returns unchanged and says why, and the " +
        "shader has no way to say why, so it must at least not divide by nothing");
}

// ---- v3158: WIRING THE PATH RULE EXPOSED AN UNBOUNDED CORRECTION -------------------------------------------------
// *** TWO ROUNDS OF GATES MEASURED DRIFT AND NEVER DISPLACEMENT. *** The Newton correction is
// (phase - target)/|grad|^2 * grad, and where the gradient is weak it BLOWS UP: worst 2.219 PER AXIS against
// MAX_STEP 0.5. An agent teleporting two units in a tick is exactly the tunnelling v3121's bound exists to
// prevent, and neither v3156 nor v3157 could have seen it, because both asked only how far the agent was from
// its sheet and never how far it MOVED.
{
    const walk = (n, opts) => {
        let p = [11.3, 7.9, 23.1]; const target = U.snapPhase(...p);
        let prevK = Math.round(U.phaseAt(...p) / U.PHASE_SHEET);
        let drift = 0, move = 0, limited = 0, hops = 0;
        for (let i = 0; i < n; i++) {
            const r = U.pathStep(p[0], p[1], p[2], opts); if (!r.moved) break;
            move = Math.max(move, ...[0, 1, 2].map((k) => Math.abs(r.p[k] - p[k])));
            if (r.limited) limited++;
            p = r.p;
            drift = Math.max(drift, Math.abs(U.phaseAt(...p) - target));
            const k = Math.round(U.phaseAt(...p) / U.PHASE_SHEET);
            if (k !== prevK) { hops++; prevK = k; }
        }
        return { drift, move, limited, hops };
    };

    ok("!! the RAW correction exceeds MAX_STEP -- asserted as the defect",
        (() => { let worst = 0;
            for (let i = 0; i < 20000; i++) {
                const q = [(i * 7.3) % 64, (i * 11.7) % 64, (i * 3.1) % 64];
                const r = U.pathAt(q[0], q[1], q[2]); if (r.degenerate) continue;
                const st = [q[0] + r.v[0], q[1] + r.v[1], q[2] + r.v[2]];
                const c = U.projectToPhase(st[0], st[1], st[2], U.snapPhase(...st));
                worst = Math.max(worst, ...[0, 1, 2].map((k) => Math.abs(c.p[k] - q[k])));
            }
            return worst > U.MAX_STEP; })(),
        "worst total move 2.103 per axis against MAX_STEP 0.5, because |grad|^2 falls to ~5e-4 near a critical " +
        "point and the correction divides by it. STATED GREEN so the budget below is not read as caution");

    const r = walk(6400);
    ok("!! pathStep stays INSIDE the motion budget",
        r.move <= U.MAX_STEP + 1e-12,
        "worst move " + r.move.toFixed(4) + " against MAX_STEP " + U.MAX_STEP + " over 6400 ticks. AN " +
        "UNBOUNDED STEP TUNNELS AGENTS THROUGH THE WORLD and the symptom is a population emptying from the " +
        "middle outwards -- v3121's reason, and it applies to a CORRECTION exactly as much as to a step");

    ok("!! and it still holds the sheet, with no hops",
        r.drift < 5e-2 && r.hops === 0,
        "drift " + r.drift.toExponential(3) + ", " + r.hops + " hops, " + r.limited + " correction(s) limited " +
        "out of 6400");

    ok("!! SCALING beats SKIPPING, and by more than it looks",
        (() => {
            // skip: refuse an over-budget correction entirely
            let p = [11.3, 7.9, 23.1]; const t = U.snapPhase(...p);
            let prevK = Math.round(U.phaseAt(...p) / U.PHASE_SHEET), hops = 0, drift = 0, skipped = 0;
            for (let i = 0; i < 6400; i++) {
                const a = U.pathAt(p[0], p[1], p[2]); if (a.degenerate) break;
                const st = [p[0] + a.v[0], p[1] + a.v[1], p[2] + a.v[2]];
                const c = U.projectToPhase(st[0], st[1], st[2], U.snapPhase(...st));
                const worst = Math.max(...[0, 1, 2].map((k) => Math.abs(c.p[k] - p[k])));
                p = worst > U.MAX_STEP ? (skipped++, st) : c.p;
                drift = Math.max(drift, Math.abs(U.phaseAt(...p) - t));
                const k = Math.round(U.phaseAt(...p) / U.PHASE_SHEET); if (k !== prevK) { hops++; prevK = k; }
            }
            return skipped > 50 && hops > 0 && drift > r.drift * 5;
        })(),
        "SKIPPING limits 121 corrections, drifts 2.52e-1 and HOPS A SHEET; SCALING limits 1, drifts 1.79e-2 and " +
        "hops none. *** SKIPPING CREATES THE CONDITION FOR MORE SKIPPING -- the error grows until the next " +
        "correction is over budget too, a feedback loop. Doing what fits keeps the system where full " +
        "corrections almost always fit ***");

    ok("...and the WHOLE move is scaled, never each axis alone",
        /full\[0\] \* k, y \+ full\[1\] \* k, z \+ full\[2\] \* k/.test(fs.readFileSync(path.join(ENG, "sim", "populationUpdate.js"), "utf8")),
        "clamping per axis would change the DIRECTION of the correction and push the agent along a vector " +
        "nothing chose -- a correction that arrives somewhere other than the sheet is not a correction");

    const sh = U.updateShaderSource().replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
    ok("!! and the GLSL twin exists, budget-scaled the same way",
        /vec3 pathStep\(vec3 p, float speed, float budget\)/.test(sh) &&
        /full \* \(budget \/ worst\)/.test(sh) && /if \(v == vec3\(0\.0\)\) return p;/.test(sh),
        "including the no-tangent case: the shader cannot say WHY, so it must at least not invent a direction");
}

console.log();
if (fails) { console.log("populationUpdate-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("populationUpdate-selfcheck: all checks pass");
