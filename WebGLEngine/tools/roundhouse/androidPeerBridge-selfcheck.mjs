// tools/roundhouse/androidPeerBridge-selfcheck.mjs
//
// Run: node tools/roundhouse/androidPeerBridge-selfcheck.mjs   (<15 s, sandboxed -- never mutates the real tree)
//
// v2922 -- THE FRONT DOOR IS GATED SHUT BEFORE IT OPENS. Three surfaces, three failure shapes:
//
//   BRIDGE     wrong routes owned, a graded verdict that never reaches the pool, or a missing ballot crashing
//              instead of explaining. Driven here with mock req/res against a SANDBOX roundhouse dir and a
//              sandbox Downloads -- configure() is the seam, and the real tree's files are hashed before and
//              after to prove the gate touched nothing.
//   INSTALLER  the one thing an installer must never do is install twice. Run against COPIES of the real
//              server.js and server.html: markers present after one run, byte-identical after two, originals
//              untouched. And the no-anchor path must degrade to printed hand-paste lines, not to a guess.
//   PAGE       the hub must exist, must talk to the routes the bridge actually owns, must link the experiment
//              and server.html, and must carry the manual install lines for the day the anchors finally move.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const sha = (p) => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");

const bridge = require(path.join(ROOT, "ai-bridge", "androidPeerBridge.js"));

// ---- SANDBOX -------------------------------------------------------------------------------------------------------
const box = fs.mkdtempSync(path.join(os.tmpdir(), "swek-android-gate-"));
const boxRh = path.join(box, "roundhouse"), boxDl = path.join(box, "Downloads");
fs.mkdirSync(boxRh); fs.mkdirSync(boxDl);
fs.copyFileSync(path.join(HERE, "android-reference.json"), path.join(boxRh, "android-reference.json"));
bridge.configure({ roundhouseDir: boxRh, moduleDir: HERE, downloadsDirs: [boxDl], log: () => {} });

const realServerJs = path.join(ROOT, "ai-bridge", "server.js");
const realServerHtml = path.join(ROOT, "server.html");
const hashBefore = { js: sha(realServerJs), html: sha(realServerHtml) };

const mockRes = () => { const r = { code: null, body: null }; return { r,
    writeHead: (c) => { r.code = c; }, end: (b) => { r.body = b ? JSON.parse(b) : null; } }; };
const call = (method, url) => new Promise((resolve) => {
    const m = mockRes();
    const owned = bridge.handle({ method, url }, m);
    if (!owned) return resolve({ owned });
    const spin = () => (m.r.code === null ? setTimeout(spin, 5) : resolve({ owned, ...m.r }));
    spin();
});

// ---- 1. THE BRIDGE -------------------------------------------------------------------------------------------------
{
    ok("the bridge owns only /android/*", (await call("GET", "/self/zip")).owned === false && (await call("GET", "/android/status")).owned === true,
        "one delegation line in server.js must be safe: every other route falls through untouched");

    let r = await call("GET", "/android/status");
    ok("status sees the reference and the empty sandbox honestly",
        r.code === 200 && r.body.reference.present && r.body.reference.checks >= 35 && !r.body.phone.present,
        r.body.reference.checks + " reference checks; phone ballot absent, and lookedIn names the directories");

    r = await call("POST", "/android/verdict");
    ok("!! grading without a ballot is a 404 WITH THE NEXT STEP, not a crash",
        r.code === 404 && /termux_peer\.sh/.test(r.body.error),
        "the error names the script that produces the missing artifact");

    r = await call("GET", "/android/verdict");
    ok("no verdict has been graded yet, and the route says so", r.code === 404);

    // a synthetic bionic ballot arrives through Downloads -- all reference passes pass, plus probes
    const ref = JSON.parse(fs.readFileSync(path.join(boxRh, "android-reference.json"), "utf8"));
    const phone = { kind: "swek-android-transcript", version: 2920, at: new Date().toISOString(), budgetMs: ref.budgetMs,
        host: { platform: "android", arch: "arm64", node: "v22.22.2", libc: "bionic (termux)" },
        probes: { downloadsPresent: true, downloadsIsSymlink: true, downloadsTarget: "/storage/emulated/0/Download", npmInstallOk: true },
        checks: ref.checks.map((c) => ({ ...c })), counts: ref.counts };
    fs.writeFileSync(path.join(boxDl, "android-phone.json"), JSON.stringify(phone));

    r = await call("POST", "/android/verdict");
    ok("!! a ballot in Downloads grades end to end through the front door",
        r.code === 200 && r.body.ok && r.body.verdict.verdicts.roundhouseSelfchecksPassOnBionic.verdict === "CONFIRMED",
        r.body.verdict ? r.body.verdict.verdicts.roundhouseSelfchecksPassOnBionic.why : "");
    ok("...and item 3 stays AWAITING with no magmap report, exactly as the CLI grader behaves",
        r.body.verdict.verdicts.magmapPassesOnMobileGpuAtRegisteredTol.verdict === "AWAITING");

    ok("!! the verdict RETURNED TO THE POOL on both roads",
        fs.existsSync(path.join(boxRh, "android-verdict.json")) && fs.existsSync(path.join(boxDl, "swek-android-verdict.json")),
        "the served copy (tools/roundhouse/android-verdict.json) and the Downloads copy (swek-android-verdict.json) -- " +
        "the ballot's road, driven in the opposite direction");

    r = await call("GET", "/android/verdict");
    ok("the last verdict is now served", r.code === 200 && r.body.kind === "swek-android-verdict" && Array.isArray(r.body.lines));
}

