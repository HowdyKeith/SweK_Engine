// WebGLEngine/tools/ship/physicsReach-selfcheck.mjs -- v3818
//
// Run: node tools/ship/physicsReach-selfcheck.mjs
//
// *** THE GAP NOTHING WAS WATCHING. ***
//
// Keith asked whether the v3817 patch's modules were available to the physics lab and its AI. They were not --
// and neither were thirty-odd others. A module can be fully graded, with its own selfcheck passing on every
// ship, and be reachable ONLY by typing a selfcheck path into a terminal. Nothing in the tree said so:
//
//   - deviceInstrumentMap maps DEVICES to INSTRUMENTS, so it can only see a module that ALREADY HAS A DEVICE.
//     A module with none is invisible to it BY CONSTRUCTION -- it is not a gap in that gate, it is outside
//     its subject.
//   - orphanDisposition, orphanTriage and pageReach returned ZERO mentions of any of the seven when asked.
//   - definitionGates counts EXPORTS without a gate, which is a different question: those modules have gates.
//     THEY HAVE NO DOORS.
//
// So seven modules could land fully graded and completely unreachable without one gate going red, which is
// how the number got to forty-one before anybody counted it.
//
// *** WHAT COUNTS AS A DOOR, AND WHY THE ANSWER IS THREE THINGS RATHER THAN ONE. *** The lab reaches physics
// three ways and they are not interchangeable: a roundhouse DEVICE (which is what the Roundhouse AI can drive),
// an INSTRUMENT row (which is what instruments.html and the bench list), and a PAGE that imports the module
// (which is what a person clicks). Requiring all three would fail modules that are legitimately one kind of
// thing; requiring none is where we were. ONE OF THE THREE IS THE BAR.
//
// *** AND THIS GATE PRINTS THE WHOLE LIST. *** definitionGates truncates its offenders after six entries and
// ends in "...", and at v3817 that made its +5 UNATTRIBUTABLE -- the number said it got worse and would not say
// what got worse, which is most of the value of having it. A ratchet that hides its own contents is a number
// nobody can act on, so this one names every module it counts.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const rd = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return ""; } };
const walk = (d, o = []) => {
    let entries = [];
    try { entries = fs.readdirSync(d); } catch { return o; }
    for (const f of entries) {
        const p = path.join(d, f);
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, o);
        else o.push(p);
    }
    return o;
};

// ---- the three doors, read once, WITH COMMENTS STRIPPED ------------------------------------------------------
// *** A MENTION IN A COMMENT IS NOT A DOOR, AND THE FIRST VERSION OF THIS GATE COUNTED ONE. ***
// It scanned raw source and was wrong in BOTH directions, which is what made the decision measurable rather
// than a matter of taste:
//   - FALSE DOOR: physics/mesh/wallCondition.mjs was counted reachable because a comment somewhere names it.
//     Nobody can run a module by reading a sentence about it. The honest count is one HIGHER.
//   - FALSE GHOST: tools/roundhouse/heidler-selfcheck.mjs quotes ANOTHER PROJECT'S file in prose --
//     "Its src/physics/heidler.js carries a header worth the whole visit" -- and the path scan below matched
//     `physics/heidler.js` out of the middle of it, then reported a ghost for a file that was never ours.
// Measured: raw 34 unreachable and one ghost; stripped 35 unreachable and no ghosts. Stripping costs exactly
// one module and it is a module that genuinely has no way in.
const stripComments = (s) => s
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
const roundhouseSrc = stripComments(walk(path.join(ENG, "tools/roundhouse")).filter((p) => p.endsWith(".mjs")).map(rd).join("\n"));
const instrumentsSrc = stripComments(rd(path.join(ENG, "physics/instruments.mjs")));
const pagesSrc = stripComments(fs.readdirSync(ENG).filter((f) => f.endsWith(".html")).map((f) => rd(path.join(ENG, f))).join("\n"));

/** A module is GRADED when a selfcheck sits beside it under the same name. Those are the ones with a claim. */
const graded = walk(path.join(ENG, "physics"))
    .filter((p) => /\.(mjs|js)$/.test(p) && !/-selfcheck\.(mjs|js)$/.test(p))
    .filter((p) => fs.existsSync(p.replace(/\.(mjs|js)$/, (m) => "-selfcheck" + m)))
    .map((p) => path.relative(ENG, p).replace(/\\/g, "/"))
    .sort();

const doorsFor = (rel) => ({
    device: roundhouseSrc.includes(rel),
    instrument: instrumentsSrc.includes(rel),
    page: pagesSrc.includes(rel),
});
const unreachable = graded.filter((rel) => { const d = doorsFor(rel); return !d.device && !d.instrument && !d.page; });

console.log("1. HOW MUCH GRADED PHYSICS HAS NO DOOR AT ALL");
{
    // *** A RATCHET, DOWNWARD ONLY. *** v3818 measured 41 of 118 and closed the thermal-statistics arc, which
    // is 7 of them, leaving 35 once comment-only mentions stopped being counted as doors (see above). The number may only fall: a round that adds a graded module WITHOUT a door has to either
    // give it one or move this line, and moving it is a decision somebody makes on purpose rather than a
    // silent drift.
    const BASELINE = 35;
    ok("!! *** NO MORE THAN " + BASELINE + " GRADED PHYSICS MODULES ARE UNREACHABLE FROM EVERY DOOR ***",
        unreachable.length <= BASELINE,
        unreachable.length + " of " + graded.length + " graded modules are named by NO roundhouse device, NO " +
        "instruments row and NO page." + (unreachable.length > BASELINE
            ? " *** THIS WENT UP. Either give the new module a door or move the baseline ON PURPOSE. ***"
            : unreachable.length < BASELINE
                ? " Below the baseline -- RATCHET IT DOWN to " + unreachable.length + " so the ground is kept."
                : ""));

    // The whole list, every time. See this file's header on why.
    console.log("        the " + unreachable.length + " with no door:");
    for (const m of unreachable) console.log("          " + m);
}

