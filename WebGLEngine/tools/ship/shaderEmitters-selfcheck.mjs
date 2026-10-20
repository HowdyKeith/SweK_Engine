// WebGLEngine/tools/ship/shaderEmitters-selfcheck.mjs -- v4486
//
// Run: node tools/ship/shaderEmitters-selfcheck.mjs
//
// Grades render/shaderEmitters.mjs -- the BODY census that sits beside render/backendParity.mjs's PREAMBLE
// census and answers the round v4483 deferred: how many files in this tree carry runnable shader text that
// classify() calls "none".
//
// *** THE INSTRUMENT IS THE SUBJECT, SO THIS GATE SPENDS MOST OF ITS ROWS ON HOW IT IS WRONG. ***
// Section 3 grades the discriminator against a hand-read answer key and the answer is 31 of 32, not 32 of 32.
// Section 4 re-derives the whole threshold sweep rather than quoting it, and asserts that the setting which
// scores 32 is a SPIKE and is not the one shipped. Section 6 asserts that neither this gate nor the module it
// grades is visible to EITHER census -- the trap five rounds in a row have sprung, in the first file that has
// to hide from two of them at once.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../../render/shaderEmitters.mjs";
import { classify, codeOnly } from "../../render/backendParity.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (...p) => fs.readFileSync(path.join(ENG, ...p), "utf8");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const M = E.MEASURED_AT_V4486;

// *** ASSEMBLED, FOR THE REASON THE MODULE'S HEADER GIVES AND ONE MORE. *** Every fixture below is shader
// text, and a fixture written literally would make this gate an emitter in its own census AND a shader-bearing
// file in backendParity's. Section 6 is what turns that from an intention into a graded fact.
const VEC3 = "ve" + "c3", VEC2 = "ve" + "c2", VEC4 = "ve" + "c4";
const FLOAT = "flo" + "at", F32 = "f" + "32", FN = "f" + "n";
const FRAGCOLOR = "gl_" + "FragColor";
const STORAGE = "va" + "r<sto" + "rage, read_write>";

// The tree scan, run once and shared: sections 1, 3, 5 and 6 all read it.
let CENSUS = null;
function M_files() {
    if (!CENSUS) {
        const io = {
            readdir: (d) => fs.readdirSync(d, { withFileTypes: true }),
            readFile: (p) => codeOnly(fs.readFileSync(p, "utf8")),
            join: path.join, relative: path.relative,
        };
        CENSUS = E.census(ENG, io, classify);
    }
    return CENSUS.emitters.concat(CENSUS.quoters);
}

// ---- 1. *** THE TELLS: EACH ONE FIRES, AND EACH ONE REFUSES THE THING IT MUST REFUSE *** ----------------------
{
    const glslBody = `${VEC3} shade(${VEC2} uv) { ${FLOAT} k = uv.x; return ${VEC3}(k); }`;
    const wgslBody = `${FN} shade(uv: ${VEC2}f) -> ${VEC3}f { let k = uv.x; return ${VEC3}f(k); }`;
    ok("a GLSL function body is an emitter", E.kindOf(glslBody) === "emitter", glslBody);
    ok("a WGSL function body is an emitter", E.kindOf(wgslBody) === "emitter", wgslBody);
    ok("plain JavaScript is none",
        E.kindOf("export function shade(uv) { const k = uv.x; return [k, k, k]; }") === "none");

    // *** THE FAMILY THAT COST A DRAFT: GLSL IS A C-FAMILY LANGUAGE AND SYNTAX ALONE CANNOT SEPARATE THEM. ***
    // A first version accepted any C-shaped definition and matched FIVE box3d rig gates, which embed real C to
    // drive the shim. The fix is that a scalar or void return must carry a shading-language TYPE in its
    // parameter list; this row drives the actual C those gates hold.
    const embeddedC = "void run(int wheels, float ratio, double* y, int* kind){ for(int i=0;i<wheels;i++) y[i]=0; }";
    ok("*** embedded C is NOT a shader, and the first draft of the tells said it was ***",
        E.kindOf(embeddedC) === "none", "the five box3d rig gates embed C; " + embeddedC.slice(0, 46) + "...");
    ok("...and the discriminator is the TYPE, not the shape: the same signature with a shading type does fire",
        E.kindOf(`void run(${VEC3} p, ${FLOAT} r) { ${FLOAT} k = r; ${VEC3} q = p * k; ${VEC2} uv = q.xy; }`) === "emitter");
    ok("...so no box3d rig gate is in either half of the census",
        !M_files().some((f) => /box3d|wheelJoint|jointDrive/.test(f)),
        "sensorsCcd, wheelJoint, box3dFilter, box3dRay and jointDrive all matched the first draft");

    const names = E.TELLS.map((t) => t.name);
    ok("every tell is named, sided and distinct", E.TELLS.length === 7 &&
        new Set(names).size === 7 && E.TELLS.every((t) => t.lang === "glsl" || t.lang === "wgsl"),
        names.join(", "));
}

