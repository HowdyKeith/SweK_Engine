#!/usr/bin/env node
// WebGLEngine/tools/ship/cliArgs.mjs -- v4647g
//
// *** AN UNKNOWN OPTION WAS IGNORED IN SILENCE, AND THE SILENCE COST 1,914 SECONDS. ***
//
// Keith ran `node tools/ship/quickSweep.mjs --read w4.json` on a tree that did not yet have --read. The
// idiom seven tools in tools/ship share is
//
//     const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
//
// so an option the build does not know about matches nothing, returns its default, AND THE RUN PROCEEDS. It
// proceeded for THIRTY-TWO MINUTES -- 427 gates, 1,914 s -- and then died, having answered a question he did
// not ask. Measured against the repair: the same line now refuses in 81 ms. 1,914,000 ms to 81 ms.
//
// *** SECOND TIME THIS SESSION FOR THE SAME MECHANISM, AND THE FIRST TIME WROTE A WRONG NUMBER. *** I typed
// `--gates` where sweepRotation's option is `--gate`. Nothing said so, a 21-gate rotation ran instead of the
// one gate I asked for, and it recorded eulerGpu AT THE 20,000 ms CAP -- a cap reading filed as a runtime,
// which is the one thing budgetIsOwn says must never happen, caused by a typo the tool declined to notice.
//
// *** AND THE TWO SPELLINGS ARE BOTH LIVE, IN ONE DIRECTORY. *** failLines.mjs and recordInputs.mjs take
// `--gates` (a list); sweepRotation.mjs takes `--gate` (one). Two modules reading one convention in opposite
// senses -- the species this session has now met in `posixAssumption`'s separators and the two ground-limit
// contracts. They are NOT unified here: a list and a single gate are different asks and merging them would
// be a silent widening. What changes is that the wrong one is REFUSED and names the right one.
//
// THE SAME `indexOf` HAS A SECOND SILENCE: it takes whatever argv element follows, so `--budget --json`
// reads "--json" as the budget, Number() gives NaN, and every gate compares `ms <= NaN` -- false for all of
// them, which is an EMPTY SWEEP THAT REPORTS SUCCESS. A trailing `--read` with no path reads undefined.
//
// parseArgs is PURE and returns its errors rather than throwing, because a gate has to drive it on bad input
// and a throw is a crash rather than a verdict -- the species v4647f spent a whole round on.
//
// Run: node tools/ship/cliArgs-selfcheck.mjs
"use strict";

/**
 * *** THE DETECTOR IS A SHAPE, NOT A SPELLING, BECAUSE TWO SPELLING-MATCHERS BOTH GOT IT WRONG. ***
 *
 * The first draft of this record was a list of five names I typed by hand from `grep -l 'const arg = (n'`.
 * The gate compared it against the tree and went red, and the gate was right TWICE OVER:
 *
 *   - `const arg = (n` matched THIS FILE, because the header sixty lines up QUOTES the idiom it is hunting.
 *     Third time this session that a hunter fired on the prose describing its own quarry -- the licence
 *     scan flagged the capture that quoted the tokens, then flagged the comment explaining why.
 *   - It also matched quickSweep and sweepRotation, whose new readers are `(n in cli.values ...)` -- the
 *     REPAIR, matched by the detector for the defect.
 *   - And it MISSED the defect wherever the helper is spelled differently: packRelease takes
 *     `indexOf("--" + name)`, ship takes `argv.indexOf(name)` off a local, refreshReleases names its helper
 *     something else. None of the three was in my list; all three ignore an unknown option.
 *
 * So the rule is the BEHAVIOUR: something indexOf'd against argv, and the NEXT element returned. Measured
 * against the tree, that is 13 tools, not 5 -- my hand list was wrong by a factor of nearly three, in the
 * round about a record that had gone stale.
 */
export const SILENT_READER = /(?:process\.)?argv\s*\.indexOf\s*\([^)]*\)[\s\S]{0,240}?\[\s*\w+\s*\+\s*1\s*\]/;

/** This module, excluded BY PATH: its header quotes the idiom, and a hunter must not fire on its own prose. */
export const HUNTER = "tools/ship/cliArgs.mjs";

/** The derived census. The gate calls this, so the list below is an expectation and never the measurement. */
export function silentReaders(dir, { fs, path } = {}) {
    return fs.readdirSync(dir)
        .filter((f) => f.endsWith(".mjs") && !f.endsWith("-selfcheck.mjs"))
        .map((f) => "tools/ship/" + f)
        .filter((m) => m !== HUNTER)
        .filter((m) => SILENT_READER.test(fs.readFileSync(path.join(dir, f_of(m)), "utf8")))
        .sort();
}
const f_of = (m) => m.split("/").pop();

/**
 * What the tree held when this was written, and what became of it. v4647g found 13 tools that read argv the silent way and recorded them as a CEILING; v4826
 * converted all 13 (`wasSilent`, one list, in the order the first record had them), so `tools` -- the tools STILL silent, which the gate re-derives every run and
 * compares to this list -- is empty, and the ratchet is at zero: a tool that reads argv with the silent idiom again is a red the day it is written.
 */
