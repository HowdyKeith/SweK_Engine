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

// v4379 -- *** THE LIST THIS GATE GUARDS WAS UNREACHABLE FOR 250 ROUNDS, AND THIS GATE'S OWN RED SAID SO. ***
// v4129 removed the rig-only panel from rig.html at Keith's request, kept RIG_ONLY in ai-bridge/rigRunner.js
// because "fourteen items of recorded reasoning about what each chore UNBLOCKS is expensive to write and
// impossible to reconstruct", and forwarded the reader to "that file's own note for where it surfaces now". That
// note does not say. Measured: fifteen entries, served on /rig/list, rendered by ZERO pages. This gate's check
// named rig.html, so it went red on the removal and the line went into the red register as a fact about a deleted
// panel -- filed rather than read. The register absorbed the news that the record was unreachable.
//
// The check no longer names a page: it asks whether ANY page renders the list, so the surface can move again
// without this going stale twice. server.html carries the panel now -- the front door, not the page Keith cleared.
//
// AND A STATIC SCAN WAS NOT ENOUGH, WHICH TWO SABOTAGES SAID BEFORE THE LIVE CHECK WAS WRITTEN: dropping the
// payload in the renderer, and dropping WHY from the row it builds, both cost 0 RED, because the strings were
// still in the file. A source that MENTIONS the list is exactly what shipped for 250 rounds. The page is now
// served with a stub /rig/list, loaded, and the panel read out of the live DOM -- and both sabotages cost 1 red.
//
// SABOTAGES, MEASURED at v4379:
//   BG the renderer drops the payload, so the panel is served and never fills -> 0 red static, 1 red live.
//   BH the row drops WHY, so the panel lists chores instead of decisions -> 0 red static, 1 red live.
//
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import { resolvePlaywright, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { webgpuSkipReason } from "./webgpuHarness.mjs";
import { prose } from "./sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const runner = fs.readFileSync(path.join(ENG, "ai-bridge", "rigRunner.js"), "utf8");

/** Serve the engine plus a STUB /rig/list, load one page, and read the rig-only panel out of the live DOM. */
async function renderedPanel(file, stub) {
    const skip = webgpuSkipReason();
    if (skip) return { ok: false, why: skip };
    const pw = resolvePlaywright(createRequire(import.meta.url));
    const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json" };
    let answer = true;
    const srv = http.createServer((q, res) => {
        const u = decodeURIComponent(String(q.url).split("?")[0]);
        if (u === "/rig/list") { if (!answer) { res.writeHead(500); return res.end("no bridge"); }
            res.writeHead(200, { "Content-Type": "application/json" }); return res.end(JSON.stringify(stub)); }
        const f = path.join(ENG, u === "/" ? file : u);
        if (!f.startsWith(ENG) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("no"); }
        res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); res.end(fs.readFileSync(f));
    });
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const br = await pw.chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader"] });
    const read = async () => { const pg = await br.newPage({ viewport: { width: 900, height: 700 } });
        await pg.goto(`http://127.0.0.1:${srv.address().port}/`, { waitUntil: "load" }); await pg.waitForTimeout(2500);
        return pg.evaluate(() => { const el = document.getElementById("rigOnlyList");
            if (!el) return { titles: 0, whys: 0, hows: 0, text: "" };
            const html = el.innerHTML || "";
            const count = (re) => (html.match(re) || []).length;
            return { titles: count(/font-weight:600/g), whys: count(/Unblocks:<\/b>/g), hows: count(/How:<\/b>/g), text: el.textContent || "" }; }); };
    const filled = await read();
    answer = false;
    const silent = await read();
    await br.close(); srv.close();
    return { ok: true, ...filled, silentText: silent.text };
}
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
    // *** v4379 -- THIS CHECK USED TO NAME rig.html, AND IT WAS RED FOR 250 ROUNDS BECAUSE OF IT. *** v4129 removed
    // the rig-only panel from rig.html at Keith's request, kept RIG_ONLY on the grounds that the reasoning in it is
    // "expensive to write and impossible to reconstruct", and forwarded the reader to "that file's own note for
    // where it surfaces now" -- a note that does not say, because it surfaced NOWHERE. The list was served on
    // /rig/list and read by no page at all, and this line went into the red register as a fact about a deleted
    // panel rather than being read as what it was: the record was unreachable.
    //
    // So the check no longer names a page. It asks the question that matters -- IS THE LIST RENDERED ANYWHERE --
    // and names whichever page answers, so the surface can move again without this going stale a second time.
    const pages = fs.readdirSync(ENG).filter((f) => f.endsWith(".html"));
    const rendered = [];
    const renders = pages.filter((f) => { const src = fs.readFileSync(path.join(ENG, f), "utf8");
        const live = src.replace(/<!--[\s\S]*?-->/g, "");   // a page that only MENTIONS it in a comment does not render it
        const hit = /rigOnly/.test(live) && /\.title/.test(live) && /\.why/.test(live) && /\.how/.test(live);
        if (hit) rendered.push(f);
        return hit; });
    ok("!! *** the rig-only list is RENDERED BY A PAGE, not merely served: a record nobody can reach is a record nobody has ***",
        renders.length > 0, renders.length ? `rendered by ${renders.join(", ")}` : "served on /rig/list and read by NO page -- which is what this gate was red about from v4129 to v4379, filed in the red register rather than read");
    // *** AND THE SCAN ABOVE IS NOT ENOUGH, WHICH TWO SABOTAGES SAID BEFORE THIS WAS WRITTEN. *** Dropping the
    // payload in the renderer, and dropping WHY from the row it builds, both cost 0 RED against a static scan: the
    // strings are still in the file. A source that MENTIONS the list is exactly what shipped for 250 rounds. So the
    // page is SERVED and LOADED here, with a stub /rig/list, and the panel is read out of the live DOM.
    if (rendered.length) {
        const stub = { checks: [], rigOnly: entries.map((e) => ({ id: e.id, title: e.title, why: "WHY-" + e.id, how: "HOW-" + e.id, link: "" })) };
        const live = await renderedPanel(rendered[0], stub);
        ok("!! *** and the panel FILLS when the bridge answers: every entry's title, what it unblocks and how, read out of the live DOM rather than out of the source ***",
            live.ok && live.titles === entries.length && live.whys === entries.length && live.hows === entries.length,
            live.ok ? `${live.titles} titles, ${live.whys} unblocks and ${live.hows} hows for ${entries.length} entries in ${rendered[0]}`
                    : `could not read the panel: ${live.why}`);
        ok("  and it says so plainly when the bridge is NOT running, rather than sitting on 'checking...' forever",
            live.silentText && /bridge is not running/.test(live.silentText),
            live.silentText ? `"${live.silentText.slice(0, 90)}"` : "no text was shown when /rig/list did not answer");
    }
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