// ---- 2. *** THE TWO REJECTIONS, EACH WITH A NEGATIVE, BECAUSE A REJECTION THAT ALWAYS FIRES REJECTS ALL *** ---
{
    const quotedByRegex = `ok("the shader writes depth", /${FRAGCOLOR} = ${VEC4}\\(/.test(src));`;
    const quotedByCall = `ok("the shell declares it", shell.prefix.includes("${STORAGE} out: outBuf;"));`;
    const prose = `say("keyed on ${FRAGCOLOR} the pattern would crawl across the object as the camera moves");`;
    ok("a regex SEARCHING for shader source is a quoter, not an emitter",
        E.kindOf(quotedByRegex) === "quoter", "the escapes give it away");
    ok("a call TESTING a string for shader source is a quoter",
        E.kindOf(quotedByCall) === "quoter",
        "*** and the escape tell alone misses this one: *** the pattern has no backslash in it at all");
    ok("a sentence that merely names a builtin is a quoter", E.kindOf(prose) === "quoter", "density, not syntax");

    // *** AND THE ESCAPE REJECTION DOES NO WORK ON THIS TREE, WHICH A SABOTAGE FOUND: DELETING IT CHANGED
    // NOTHING. *** Every hit it catches, the call test catches too. It is kept because it is the more specific
    // test and because a pattern stored FAR from the matcher that uses it has escapes and no call in reach --
    // so that case is constructed here, and the rejection is proved to do something rather than assumed to.
    const storedPattern = "const RX = /" + FRAGCOLOR + "\\s*=\\s*" + VEC4 + "\\(/, " +
        "RX2 = /" + FLOAT + " shade\\(" + VEC2 + " uv\\)/, RX3 = /" + VEC3 + " c = " + VEC3 + "\\(/;";
    ok("!! the escape rejection is not vacuous: a stored pattern, dense and with no matcher in reach, is a quoter",
        E.kindOf(storedPattern) === "quoter" &&
        E.tellHits(storedPattern).every((h) => E.quotedAt(storedPattern, h) === "escape"),
        "escape is what rejects it; the call test cannot see a matcher because there is not one nearby");

    // *** VACUITY: A REJECTION THAT SAYS YES TO EVERYTHING WOULD PASS EVERY ROW ABOVE. *** v4485 shipped that
    // defect and caught it only because a negative case was added. Both rejections are asked to say NO here.
    const body = `${VEC3} shade(${VEC2} uv) { ${FLOAT} k = uv.x; ${VEC3} c = ${VEC3}(k, k, k); return c; }`;
    const hits = E.tellHits(body);
    ok("!! neither rejection fires on a bare shader body -- a rejection that always fires rejects everything",
        hits.length > 0 && hits.every((h) => E.quotedAt(body, h) === null),
        `${hits.length} tells, none quoted`);
    ok("...and the density of that body clears the floor while the prose above does not",
        E.densityAt(body, hits[0]) >= E.DENSITY_FLOOR &&
        E.densityAt(prose, E.tellHits(prose)[0]) < E.DENSITY_FLOOR,
        `body ${E.densityAt(body, hits[0])} vs prose ${E.densityAt(prose, E.tellHits(prose)[0])}, floor ${E.DENSITY_FLOOR}`);

    // Per-hit, not per-file: a gate that quotes in one place and builds in another is an emitter.
    const far = "\n" + "// filler line, no shader vocabulary at all\n".repeat(6);
    ok("a file that BOTH quotes and emits is an emitter -- the rejections are per hit",
        E.kindOf(quotedByRegex + far + body) === "emitter",
        "tools/ship/shaderPairs-selfcheck.mjs is exactly this file");
    // *** AND THE COST OF THAT IS MEASURED RATHER THAN HIDDEN: THE REJECTION IS A WINDOW, SO IT HAS A REACH. ***
    // The row above needed padding. Written adjacent, the same body is swallowed by the call radius of the line
    // above it and the file reads as a quoter -- which is what a first draft of this row discovered by going red.
    ok("!! ...and a body written INSIDE the call radius of a quote is rejected, which is a real cost",
        E.kindOf(quotedByRegex + "\n" + body) === "quoter",
        `the call window reaches ${E.WINDOW.call} characters either side; a gate that emits a shader on the ` +
        "line after it tests one would be invisible to this census");
    // ...and "no file in the tree does that" is a CLAIM, so it is derived rather than asserted in prose: shrink
    // the call radius to 40 and see whether any file the census currently calls a quoter turns into an emitter.
    {
        const flipped = CENSUS.quoters.filter((f) => {
            const t = codeOnly(read(f));
            return E.tellHits(t).some((h) =>
                !E.QUOTE_ESCAPE.test(t.slice(Math.max(0, h.index - E.WINDOW.escape), h.index + h.length + E.WINDOW.escape)) &&
                E.QUOTE_CALL.test(t.slice(Math.max(0, h.index - E.WINDOW.call), h.index + h.length + E.WINDOW.call)) &&
                !E.QUOTE_CALL.test(t.slice(Math.max(0, h.index - 40), h.index + h.length + 40)) &&
                E.densityAt(t, h) >= E.DENSITY_FLOOR);
        });
        // The four-way split behind the header's claim that one rejection is currently idle. REPORTED, not
        // pinned: a row asserting escapeOnly stays 0 would go red the day the rejection first does something.
        const R = { escapeOnly: 0, callOnly: 0, both: 0, neither: 0 };
        let hits = 0;
        for (const f of CENSUS.emitters.concat(CENSUS.quoters)) {
            const t = codeOnly(read(f));
            for (const h of E.tellHits(t)) {
                hits++;
                const e = E.QUOTE_ESCAPE.test(t.slice(Math.max(0, h.index - E.WINDOW.escape), h.index + h.length + E.WINDOW.escape));
                const k = E.QUOTE_CALL.test(t.slice(Math.max(0, h.index - E.WINDOW.call), h.index + h.length + E.WINDOW.call));
                R[e && k ? "both" : e ? "escapeOnly" : k ? "callOnly" : "neither"]++;
            }
        }
        ok("the four-way split of what each rejection catches accounts for every tell in the tree",
            R.escapeOnly + R.callOnly + R.both + R.neither === hits &&
            R.callOnly === M.rejections.callOnly && R.both === M.rejections.both,
            `${hits} tells: escape-only ${R.escapeOnly}, call-only ${R.callOnly}, both ${R.both}, neither ${R.neither}` +
            (R.escapeOnly === 0 ? " -- the escape test still earns nothing here and the header says so"
                                : " -- *** the escape test has started doing work; update the header ***"));

        ok("...and no file in the tree is actually paying that cost today -- derived, not asserted",
            flipped.length === 0,
            `narrowing the call radius from ${E.WINDOW.call} to 40 moves ${flipped.length} of ` +
            `${CENSUS.quoters.length} quoters${flipped.length ? ": " + flipped.join(", ") : ""}`);
    }
}

