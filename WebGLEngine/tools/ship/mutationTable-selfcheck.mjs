// WebGLEngine/tools/ship/mutationTable-selfcheck.mjs -- v2884
//
// Run: node tools/ship/mutationTable-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES THE MUTATION TABLE -- not by running it, which costs six minutes, but by checking in milliseconds that
// every mutation still BITES.
//
// THE HOLE THIS EXISTS FOR, AND IT WAS REAL. tools/mutate/mutate.mjs is the tool that finds controls which cannot
// fail: break the code on purpose, and if the gate still passes, the gate does not cover that behaviour. It found
// its first survivor at v2494 and then STOPPED BEING RUN -- it is in neither verify.mjs nor selfchecks.mjs.
//
// AND A MUTATION TABLE ROTS. If a find-string no longer appears in its target file the mutation applies NOTHING,
// the gate stays green, and since caught = !green it is reported SURVIVED.
//
// v2886 CORRECTION: v2884 said "reports CAUGHT". That is BACKWARDS -- a stale mutation reports SURVIVED, which
// is a FALSE ALARM rather than a false pass. Less dangerous than I claimed, and still worth catching, because a
// phantom survivor buries the real ones in noise. Which is exactly what happened: "the spiky kernel's constant"
// had been stale since a _p6(h) refactor, and the SPH density-symmetry mutation was patching a code path no test
// runs -- two phantom survivors between them, one of which has been on the books since v2494.
//
// Running the full suite on every ship is not affordable. Checking that the table is still LOADED is free.
import { MUTATIONS } from "../mutate/mutate.mjs";
import { prose } from "./sourceScan.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// ---- 1. the table is populated and well formed ------------------------------------------------------------------
{
    ok("the mutation table is populated", MUTATIONS.length >= 8, MUTATIONS.length + " mutations");
    const bad = MUTATIONS.filter((m) => !m.name || !m.file || !m.find || !m.replace || !m.breaks);
    ok("every mutation names what it BREAKS", bad.length === 0,
       bad.length ? bad.map((m) => m.name).join(", ") : "a mutation that cannot say what it should break is not a test");
    ok("find and replace actually differ", MUTATIONS.every((m) => m.find !== m.replace),
       "a no-op mutation changes nothing, leaves the gate green, and is reported SURVIVED forever");
}

// ---- 2. THE ROT CHECK: every mutation must still BITE ---------------------------------------------------------------
{
    const stale = [];
    for (const m of MUTATIONS) {
        let src = null;
        try { src = fs.readFileSync(path.join(ENG, m.file), "utf8"); } catch { stale.push(m.name + " (file missing: " + m.file + ")"); continue; }
        if (!src.includes(m.find)) stale.push(m.name + " -> " + m.file);
    }
    ok("!! EVERY MUTATION'S FIND-STRING IS STILL PRESENT", stale.length === 0,
       stale.length ? "STALE, MUTATES NOTHING, WOULD REPORT A PHANTOM SURVIVOR: " + stale.join(" | ")
                    : MUTATIONS.length + " mutations all still bite");
    ok("...and every target file exists", MUTATIONS.every((m) => fs.existsSync(path.join(ENG, m.file))));
}

// ---- 3. AMBIGUITY MUST BE DECLARED, because replace() patches only the FIRST match -----------------------------------
//
// String.replace with a STRING pattern replaces one occurrence. If a find-string matches twice, the mutation
// silently patches whichever comes first -- which may not be the path the tests exercise, making it invisible.
{
    const undeclared = [];
    for (const m of MUTATIONS) {
        const src = fs.readFileSync(path.join(ENG, m.file), "utf8");
        const n = src.split(m.find).length - 1;
        if (n > 1 && !m.occurrences) undeclared.push(m.name + " (" + n + " matches)");
    }
    ok("!! a find-string matching MORE THAN ONCE must declare it", undeclared.length === 0,
       undeclared.length ? "UNDECLARED: " + undeclared.join(" | ")
                         : "v2886 made the patcher replaceAll, so duplicates now all bite -- but a duplicate still needs declaring, because it means two implementations of one behaviour exist and a reader should know");
    const src = fs.readFileSync(path.join(ENG, "tools", "mutate", "mutate.mjs"), "utf8");
    ok("!! the patcher uses replaceAll, not replace", /original\.replaceAll\(/.test(src),
       "replace() patches ONE occurrence; that cost a phantom survivor from v2494 to v2886, mutating a grid path no test runs");
    // and a declared one must say what it does NOT cover
    const declared = MUTATIONS.filter((m) => m.occurrences > 1);
    ok("...and a declared duplicate says what it does NOT cover", declared.every((m) => (m.covers || "").length > 20),
       declared.length ? declared.map((m) => m.covers.slice(0, 60)).join(" | ") : "none declared");
}

// ---- 4. the harness's own safety properties are still in place ---------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "mutate", "mutate.mjs"), "utf8");
    ok("!! it writes a STRANDED MARKER before touching source", /stranded/i.test(src),
       "a finally block does not survive SIGKILL, and the first version left a mutated constant in the real tree");
    ok("...and recovers one on the next run", /recoverStranded/.test(src));
    ok("!! it refuses to report verdicts if the gate is ALREADY red", /Refusing to produce verdicts/.test(src),
       "every mutation would be reported CAUGHT and every one would be meaningless");
    ok("...and refuses an empty --only filter", /Refusing to report a score on an empty set/.test(src),
       "0/0 caught is a pass that means nothing");
}

console.log(fails ? "\nmutationTable-selfcheck: " + fails + " FAILED" : "\nmutationTable-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
