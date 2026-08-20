// WebGLEngine/tools/ship/shipRitual-selfcheck.mjs — v3528
//
// Run: node tools/ship/shipRitual-selfcheck.mjs   (~5s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** THE RITUAL WAS WRITTEN TWICE AND THE SECOND COPY HAD GONE ENTIRELY WRONG. *** At v3527 the handoff's State
// block still read "Engine v3034", "79 checks", "482 gates", "27 devices" -- against a tree at v3527 with 77
// checks, 862 gates and 63 devices. FOUR NUMBERS, ALL STALE, 493 versions of drift.
//
// That is not carelessness. It is the second-declaration failure this lab keeps finding in its own instruments:
// promptCost's device count multiplied through a cost model, case-study's gate count baked into a page,
// gateReach's population pin that went red and stayed red until it became wallpaper. Every one of them was a
// fact the tree already knew, written down a second time somewhere nothing read.
//
// THE FIX IS NOT TO SYNCHRONISE THE TWO COPIES. IT IS TO STOP DECLARING IT TWICE. The steps are declared once, as
// data, each carrying its own verification; the numbers are not declared at all, they are read. This gate holds
// both halves of that: the ritual must stay checkable, and the handoff must stay silent about what it can read.
//
// PROVENANCE: the shape is from moazbuilds/CodeMachine-CLI, refused as code at v3527 -- it orchestrates coding
// agents and SweK is the thing being built, not a workflow to build it. A declared, re-runnable workflow file was
// the one part worth taking.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STEPS, checkable, currentState, inspect, showLines } from "./shipRitual.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };

// ---- 1. EVERY STEP CARRIES ITS OWN VERIFICATION, OR NAMES THE GATE THAT DOES ---------------------------------------
{
    const orphan = STEPS.filter((s) => typeof s.verify !== "function" && !s.gate && s.id !== "package");
    ok("!! every step either checks itself or delegates to a NAMED gate",
       orphan.length === 0,
       orphan.length ? "no check and no gate: " + orphan.map((s) => s.id).join(", ")
                     : STEPS.length + " steps, " + checkable().length + " self-checking, " +
                       STEPS.filter((s) => s.gate).length + " delegated — a step that cannot say how you would " +
                       "know it worked is not a step in a ritual, it is a habit");
    ok("...and every step states WHY, not just what",
       STEPS.every((s) => typeof s.why === "string" && s.why.length > 60),
       "a command without its reason is the thing that gets skipped first when somebody is in a hurry");
}

// ---- 2. THE ORDER IS LOAD-BEARING AND IS ASSERTED ---------------------------------------------------------------------
{
    const ids = STEPS.map((s) => s.id);
    const iIndex = ids.indexOf("knowledge-index"), iCounts = ids.indexOf("derived-counts"), iVerify = ids.indexOf("verify");
    ok("!! the index and the derived counts are rebuilt BEFORE verify runs",
       iIndex < iVerify && iCounts < iVerify,
       "index at " + (iIndex + 1) + ", counts at " + (iCounts + 1) + ", verify at " + (iVerify + 1) +
       " — reversed, verify checks yesterday's numbers and passes. The order is the ritual, not decoration");
    // *** v3907 -- THIS WAS "packaging is last" AND IT WENT RED WHEN publish-release WAS ADDED AFTER IT. ***
    // I did NOT edit it to agree with what shipped, which is the failure this tree names out loud. I read it
    // first, and what it says is telling: the line above it EXPLAINS ITS ORDER ("reversed, verify checks
    // yesterday's numbers and passes") and this one gave no reason at all. IT WAS DESCRIBING THE LIST, NOT
    // CONSTRAINING IT -- a positional assertion standing in for a causal one nobody had written down.
    //
    // The causal claim is: PACKAGING MUST COME AFTER EVERY STEP THAT MODIFIES THE TREE, because the zip has to
    // contain the finished tree. Publishing does not modify the tree, it CONSUMES the zip -- so it belongs after
    // packaging and always did; there was simply never a step there before. Asserted as the reason now, which is
    // strictly stronger: "last" permitted a tree-mutating step to be inserted at position 7 and stay green.
    const MUTATES = ["bump-version", "changelog", "knowledge-index", "launch-index", "population-census", "derived-counts"];
    const iPkg = ids.indexOf("package");
    const lateMutator = MUTATES.filter((m) => ids.indexOf(m) > iPkg);
    ok("!! *** packaging comes after every step that MODIFIES the tree -- the reason 'last' was standing in for ***",
       iPkg >= 0 && lateMutator.length === 0,
       lateMutator.length ? "MUTATES THE TREE AFTER PACKAGING: " + lateMutator.join(", ")
                          : "package at " + (iPkg + 1) + ", after all " + MUTATES.length + " tree-mutating steps");
    const iPub = ids.indexOf("publish-release");
    ok("...and publishing comes after packaging, because it UPLOADS THE ZIP packaging produced",
       iPub === -1 || iPub > iPkg,
       iPub === -1 ? "no publish step in the ritual" : "package at " + (iPkg + 1) + ", publish at " + (iPub + 1));
}

