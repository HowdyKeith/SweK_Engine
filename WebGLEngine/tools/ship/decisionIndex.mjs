import { pathToFileURL, fileURLToPath } from "node:url";
// WebGLEngine/tools/ship/decisionIndex.mjs -- v3172
//
// THE TREE ALREADY DECIDED IT, AND THE DECISION IS IN A COMMENT NOBODY GREPS.
//
// *** SIX TIMES IN ONE SESSION I PROPOSED A ROUND THAT WAS ALREADY DONE. *** Android discovery, the Termux
// launchers, the Android dependency analysis, Terasology's record-and-replay, its one-owner event rule, and
// then -- most pointedly -- "wire binaryFaces into the mesher", which mesh/meshChoice-selfcheck.mjs opens by
// answering: "I SET OUT TO CONNECT binaryFaces TO greedyMesh3d AND MEASURED MY WAY OUT OF IT", with a 144:1
// ratio showing that even an INFINITELY FAST binaryFaces could not move the total.
//
// THE CORRECTIVE IS NOT "CHECK HARDER". Every one of those answers was written down, gated, and shipped. The
// problem is that A DECISION NOT TO DO SOMETHING LOOKS EXACTLY LIKE AN ABSENCE from outside the file that
// records it -- and this tree has ~579 gates, most carrying a paragraph about what was tried and why it
// stopped. That is a body of decisions with no index.
//
// SO: DERIVE THE INDEX. A gate that says "I measured my way out of it", "cannot help", "NOT WORTH", "already
// exists" or "declined" is recording a CLOSED QUESTION, and the next person -- or the next me -- should meet it
// before proposing the work again.
//
// *** THIS IS A REPORT, NOT A RULE. *** It cannot tell a decision from a description, and pretending otherwise
// would make it a filter that hides work. It surfaces candidates and names the file; a human reads the
// paragraph. v3103's law: a report is where a real judgement goes when source alone cannot decide.

import fs from "node:fs";
import path from "node:path";
import { gateFiles } from "./staleness.mjs";

/**
 * Phrases that mark a CLOSED QUESTION rather than a description of behaviour.
 *
 * Chosen to be narrow: each is a sentence somebody writes when they STOPPED, not when they explained. A looser
 * set ("not", "no", "cannot") would match every guard clause in the tree and the index would be noise.
 */
export const CLOSURE_MARKS = [
    /measured my way out of it/i,
    /cannot help/i,
    /is not worth/i,
    /NOT WORTH DOING/i,
    /declined to/i,
    /decided against/i,
    /deliberately (not|excluded|off|absent)/i,
    /on purpose,? and (not|the reason)/i,
    /would be a downgrade/i,
    /already (exists|does|has)/i,
    /DO NOT (convert|adopt|promote|delete|use)/i,
    /is the wrong frame/i,
    // NOT /circular/ ALONE. My first version matched it and pulled in FOUR PHYSICS GATES on "circular orbit"
    // -- blackHole, mission, neutronStar and diffraction. A report that is mostly noise trains people to
    // ignore it, which is worse than not having one, and the same instinct as v3141's exemptions: the mark has
    // to be DECIDABLE, not merely suggestive.
    /would be circular/i,
    /is circular\b/i,
];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m).replace(/\r/g, "");

/** Pull the header comment block -- the part a gate uses to say what it is and what it decided. */
function headerOf(src) {
    const lines = strip(src).split("\n");
    const out = [];
    for (const l of lines) {
        if (/^\s*(import|const|let|export|function|async)/.test(l)) break;
        if (/^\s*(\/\/|\/\*|\*)/.test(l) || !l.trim()) out.push(l.replace(/^\s*(\/\/ ?|\* ?)/, ""));
    }
    return out.join("\n");
}

/**
 * Walk every selfcheck and report the ones whose header records a closed question.
 *
 * DERIVED, and the corpus is DERIVED TOO: it finds selfchecks by resolution rather than from a list, so a gate
 * added tomorrow is indexed without anybody remembering to add it. A typed corpus would be the thing this
 * module exists to prevent, one level up.
 */
export function decisionIndex(engRoot) {
    const found = [];
    // v3214 -- WAS A SECOND WALKER, AND singleSource-selfcheck HAS BEEN SAYING SO. staleness.mjs owns
    // gateFiles() and describes itself as "the ONE definition of a gate exists here"; re-deriving the pattern
    // here made a third counter that could disagree with the other two, which is exactly what v3041 spent a
    // round removing after three of them had disagreed for 153 versions. The header of this very file argues
    // that its corpus is DERIVED rather than listed -- it is, and now it derives it from the one definition.
    const walk = (dir) => {
        for (const p of gateFiles(dir)) {
            let src; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const head = headerOf(src);
            const marks = CLOSURE_MARKS.filter((r) => r.test(head));
            if (!marks.length) continue;
            // The first sentence carrying a mark IS the decision, near enough to point somebody at the file.
            const line = head.split("\n").find((l) => marks.some((r) => r.test(l))) || "";
            found.push({
                file: path.relative(engRoot, p).replace(/\\/g, "/"),
                marks: marks.length,
                says: line.trim().slice(0, 160),
            });
        }
    };
    walk(engRoot);
    return found.sort((a, b) => (b.marks - a.marks) || a.file.localeCompare(b.file));
}

const ENGROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// v3219 -- A FRONT DOOR. *** RUNNING THIS FILE PRINTED NOTHING AND EXITED 0, WHICH READS AS A CLEAN BILL. ***
// EIGHT of this tree's analysis tools did that, not the two on record: an empty report and a tool that never
// ran are indistinguishable from a shell, and every one of them was ALSO reported by graveyard-selfcheck as an
// orphaned utility -- because its only consumer was its own gate. One main block answers both: the tool becomes
// runnable by a person, and it acquires a caller that is not a test.

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
    const rows = await decisionIndex(ENGROOT);
    console.log("[decisionIndex] " + rows.length + " selfcheck header(s) record a CLOSED QUESTION.");
    console.log("[decisionIndex] A REPORT, NOT A RULE -- a decision not to do something looks exactly like an");
    console.log("[decisionIndex] absence from outside the file that records it. Read before proposing a round.");
    for (const r of rows) console.log("  " + r.file + "\n      " + (r.says || "").trim());
}
