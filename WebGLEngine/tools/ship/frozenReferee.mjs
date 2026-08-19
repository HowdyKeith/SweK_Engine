// tools/ship/frozenReferee.mjs -- v3745
//
// *** THE QUESTION: DID THIS ROUND CHANGE BOTH A SUBJECT AND ITS OWN GRADER? *** A gate edited in the same
// round as the code it grades is not automatically wrong -- a new key needs a new gate, and half this
// session's rounds did exactly that on purpose. IT IS THE THING THAT NEEDS A STATED REASON. The failure it
// guards against is the one this tree keeps finding from the inside: a check widened until it passes, which
// looks identical in a diff to a check corrected because it was pinned to a spelling. v3740 IS THE EXAMPLE --
// the Raycast gate was widened in the same round its subject was fixed, and the only thing separating that
// from cheating was that the WIDER check was re-run against the ORIGINAL broken state and still failed.
// NOTHING ENFORCED THAT. THIS FILE IS THE ENFORCEMENT.
//
// It is also step 1 of the autoresearch-loop question (v3742). A loop that edits code MUST NOT be able to edit
// its own referee, and an allowlist is the wrong shape -- you cannot enumerate everything a loop must not
// touch. THE RIGHT SHAPE IS A HASH OF EVERY GATE, COMPARED BEFORE AND AFTER: exact, cheap, and it does not
// care how the edit arrived. `frozenCheck` is that entry point, and it is useful loop or no loop.
//
// *** HOW A GATE'S SUBJECT IS DERIVED, AND WHY NOT BY NAME. The obvious pairing is X-selfcheck.mjs next to
// X.js. MEASURED AT v3745: THAT HOLDS FOR ONLY 473 OF 1004 GATES. A name-based pairing would be blind to more
// than half the suite while looking complete. So the subject is derived from WHAT THE GATE IMPORTS -- the same
// idiom deviceInstrumentMap already uses (v3728: a row's gate IMPORTS are the modules it exercises). MEASURED:
// 844 of 1004 gates import at least one shipping module, 1837 edges in total. ***
//
// *** THE REMAINING 160 IMPORT NOTHING -- they read source as TEXT (hostingPanel-selfcheck, claimCheck-selfcheck
// and the like). THEY ARE REPORTED AS UNPAIRED, NOT AS CLEAN. A gate whose subject cannot be derived has not
// been shown to be safe; it has not been looked at. Same third state as claimCheck's UNCHECKABLE, and the same
// reason: a checker that silently drops what it cannot resolve hands out a clean bill it never earned. ***

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { gateFiles } from "./staleness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
export const MANIFEST = path.join(HERE, "referee-hashes.json");