console.log("\n2. THE ARC KEITH ASKED ABOUT NOW HAS ONE");
{
    // He asked directly: "are the patch items available to the physics lab and the physics lab ai?" The answer
    // was no, for all seven. These are pinned by NAME because the question was about these specific modules --
    // the general rule is section 1, and this is the receipt for the round that answered him.
    const ARC = [
        "physics/thermal/fermi.mjs", "physics/thermal/sackurTetrode.mjs", "physics/thermal/chemicalPotential.mjs",
        "physics/thermal/debye.mjs", "physics/thermal/bec.mjs", "physics/thermal/blackbody.mjs",
        "physics/md/maxwellSpeed.mjs",
    ];
    for (const m of ARC) {
        const d = doorsFor(m);
        ok("!! " + path.basename(m).padEnd(24) + " device:" + (d.device ? "y" : "-") +
           " instrument:" + (d.instrument ? "y" : "-") + " page:" + (d.page ? "y" : "-"),
            d.device || d.instrument || d.page,
            d.device || d.instrument || d.page ? "" : "*** STILL NO DOOR ***");
    }
}

console.log("\n3. A DOOR THAT NAMES A MODULE MUST NAME ONE THAT EXISTS");
{
    // The cheap way to make section 1 green is to name modules that are not there. This is the check that
    // makes that not work.
    const named = new Set();
    for (const src of [roundhouseSrc, instrumentsSrc, pagesSrc]) {
        for (const m of src.matchAll(/physics\/[A-Za-z0-9_\/-]+\.(?:mjs|js)/g)) named.add(m[0]);
    }
    // The sources are already comment-stripped, so a path quoted in prose -- including another project's --
    // cannot reach this scan. That was a real false positive: see the header on heidler.
    const ghosts = [...named].filter((rel) => !fs.existsSync(path.join(ENG, rel)) && !/-selfcheck\./.test(rel)).sort();
    ok("!! every physics module named by a device, a row or a page exists on disk", ghosts.length === 0,
        ghosts.length ? "GHOSTS: " + ghosts.join(", ") : named.size + " distinct module paths named across the three doors, all present");
}

console.log("\n4. SABOTAGE");
{
    const fake = "physics/thermal/thisModuleDoesNotExist.mjs";
    ok("!! SABOTAGE: a module named by nothing IS counted unreachable",
        !roundhouseSrc.includes(fake) && !instrumentsSrc.includes(fake) && !pagesSrc.includes(fake),
        "the three-door test is a plain containment check on the shipped sources, so a module nobody mentions " +
        "cannot slip through by being spelled oddly");
    // *** I ARGUED THE OPPOSITE HERE FIRST AND THE MEASUREMENT SETTLED IT. *** The original note said a prose
    // mention should count, on the theory that tightening the rule would call phase-change.html's four phase
    // modules doorless. It would not: they reach the lab through their DEVICES, and stripping comments moves
    // the count by exactly one module -- wallCondition.mjs, which really does have no way in. The rule is
    // still CONTAINMENT rather than a parsed import, because a bind naming a path in code is a real door; it
    // is only PROSE that stopped counting.
    const inCode = pagesSrc.includes("physics/thermal/phaseOps.mjs") || roundhouseSrc.includes("physics/thermal/vaporize.mjs");
    ok("!! the rule is CONTAINMENT IN CODE, not a parsed import", inCode,
        "phase-change.html's four reach the lab through their BINDS rather than by importing the physics " +
        "module directly, and those binds still name them in code. A stricter parsed-import rule would call " +
        "four modules with a working front door doorless");
}

{
    // *** THE TWO FALSE POSITIVES THIS GATE SHIPPED WITH, EACH RE-RUN AGAINST THE STRIPPER. ***
    const prose = "// Its src/physics/heidler.js carries a header worth the whole visit\nconst x = 1;";
    const hits = [...stripComments(prose).matchAll(/physics\/[A-Za-z0-9_\/-]+\.(?:mjs|js)/g)];
    ok("!! SABOTAGE: another project's path quoted in a comment is NOT read as a module",
        hits.length === 0,
        "this exact line produced a GHOST report for physics/heidler.js -- a file that was never ours, matched " +
        "out of the middle of `src/physics/heidler.js` in prose");

    const proseDoor = "/* see physics/mesh/wallCondition.mjs for the reasoning */";
    ok("!! SABOTAGE: a module mentioned ONLY in a comment is NOT counted as having a door",
        !stripComments(proseDoor).includes("physics/mesh/wallCondition.mjs"),
        "it was, and that is why the count read 34 instead of 35. NOBODY CAN RUN A MODULE BY READING A " +
        "SENTENCE ABOUT IT");

    const realDoor = 'import { satPressure } from "../../physics/thermal/vaporize.mjs";';
    ok("...and a real import is still a door", stripComments(realDoor).includes("physics/thermal/vaporize.mjs"),
        "so the stripper removed the prose and left the code, which is the whole distinction");
}

say("\nWHAT THIS DOES NOT DO: it measures whether a door EXISTS, not whether it WORKS. A device that throws, an " +
    "instrument row pointing at a page that never renders, or a page nobody can find from server.html would " +
    "all pass here. *** THOSE ARE deviceInstrumentMap'S, pageReach'S AND pageSections' SUBJECTS RESPECTIVELY, " +
    "and this gate deliberately does not duplicate them -- it answers the one question none of them could: " +
    "IS THERE ANY WAY IN AT ALL. ***");

console.log("\nphysicsReach-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
