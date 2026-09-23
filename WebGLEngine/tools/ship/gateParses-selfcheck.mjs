// WebGLEngine/tools/ship/gateParses-selfcheck.mjs -- v4668
//
// *** A GATE THAT DOES NOT PARSE DOES NOT RUN, AND THIS TREE SHIPPED TWO ROUNDS OVER ONE. ***
//
// v4663 edited tools/ship/murmurDrive-selfcheck.mjs, dropped a ` + ` between two adjacent template literals,
// and left the file a SyntaxError. It also raised a count in that same row from 2 to 3 for a site it had just
// wired. Neither change was ever evaluated: the file has not parsed since, so v4663 and v4664 both shipped
// with that gate silent, and the number it advertised had never been true -- repaired and re-run at v4668 the
// old instrument reads 2, exactly what it read before v4663 touched it.
//
// *** THE POINT IS THE CLASS AND NOT THE FILE. *** This tree's own recurring finding is a check that reports
// less than it claims; the extreme of that is a check that reports NOTHING while its title, its prose and its
// asserted numbers all still read like a live guarantee. Every gate here is a source file edited by hand, in
// rounds that add prose to a row as often as they add arithmetic to it, and a broken string concatenation in a
// 900-character explanation is invisible to every reader who is reading the explanation.
//
// *** IT IS A PARSE AND NOT A RUN, AND THE DIFFERENCE IS THE WHOLE BUDGET. *** tools/ship/selfchecks.mjs runs
// the suite serially at roughly 26 minutes; that IS the guarantee and this does not replace it. This answers
// one question -- can each file be loaded at all -- for 1,775 files in under a second, which is cheap enough to
// belong in the round that edits a gate rather than in the ritual at the end of it.
//
// vm.SourceTextModule COMPILES WITHOUT EVALUATING, which is what makes that possible: a gate that renders
// eighteen species and one that prints a table cost the same here. It needs --experimental-vm-modules, so this
// file re-execs itself with the flag rather than asking the runner for it -- the runner spawns `node <gate>`
// and every gate in the tree has to work that way.
"use strict";

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = fileURLToPath(import.meta.url);
const ENG = path.resolve(path.dirname(HERE), "..", "..");

// *** THE RE-EXEC IS GUARDED BY AN ENVIRONMENT VARIABLE AND NOT BY A FLAG SNIFF. *** process.execArgv is empty
// in the child of an execFileSync that passes the flag positionally on some Node builds, and a re-exec that
// cannot tell it has already happened forks forever.
if (!process.env.__GATE_PARSES_CHILD) {
    // AND THE CHILD'S OUTPUT IS FORWARDED ON BOTH PATHS. A child that goes red exits nonzero, execFileSync
    // THROWS, and a parent that only writes the return value prints the exception's inspection instead of the
    // gate -- which is a red gate reporting itself as a crash. The first cut of this file did exactly that.
    let out = "";
    try {
        out = execFileSync(process.execPath, ["--experimental-vm-modules", "--no-warnings", HERE],
            { cwd: ENG, encoding: "utf8", env: { ...process.env, __GATE_PARSES_CHILD: "1" },
              stdio: ["ignore", "pipe", "inherit"] });
    } catch (e) { out = String((e && e.stdout) || ""); }
    process.stdout.write(out);
    process.exit(/^ALL GREEN$/m.test(out) ? 0 : 1);
}

const vm = await import("node:vm");

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const sec = (t) => console.log("\n" + t);

console.log("gateParses-selfcheck -- every gate in the tree can be loaded at all\n");

// The same walk tools/ship/selfchecks.mjs uses, including its `__` exclusion: four gates plant a transient
// `__`-prefixed fixture on disk for the seconds they run, and a walk that picks one up is a race that fails at
// random and never reproduces. Three other files in this tree close that hole; this is the fourth.
const walk = (dir, test, out = []) => {
    for (const f of fs.readdirSync(dir)) {
        if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
        const p = path.join(dir, f);
        let st; try { st = fs.statSync(p); } catch { continue; }
        if (st.isDirectory()) walk(p, test, out);
        else if (test(f) && !f.startsWith("__")) out.push(p);
    }
    return out;
};

const parseOf = (src, id) => {
    try { new vm.SourceTextModule(src, { identifier: id }); return null; }
    catch (e) { return (e && e.constructor && e.constructor.name) + ": " + String(e.message).split("\n")[0]; }
};

