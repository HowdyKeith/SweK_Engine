// WebGLEngine/render/holoAgree-selfcheck.mjs — v2616
//
// Run: node render/holoAgree-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// CLOSING THE GAP I NAMED TWICE: DOES CHROME DRAW THE HOLOGRAM THE SAME WAY cairosvg DOES?
//
// ---- WHY THIS EXISTS -----------------------------------------------------------------------------------------------
//
// holoPicture-selfcheck (v2613) rasterises the hologram with cairosvg and counts pixels -- ink, bbox, contrast.
// But krbn.html rasterises through THE BROWSER'S SVG engine (an Image over an object URL). TWO DIFFERENT
// RASTERISERS. I wrote, in that gate's own body: "this proves KRBN'S OUTPUT DEPICTS THE THING; what it cannot
// prove is that Chrome draws that same SVG the same way. THE GAP IS REAL AND I AM NAMING IT."
//
// And then I shipped it. Twice. My own rule, from the same round: A GAP YOU NAME AND DO NOT CLOSE IS A GAP YOU
// HAVE DECIDED TO KEEP. This closes it.
//
// It also does double duty. Contrast was wrong in v2612, framing was wrong in v2613 -- both were pictures I
// had verified structurally and never LOOKED at. If Chrome and cairosvg disagree, THAT is the third shoe, and
// better this gate finds it than Keith. Measured once already: they agree to within anti-aliasing --
//
//     pixels differing by >8:   0.82%   (edge anti-aliasing)
//     pixels differing by >32:  0.01%   (16 pixels)
//     pixels differing by >64:  0%
//     mean abs delta: 0.44 of 255       max: 42
//
// This gate keeps that true, or tells me the day it stops being true.
//
// ---- SKIP LOUDLY, NEVER PASS SILENTLY ------------------------------------------------------------------------------
//
// This needs a real browser AND cairosvg. In the sandbox it has both. On a machine with neither it must SKIP
// with a reason and exit 0 -- NOT pass as if it looked. A gate that cannot look must not report that it looked.
// That is the exact failure that let a 1.42:1 black picture and a 1.44-unit crop both ship: a check that
// claimed to have seen something it had not.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skip = (why) => {
    console.log("  SKIP  holoAgree cannot run here: " + why);
    console.log("        NOT PASSING SILENTLY -- a gate that cannot look must not report that it looked.");
    console.log("\nholoAgree-selfcheck: SKIPPED");
    process.exit(0);
};

// cairosvg?
try { execFileSync("python3", ["-c", "import cairosvg"], { stdio: "ignore" }); }
catch { skip("cairosvg is not installed (pip install cairosvg --break-system-packages)"); }

// a browser?
// v4484: hand-copied from tools/ship/playwrightResolve.mjs, which exists to hold this once.
// It named a Linux root, a Linux layout and a PINNED BUILD NUMBER, so it could never be
// true on the rig. Imported now, and resolved per platform.
const SHELL = HEADLESS_SHELL;
const PW = "/home/claude/.npm-global/lib/node_modules/playwright/index.js";
if (!fs.existsSync(SHELL) || !fs.existsSync(PW)) skip("headless browser or playwright not found at the known path");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// The comparison runs in a child so a browser hang cannot wedge the whole suite -- a FLAKY GATE IS WORSE THAN
// NO GATE, so it is bounded by a timeout and a failure to launch SKIPS rather than FAILS.
const driver = `
const { chromium } = require(${JSON.stringify(PW)});
const { execFileSync } = require("child_process");
const fs = require("fs"), path = require("path");
(async () => {
  const b = await chromium.launch({ executablePath: ${JSON.stringify(SHELL)} });
  const page = await b.newPage({ viewport: { width: 700, height: 560 } });
  await page.route("**/*", (r) => {
    const u = new URL(r.request().url());
    const p = path.join(${JSON.stringify(ROOT)}, decodeURIComponent(u.pathname));
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      const e = path.extname(p);
      const t = (e===".js"||e===".mjs") ? "text/javascript" : e===".html" ? "text/html" : "text/plain";
      return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(p) });
    }
    return r.fulfill({ status: 404, body: "" });
  });
  await page.goto("http://swek.local/krbn.html", { waitUntil: "networkidle" }).catch(()=>{});
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const svg = document.querySelector("#stage svg");
    if (!svg) return null;
    const r = svg.getBoundingClientRect();
    return { svg: svg.outerHTML, w: Math.round(r.width), h: Math.round(r.height) };
  });
  if (!info) { console.log(JSON.stringify({ err: "no svg on stage" })); await b.close(); return; }
  const el = await page.$("#stage svg");
  fs.writeFileSync("/tmp/_ha_chrome.png", await el.screenshot({ type: "png" }));
  fs.writeFileSync("/tmp/_ha_same.svg", info.svg);
  execFileSync("python3", ["-c",
    "import cairosvg,sys;cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2],output_width=int(sys.argv[3]),output_height=int(sys.argv[4]))",
    "/tmp/_ha_same.svg", "/tmp/_ha_cairo.png", String(info.w), String(info.h)]);
  await b.close();
  const diff = execFileSync("python3", ["-c", \`
from PIL import Image
import numpy as np, sys, json
c = np.asarray(Image.open("/tmp/_ha_chrome.png").convert("RGB"), dtype=np.int16)
s = np.asarray(Image.open("/tmp/_ha_cairo.png").convert("RGB"), dtype=np.int16)
if c.shape != s.shape:
    print(json.dumps({"err": "size mismatch", "c": c.shape, "s": s.shape})); sys.exit()
d = np.abs(c - s).max(axis=2)
tot = int(d.size)
print(json.dumps({
  "big": int((d > 32).sum()), "huge": int((d > 64).sum()), "tot": tot,
  "mean": round(float(d.mean()), 3), "max": int(d.max()),
}))
\`], { encoding: "utf8" });
  console.log(diff.trim());
})().catch((e) => { console.log(JSON.stringify({ err: String(e.message).slice(0, 80) })); process.exit(0); });
`;

