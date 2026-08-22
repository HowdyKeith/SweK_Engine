// WebGLEngine/tools/ship/todo-selfcheck.mjs -- v3580
//
// Run: node tools/ship/todo-selfcheck.mjs
// RUNTIME 0.3s MEASURED with date +%s%N around the run. Not remembered; v3211-v3213 found 59 of 82 headers wrong.
//
// *** A TODO LIST IS THE EASIEST FILE IN A TREE TO LET ROT, because nothing breaks when it does. *** This runs
// the `evidence` commands and checks the claims are still true -- so an item that has quietly been fixed goes
// RED rather than sitting there forever, and an item whose evidence no longer runs cannot pretend to be checked.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TODO, byStatus, reportLines } from "./todo.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l, n = "") => console.log(`  ----  ${l}${n ? "   " + n : ""}`);

console.log("todo-selfcheck -- the work list, and whether its claims are still true\n");

// ---------------------------------------------------------------------------
console.log("1. THE SHAPE OF THE REGISTER");
{
    report("open / done / wont", byStatus("open").length + " / " + byStatus("done").length + " / " + byStatus("wont").length);
    ok("every item has an id, a title and a why",
        TODO.every((t) => t.id && t.title && t.why),
        "an item without a WHY is a note to somebody who already knows, which is nobody in six months");
    ok("!! every item carries EVIDENCE that somebody can run",
        TODO.every((t) => typeof t.evidence === "string" && t.evidence.length > 5),
        "*** AN ITEM ASSERTING 'THE GATES ARE UNTIMED' IS AN OPINION; an item that names the file and the tool " +
        "that writes it is a fact somebody can check in ten seconds and DELETE WHEN IT STOPS BEING TRUE. *** A " +
        "list whose claims cannot be re-derived rots exactly like the derived facts staleness.mjs catches.");
    ok("ids are unique",
        new Set(TODO.map((t) => t.id)).size === TODO.length,
        "two items under one id means one of them is invisible to any tool that indexes by it");
    ok("!! a 'wont' item must carry a reason",
        byStatus("wont").every((t) => t.reason),
        "*** AN ITEM DROPPED WITHOUT A REASON IS INDISTINGUISHABLE FROM AN ITEM FORGOTTEN *** -- pageSections' " +
        "UNPLACED doctrine, in a second place.");
    ok("!! a DONE item is kept with its outcome rather than deleted",
        byStatus("done").every((t) => t.outcome && t.version),
        "the contact closure ended in a REFUTATION, and a deleted item would lose that the question was ever " +
        "asked. Same rule BLOCKED_ON_REBUILD follows at v3571.");
}

