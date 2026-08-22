// WebGLEngine/tools/ship/wiringClaims.mjs -- v3370
//
// *** ELEVEN TIMES IN ONE SESSION A RECORD OUTLIVED THE CODE IT DESCRIBED, AND EVERY ONE WAS THE SAME SENTENCE
// SHAPE: "X IS NOT WIRED". ***
//
//   multigridGPU        called blocked-on-async at v3352 -- wired since v3225, and the async problem SOLVED and
//                       GATED. I read it from my own notes; multigrid.html carried the same stale line for 127
//                       versions; and it then arrived AGAIN in an outside status report at v3366.
//   quadricDecimate     "InstanceLod.js is live and wants exactly this" -- idleTasks.js imports it, and
//                       InstanceLod does not and never did.
//   SSAOPass            "proven better AO" -- no gate exists, and a SECOND SSAO is live inside bloomPass.
//   probes.mjs          called blocked -- render-qa.mjs imports it.
//   RagdollDismember    "nothing to connect it TO" -- corrected at v3232.
//   greedyMesh          liveness wrong in FOUR records at once.
//
// THE COMMON FACTOR IS NOT CARELESSNESS. IT IS THAT A WIRING CLAIM IS A FACT ABOUT THE IMPORT GRAPH WRITTEN
// DOWN IN PROSE, WHERE NOTHING RE-DERIVES IT. The code moves; the sentence does not; and the sentence is what
// the next person reads. Every one of these was answerable in seconds by the graph and wrong for months.
//
// SO: FIND THE SENTENCES AND CHECK THEM. Not a style rule -- a claim about the tree, tested against the tree.
//
// *** WHAT THIS DELIBERATELY DOES NOT DO. *** It does not forbid the sentences. Several are CORRECT and
// load-bearing: orphanScan's header names SSAOPass as a hand-verified revive candidate, and hilbert.mjs's entry
// says "unwired by design" for a stated reason. A CHECK THAT BANNED THE PHRASE WOULD DELETE THE RECORDS THAT
// WORK ALONG WITH THE ONES THAT ROTTED. It reports a claim whose subject IS reachable, which is the only case
// that is unambiguously wrong.
/**
 * *** THE AUDIT THAT PRODUCED THIS FILE, COMPLETED AT v3372. *** An outside status report arrived at v3366 with
 * four measured backlogs and a four-item "blocked" list. Every figure has now been re-derived from the tree:
 *
 *   MEASURED NUMBERS -- ACCURATE.
 *     coupling census      32 candidates / 10 declared / 14 open      EXACT
 *     value-match          23 matches / 22 open                       EXACT
 *     graded coverage      55 of 139                                  55 of 140 (a patch added one module)
 *     definitions          641 / 37 / 32                              645 / 37 / 33
 *
 *   PROSE CLAIMS ABOUT WIRING -- THREE OF FOUR WRONG.
 *     multigridGPU  "blocked, solve is async"     wired since v3225, async SOLVED and gated since then
 *     quadricDecimate "InstanceLod wants this"    idleTasks imports it; InstanceLod does not and never did
 *     SSAOPass      "proven better AO"            no gate exists, and a second SSAO is live in bloomPass
 *     probes.mjs    "needs a rig run"             CORRECT, and already imported by render-qa
 *
 * *** AND THE VERDICT ABOVE WAS OVERSTATED WHEN FIRST WRITTEN. CORRECTED HERE. ***
 *
 * I recorded it as "every sentence it wrote about wiring was WRONG". THAT IS NOT ESTABLISHED AND I CANNOT
 * ESTABLISH IT: THE PATCH SHIPPED NO PATCH.md AND NO STATED BASE -- I noted that myself when applying it -- so
 * the tree those claims were scanned against is UNKNOWN. Patches here are small, focused, and expected to be
 * scanned before merge, which means a claim written against an earlier tree can be ACCURATE AT ITS BASE and
 * simply not hold at the merge point. "DOES NOT HOLD AT v3372" IS WHAT WAS MEASURED. "WAS WRONG WHEN WRITTEN"
 * IS A CLAIM ABOUT A TREE I NEVER SAW, and asserting a single cause for four claims from one endpoint is the
 * same error this file catalogues.
 *
 * *** AND THE DETAIL THAT SHOULD HAVE STOPPED ME IS ONE THIS FILE FOUND: the ORIGIN of the multigridGPU claim
 * was multigridGPU-selfcheck.mjs'S OWN HEADER, still reading "the port is unwired" 145 versions after v3225
 * wired it. ANY SCAN READING THE TREE'S PROSE AT ALMOST ANY RECENT VERSION WOULD HAVE REPORTED EXACTLY THAT,
 * FAITHFULLY. *** So the report was most likely a VICTIM of the stale sentence rather than a source of it --
 * close to the opposite of what the verdict said, and a stronger argument for this gate rather than a weaker
 * one: the rot was IN THE TREE, and anything reading the tree inherited it.
 *
 * WHAT SURVIVES, AND IT IS THE PART WORTH KEEPING: A COUNT IS RE-DERIVED EACH TIME IT IS PRODUCED; A WIRING
 * CLAIM IS WRITTEN ONCE AND COPIED FORWARD. That asymmetry is real, it explains why the numbers travelled
 * intact and the sentences did not, and it is why this file checks the sentences against the graph. IT DOES
 * NOT REQUIRE ANYBODY TO HAVE BEEN CARELESS, and the first version of this header implied that they had been.
 *
 * AND THE SAME TRAP CAUGHT ME TWICE WHILE AUDITING IT: valueMatch returns { verdict }, not { survives }, and
 * coupleCensus reads crossDevice-selfcheck BESIDE ITSELF rather than from the engine root. Both times my first
 * run produced a clean-looking wrong answer -- 0 survivors, 0 declared -- and both were one sentence from being
 * reported as the report being wrong. READ THE SIGNATURE BEFORE DOUBTING THE NUMBER.
 */

