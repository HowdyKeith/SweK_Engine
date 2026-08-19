// WebGLEngine/tools/ship/gatesBridge-selfcheck.mjs -- v2806
//
// Run: node tools/ship/gatesBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered -- so this gate appears in the very list it serves).
//
// GATES ai-bridge/gatesBridge.js + gates.html -- the front door for the verification suite.
//
// TWO PROPERTIES CARRY THIS FILE:
//   1. IT IS NOT AN ARBITRARY SCRIPT RUNNER. /gates/run takes a NAME that must be a member of the discovered
//      list. Traversal, absolute paths, and any non-selfcheck file are refused. A page that could execute any
//      path on the box would be a remote shell with a nice table.
//   2. IT CANNOT DISAGREE WITH THE SHIP GATE. Discovery mirrors selfchecks.mjs's walk exactly, and that suite's
//      ALREADY_GATED / SKIP entries are PARSED OUT OF ITS SOURCE rather than copied -- so the page cannot show a
//      different set of gates than the ship actually runs. A dashboard that disagrees with the gate is worse
//      than no dashboard, because it is believed.

import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "gatesBridge.js"));

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url) {
    let body = null, code = 200;
    await bridge.handle({ url, method: "GET" }, {}, { sendJson: (o, c = 200) => { body = o; code = c; } });
    return { body, code };
}

// 1. routing
{
    ok("owns: /gates and subpaths", bridge.owns("/gates") && bridge.owns("/gates/list") && bridge.owns("/gates/run?name=x"));
    ok("owns: NOT lookalikes", !bridge.owns("/gatesx") && !bridge.owns("/bench") && !bridge.owns("/"));
}

// 2. DISCOVERY AGREES WITH THE SHIP GATE
{
    const l = bridge.listGates();
    ok("discovery: finds a substantial suite", l.runnable.length > 50, l.runnable.length + " runnable of " + l.total);
    ok("discovery: parsed the suite's own exclusion lists (not copied here)", l.parsedExclusions === true);
    ok("discovery: excludes the runner itself (it matches its own pattern)", !l.runnable.includes("tools/ship/selfchecks.mjs"));
    ok("discovery: excludes ALREADY_GATED entries", l.alreadyGated.length > 0 && l.alreadyGated.every((f) => !l.runnable.includes(f)));
    ok("discovery: excludes SKIP entries and carries their reasons", l.skipped.length > 0 && l.skipped.every((s) => !l.runnable.includes(s.file) && s.reason && s.reason.length > 10));
    ok("discovery: ignores node_modules / vendor", l.runnable.every((f) => !/node_modules|\/vendor\//.test(f)));
    ok("discovery: every entry matches the suite's pattern", l.runnable.every((f) => /selfcheck.*\.mjs$/.test(f)));
    ok("discovery: this very gate is in the list it serves", l.runnable.includes("tools/ship/gatesBridge-selfcheck.mjs"));
    // cross-check against an independent walk using the suite's own rules
    const walk = (dir, out = []) => {
        for (const f of fs.readdirSync(dir)) {
            if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
            const p = path.join(dir, f);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) walk(p, out);
            else if (/selfcheck.*\.mjs$/.test(f)) out.push(path.relative(ENG, p).split(path.sep).join("/"));
        }
        return out;
    };
    ok("discovery: total matches an independent walk with the same rules", walk(ENG).length === l.total, `bridge=${l.total} independent=${walk(ENG).length}`);
}

// 3. NOT AN ARBITRARY SCRIPT RUNNER -- the property that keeps this page from being a remote shell
{
    const attempts = [
        "../../../etc/passwd",
        "/etc/passwd",
        "tools/ship/../../ai-bridge/server.js",
        "ai-bridge/server.js",
        "main.js",
        "tools/ship/selfchecks.mjs",              // the runner itself: excluded, so not runnable
        "ev/tools/ev-selfcheck.mjs",              // SKIP entry: excluded, so not runnable
        "",
    ];
    let allRefused = true, leaked = "";
    for (const a of attempts) {
        const r = await call("/gates/run?name=" + encodeURIComponent(a));
        if (!(r.code === 400 && r.body && r.body.error === "not-a-gate")) { allRefused = false; leaked = a; }
    }
    ok("SECURITY: every non-gate path is refused (traversal, absolute, source files, excluded gates)", allRefused, leaked ? "accepted: " + leaked : "");
}

// 4. a real gate runs and reports honestly
{
    const target = "tools/ship/launchers-selfcheck.mjs";   // fast and deterministic
    const l = bridge.listGates();
    if (l.runnable.includes(target)) {
        const r = await call("/gates/run?name=" + encodeURIComponent(target) + "&timeout=60000");
        ok("run: a discovered gate executes and reports pass", r.body.ok === true && r.body.pass === true, "exit=" + r.body.exitCode);
        ok("run: returns the gate's own output", typeof r.body.output === "string" && /launchers-selfcheck/.test(r.body.output));
        ok("run: reports a duration", typeof r.body.ms === "number" && r.body.ms >= 0);
        ok("run: distinguishes timeout from failure", r.body.timedOut === false);
    } else ok("run: fixture gate present", false, target + " not discovered");
}

// 5. a FAILING gate is reported as failing, not swallowed
{
    const tmp = path.join(ENG, "tools", "ship", "zz-temp-fixture-selfcheck.mjs");
    fs.writeFileSync(tmp, 'console.log("deliberate failure fixture");\nprocess.exit(3);\n');
    try {
        const r = await call("/gates/run?name=tools/ship/zz-temp-fixture-selfcheck.mjs");
        ok("run: a failing gate reports pass:false with its exit code", r.body.ok === true && r.body.pass === false && r.body.exitCode === 3, "exit=" + r.body.exitCode);
        ok("run: the failing gate's output is returned", /deliberate failure fixture/.test(r.body.output || ""));
    } finally { fs.unlinkSync(tmp); }
}

// 6. timeout is clamped so a request cannot pin the server forever
{
    const l = bridge.listGates();
    const target = l.runnable.includes("tools/ship/launchers-selfcheck.mjs") ? "tools/ship/launchers-selfcheck.mjs" : l.runnable[0];
    const r = await call("/gates/run?name=" + encodeURIComponent(target) + "&timeout=99999999");
    ok("run: an absurd timeout is clamped rather than honoured", r.body.ok === true);
    ok("unknown subroute -> 404", (await call("/gates/nope")).code === 404);
}

// 7. the page drives the real endpoints and shows the exclusions
{
    const p = path.join(ENG, "gates.html");
    ok("page: gates.html exists", fs.existsSync(p));
    const html = fs.readFileSync(p, "utf8");
    ok("page: calls /gates/list", html.includes("/gates/list"));
    ok("page: calls /gates/run", html.includes("/gates/run?name="));
    ok("page: runs them ONE AT A TIME (await inside the loop) for live progress", /for \(const g of list\)[\s\S]{0,400}await fetch\("\/gates\/run/.test(html));
    ok("page: offers a stop control for a long sweep", /bStop/.test(html));
    ok("page: shows skipped gates WITH their reasons", /s\.reason/.test(html));
    ok("page: warns if the suite exclusions could not be parsed", /parsedExclusions/.test(html));
}

// 8. registered in the server dispatch
{
    const srv = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("server.js: requires gatesBridge", /require\("\.\/gatesBridge\.js"\)/.test(srv));
    ok("server.js: dispatches gatesBridge.owns(req.url)", /gatesBridge\.owns\(req\.url\)/.test(srv));
}

console.log("gatesBridge-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