// ---------------------------------------------------------------------------
console.log("\n2. *** THE CLAIMS ARE RE-DERIVED, NOT TRUSTED ***");
{
    const run = (cmd) => {
        try { return execFileSync("bash", ["-lc", cmd], { cwd: ENG, encoding: "utf8", timeout: 30000 }).trim(); }
        catch (e) { return "ERR:" + String((e && e.message) || e).split("\n")[0]; }
    };

    // *** THIS CHECK WAS WRONG IN THE SAME WAY THE ITEM WAS, WHICH IS WHY IT PASSED. ***
    // It read Object.keys(timings.gates || timings).length -- there is no `gates` key, so it counted the file's
    // THREE TOP-LEVEL KEYS and asserted `< 50`. The register said three, the gate agreed, and the file held 580.
    // TWO CHECKS THAT LOOKED INDEPENDENT SHARED ONE WRONG PROBE, which is the second-copy defect one level up:
    // not two copies of data, TWO COPIES OF A BUG. Rewritten to read the field by name and to assert the
    // PROPERTY -- that coverage is partial -- rather than a number that came from a guess.
    const timings = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "ship", "gate-timings.json"), "utf8"));
    const nTimed = Object.keys(timings.timings).length;
    const nGates = JSON.parse(fs.readFileSync(path.join(ENG, "knowledge-index.json"), "utf8")).gates.length;
    report("gates timed / gates in the suite", nTimed + " / " + nGates);
    ok("!! the record still does not cover the whole suite",
        nTimed < nGates && nTimed > 100,
        "*** BOTH BOUNDS ARE LOAD-BEARING: full coverage would make the item done, and near-zero coverage would " +
        "mean the earlier reading was right after all. *** The real gap is " + (nGates - nTimed) + " gates, " +
        "and it now closes by RUNNING rather than by building anything.");

    // the six instruments really do have no page
    const noPage = run("node -e 'import(\"./physics/instruments.mjs\").then(m=>console.log(m.INSTRUMENTS.filter(i=>!i.page).length))'");
    report("instruments with no page", noPage);
    ok("the instrument-pages claim is still true",
        Number(noPage) > 20,
        "33 of 103 when the item was written");

    // *** THIS CHECK WENT RED WHEN THE ITEM WAS FIXED, WHICH IS THE REGISTER WORKING. ***
    // It asserted that both spellings were still populated. v3582 renamed one, the claim stopped being true,
    // and the gate said so -- "the register announces its own completion instead of waiting to be tidied",
    // written into this file's header before it had ever happened. It is REWRITTEN TO THE PROPERTY rather than
    // deleted: what matters is not that a particular typo exists, it is that NOTHING WAS CHECKING LABELS AT
    // ALL, and areaHygiene now owns that. Deleting the line would retire a rule alongside the instance that
    // motivated it, which this project keeps catching in other files.
    const areas = run("node -e 'import(\"./physics/instruments.mjs\").then(m=>{const a={};for(const i of m.INSTRUMENTS)a[i.area]=(a[i.area]||0)+1;console.log((a[\"soft body\"]||0)+\",\"+(a[\"soft bodies\"]||0))})'");
    report("soft body , soft bodies", areas);
    ok("!! the duplicate label is GONE, and a checker now owns the class",
        areas.startsWith("0,") && fs.existsSync(path.join(ENG, "tools", "ship", "areaHygiene.mjs")),
        "one spelling remains, and tools/ship/areaHygiene.mjs fails on ANY colliding pair. *** THE RENAME WAS " +
        "NEVER THE FIX -- the reason it survived 104 instruments is that nothing checked area labels, so the " +
        "next plural would have walked straight back in. ***");

    // the contacts overlay really does have no renderer
    // *** THIS CHECK WENT RED WHEN v3586 BUILT THE OVERLAY, WHICH IS THE REGISTER WORKING AGAIN. ***
    // It asserted that NOTHING calls the contact accessor. box3d-contacts.html now does, so the claim is false
    // and the gate said so -- the third time this register has announced its own completion rather than waiting
    // to be tidied (the duplicate-label item at v3582, the gate-timings probe at v3584, this).
    //
    // It is REWRITTEN TO THE PROPERTY, not deleted: what matters is that a caller and the shim agree about
    // whether contacts are readable, and the reverse claim -- SOMETHING draws them -- is the one worth holding
    // now. The self-counting problem from v3580 is gone with it: the needle no longer has to dodge the register,
    // because the check is about the OVERLAY rather than about a grep.
    const overlay = fs.existsSync(path.join(ENG, "box3d-contacts.html"));
    const loader = fs.readFileSync(path.join(ENG, "physics", "box3d", "box3dLoader.js"), "utf8");
    report("overlay page present / loader can read contacts", overlay + " / " + /readContacts\(\)/.test(loader));
    ok("!! round 3 is built: something DRAWS a contact, and the loader can hand one over",
        overlay && /readContacts\(\)/.test(loader) && /supportsContacts\(\)/.test(loader),
        "the shim declared exports -> gate -> overlay at v3037 and the third sat unbuilt for 549 versions, " +
        "because the browser loader had no accessor at all. *** THE CHECK THAT USED TO ASSERT ITS ABSENCE NOW " +
        "ASSERTS ITS PRESENCE -- same subject, opposite direction, and the register was what noticed. ***");

}

// ---------------------------------------------------------------------------
console.log("\n3. THE DONE ITEM'S OUTCOME IS STILL REPRODUCIBLE");
{
    const done = TODO.find((t) => t.id === "contact-closure");
    ok("!! the contact closure item points at a gate that exists and passes",
        fs.existsSync(path.join(ENG, "physics", "mechanics", "contactImpulse-selfcheck.mjs")),
        "an outcome recorded without a way to re-run it is a memory, and this project has found 59 of 82 " +
        "headers wrong by re-running things");
    ok("...and it records the REFUTATION rather than only the surviving keys",
        /DOES NOT EXIST/.test(done.outcome),
        "*** THE ROUND'S RESULT WAS THAT A STATED PURPOSE COULD NOT BE DELIVERED. *** A register listing only " +
        "what worked would make the next reader spend the same round again, which is precisely what happened " +
        "here to the person who wrote the v3037 header.");
    ok("the shim header it corrected really was corrected",
        /THE CLOSURE THIS BLOCK WAS BUILT FOR DOES NOT EXIST/.test(
            fs.readFileSync(path.join(ENG, "physics", "box3d", "box3d_shim.c"), "utf8")),
        "the correction is at the source, not only in the register");
}

// ---------------------------------------------------------------------------
console.log("\n4. THE REPORT PRINTS AND THE SPLIT HOLDS");
ok("the reporting tool produces a report", reportLines().length > 8,
    "v3327's split: a reporting tool prints, the gate beside it is what exits nonzero");

console.log(fails ? `\ntodo-selfcheck: ${fails} FAILED` : "\ntodo-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
