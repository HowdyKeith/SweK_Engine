// WebGLEngine/tools/ship/rigLabGeminiKey-selfcheck.mjs — v4081
//
// Run: node tools/ship/rigLabGeminiKey-selfcheck.mjs   (needs Chromium; skips cleanly without)
//
// Keith: "same with RIG LAB panel spawn. the AI Voxel creature (Gemini) needs to have a '(Gemini needs Key)'
// and the link to the Gemini API key setup in the SETTINGS control panel." Follow-up: "Gemini needs key if no
// key is stored/ready so we need to check that."
//
// main.js's RIG LAB panel's "AI voxel creature (Gemini)" section previously surfaced a missing key only AFTER
// a failed generate attempt (doGenerate()'s `r?.error === "no_api_key"` branch) -- a full Gemini round-trip's
// worth of latency just to learn the key was never set. This gate verifies a new inline note, checked via
// window.ai.keyStatus() (the SAME masked-status endpoint /ai/keys already serves the rest of Settings),
// shown BEFORE the user types anything.
//
// FOUR REAL STATES, LIVE-RENDERED RATHER THAN READ FROM SOURCE (a DOM visibility claim is exactly the kind of
// thing that can look right in the code and still not render, per this tree's own avatarFraming-selfcheck.mjs
// precedent):
//   1. bridge unreachable (keyStatus() rejects)      -> note HIDDEN. Absent-and-unknown is not the same claim
//      as "no key" -- see WHAT THIS DOES NOT CLAIM below.
//   2. bridge says gemini.set === true                -> note HIDDEN.
//   3. bridge says gemini.set === false                -> note VISIBLE, amber, reading "Gemini needs Key".
//   4. clicking its "set it in Settings" link           -> calls window.openSettings("discord"), the real
//      category the geminiKey control lives in (settingsHub.js groups it under "Connectors", not "LLM / AI
//      Models" -- open() only resolves at category granularity, so this is the closest real deep link, not
//      a scroll-to-control jump).
//
// WHAT THIS DOES NOT CLAIM: that a real ai-bridge server correctly reports Gemini key status over a real
// network. This sandbox has no bridge; every scenario except #1 is driven by monkey-patching
// window.ai.keyStatus() to return a controlled answer, exactly as v4053's Home Assistant solar gate names its
// own honest limit for the same reason.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("rigLabGeminiKey-selfcheck -- the RIG LAB Gemini-creature key note, checked in a real browser\n");

