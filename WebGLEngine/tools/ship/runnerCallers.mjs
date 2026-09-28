// WebGLEngine/tools/ship/runnerCallers.mjs -- A COMPUTE RUNNER NOTHING OUTSIDE A GATE IMPORTS.
//
// *** tools/ship/kernelReach.mjs's CLOSING LINE NAMES THIS AND CANNOT ANSWER IT. *** That census counts WGSL
// kernels the engine cannot dispatch, and it says: "unchecked here: whether a reachable kernel is ever
// actually DISPATCHED AT RUNTIME -- this is a static question about what production code CAN run, and a
// module imported but never called would still read as reachable."
//
// The arc closed that census at zero in v4647. The layer above it did not close: a kernel becomes reachable
// the moment a RUNNER imports it, and a runner that only its own gate constructs has moved the problem up one
// level rather than solved it. MEASURED tree-wide: 15 modules dispatch a compute pipeline and THREE of them
// are imported by nothing but their own selfcheck. Two are this session's -- v4647's render/temporalLockGPU.mjs
// and v4648's render/visibilityGPU.mjs -- which is worth saying plainly, since both rounds reported closing a
// reachability gap while opening this one.
//
// ---- WHAT A "RUNNER" IS HERE, AND WHY IT IS AN IDIOM RATHER THAN A NAME ---------------------------------------
//
// A module whose CODE both builds a compute pipeline and dispatches it -- `.compute({` and `.dispatch(`. Not a
// name pattern: the tree's runners are called fsrGPU, temporalGPU, objectMotionGPU and populationPolicy, and a
// census keyed on "GPU" would miss the last and admit any file that mentions one. Read through codeOnly, so a
// header describing what a runner does is not a runner.
//
// ---- *** AND THE IMPORT SCAN READS noComments, NOT codeOnly, WHICH IS THE OPPOSITE CHOICE AND DELIBERATE ***
//
// An import PATH is a string literal. codeOnly blanks string contents, so a census of imports built on it
// finds nothing at all -- measured, it reported every one of the fifteen as gate-only, including the five
// fsr.html plainly imports. sourceScan.mjs's own docstring says which reader answers which question: "use
// [noComments] when the thing you are looking for is TEXT the code contains (an event name, a URL, a route);
// use codeOnly when it is an IDIOM". This file needs both, for its two halves, and picking wrong in each
// direction is how that sentence was earned back.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { noComments, codeOnly } from "./sourceScan.mjs";

const SKIP_DIRS = new Set(["node_modules", "vendor", ".git"]);

/** Every .mjs/.js/.html under `root`, skipping vendored and hidden trees. */
export function walkSource(root, out = []) {
    for (const e of fs.readdirSync(root, { withFileTypes: true })) {
        if (SKIP_DIRS.has(e.name) || e.name.startsWith(".")) continue;
        const p = path.join(root, e.name);
        if (e.isDirectory()) walkSource(p, out);
        else if (/\.(mjs|js|html)$/.test(e.name)) out.push(p);
    }
    return out;
}

export const isGate = (f) => /-selfcheck\.mjs$/.test(f);

/** Does this file's CODE build and dispatch a compute pipeline? */
export function isRunner(text) {
    const c = codeOnly(text);
    return /\.compute\s*\(\s*\{/.test(c) && /\.dispatch\s*\(/.test(c);
}

/**
 * Does `text` import the module whose basename (without extension) is `base`? Reads TEXT, because a path is
 * a string -- see the header. Pass `pre` when the caller already has noComments(text): this is called once
 * per (runner, file) pair, and stripping every file's comments fifteen times over took the census from
 * 1.3 seconds to THIRTY-SIX, past the sweep's 20,000 ms SIGKILL cap and not merely its 3,000 ms budget.
 */
export function importsModule(text, base, pre = null) {
    const esc = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:import|from)\\s*[^;\\n]{0,200}["'][^"']*${esc}\\.(?:mjs|js)["']`).test(pre === null ? noComments(text) : pre);
}

/**
 * Census `root` for compute runners and who imports them.
 *
 * Returns { runners, gateOnly, uncalled } -- every runner with its gate and production importer counts, the
 * ones no production file imports, and the ones NOTHING imports at all. The third is separated because it is
 * a different debt: a runner only a gate uses is reachable from a test, and one nothing imports is reachable
 * from nowhere, and a census that merged them would let the second hide inside the first.
 */
export function runnerCallers(root) {
    const files = walkSource(root);
    const text = new Map(files.map((f) => [f, fs.readFileSync(f, "utf8")]));
    // *** TWO SUBSTRING PRE-FILTERS, AND BOTH ARE SOUND RATHER THAN APPROXIMATE. *** codeOnly and
    // noComments both cost real time across four thousand files, and running them on every file for every
    // runner took this census to THIRTY-SIX SECONDS -- past the sweep's 20,000 ms SIGKILL cap. Memoising
    // took it to 6.5 s and these take it under the 3,000 ms budget.
    //
    // Neither filter can produce a false negative: stripping comments and blanking strings only ever REMOVE
    // characters, so a file whose raw text lacks ".compute(" cannot contain it after codeOnly, and one whose
    // raw text lacks a module's basename cannot import it after noComments. That is why they are a filter
    // and not a heuristic -- the expensive readers still decide every case they are handed.
    const maybeRunner = files.filter((f) => !isGate(f) && text.get(f).includes(".compute("));
    // ...and memoised on top of the filter, because a file importing several runners would otherwise have
    // its comments stripped once per runner. Filter first, cache second: the filter decides WHETHER, the
    // cache decides HOW OFTEN.
    const strippedCache = new Map();
    const strip = (f) => { let v = strippedCache.get(f); if (v === undefined) { v = noComments(text.get(f)); strippedCache.set(f, v); } return v; };
    const runners = [];
    for (const f of maybeRunner) {
        if (!isRunner(text.get(f))) continue;
        const base = path.basename(f).replace(/\.(mjs|js)$/, "");
        let gates = 0, production = 0; const by = [];
        for (const g of files) {
            if (g === f) continue;
            if (!text.get(g).includes(base)) continue;        // sound: noComments only removes characters
            if (!importsModule(text.get(g), base, strip(g))) continue;
            if (isGate(g)) gates++; else { production++; by.push(path.relative(root, g)); }
        }
        runners.push({ file: path.relative(root, f), gates, production, by });
    }
    return {
        runners,
        gateOnly: runners.filter((r) => r.production === 0 && r.gates > 0),
        uncalled: runners.filter((r) => r.production === 0 && r.gates === 0),
    };
}
