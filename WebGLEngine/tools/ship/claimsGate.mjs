// WebGLEngine/tools/ship/claimsGate.mjs — v2541
//
// THE GATE JUDGES THE BUILD. NOTHING JUDGES THE CLAIM.
//
// verify.mjs asks: does it parse, do the selfchecks pass, is the version stamped, is the zip clean. Every one of
// those is worth asking and NOT ONE OF THEM ASKS WHETHER THE ROUND WAS WORTH SHIPPING.
//
// The proof is in this engine's own history. v2536 shipped GREEN with a spatial grid that was a 2.5x
// PESSIMISATION at the particle count the flesh actually runs. Every gate agreed, because every gate was asked a
// question the grid answered correctly. The gate has never once said "this round was pointless." It cannot. It
// does not know what the round was FOR.
//
// loop-js/loop.js names the missing piece: Execute -> Handoff -> VERIFY, where Verify is a SEPARATE, SKEPTICAL
// JUDGE that rules on whether the GOAL was met, and a settled Loop re-enters through it -- "re-judged, never
// blindly re-run". Their judge is an agent. Ours cannot be, and does not need to be, because this engine already
// writes its claims down: predictions.html carries a CLAIMS array with a `kill` field -- the condition that would
// prove the claim WRONG.
//
// That file is a judge that was never wired into the gate. And A CHECK NOT IN THE GATE IS NOT BEING RUN.
//
// So this is that wiring, and it enforces one law on the claims themselves:
//
//     A CONTROL THAT CANNOT FAIL IS DECORATION.
//
// A claim with no kill condition is unfalsifiable -- a wish with a version number on it. A claim marked settled
// with nothing measured is an assertion wearing a verdict. This gate refuses both. It does not judge whether a
// claim is TRUE (nothing deterministic can), it judges whether the claim is HONESTLY SHAPED -- whether it is the
// kind of thing that could ever be found wrong.
//
// Run: node tools/ship/claimsGate.mjs [--file predictions.html]
"use strict";

import fs from "node:fs";
import path from "node:path";

const KNOWN_STATES = ["open", "settled", "broken"];

/**
 * Pull the claim objects out of the page. The page is the source of truth: it is what a human reads, and a
 * separate machine-readable copy would be a second source of truth that drifts.
 */
export function extractClaims(html) {
    const out = [];
    for (const arr of ["CLAIMS", "SETTLED"]) {
        const i = html.indexOf("const " + arr + " = [");
        if (i < 0) continue;
        // Walk brackets rather than regex the array: a `pred` string containing a ] would end a lazy regex early
        // and silently drop every claim after it. That failure would look exactly like "no claims to check".
        //
        // AND THE WALKER MUST SKIP STRINGS, or it reproduces the very bug it was written to avoid -- the first
        // version of this did not, and a pred containing "[1, 2]" made it parse ZERO claims. Caught by
        // claimsGate-selfcheck.mjs, which exists because a gate that silently checks nothing is worse than no gate.
        let depth = 0, start = html.indexOf("[", i), j = start;
        let q = null;
        for (; j < html.length; j++) {
            const c = html[j];
            if (q) {
                if (c === "\\") { j++; continue; }
                if (c === q) q = null;
                continue;
            }
            if (c === '"' || c === "'" || c === "`") { q = c; continue; }
            if (c === "[") depth++;
            else if (c === "]") { depth--; if (depth === 0) break; }
        }
        const body = html.slice(start, j + 1);
        // each claim is a top-level { ... } inside
        // same rule for the per-claim braces: a `{` inside a pred is text, not structure
        let d = 0, s = -1, qq = null;
        for (let k = 0; k < body.length; k++) {
            const c = body[k];
            if (qq) {
                if (c === "\\") { k++; continue; }
                if (c === qq) qq = null;
                continue;
            }
            if (c === '"' || c === "'" || c === "`") { qq = c; continue; }
            if (c === "{") { if (d === 0) s = k; d++; }
            else if (c === "}") { d--; if (d === 0 && s >= 0) { out.push({ src: body.slice(s, k + 1), arr }); s = -1; } }
        }
    }
    return out.map((c) => ({ ...c, ...fields(c.src) }));
}

