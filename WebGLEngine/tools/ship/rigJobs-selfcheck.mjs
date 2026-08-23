// WebGLEngine/tools/ship/rigJobs-selfcheck.mjs -- v2844
//
// Run: node tools/ship/rigJobs-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the RIG_ONLY list behind rig.html -- the page whose whole purpose is that "the pile that has been
// accumulating in changelogs where nobody could click them" is visible in one place.
//
// THE FAILURE THIS EXISTS FOR IS THE ONE I COMMITTED: work that needs Keith's hardware gets described at length
// in a changelog and then lives nowhere he would ever find it. rig.html was built for exactly that, and this
// session generated three more such jobs -- the shedding settle run, the wasm-stats capture, the model bench --
// none of which were on it. Same shape as the nineteen unlinked pages in v2836.
//
// SO WHAT IS GATED IS NOT "the list is long" BUT THAT EVERY ENTRY EARNS ITS PLACE: it says what it UNBLOCKS
// rather than merely what it is, it says HOW, and anything it points at actually exists. The page's own note
// puts it best -- "rebuild the wasm" is a chore, "rebuild the wasm, it blocks five things" is a decision.

import fs from "node:fs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const runner = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");
const page = fs.readFileSync(path.join(ENG, "rig.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// pull the entries out of the source
const blocks = [...runner.matchAll(/\{\s*\n\s*id: "([a-z]+)", title: "((?:[^"\\]|\\.)*)"[\s\S]*?\n    \},/g)];
const entries = blocks.map((m) => ({ id: m[1], title: m[2], body: m[0] }));

// 1. THE LIST IS REACHABLE AND RENDERED
{
    ok("rig.html asks the bridge for the list", /fetch\("\/rig\/list"\)/.test(page));
    ok("the bridge serves rigOnly alongside the discovered checks", /rigOnly: RIG_ONLY/.test(runner));
    ok("the page renders title, why and how for each", /r\.title/.test(page) && /r\.why/.test(page) && /r\.how/.test(page));
    ok("entries were parsed from the source", entries.length >= 10, `${entries.length} entries`);
}

// 2. EVERY ENTRY EARNS ITS PLACE
{
    const noWhy = entries.filter((e) => !/why:\s*"/.test(e.body));
    const noHow = entries.filter((e) => !/how:\s*"/.test(e.body));
    ok("!! every entry says what it UNBLOCKS, not just what it is", noWhy.length === 0, noWhy.map((e) => e.id).join(","));
    ok("every entry says HOW", noHow.length === 0, noHow.map((e) => e.id).join(","));
    const thin = entries.filter((e) => { const m = e.body.match(/why:\s*"((?:[^"\\]|\\.)*)"/); return !m || m[1].length < 60; });
    ok("...and the reason is substantial rather than a label", thin.length === 0, thin.map((e) => e.id).join(","));
    ok("ids are unique", new Set(entries.map((e) => e.id)).size === entries.length);
}

// 3. WHAT AN ENTRY POINTS AT MUST EXIST -- a dead link on this page is worse than no link
{
    const missing = [];
    for (const e of entries) {
        const m = e.body.match(/link:\s*"([^"]*)"/);
        if (!m || !m[1]) continue;                       // an empty link is allowed; a WRONG one is not
        const rel = m[1].replace(/^\//, "");
        if (!fs.existsSync(path.join(ENG, rel))) missing.push(`${e.id} -> ${m[1]}`);
    }
    ok("!! every link points at a page that exists", missing.length === 0, missing.join(", "));
    // and any command an entry names must be a real file
    const cmds = [...runner.matchAll(/node (tools\/[A-Za-z0-9_\-./]+\.mjs)/g)].map((m) => m[1]);
    const badCmd = [...new Set(cmds)].filter((c) => !fs.existsSync(path.join(ENG, c)));
    ok("!! every script an entry tells you to run actually exists", badCmd.length === 0, badCmd.join(", ") || cmds.length + " commands checked");

    // *** v3946 -- "THE SCRIPT EXISTS" IS NOT "THE SCRIPT CAN RUN", AND dfg WENT THROUGH THAT GAP. ***
    //
    // The check directly above passed on the dfg entry for a hundred versions while the run it describes was
    // impossible: tools/dfg-benchmark.mjs is present, so the ENTRY POINT resolved -- and the external answer key
    // it grades against, simulation/lbm/dfgBenchmark.mjs, is in NO COMMIT of this repository. The tool now says
    // LOST SOURCE and exits (v3942), but rig.html still told Keith to go and spend a multi-pass CPU run on it.
    //
    // THIS PAGE'S COST OF BEING WRONG IS NOT A RED GATE, IT IS AN AFTERNOON. Every other list in this tree is
    // read by a machine that will simply fail; this one is read by a person who then goes and does the thing.
    // An item that cannot be done is worse here than anywhere else, which is why it gets the stricter check.
    //
    // Checked WITHOUT EXECUTING ANYTHING: a tool that has diagnosed its own missing precondition says so in a
    // console report, and an entry pointing at such a tool must carry the blocker in its own text. Prose linked
    // to prose is a weak check in general -- it is the right one here because the tool's self-report IS the
    // fact, and the failure being prevented is a person reading the entry and believing it.
    const blocked = [];
    for (const e of entries) {
        for (const c of [...new Set([...e.body.matchAll(/node (tools\/[A-Za-z0-9_\-./]+\.mjs)/g)].map((m) => m[1]))]) {
            const p = path.join(ENG, c);
            if (!fs.existsSync(p)) continue;
            let src = ""; try { src = fs.readFileSync(p, "utf8"); } catch { continue; }
            const declaresLost = /console\.(error|log)\(\s*"\[[^\]]+\]\s*LOST SOURCE/.test(src);
            if (declaresLost && !/LOST SOURCE|BLOCKED/.test(e.body)) blocked.push(`${e.id} -> ${c}`);
        }
    }
    ok("!! ...and an entry whose tool has declared its OWN source lost says so, instead of reading as a run",
       blocked.length === 0,
       blocked.length ? "TELLS YOU TO RUN A TOOL THAT CANNOT RUN: " + blocked.join(", ")
                      : "no entry points at a self-declared-blocked tool without naming the blocker");
}

// 4. THIS SESSION'S RIG WORK IS ON THE LIST -- the v2836 failure, not repeated
{
    const ids = entries.map((e) => e.id);
    for (const [id, what] of [["settle", "the long-warmup 2f run"], ["wasmstats", "the wasm terrain speedup capture"], ["modelbench", "the fleet model comparison"]]) {
        ok(`!! ${what} is on the rig page, not only in a changelog`, ids.includes(id));
    }
    const settle = entries.find((e) => e.id === "settle");
    ok("...and the settle entry carries the EVIDENCE that chose it", !!settle && /REFUTED/.test(settle.body) && /14000/.test(settle.body) && /12000/.test(settle.body));
    ok("...and says what a NEGATIVE result would mean, so the run is worth doing either way",
        !!settle && /settling was not the answer/i.test(settle.body));
}

// 5. A SETTLED QUESTION STAYS ON THE PAGE AS A RECORD rather than vanishing
{
    const seam = entries.find((e) => e.id === "seam");
    ok("the answered RLE seam question is kept, marked SETTLED", !!seam && /SETTLED/.test(seam.title));
    ok("...with the numbers that settled it, so nobody re-opens it from memory", !!seam && /0\.6906/.test(seam.body) && /232/.test(seam.body));
    ok("...and it says there is nothing to do", !!seam && /Nothing to do/.test(seam.body));
}

// 6. the settle script is real, runnable and honest about its cost
{
    const p = path.join(ENG, "tools", "shedding-settle.mjs");
    ok("tools/shedding-settle.mjs exists", fs.existsSync(p));
    const src = fs.readFileSync(p, "utf8");
    ok("it takes --warm and --rec, so the cost is the caller's choice", /--warm/.test(src) && /arg\("warm"/.test(src));
    ok("it prints the SETTLING CURVE as it goes, not just a verdict at the end", /change since last/.test(src));
    ok("!! it uses a probe RAKE, so 'bad probe' and 'incoherent wake' can be told apart", /const DS = \[/.test(src) && /PROBES AGREE WITH EACH OTHER/.test(src));
    ok("it records why it is the fourth attempt", /v2797/.test(src) && /v2843/.test(src) && /REFUTED/.test(src));
    ok("it is a SCRIPT and not a gate, and says why", /takes minutes|rather than a pass or a fail/i.test(src));
    ok("main-module detection uses pathToFileURL (the Windows path law)", /import\.meta\.url === pathToFileURL\(process\.argv\[1\]\)\.href/.test(src));
}

console.log("rigJobs-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