"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** The sentence shapes that assert a module has no consumer. */
export const CLAIM_PATTERNS = [
    /wired to nothing/i, /never connected/i, /nothing calls it/i, /zero referrers/i,
    /imports this module zero/i, /\bis unwired\b/i, /not wired into/i, /no consumer/i,
];

/** Every module that IS imported by something else, by real import specifier -- never a substring match. */
export function importedModules(root = ENG) {
    const files = [];
    const walk = (d) => {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (/\.(js|mjs|html)$/.test(e.name)) files.push(p);
        }
    };
    walk(root);
    const reached = new Set();
    for (const f of files) {
        let src; try { src = fs.readFileSync(f, "utf8"); } catch { continue; }
        // Real specifiers only: `from "..."` and `import("...")`. A bare mention in prose is NOT a reference,
        // which is the entire failure this file exists to correct -- do not repeat it while correcting it.
        for (const m of src.matchAll(/from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']/g)) {
            const spec = m[1] || m[2];
            if (!spec || !/^[./]/.test(spec)) continue;
            const abs = path.resolve(path.dirname(f), spec);
            for (const cand of [abs, abs + ".js", abs + ".mjs"]) {
                if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
                    // A module reached ONLY by its own selfcheck is not wired -- orphanScan's own rule.
                    if (!/-selfcheck\.mjs$/.test(f)) reached.add(path.relative(ENG, cand).replace(/\\/g, "/"));
                    break;
                }
            }
        }
    }
    return reached;
}

/** A claim sentence, the module it names, and whether that module is actually reachable. */
/** A contrast line names TWO modules ("A is unwired while B is live"); anything past that is prose. */
export const MAX_SUBJECTS_PER_CLAIM = 2;

/** Lines that matched a claim pattern but name too many modules to be a record. Filled by auditClaims(). */
export const proseBlocks = [];