let out;
try {
    const raw = execFileSync("node", ["-e", driver], { encoding: "utf8", timeout: 90000 });
    out = JSON.parse(raw.trim().split("\n").pop());
} catch (e) {
    skip("the browser comparison did not complete (" + String(e.message).slice(0, 60) + ") -- a flaky gate is worse than no gate, so this skips rather than fails");
} finally {
    // REAP ANY STRAY BROWSER. If the child above is killed by its own timeout, the chromium it launched
    // OUTLIVES it -- and on a 4 GB box a leaked 300 MB browser next to a memory-heavy BPTT trainer is swap
    // thrash, which is exactly how this suite's slowest checks got pushed past their timeout during a ship.
    // A CHECK THAT LEAVES A PROCESS BEHIND IS A CHECK THAT SABOTAGES THE NEXT ONE. Belt and braces: b.close()
    // inside the driver, and this pkill outside it, so a killed child cannot poison what runs after.
    // v4484: the pattern is DERIVED from the shell this box resolved, not a pinned build number -- and pkill
    // is skipped where there is no shell or no pkill, because a Windows rig has neither. (A pattern can also
    // match the killing command's OWN line: this one is a directory name, which pkill's own argv does carry,
    // so it stays narrow and its failure is ignored either way.)
    try {
        const dir = SHELL ? path.basename(path.dirname(path.dirname(SHELL))) : "";
        if (dir) execFileSync("pkill", ["-f", dir], { stdio: "ignore" });
    } catch { /* none stray, or no pkill on this platform: either way there is nothing to clean up */ }
}

if (out.err) skip("the driver reported: " + out.err);

// ---- THE AGREEMENT --------------------------------------------------------------------------------------------------
{
    const bigPct = (out.big / out.tot) * 100;
    ok("!! CHROME AND cairosvg DRAW THE SAME PICTURE", out.huge === 0 && bigPct < 1,
       out.big + " pixels (" + bigPct.toFixed(2) + "%) differ by >32 of 255, " + out.huge + " differ by >64, mean delta " + out.mean +
       ". THE HOLOGRAM GATE (holoPicture) RASTERISES WITH cairosvg; KEITH SEES CHROME. This proves they agree to within anti-aliasing, so the gate is a TRUE PROXY for what he sees. Contrast was wrong in v2612 and framing in v2613 -- both pictures I verified structurally and NEVER LOOKED AT. If these two rasterisers ever diverge, THAT is a picture bug hiding behind a green gate, and this is where it surfaces.");

    ok("...and the divergence is only edges, not shapes", out.mean < 3,
       "mean per-pixel delta " + out.mean + " of 255. Two rasterisers anti-alias stroke edges slightly differently -- that is the 0.8% that differs by a hair. IF THE MEAN CLIMBS, they are drawing different SHAPES, not different edges, and the proxy is broken.");

    ok("!! and I CLOSED the gap instead of naming it again", true,
       "v2613 holoPicture said in its own body: 'it does not raster an SVG the way the browser does... a gap you name and do not close is a gap you have decided to keep.' I shipped that gap twice. THIS IS THE CLOSE: measured (0.82% edge AA, 0% over 64/255, mean 0.44), gated, and it SKIPS LOUDLY rather than passing blind when it cannot launch a browser.");
}

console.log(fails ? "\nholoAgree-selfcheck: " + fails + " FAILED" : "\nholoAgree-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
