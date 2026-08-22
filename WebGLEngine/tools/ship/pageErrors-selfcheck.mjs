// WebGLEngine/tools/ship/pageErrors-selfcheck.mjs -- v2839
//
// Run: node tools/ship/pageErrors-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES the three REAL page failures from Keith's render-QA run -- the ones that were actual bugs rather than
// missing assets. Every other failure in that report was a 404 for a .glb or a video; these three were the
// engine breaking itself.
//
//   es-away-mission  "Cannot access 'tickMsg' before initialization" -- and it rendered nonBlackFrac 0.0007,
//                    which is a black screen with a few lit pixels. TEMPORAL DEAD ZONE: newDerelict() was
//                    CALLED at top level one line before the `let tickMsg` it depends on was declared.
//   bzflag           "Cannot set properties of null (setting 'textContent')" -- five HUD rows were WRITTEN TO
//                    every frame and had never existed in the DOM.
//   face.html        the screenshot timed out after 30 seconds and produced no image. Not a page bug at all:
//                    the HARNESS routed a page with no declared canvas into an ELEMENT screenshot, then hunted
//                    for a canvas the page created dynamically and never made visible.
//
// The third is the one worth dwelling on, because it was not one page: 113 discovered pages were routed the
// same wrong way and any of them could have burned the same 30 seconds. A single visible symptom, a systemic
// cause.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

// 1. es-away-mission -- the declaration must PRECEDE the call, because `let` does not hoist
{
    const s = read("es-away-mission.html");
    const decl = s.indexOf("let tickMsg");
    const fnDef = s.indexOf("function newDerelict()");
    const call = s.indexOf("\nnewDerelict();");
    ok("es-away-mission: tickMsg is declared", decl > 0);
    ok("!! ...BEFORE the function that assigns it", decl < fnDef, `decl@${decl} fn@${fnDef}`);
    ok("!! ...and before the top-level call that runs it", decl < call, `decl@${decl} call@${call}`);
    ok("...with the reason recorded, since the fix is a line order nobody would question later",
        /`let` is not hoisted|not hoisted/.test(s) && /nonBlackFrac 0\.0007/.test(s));
}

// 2. bzflag -- every id it writes to must exist, AND a missing one must not throw
{
    const s = read("bzflag.html");
    const written = [...new Set([...s.matchAll(/setText\("([A-Za-z0-9_-]+)"/g)].map((m) => m[1]))];
    const defined = new Set([...s.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
    const missing = written.filter((id) => !defined.has(id));
    ok("bzflag: it writes to at least the five rows that were missing", ["mRoom", "mScore", "mPeers", "mTank", "mReload"].every((id) => written.includes(id)));
    ok("!! ...and EVERY id it writes to now exists in the DOM", missing.length === 0, missing.join(", ") || `${written.length} ids, all present`);
    const raw = [...s.matchAll(/\$\("[A-Za-z0-9_-]+"\)\.textContent\s*=/g)].length;
    ok("!! no raw $(...).textContent assignment survives -- those are the ones that throw", raw === 0, String(raw));
    ok("the setter is NULL-SAFE, so the next missing row costs a blank readout not a dead frame",
        /const setText = \(id, value\) => \{ const el = document\.getElementById\(id\); if \(el\)/.test(s));
    ok("...and says why that matters", /degrade to NOT SHOWN|never to a thrown frame/i.test(s));
}

// 3. the harness -- absence of a canvas is information, not a gap to fill with a guess
{
    const d = read("tools/render-qa/discover.mjs");
    ok("discover: every discovered page gets an explicit canvas mode", /e\.canvas = "viewport";/.test(d));
    ok("!! ...set OUTSIDE the hasCanvas branch, so a page with no canvas still gets one",
        d.indexOf('e.canvas = "viewport";') < d.indexOf("if (meta.hasCanvas)"));
    ok("...and the canvas CHECK is still only added when there is a canvas to check",
        /if \(meta\.hasCanvas\) \{ e\.checks\.push\(\{ type: "notAllBlack"/.test(d));

    const q = read("tools/render-qa/render-qa.mjs");
    ok("render-qa: an element screenshot carries its own timeout", /target\.screenshot\(\{ type: "png", timeout: 8000 \}\)/.test(q));
    ok("!! ...and an invisible target FALLS BACK to the viewport rather than timing out", /shotFallback = "canvas not visible/.test(q) && /buf = await page\.screenshot/.test(q));
    ok("!! ...and the fallback is RECORDED, so it cannot be mistaken for a normal shot", /rec\.shotFallback = shotFallback/.test(q));
    ok("...with the reasoning kept where the next person will read it", /worth more than\s*\n?\s*\/\/ a perfect picture of nothing|picture of the page is worth more/.test(q));
}

// 4. the systemic scale of the third bug -- it was never one page
{
    const fsMod = fs;
    ok("this was not a face.html problem: many discovered pages have no canvas at all",
        (() => {
            const files = fsMod.readdirSync(ENG).filter((f) => f.endsWith(".html"));
            const noCanvas = files.filter((f) => { try { return !/<canvas/i.test(fsMod.readFileSync(path.join(ENG, f), "utf8")); } catch { return false; } });
            return noCanvas.length > 20;
        })(), "each one was routed into an element screenshot it could never satisfy");
}

// 5. all three pages still parse
{
    const { execFileSync } = await import("node:child_process");
    for (const f of ["es-away-mission.html", "bzflag.html"]) {
        const s = read(f);
        const blocks = [...s.matchAll(/<script(?: type="module")?>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
        let good = true;
        for (const b of blocks) {
            if (!b.trim()) continue;
            try { execFileSync(process.execPath, ["--input-type=module", "--check"], { input: b, stdio: ["pipe", "pipe", "pipe"] }); }
            catch { good = false; }
        }
        ok(`${f}: every script block parses`, good);
    }
}

console.log("pageErrors-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