// ---- 3. *** THE CENSUS OVER THE REAL TREE, GRADED AGAINST A KEY READ BY HAND BEFORE ANY THRESHOLD *** ---------
{
    const c = (M_files(), CENSUS);
    const truth = new Map(E.HAND_VERIFIED.map((h) => [h.file, h.kind]));
    const got = new Map([...c.emitters.map((f) => [f, "emitter"]), ...c.quoters.map((f) => [f, "quoter"])]);
    const disagree = [...truth].filter(([f, k]) => got.get(f) !== k).map(([f]) => f);
    const unlisted = [...got.keys()].filter((f) => !truth.has(f));

    say(`scanned ${c.scanned} files; ${c.seenByPreamble} already visible to the preamble census; ` +
        `${c.emitters.length} emitters and ${c.quoters.length} quoters among the rest`);
    ok("the answer key covers the whole hit population -- no file is classified without a hand-read label",
        unlisted.length === 0, unlisted.length ? unlisted.join(", ") : `all ${got.size} rows are in the key`);
    // v4487 -- STATED AS A SHAPE, NOT A PAIR OF LITERALS. This row read "31 of 32" until a round added one
    // file to the tree, and the honest edit turned out to be a number rather than a rethink. What the claim
    // actually is: the shipped thresholds miss exactly one row, whatever the key holds.
    ok("*** the shipped thresholds agree with all but ONE hand-read row, and the claim is never a clean sweep ***",
        truth.size - disagree.length === M.agreement && M.agreement === M.rows - 1 &&
        M.rows === E.HAND_VERIFIED.length,
        `${truth.size - disagree.length}/${truth.size}`);
    ok("...and the ONE disagreement is the row RESIDUAL names, not some other row",
        disagree.length === 1 && disagree[0] === E.RESIDUAL.file,
        `${disagree.join(", ")} -- ${E.RESIDUAL.reason}`);
    ok("...so the reported totals are one over the hand count on the emitter side and one under on the other",
        c.emitters.length === M.reportedEmitters && c.quoters.length === M.reportedQuoters &&
        M.reportedEmitters === M.handVerifiedEmitters + 1 && M.reportedQuoters === M.handVerifiedQuoters - 1,
        `reported ${c.emitters.length}/${c.quoters.length}, hand ${M.handVerifiedEmitters}/${M.handVerifiedQuoters}`);
    ok("the tree has not shrunk under the scan", c.scanned >= M.scanned, `${c.scanned} >= ${M.scanned}`);

    // The finding itself, stated as a number the next round can check.
    const emitters = E.HAND_VERIFIED.filter((h) => h.kind === "emitter");
    ok("*** FOURTEEN files carry runnable shader text that the preamble census calls none ***",
        emitters.length === M.handVerifiedEmitters && M.handVerifiedEmitters === 14,
        `against ${M.preambleCensus.glslBearing} GLSL-bearing and ${M.preambleCensus.wgslBearing} WGSL-bearing`);
    ok("...and every one of them carries a REASON it is invisible, from the four the module names",
        emitters.every((h) => Object.values(E.REASONS).includes(h.why)) &&
        E.HAND_VERIFIED.filter((h) => h.kind === "quoter").every((h) => h.why === null),
        Object.values(E.REASONS).map((r) => r + "=" + emitters.filter((h) => h.why === r).length).join(", "));
    ok("...only TWO of the fourteen could be recovered by widening a pattern; the other twelve are structural",
        emitters.filter((h) => h.why === E.REASONS.NO_UNIFORM).length === M.fixableByPattern &&
        M.fixableByPattern === 2,
        "a framework tell is a uniform declaration, and a vertex shader need not have one");
}