export const SILENT_AT_V4647G = Object.freeze({
    at: "v4647g",
    tools: Object.freeze([]),
    wasSilent: Object.freeze(["tools/ship/changelog.mjs", "tools/ship/claimsGate.mjs", "tools/ship/dockFraming.mjs",
                              "tools/ship/failLines.mjs", "tools/ship/gateSelection.mjs", "tools/ship/gateSweep.mjs",
                              "tools/ship/packRelease.mjs", "tools/ship/recordInputs.mjs",
                              "tools/ship/refreshReleases.mjs", "tools/ship/selfchecks.mjs", "tools/ship/ship.mjs",
                              "tools/ship/status.mjs", "tools/ship/verify.mjs"]),
    convertedAt: "v4826",
    adopted: Object.freeze(["tools/ship/quickSweep.mjs", "tools/ship/sweepRotation.mjs"]),
    firstDraftSaid: 5,
    // The two spellings of the gate option, both live in this directory.
    gateSpellings: Object.freeze({ "--gates": Object.freeze(["tools/ship/failLines.mjs", "tools/ship/recordInputs.mjs"]),
                                   "--gate": Object.freeze(["tools/ship/sweepRotation.mjs"]) }),
    why: "WAS A CEILING, IS A FLOOR. v4647g converted the two whose silence COST something measured (32 minutes of sweep answering a question nobody asked, a " +
         "cap reading written into the timings file by a typo) and recorded the other thirteen as countable rather than forgotten. v4826 converted them: the one " +
         "that matters most is verify.mjs, which shipVerdict hands its argv verbatim -- a mistyped --versoin used to verify against no version at all and print " +
         "ALL GREEN.",
});

// Edit distance, bounded. Only ever used to say "did you mean", never to decide anything.
export function editDistance(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++)
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = cur;
    }
    return prev[n];
}

/** The nearest known option within 3 edits, or null. `--gates` -> `--gate` is distance 1. */
export function nearestOption(name, known) {
    let best = null, bestD = Infinity;
    for (const k of known) { const d = editDistance(name, k); if (d < bestD) { bestD = d; best = k; } }
    return bestD <= 3 ? best : null;
}

/**
 * Parse `argv` (the tokens AFTER node and the script path) against a spec.
 *
 *   spec.values : { "--budget": "number" | "path" | "string", ... }
 *   spec.flags  : ["--json", ...]
 *   spec.positional : true when bare words are arguments too (collected in `rest`) -- v4826
 *
 * Returns { values, flags, errors, rest }. A non-empty `errors` means the caller must refuse. Nothing throws.
 */
export function parseArgs(argv, spec) {
    const vs = spec.values || {}, fl = spec.flags || [];
    const known = [...Object.keys(vs), ...fl];
    const values = {}, flags = new Set(), errors = [], rest = [];
    for (let i = 0; i < argv.length; i++) {
        const tok = argv[i];
        if (fl.includes(tok)) { flags.add(tok); continue; }
        if (tok in vs) {
            const v = argv[i + 1];
            if (v === undefined || v.startsWith("--")) {
                // The next token is NOT consumed: it may be a perfectly good option, and swallowing it would
                // turn one mistake into two error messages about the wrong thing.
                errors.push(`${tok} needs a value and got ${v === undefined ? "nothing" : v}`);
                continue;
            }
            i++;
            if (vs[tok] === "number") {
                const n = Number(v);
                // Zero and negatives are refused with NaN, for one reason: all three are a run that selects
                // nothing and then reports that it ran. An empty sweep that says ALL GREEN is the worst
                // output this tree can produce.
                if (!Number.isFinite(n) || n <= 0) { errors.push(`${tok} needs a positive number and got "${v}"`); continue; }
                values[tok] = n;
            } else values[tok] = v;
            continue;
        }
        // v4826 -- a tool that takes FILES (gateSelection: the changed paths) says so, and its bare words are collected; an unknown OPTION is still refused
        if (spec.positional && !tok.startsWith("-")) { rest.push(tok); continue; }
        const near = tok.startsWith("-") ? nearestOption(tok, known) : null;
        errors.push(tok.startsWith("-")
            ? `unknown option ${tok}` + (near ? ` -- did you mean ${near}?` : "")
            : `unexpected argument "${tok}" -- every value belongs to an option`);
    }
    return { values, flags, errors, rest };
}

/** The refusal a CLI prints. Returned as lines so a gate can read them without capturing a process. */
export function refusalLines(tag, errors, spec) {
    const L = errors.map((e) => `[${tag}] ${e}`);
    L.push(`[${tag}] options: ${Object.keys(spec.values || {}).join(" ") || "(none)"} ; flags: ${(spec.flags || []).join(" ") || "(none)"}`);
    L.push(`[${tag}] nothing was run. An argument the tool does not understand is refused here rather than ` +
           `ignored on the way past -- this one cost 1,914 s of sweep the day it was found.`);
    return L;
}

/**
 * v4826 -- THE FRONT DOOR EVERY ADOPTING TOOL USES: parse argv, and on ANY error print the refusal and exit 2 before anything runs. `io` is injected by the
 * gate (a gate cannot let a process exit under it); a tool passes nothing. Returns { values, flags, errors, rest } when argv is clean. Exit code 2 is the
 * tree's "the run itself broke" (lockstepPeer, flakeProbe, quickSweep): a refusal is not a verdict about the code, so it is never 1.
 */
export function parseOrExit(tag, spec, argv = process.argv.slice(2), io = { err: (l) => console.error(l), exit: (c) => process.exit(c) }) {
    const cli = parseArgs(argv, spec);
    if (cli.errors.length) { for (const l of refusalLines(tag, cli.errors, spec)) io.err(l); io.exit(2); }
    return cli;
}