// ---- 2. THE INSTALLER, AGAINST COPIES ------------------------------------------------------------------------------
{
    const cpJs = path.join(box, "server.js"), cpHtml = path.join(box, "server.html");
    fs.copyFileSync(realServerJs, cpJs); fs.copyFileSync(realServerHtml, cpHtml);
    const installer = path.join(ROOT, "ai-bridge", "installAndroidPeerBridge.mjs");

    execFileSync(process.execPath, [installer, cpJs, cpHtml], { encoding: "utf8" });
    const js1 = fs.readFileSync(cpJs, "utf8"), html1 = fs.readFileSync(cpHtml, "utf8");
    ok("!! one run installs all three insertions at their anchors",
        js1.includes('require("./androidPeerBridge.js")') && js1.includes("androidPeerBridge.handle(req, res)") &&
        html1.includes('id="androidPeerBtn"'),
        "require after buildName (v2871), delegation before /self/zip (v1682), button beside checkPeersVer");
    ok("the delegation is mounted INSIDE the request handler, before /self/zip",
        js1.indexOf("androidPeerBridge.handle") < js1.indexOf('"/self/zip"') &&
        js1.indexOf("androidPeerBridge.handle") > js1.indexOf("http.createServer"));

    const out2 = execFileSync(process.execPath, [installer, cpJs, cpHtml], { encoding: "utf8" });
    ok("!! the second run is a byte-identical no-op that says so",
        fs.readFileSync(cpJs, "utf8") === js1 && fs.readFileSync(cpHtml, "utf8") === html1 && /3 already present/.test(out2),
        "idempotent by marker: the one thing an installer must never do is install twice");

    // the no-anchor path: an html with the button anchor missing degrades to hand-paste, exit 1, nothing guessed
    const bare = path.join(box, "bare.html"); fs.writeFileSync(bare, "<html><body>no header here</body></html>");
    let code = 0, out3 = "";
    try { out3 = execFileSync(process.execPath, [installer, cpJs, bare], { encoding: "utf8" }); }
    catch (e) { code = e.status; out3 = e.stdout || ""; }
    ok("a missing anchor prints the exact hand-paste line and reports PARTIAL instead of guessing",
        code === 1 && /NO ANCHOR/.test(out3) && /androidPeerBtn/.test(out3) && !fs.readFileSync(bare, "utf8").includes("androidPeerBtn"));
}

// ---- 3. THE PAGE ---------------------------------------------------------------------------------------------------
{
    const p = path.join(ROOT, "android-peer.html");
    const page = fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
    ok("android-peer.html exists at the engine root", page.length > 0);
    ok("the hub talks to routes the bridges own (v2923 adds candidates/invite)",
        page.includes("/android/status") && page.includes("/android/verdict") &&
        !/\/android\/(?!status|verdict|candidates|invite|join|bootstrap|manifest|push|apk-status)/.test(page),
        "status + verdict (peer bridge) plus candidates/invite/join (invite bridge) -- any OTHER /android/ path would be a typo or a dead link");
    ok("it links the experiment, server mode, and carries the six items + the expectations table",
        /magmap-android\.html/.test(page) && /server\.html/.test(page) && /Termux path/.test(page) && /what to expect/i.test(page));
    ok("!! the manual install lines are on the page, for the day the anchors move",
        page.includes('androidPeerBridge.handle(req, res)') && page.includes('require("./androidPeerBridge.js")'),
        "the installer degrades to hand-paste; the page is where those hands find the lines");
}

// ---- THE REAL TREE WAS NEVER TOUCHED -------------------------------------------------------------------------------
ok("!! the real server.js and server.html are byte-identical to before this gate ran",
    sha(realServerJs) === hashBefore.js && sha(realServerHtml) === hashBefore.html,
    "the gate installs into copies and grades in a sandbox; installing into the live tree is the USER'S single command, not a side effect of a selfcheck");

fs.rmSync(box, { recursive: true, force: true });
console.log("");
console.log(fails === 0 ? "  ALL PASS -- the front door is gated; install it with: node ai-bridge/installAndroidPeerBridge.mjs" : "  " + fails + " FAILURE(S)");
process.exit(fails ? 1 : 0);