// ---- 4. *** THE THRESHOLDS ARE FITTED, AND THE SWEEP IS RE-DERIVED RATHER THAN QUOTED *** ---------------------
{
    const texts = E.HAND_VERIFIED.map((h) => ({ want: h.kind, t: codeOnly(read(h.file)) }));
    const score = (r, f) => texts.filter((x) => E.kindWith(x.t, r, f) === x.want).length;
    let mismatched = 0;
    for (const [r, row] of Object.entries(E.TUNING.byRadius)) {
        const derived = E.TUNING.floors.map((f) => score(Number(r), f));
        if (derived.join() !== row.join()) { mismatched++; say(`r=${r} recorded ${row.join(" ")} derived ${derived.join(" ")}`); }
    }
    ok("every cell of the recorded sweep re-derives from the module and the key",
        mismatched === 0, `${Object.keys(E.TUNING.byRadius).length} radii x ${E.TUNING.floors.length} floors`);

    const P = E.TUNING.peak, S = E.TUNING.shipped;
    ok("the setting that scores a perfect 32 really does score 32",
        score(P.radius, P.floor) === P.agreement && P.agreement === E.HAND_VERIFIED.length);
    ok("*** and it is NOT shipped, because it is a spike: all four of its neighbours score lower ***",
        P.shipped === false &&
        [score(P.radius, P.floor - 1), score(P.radius, P.floor + 1), score(100, P.floor), score(200, P.floor)]
            .every((n) => n < P.agreement),
        `${P.agreement} at r=${P.radius}/floor=${P.floor}, neighbours ` +
        [score(P.radius, P.floor - 1), score(P.radius, P.floor + 1), score(100, P.floor), score(200, P.floor)].join(", "));
    ok("...the shipped setting is what the module ships, and it scores what it says",
        S.radius === E.WINDOW.density && S.floor === E.DENSITY_FLOOR &&
        score(S.radius, S.floor) === S.agreement,
        `r=${S.radius}, floor ${S.floor}, ${S.agreement}/${E.HAND_VERIFIED.length}`);
    // *** THE FIRST DRAFT OF THIS ROW SAID THE RUN WAS THREE WIDE AND WENT RED. *** It was four: floor 3 scores
    // 31 at this radius too, and the sentence had read the span from floor 4. The run is DERIVED here and the
    // recorded table is graded against the derivation, so the prose cannot drift from the numbers again.
    const runs = Object.fromEntries(Object.entries(E.TUNING.byRadius)
        .map(([r, row]) => [r, longestRun(row, Math.max(...row))]));
    ok("...the recorded run lengths are the ones the table actually has",
        Object.entries(E.TUNING.runAtBest).every(([r, n]) => runs[r] === n),
        Object.entries(runs).map(([r, n]) => "r=" + r + ":" + n).join(", "));
    ok("...the shipped radius has the longest run of all, and the shipped floor is INSIDE it, not on an edge",
        runs[String(S.radius)] === 4 &&
        Object.entries(runs).every(([r, n]) => Number(r) === S.radius || n <= 2) &&
        score(S.radius, S.floor - 1) === S.agreement && score(S.radius, S.floor + 1) === S.agreement,
        "four floors wide against at most two anywhere else -- the reason the lower score is the honest one");
}
function longestRun(row, v) {
    let best = 0, n = 0;
    for (const x of row) { n = x === v ? n + 1 : 0; if (n > best) best = n; }
    return best;
}