function fields(src) {
    const f = {};
    for (const key of ["name", "since", "state", "pred", "why", "kill", "measured", "page", "where"]) {
        // the value is a quoted string; find the key at a property position and read the string after it
        const m = new RegExp('(^|[\\s,{])' + key + ':\\s*(["\'`])').exec(src);
        if (!m) continue;
        const q = m[2];
        let i = m.index + m[0].length, v = "";
        for (; i < src.length; i++) {
            if (src[i] === "\\") { v += src[i] + src[i + 1]; i++; continue; }
            if (src[i] === q) break;
            v += src[i];
        }
        f[key] = v.trim();
    }
    return f;
}

export function judge(claims) {
    const problems = [];
    const seen = new Set();
    for (const c of claims) {
        const id = c.name || "(unnamed)";
        // ---- shape: the things every claim must have to be a claim at all
        if (!c.name) problems.push(["a claim with no name", c.src.slice(0, 60)]);
        if (!c.since) problems.push([id, "no `since` -- an undated claim cannot go stale, so it never will"]);
        if (!c.state) problems.push([id, "no `state`"]);
        else if (!KNOWN_STATES.includes(c.state)) problems.push([id, "unknown state '" + c.state + "' (known: " + KNOWN_STATES.join(", ") + ")"]);
        if (!c.pred) problems.push([id, "no `pred` -- nothing is actually being claimed"]);

        // ---- THE LAW: A CONTROL THAT CANNOT FAIL IS DECORATION
        if (c.state === "open" && !c.kill) {
            problems.push([id, "OPEN with no `kill` -- unfalsifiable. A claim that cannot be proven wrong is a wish with a version number."]);
        }
        // ---- a verdict needs evidence
        if ((c.state === "settled" || c.state === "broken") && !c.measured) {
            problems.push([id, state(c) + " with nothing in `measured` -- an assertion wearing a verdict"]);
        }
        // ---- and a kill condition that names no test is a kill condition in name only
        if (c.kill && c.kill.length < 25) {
            problems.push([id, "`kill` is too short to name a test: " + JSON.stringify(c.kill)]);
        }
        if (seen.has(id)) problems.push([id, "duplicate claim name -- two claims with one name cannot both be settled"]);
        seen.add(id);
    }
    return problems;
}

const state = (c) => (c.state === "broken" ? "BROKEN" : "settled");

// ---- CLI ---------------------------------------------------------------------------------------------------
if (process.argv[1] && process.argv[1].endsWith("claimsGate.mjs")) {
    const idx = process.argv.indexOf("--file");
    const file = idx > 0 ? process.argv[idx + 1] : path.join(process.cwd(), "predictions.html");
    if (!fs.existsSync(file)) {
        console.error("claimsGate: no " + file + " -- the engine makes claims and does not write them down. That is the failure, not a missing file.");
        process.exit(1);
    }
    const claims = extractClaims(fs.readFileSync(file, "utf8"));
    if (!claims.length) {
        console.error("claimsGate: parsed 0 claims out of " + path.basename(file) + ". Either the page changed shape or the parser is broken -- and a claims gate that silently finds nothing to check is the worst possible outcome.");
        process.exit(1);
    }
    const problems = judge(claims);
    const byState = {};
    for (const c of claims) byState[c.state || "?"] = (byState[c.state || "?"] || 0) + 1;
    const summary = Object.entries(byState).map(([k, v]) => v + " " + k).join(", ");
    if (!problems.length) {
        console.log("claimsGate: " + claims.length + " claims (" + summary + "), every one falsifiable and every verdict evidenced");
        process.exit(0);
    }
    console.log("claimsGate: " + claims.length + " claims (" + summary + "), " + problems.length + " PROBLEMS\n");
    for (const [id, msg] of problems) console.log("  " + id + "\n      " + msg);
    console.log("\nA CONTROL THAT CANNOT FAIL IS DECORATION. Fix the claims or the gate is theatre.");
    process.exit(1);
}