// ---- 3. THE NUMBERS ARE READ, NEVER DECLARED --------------------------------------------------------------------------
{
    const s = currentState();
    ok("!! the ritual reads the version, the brain build and the gate count from the tree",
       s.engine && s.brain && s.gates > 0,
       s.engine + " / " + s.brain + " / " + s.gates + " gates — none of these is written in shipRitual.mjs, which " +
       "is the entire argument of the file");
    const src = read("tools/ship/shipRitual.mjs");
    const code = src.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! ...and no gate count or version number is hardcoded in its CODE",
       !/\b(482|862|79|77)\b/.test(code) && !/v3\d{3}/.test(code.replace(/v3528/g, "")),
       "the historical figures appear in the comment block, where they are a RECORD of the drift, and nowhere in " +
       "the executable part where they could become a fifth stale declaration");
}

// ---- 4. *** AND THE HANDOFF NO LONGER DECLARES WHAT IT CAN READ. *** ---------------------------------------------------
{
    const h = read("HANDOFF.md");
    ok("!! the handoff's State block no longer carries a hardcoded engine version",
       !/Engine \*\*v\d+\*\*/.test(h),
       "it read 'Engine **v3034**' while the tree was at v3527");
    ok("!! ...nor a hardcoded gate count or check count",
       !/\*\*482 gates\*\*/.test(h) && !/= \*\*79 checks\*\*/.test(h),
       "it read '482 gates' against 862 and '79 checks' against 77 — every number in the block was wrong");
    ok("!! and it points at the commands that produce them instead",
       /shipRitual\.mjs/.test(h) && /nextRounds\.mjs/.test(h) && /deviceOwed\.mjs/.test(h),
       "three commands replacing four stale facts. The fix for a second declaration is not to synchronise it, it " +
       "is to delete it");
    // *** WRAPPED ACROSS LINES, AGAIN, AND THIS TIME prose() CANNOT HELP. *** The phrase in the handoff is
    // "is a PRE-FILTER,\nnever a ship", so a raw regex sees neither half -- the same defect the v3298 prose round
    // cured for JS comments and the v3527 provenance checks hit an hour ago. But sourceScan's prose() strips
    // "//" markers from SOURCE; this is MARKDOWN, where the wrapping is the same problem and the cure does not
    // reach. Collapsing whitespace is the fix here, and the gap in prose()'s coverage is now recorded rather
    // than rediscovered a fourth time.
    const flat = h.replace(/\s+/g, " ");
    ok("...while KEEPING the things that are rules rather than counts",
       /PRE-FILTER, never a ship/.test(flat) && /REFUSES to run without/.test(flat),
       "the --affected pre-filter rule and verify's refusal to run without --version are not derivable from the " +
       "tree and belong in prose. A count is not");
}

// ---- 5. THE RITUAL DESCRIBES THE TREE AS IT ACTUALLY STANDS -------------------------------------------------------------
{
    const { rows } = inspect();
    const failing = rows.filter((r) => r.ok === false);
    ok("!! every self-checking step passes against this tree right now",
       failing.length === 0,
       failing.length ? failing.map((r) => r.id + ": " + r.detail).join("; ")
                      : rows.filter((r) => r.ok === true).map((r) => r.id).join(", ") + " all satisfied");
    ok("...and the version markers agree, which is the cross-check verify enforces",
       currentState().markersAgree,
       "main.js and brain.js are two declarations ON PURPOSE — a deliberate cross-check is not accidental " +
       "duplication, and the difference is that something reads them and refuses when they disagree");
    // v3907 -- THIS LABEL SAID "all six steps" WHILE THE PREDICATE COUNTED STEPS.length. The check was right and
    // its NAME had been wrong since the seventh step was added. *** A NAME IS A CLAIM *** -- the same bug
    // blobSpace-selfcheck already records against backendConformance's "answers all ten calls", which had been
    // wrong since the eleventh. SECOND INSTANCE IN THIS TREE, so the fix here is not to write "nine": it is to
    // make the label READ THE NUMBER, so it cannot go stale a third time.
    ok(`the show output names all ${STEPS.length} steps`,
       showLines().join("\n").split("\n").filter((l) => /^\s+(ok|XX|--)/.test(l)).length === STEPS.length);
}

console.log(fails ? ("[shipRitual-selfcheck] FAILED " + fails) : "[shipRitual-selfcheck] all passed");
process.exit(fails ? 1 : 0);