// ---- 5. *** THE TWO CENSUSES ARE SEPARATE AND THEIR ARITHMETIC MUST STILL MEET *** ----------------------------
{
    const c = (M_files(), CENSUS);
    const P = M.preambleCensus;
    ok("*** classify() was NOT widened: backendParity's own ratchets are untouched by this round ***",
        (() => { const b = read("render", "backendParity.mjs");
                 return b.includes("glslBearing: " + P.glslBearing) &&
                        b.includes("wgslBearing: " + P.wgslBearing) &&
                        b.includes("both: " + P.both); })(),
        `${P.glslBearing} / ${P.wgslBearing} / ${P.both} -- widening it would move six ratchets at once`);
    ok("...and the two censuses meet: what the preamble census sees is exactly its own inclusion-exclusion",
        c.seenByPreamble === P.glslBearing + P.wgslBearing - P.both,
        `${c.seenByPreamble} == ${P.glslBearing} + ${P.wgslBearing} - ${P.both}`);
    ok("...every file in the answer key really is invisible to the preamble census",
        E.HAND_VERIFIED.every((h) => classify(read(h.file)) === "none"),
        "if one of these ever gains a header this row goes red and the key needs re-reading, which is correct");

    // The loop this round closes: the disarming that stops self-counting also stops being counted.
    const disarmed = E.HAND_VERIFIED.filter((h) => h.why === E.REASONS.DISARMED);
    ok("*** the disarmed row is real: the file holds a complete module and hides its stage marker on purpose ***",
        disarmed.length === 1 && (() => {
            const src = read(disarmed[0].file);
            return E.kindOf(codeOnly(src)) === "emitter" && classify(src) === "none" &&
                   /"@"\s*\+\s*"compute"/.test(src);
        })(), disarmed.map((h) => h.file).join(", ") +
        " -- the defence against a false positive is what created the false negative");
}

// ---- 6. *** NEITHER THIS MODULE NOR THIS GATE MAY BE VISIBLE TO EITHER CENSUS *** -----------------------------
{
    const mod = read("render", "shaderEmitters.mjs"), self = read("tools", "ship", "shaderEmitters-selfcheck.mjs");
    ok("*** the body census does not classify itself ***",
        E.kindOf(codeOnly(mod)) === "none" && E.kindOf(codeOnly(self)) === "none",
        "module and gate, both none -- the fixtures above are assembled from fragments for exactly this");
    ok("*** and neither is visible to the preamble census either -- the first file in the tree hiding from two ***",
        classify(mod) === "none" && classify(self) === "none",
        "v4462, v4479, v4483, v4484 and v4485 each sprang this trap in one census; there are two now");
    ok("...and neither appears in the census output it produces",
        !M_files().some((f) => /shaderEmitters/.test(f)), "an absence asserted, not an exclusion list maintained");
}

console.log("shaderEmitters-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