// =============================================================================================================
sec("1. *** THE INSTRUMENT CAN FAIL, AND IT IS SHOWN FAILING BEFORE IT IS BELIEVED ***");
{
    // *** WITHOUT THIS ROW SECTION 2 IS A POPULATION OF FILES AND A FUNCTION THAT MIGHT RETURN null FOREVER. ***
    // The decoys are STRINGS and not files on disk, deliberately: a gate that plants a source file in the tree
    // for the seconds it runs is the transient-fixture race the walk above excludes, and this one would be
    // planting it inside its own population.
    //
    // THE FIRST DECOY IS v4663's ACTUAL DEFECT, transcribed: two adjacent template literals with the ` + `
    // between them dropped. It is the shape that broke murmurDrive and it is the shape a round is most likely
    // to write, because it is produced by editing PROSE.
    const decoys = [
        // *** AND THE CONTEXT IS PART OF THE DEFECT, which the first cut of this decoy got wrong. *** Two
        // template literals side by side, ANYWHERE, are a TAGGED TEMPLATE and parse perfectly -- the first
        // tags the second. What actually broke murmurDrive is subtler and the decoy took two tries to state:
        // the first literal was left OPEN at the end of its line, so the backtick at the start of the NEXT
        // line closed it, and the prose that followed -- `amplitude is bounded by...` -- became bare
        // identifiers inside an argument list. A decoy with both literals properly closed passes, and a decoy
        // that passes is a self-test that proves nothing while looking like one.
        ["v4663's own break: two template literals in an argument list with the concatenation dropped",
         'ok("row", true, `first half of a sentence \n        `and the rest of it ` +\n        `and more`);'],
        ["an unterminated template literal", 'const x = `never closed;'],
        ["a stray close paren in an argument list", 'ok("row", true, `why`));'],
        ["an await outside a module's top level in a non-module context is NOT a syntax error here",
         'const a = await x;'],
    ];
    const verdicts = decoys.map(([, src]) => parseOf(src, "decoy"));
    for (let i = 0; i < 3; i++) say(`decoy ${i + 1} (${decoys[i][0]}): ${verdicts[i] || "PARSED -- not rejected"}`);
    ok("!! *** THREE BROKEN SOURCES ARE REJECTED AND A VALID ONE IS NOT: the parser discriminates ***",
        verdicts[0] && verdicts[1] && verdicts[2] && verdicts[3] === null,
        `the three malformed sources are rejected with a SyntaxError each and the fourth -- a top-level await, ` +
        `which is legal in a module and illegal in a script -- PARSES. The fourth conjunct is what says this ` +
        `is compiling as a MODULE: vm.Script would reject it, and a parser that rejected every file in the ` +
        `population would also "catch" v4663 while saying nothing true about any other round.`);
}

// =============================================================================================================
sec("2. *** EVERY GATE FILE IN THE TREE PARSES ***");
{
    const gates = walk(ENG, (f) => /selfcheck.*\.mjs$/.test(f));
    const broken = [];
    const t0 = Date.now();
    for (const f of gates) {
        const why = parseOf(fs.readFileSync(f, "utf8"), f);
        if (why) broken.push(path.relative(ENG, f) + " -- " + why);
    }
    const ms = Date.now() - t0;
    say(`${gates.length} gate files walked and compiled in ${ms} ms`);
    for (const b of broken.slice(0, 12)) say("BROKEN: " + b);
    // *** THE POPULATION IS ASSERTED AND NOT ASSUMED. *** A walk that resolved to the wrong root, or an
    // exclusion that grew a character, would return an empty list and this row would go green on nothing --
    // "0 of 0 files are broken" is true of every tree including one that does not exist. The floor is well
    // below the current 1,775 so ordinary deletions do not fire it, and well above zero so a broken walk does.
    ok("!! *** NOT ONE OF THE TREE'S GATE FILES FAILS TO COMPILE ***",
        broken.length === 0 && gates.length >= 1500,
        `${gates.length} files named *selfcheck*.mjs, ${broken.length} of them unparseable, ${ms} ms. ` +
        `*** THE COUNT IS PART OF THE ASSERTION: *** an empty population passes a "nothing is broken" test ` +
        `forever, which is this tree's most-repaired failure and would be its most embarrassing one in a gate ` +
        `whose whole subject is a check that silently stopped checking.`);
}

// =============================================================================================================
sec("3. *** AND THE HELPERS THE GATES IMPORT, WHICH THE RUNNER NEVER SPAWNS DIRECTLY ***");
{
    // A gate that cannot parse reports itself by exiting nonzero once anybody runs it. A HELPER that cannot
    // parse takes down every gate that imports it, and the reason surfaces as a module-resolution error in
    // whichever gate happened to be spawned first -- which is how seventeen crashed gates were once filed
    // under the Node version banner. tools/ship/murmurSpeciesFrames.mjs is imported by eleven species gates.
    const helpers = [...walk(path.join(ENG, "tools", "ship"), (f) => /\.mjs$/.test(f) && !/selfcheck/.test(f)),
                     ...walk(path.join(ENG, "render"), (f) => /\.mjs$/.test(f))];
    const broken = [];
    for (const f of helpers) {
        const why = parseOf(fs.readFileSync(f, "utf8"), f);
        if (why) broken.push(path.relative(ENG, f) + " -- " + why);
    }
    say(`${helpers.length} non-gate modules under tools/ship and render`);
    for (const b of broken.slice(0, 12)) say("BROKEN: " + b);
    ok("!! ...and all of them compile too",
        broken.length === 0 && helpers.length >= 200,
        `${helpers.length} modules, ${broken.length} unparseable. THE SCOPE IS STATED AND IT IS NOT THE WHOLE ` +
        `TREE: these two directories are where the gates' own machinery lives -- the kit, the shader builder, ` +
        `the host integrator, the frame helper and the ship tools. Application code elsewhere is covered by ` +
        `whatever gate loads it, and is not claimed here.`);
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
    "\nWHAT THIS GATE IS FOR: the difference between a gate that is red and a gate that is not running. " +
    "v4663 broke tools/ship/murmurDrive-selfcheck.mjs with a dropped ` + ` in a prose string and shipped; so " +
    "did v4664. The file had a green-looking row in it asserting a count that had never been evaluated. A " +
    "parse is the cheapest possible proof that a check is still a check." +
    "\nWHAT IT DOES NOT CLAIM: that any gate PASSES, that its assertions are sound, or that its numbers are " +
    "current. tools/ship/selfchecks.mjs runs the suite and is the guarantee; this is the sub-second question " +
    "that can be asked in the same round as the edit, which is the round where the answer is worth having.");
process.exit(fails ? 1 : 0);
