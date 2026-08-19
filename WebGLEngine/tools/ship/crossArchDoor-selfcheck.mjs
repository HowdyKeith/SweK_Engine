// WebGLEngine/tools/ship/crossArchDoor-selfcheck.mjs -- v2865
//
// Run: node tools/ship/crossArchDoor-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES two things from the same round:
//   1. ai-bridge/crossArchBridge.js + the MAC-ONLY panel on server.html
//   2. the four ES/EV claims added to predictions.html
//
// ON THE MAC-ONLY PART. Keith asked for the cross-arch session as a clicked link on the Mac but not the PC. The
// distinction gated here is that the BUTTON is hidden and the ENDPOINT is not: hiding a control is a UI choice,
// refusing to answer would be a different and worse one, because a win32/x64 run against a linux/x64 baseline is
// still a real comparison. A platform-locked endpoint would have quietly removed a measurement.
//
// ON THE CLAIMS. A claim is only falsifiable if the thing it names as its killer actually EXISTS. The ES/EV port
// had 21 gates and zero claims -- the code was verified and the assertions were never written -- so the risk when
// writing four at once is citing a gate that is not there, which would make the portfolio page confidently
// unfalsifiable. Every kill path is checked against the filesystem here.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const bridge = require(path.join(ENG, "ai-bridge", "crossArchBridge.js"));
const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
const html = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const preds = fs.readFileSync(path.join(ENG, "predictions.html"), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

async function call(url, method = "GET") {
    let captured = null, code = 200;
    const req = { url, method, destroy() {}, on(ev, cb) { if (ev === "end") cb(); return req; } };
    await bridge.handle(req, {}, { sendJson: (o, c = 200) => { captured = o; code = c; } });
    return { body: captured, code };
}

// ---- 1. routing + status ---------------------------------------------------------------------------------------
{
    ok("owns /crossarch and subpaths", bridge.owns("/crossarch") && bridge.owns("/crossarch/status") && bridge.owns("/crossarch/run"));
    ok("owns NOT a lookalike", !bridge.owns("/crossarchX") && !bridge.owns("/cross") && !bridge.owns("/"));
    const s = (await call("/crossarch/status")).body;
    ok("/status reports platform and arch", s && s.ok && typeof s.platform === "string" && typeof s.arch === "string", s.platform + "/" + s.arch);
    ok("!! ...and isMac is a BOOLEAN the page can key off", typeof s.isMac === "boolean" && s.isMac === (process.platform === "darwin"),
       "isMac=" + s.isMac);
    ok("...and says whether the baseline is present", typeof s.baseline === "boolean");
    ok("unknown subroute -> 404", (await call("/crossarch/wat")).code === 404);
    ok("run via GET -> 405", (await call("/crossarch/run", "GET")).code === 405);
}

// ---- 2. THE ENDPOINT IS NOT PLATFORM-LOCKED, only the button is -------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ai-bridge", "crossArchBridge.js"), "utf8");
    ok("!! the bridge does NOT refuse on non-Mac", !/platform !== "darwin"[\s\S]{0,80}?(error|refus|403)/i.test(src),
       "a win32/x64 run against a linux/x64 baseline is a real comparison -- hiding a button is a UI choice, refusing is a lost measurement");
    ok("...and the reasoning is recorded in the source", /not platform-locked/i.test(src));
    ok("it drives macSession rather than reimplementing it", /macSession\.mjs/.test(src) && !/computeFingerprint/.test(src));
    ok("one session at a time", /already running/.test(src));
    ok("!! a non-zero exit is distinguished from a SKIPPED stage", /SKIPPED stage would have exited 0/.test(src),
       "macSession treats skipped and failed differently and the bridge must not flatten them");
}

// ---- 3. WIRED IN + the Mac-only panel ----------------------------------------------------------------------------
{
    ok("server.js requires the bridge", /require\(["']\.\/crossArchBridge\.js["']\)/.test(server));
    ok("server.js dispatches it", /crossArchBridge\.owns\(/.test(server) && /crossArchBridge\.handle\(/.test(server));
    ok("server.html has the panel", /caPanel/.test(html) && /\/crossarch\/run/.test(html));
    ok("!! the panel is HIDDEN BY DEFAULT", /id="caPanel"[^>]*display:none/.test(html),
       "it must start hidden and be revealed only after status says darwin -- not flash on every machine");
    ok("!! ...and revealed only when the server says darwin", /if\(!s\.isMac\)\s*return;/.test(html),
       "the page asks the SERVER what it is running on rather than sniffing the browser's user agent, which is the client's opinion about a different machine");
    ok("...polls the log while it runs", /\/crossarch\/log/.test(html));
    ok("...and re-enables the button when the run ends", /caRun.*disabled\s*=\s*false|disabled=false/.test(html));
}

// ---- 4. THE ES/EV CLAIMS ARE REAL AND FALSIFIABLE ------------------------------------------------------------------
//
// Four claims were added at once for a subsystem that had none. The risk is citing a gate that does not exist.
{
    const wanted = [
        ["calendar is exact to the day", "ev/tools/es-date-selfcheck.mjs"],
        ["may only APPLY damage to what it owns", "ev/tools/es-damage-selfcheck.mjs"],
        ["Do not claim what you cannot own", "ev/tools/es-authority-selfcheck.mjs"],
        ["mission gate is mutation-tested", "ev/tools/es-gates-selfcheck.mjs"],
    ];
    for (const [needle, gate] of wanted) {
        ok("claim present: " + needle.slice(0, 42), preds.includes(needle));
        ok("  ...and its named gate EXISTS", fs.existsSync(path.join(ENG, gate)), gate);
    }
    ok("!! every ES claim names an HONEST SCOPE", (preds.match(/HONEST SCOPE/g) || []).length >= 4,
       "the mission claim in particular must say the whole-game counts are SKIPPED without ES_DATA_DIR");
    ok("...and the mission claim admits the SKIP rather than implying full coverage", /ES_DATA_DIR/.test(preds),
       "21 gates over 69 files is real coverage; claiming the shipped campaign is verified would not be");
}

// ---- 5. server.html still parses, via the engine's own parser -------------------------------------------------------
{
    const { execFileSync } = await import("node:child_process");
    let out = "", ranOk = true;
    try {
        out = execFileSync(process.execPath, ["--experimental-vm-modules", "tools/ship/pageParse.mjs"],
                           { cwd: ENG, encoding: "utf8", timeout: 180000, stdio: ["ignore", "pipe", "ignore"] });
    } catch (e) { ranOk = false; out = String((e && e.stdout) || e.message || ""); }
    const m = out.match(/pageParse: (\d+) inline scripts in (\d+) pages parse/);
    ok("every inline script parses (engine's own parser, not one written here)", ranOk && !!m,
       m ? m[1] + " scripts in " + m[2] + " pages" : out.slice(-160).trim());
}

console.log(fails ? "\ncrossArchDoor-selfcheck: " + fails + " FAILED" : "\ncrossArchDoor-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