export const isGate = (p) => /-selfcheck\.mjs$/.test(p);
const rel = (p) => path.relative(ENG, p).split(path.sep).join("/");
const hash = (p) => {
    try { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex").slice(0, 16); }
    catch { return null; }
};

/** The shipping modules a gate imports. NOT a name match -- see the header for why. */
export function subjectsOf(gatePath) {
    let src = "";
    try { src = fs.readFileSync(gatePath, "utf8"); } catch { return []; }
    const dir = path.dirname(gatePath);
    const out = [];
    for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
        const abs = path.resolve(dir, m[1]);
        if (isGate(abs)) continue;                 // a gate importing a helper gate is not its subject
        if (!fs.existsSync(abs)) continue;
        out.push(abs);
    }
    // *** v3796 -- A GATE THAT READS ITS SUBJECT NAMES IT JUST AS EXPLICITLY AS ONE THAT IMPORTS IT.
    // Import-based derivation cannot see an HTML PAGE, because a page cannot be imported -- so every gate that
    // grades a page reported UNPAIRED or GATE ONLY however precisely it named its subject. THAT HAPPENED FOUR
    // TIMES IN ONE SESSION (v3770, v3786, v3788, v3795) and each time the entry had to explain that the tool
    // was right by its rule and wrong about the facts. FOUR EXPLANATIONS OF THE SAME NON-DEFECT IS THE TOOL
    // ASKING FOR A RULE.
    // *** THIS IS NOT A LOOSENING. The bar is unchanged -- the gate must NAME the file, in its own source, as a
    // path that exists -- and only the SPELLING widens: `readFileSync(new URL("../x.html", import.meta.url))`
    // and `path.join(root, "x.html")` are as explicit as an import statement. What is still refused is a gate
    // that names nothing: it reports UNPAIRED exactly as before. ***
    for (const m of src.matchAll(/["'](\.{0,2}\/?[\w./-]+\.(?:html|json|css|glsl|wgsl|bat|sh|md))["']/g)) {
        const name = m[1];
        // try the gate's own directory first, then the tree root two levels up (tools/ship -> WebGLEngine)
        for (const cand of [path.resolve(dir, name), path.resolve(dir, "..", name), path.resolve(dir, "..", "..", name)]) {
            if (!fs.existsSync(cand) || isGate(cand)) continue;
            out.push(cand); break;
        }
    }
    return [...new Set(out)];
}

/** Hash every gate and every module any gate names as a subject. */
export function snapshot() {
    const gates = {}, subjects = {}, pairs = {};
    for (const g of gateFiles()) {
        const gr = rel(g);
        gates[gr] = hash(g);
        const subs = subjectsOf(g).map(rel);
        pairs[gr] = subs;
        for (const s of subs) if (!(s in subjects)) subjects[s] = hash(path.join(ENG, s));
    }
    return { gates, subjects, pairs };
}

/**
 * *** THE LOOP ENTRY POINT: NOT ONE GATE FILE MAY DIFFER. No allowlist, no exceptions, no "unless" -- an
 * optimisation loop that can reach its referee has no referee. Returns the changed gates, so a violation NAMES
 * ITSELF rather than being a bare false. ***
 */
export function frozenCheck(beforeGates, afterGates) {
    const changed = [], added = [], removed = [];
    for (const [p, h] of Object.entries(afterGates)) {
        if (!(p in beforeGates)) added.push(p);
        else if (beforeGates[p] !== h) changed.push(p);
    }
    for (const p of Object.keys(beforeGates)) if (!(p in afterGates)) removed.push(p);
    return { frozen: changed.length === 0 && added.length === 0 && removed.length === 0, changed, added, removed };
}

/**
 * Pairs where the gate AND at least one of its subjects both moved since the manifest.
 * `unpaired` = gates that changed but whose subject cannot be derived -- reported, never counted as clean.
 */
export function pairedEdits(manifest, now) {
    const paired = [], gateOnly = [], unpaired = [];
    for (const [g, h] of Object.entries(now.gates)) {
        if (manifest.gates[g] === h) continue;                      // gate unchanged -- not this tool's business
        const subs = now.pairs[g] || [];
        if (!subs.length) { unpaired.push(g); continue; }
        const moved = subs.filter((s) => manifest.subjects[s] !== now.subjects[s]);
        if (moved.length) paired.push({ gate: g, subjects: moved });
        else gateOnly.push(g);
    }
    return { paired, gateOnly, unpaired };
}

/**
 * *** A PAIRED EDIT MUST BE NAMED IN THE CHANGELOG. That is the whole discipline, and it reuses the record
 * this project already writes every round rather than inventing a second declaration to keep in sync. If a
 * round changes wadVoxelizer.js and wadVoxelizer-selfcheck.mjs together, the entry has to say so -- which is
 * exactly the sentence a reader needs in order to tell a correction from a widening. ***
 */
export function buildVersion() {
    try { return (readFileSyncSafe(path.join(ENG, "main.js")).match(/ENGINE_VERSION = "(v\d+)"/) || [])[1] || null; }
    catch { return null; }
}
function readFileSyncSafe(p) { return fs.readFileSync(p, "utf8"); }

/** The `## vNNNN` the newest changelog entry is about, or null. */
export function entryVersion(changelogText) {
    const m = String(changelogText || "").match(/^##\s*(v\d+)/m);
    return m ? m[1] : null;
}

export function undeclared(paired, changelogText, expectVersion = buildVersion()) {
    const text = String(changelogText || "");
    // *** v3751 -- THE HOLE THIS CLOSES WAS FOUND BY USING THE TOOL, AND IT REPORTED A CLEAN BILL WHILE IT WAS
    // OPEN. The check only asked whether a basename appeared in the NEWEST entry -- so A FILE EDITED IN TWO
    // CONSECUTIVE ROUNDS WAS SELF-DECLARING ON THE SECOND, because the previous round's entry still names it.
    // At v3750 it reported 0 UNDECLARED for a paired edit on loopAccept.mjs BEFORE THAT ROUND'S ENTRY EXISTED,
    // purely because v3749's entry mentioned the file. *** AN ENTRY FOR ANOTHER BUILD DECLARES NOTHING ABOUT
    // THIS ONE: if the newest entry's version does not match the build's ENGINE_VERSION, EVERY paired edit is
    // undeclared, and the reason says which two versions disagreed rather than leaving a bare count. ***
    const seen = entryVersion(text);
    if (expectVersion && seen !== expectVersion) {
        return paired.map((p) => ({ ...p, why: "the newest changelog entry is " + (seen || "unreadable") +
                                          " but this build is " + expectVersion + " -- it declares nothing about this round" }));
    }
    return paired.filter((p) => {
        const names = [p.gate, ...p.subjects].map((f) => path.basename(f).replace(/\.(mjs|js|cjs)$/, ""));
        return !names.some((n) => text.includes(n));
    });
}

export function readManifest() {
    try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); } catch { return null; }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
    const now = snapshot();
    if (process.argv.includes("--accept")) {
        // *** DELIBERATE, NEVER AUTOMATIC. A manifest this tool refreshed on every run would agree with itself
        // forever -- the mirror shape. Accepting is a separate act, taken by a person after reading the report. ***
        fs.writeFileSync(MANIFEST, JSON.stringify({ accepted: new Date().toISOString().slice(0, 10), ...now }, null, 0));
        console.log("[frozenReferee] manifest accepted: " + Object.keys(now.gates).length + " gates, " +
                    Object.keys(now.subjects).length + " subjects");
        process.exit(0);
    }
    const man = readManifest();
    if (!man) { console.log("[frozenReferee] NO MANIFEST -- run with --accept once to record a baseline. THIS IS NOT A PASS."); process.exit(1); }
    const r = pairedEdits(man, now);
    // *** v3751 -- THE HEADER IS KEPT. This line used to split on /^## v/ and take [1], which DROPPED THE
    // "## v" PREFIX -- so the version rule added this round saw a headerless string, read null, and called
    // EVERY paired edit undeclared. THE RULE WAS RIGHT AND ITS OWN CALLER WAS FEEDING IT THE WRONG SHAPE.
    // Found in the same round the rule was written, by running the tool on itself. ***
    const changelog = (() => {
        try {
            const parts = fs.readFileSync(path.join(ENG, "..", "BACKLOG.md"), "utf8").split(/^## v/m);
            return parts.length > 1 ? "## v" + parts[1] : "";
        } catch { return ""; }
    })();
    const bad = undeclared(r.paired, changelog);
    console.log("[frozenReferee] since " + man.accepted + ":");
    for (const p of r.paired) console.log("  PAIRED EDIT   " + p.gate + "  +  " + p.subjects.join(", "));
    for (const g of r.gateOnly) console.log("  GATE ONLY     " + g + "   (its subjects did not move)");
    if (r.unpaired.length) console.log("  UNPAIRED      " + r.unpaired.length + " changed gate(s) whose subject cannot be derived -- NOT a pass, just unresolved");
    for (const p of bad) console.log("  *** UNDECLARED PAIRED EDIT: " + p.gate + " -- not named in the newest changelog entry ***");
    console.log("[frozenReferee] " + r.paired.length + " paired, " + r.gateOnly.length + " gate-only, " +
                r.unpaired.length + " unpaired, " + bad.length + " undeclared");
    process.exit(bad.length ? 1 : 0);
}