export function auditClaims(root = ENG) {
    const reached = importedModules(root);
    const out = [];
    const prose = proseBlocks; prose.length = 0;
    const walk = (d) => {
        let ents; try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const p = path.join(d, e.name);
            if (e.isDirectory()) { walk(p); continue; }
            if (!/\.(js|mjs|html|md)$/.test(e.name)) continue;
            let src; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            src.split(/\r?\n/).forEach((line, i) => {
                if (!CLAIM_PATTERNS.some((re) => re.test(line))) return;
                // The subject is any path-like token on the same line.
                const rel = path.relative(ENG, p).replace(/\\/g, "/");
                const subjects = [];
                for (const m of line.matchAll(/([\w./-]+\.(?:js|mjs))\b/g)) {
                    const rel = m[1].replace(/^\.?\//, "");
                    const hit = [...reached].find((r) => r === rel || r.endsWith("/" + rel));
                    if (hit) subjects.push(hit);
                }
                // *** v3932 -- ONE LINE WAS PRODUCING 294 OF THE 300 CLAIMS. ***
                //
                // This walks LINES, and the design assumption is that a line making a wiring claim names the
                // module it is about -- one path token -- and a CONTRAST line -- "A is unwired
                // while B is live" -- names two, which is why the selfcheck adjudicates those by name. (No real
                // module path is quoted in this comment: naming one HERE would create a claim, which is how the
                // v3930 strictConfig fix put its own explanation into the audit it was repairing.) main.js
                // holds the engine's whole changelog as the TRAILING COMMENT OF A SINGLE LINE, so that one line
                // matched a claim pattern and handed back every module path in the history: 294 subjects, all
                // from main.js:4977. THE COUNT WAS NOT 300 CLAIMS, IT WAS SIX CLAIMS AND ONE PARAGRAPH.
                //
                // The discriminator is derived rather than a filename exclusion, so it holds for any future
                // mega-comment: A LINE NAMING MORE MODULES THAN A CONTRAST CAN IS PROSE, NOT A RECORD. Such
                // lines are RETURNED SEPARATELY rather than dropped -- an exclusion nobody can see is the next
                // round's mystery, and main.js line 1967 already records this same line as a known hazard.
                // *** v3934 -- THE CHANGELOG RECORDS CLAIMS; IT DOES NOT MAKE THEM. ***
                //
                // v3932 cut 300 hits to 6 by refusing lines that name more modules than a contrast can. Then
                // v3932's OWN CHANGELOG BLOCK -- describing the officeDispatch fix, in main.js -- arrived as a
                // fresh two-subject claim, because a changelog block is multi-line and each line names few
                // modules. THE AUDITOR WAS READING THE RECORD OF ITS OWN FINDING AS A NEW FINDING.
                //
                // main.js is the engine's changelog. Every block in it is a DATED HISTORICAL RECORD, written in
                // the past tense about a state that has usually been fixed -- that is what a changelog is for.
                // Reading it as live prose means every round's write-up becomes next round's claim, forever.
                // Excluded by NAME because there is exactly one such file and pretending otherwise would be a
                // derived-sounding rule with one member; REPORTED alongside the prose blocks so the exclusion is
                // visible rather than silent. main.js line 1967 already records this same file as a hazard for a
                // different scanner.
                if (rel === "main.js") {
                    prose.push({ file: rel, line: i + 1, subjects: subjects.length,
                                 why: "engine changelog: a dated record OF a claim, not a claim",
                                 text: line.trim().slice(0, 120) });
                    return;
                }
                if (subjects.length > MAX_SUBJECTS_PER_CLAIM) {
                    prose.push({ file: rel, line: i + 1, subjects: subjects.length,
                                 why: "names more modules than a contrast line can", text: line.trim().slice(0, 120) });
                    return;
                }
                for (const hit of subjects) {
                    out.push({ file: rel, line: i + 1, subject: hit, text: line.trim().slice(0, 150) });
                }
            });
        }
    };
    walk(root);
    return out;
}