console.log("0. *** SOURCE: the note exists, checks window.ai.keyStatus(), and links to the right category ***");
{
    const src = fs.readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("!! refreshKeyNote() reads window.ai.keyStatus() and gates on gemini.set specifically",
        /const s = await window\.ai\?\.keyStatus\?\.\(\)/.test(src) && /s\.gemini && s\.gemini\.set/.test(src));
    ok("!! the settings link opens the \"discord\" category (where geminiKey actually lives)",
        /keyLink\.addEventListener\("click"[\s\S]{0,120}openSettings[\s\S]{0,40}\("discord"\)/.test(src));
    ok("...and the note is re-checked on every tab open, not just once at boot",
        /if \(opening\) refreshKeyNote\(\)/.test(src));
}

const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
const { createRequire } = await import("node:module");
const rr = pw.resolvePlaywright(createRequire(import.meta.url));
const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
if (skip) {
    console.log("\n  ----  live checks SKIPPED -- " + skip);
} else {
    const http = await import("node:http");
    const srv = http.default.createServer((rq, rs) => {
        const p = decodeURIComponent((rq.url || "/").split("?")[0]);
        const f = path.join(ROOT, p === "/" ? "/index.html" : p);
        if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rs.writeHead(404); rs.end("nf"); return; }
        const e = path.extname(f);
        const ct = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json", ".css": "text/css" }[e] || "application/octet-stream";
        rs.writeHead(200, { "Content-Type": ct }); rs.end(fs.readFileSync(f));
    });
    await new Promise((x) => srv.listen(0, "127.0.0.1", x));
    const b = await rr.chromium.launch({ executablePath: pw.HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl"] });
    try {
        const pg = await b.newPage();
        const errs = [];
        pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
        await pg.setViewportSize({ width: 1400, height: 900 });
        await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load", timeout: 60000 });
        await pg.waitForTimeout(6000);

        const findNote = () => {
            const link = [...document.querySelectorAll("a")].find((a) => /set it in Settings/i.test(a.textContent || ""));
            return link ? link.parentElement : null;
        };
        const openRigLab = () => {
            const tabs = [...document.querySelectorAll(".lcars-minitab, [class*=minitab]")];
            const t = tabs.find((el) => /rig lab/i.test(el.textContent || ""));
            t.click();
        };
        const reopenRigLab = () => { openRigLab(); openRigLab(); };   // close then reopen -> forces refreshKeyNote()

        await pg.evaluate((fnSrc) => { new Function(fnSrc + "; openRigLab();")(); }, "const openRigLab = " + openRigLab.toString());
        await pg.waitForTimeout(700);
        const noBridge = await pg.evaluate((findNoteSrc) => {
            const findNote = new Function("return (" + findNoteSrc + ")")();
            const el = findNote();
            return el ? { found: true, display: getComputedStyle(el).display } : { found: false };
        }, findNote.toString());
        ok("!! *** 1: bridge unreachable -- keyStatus() rejects, and the note stays HIDDEN, not a false claim ***",
            noBridge.found && noBridge.display === "none",
            JSON.stringify(noBridge) + " -- \"needs key\" would be a WRONG claim here; the real answer is unknown");

        await pg.evaluate(() => { window.ai.keyStatus = async () => ({ gemini: { set: true, len: 39, tail: "abcd" } }); });
        await pg.evaluate((fnSrc) => { new Function(fnSrc + "; reopenRigLab();")(); }, "const openRigLab = " + openRigLab.toString() + "; const reopenRigLab = " + reopenRigLab.toString());
        await pg.waitForTimeout(400);
        const keySet = await pg.evaluate((findNoteSrc) => {
            const findNote = new Function("return (" + findNoteSrc + ")")();
            const el = findNote();
            return el ? { found: true, display: getComputedStyle(el).display } : { found: false };
        }, findNote.toString());
        ok("!! *** 2: bridge reports gemini.set:true -- note HIDDEN ***", keySet.found && keySet.display === "none");

        await pg.evaluate(() => { window.ai.keyStatus = async () => ({ gemini: { set: false } }); });
        await pg.evaluate((fnSrc) => { new Function(fnSrc + "; reopenRigLab();")(); }, "const openRigLab = " + openRigLab.toString() + "; const reopenRigLab = " + reopenRigLab.toString());
        await pg.waitForTimeout(400);
        const noKey = await pg.evaluate((findNoteSrc) => {
            const findNote = new Function("return (" + findNoteSrc + ")")();
            const el = findNote();
            return el ? { found: true, display: getComputedStyle(el).display, color: getComputedStyle(el).color, text: el.textContent } : { found: false };
        }, findNote.toString());
        ok("!! *** 3: bridge reports gemini.set:false -- note VISIBLE, amber, reading 'Gemini needs Key' ***",
            noKey.found && noKey.display === "block" && /Gemini needs Key/.test(noKey.text) && noKey.color === "rgb(224, 160, 90)",
            JSON.stringify(noKey));

        let settingsCall = null;
        await pg.exposeFunction("_recordSettingsCall", (cat) => { settingsCall = cat; });
        await pg.evaluate(() => { window.openSettings = (cat) => window._recordSettingsCall(cat); });
        const clicked = await pg.evaluate((findNoteSrc) => {
            const findNote = new Function("return (" + findNoteSrc + ")")();
            const el = findNote();
            const link = el && el.querySelector("a");
            if (!link) return { ok: false };
            link.click();
            return { ok: true };
        }, findNote.toString());
        await pg.waitForTimeout(200);
        ok("!! *** 4: clicking the link opens Settings at the \"discord\" (Connectors) category -- where geminiKey lives ***",
            clicked.ok && settingsCall === "discord",
            "recorded call: " + JSON.stringify(settingsCall));

        ok("...and none of this threw a page error", errs.length === 0, errs.length ? errs[0] : "clean");
    } finally { await b.close(); await new Promise((x) => srv.close(x)); }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
