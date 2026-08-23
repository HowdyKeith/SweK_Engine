// WebGLEngine/tools/ship/recordFloat-selfcheck.mjs -- v3950
//
// Run: node tools/ship/recordFloat-selfcheck.mjs   (needs Chromium; skips cleanly without it)
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ui/recordFloat.js -- the floating record button that TWENTY-FIVE PAGES asked for on every load and that
// did not exist.
//
// *** HALF OF A 51-PAGE FAILURE REPORT WAS THIS ONE 404. *** Keith's render-qa run over 377 pages failed 51, and
// 25 of those were `404 /ui/recordFloat.js` and nothing else. The file is in no commit of this repository
// (`git log --all` over the path is empty; history begins v3842), no changelog names it, and no module imports
// it -- the same LOST SOURCE shape as simulation/lbm/dfgBenchmark.mjs, found the same week.
//
// WHAT IS CHECKED HERE IS THE DECISION, NOT THE DECORATION. The button is easy; the property worth defending is
// that it DOES NOT APPEAR ON A PAGE IT CANNOT RECORD. Nine of the twenty-five have no <canvas> at all, and
// render-qa's own output quotes this tree's rule for that case on a different page: "v2579 A flag that lies is
// worse than no flag."
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("recordFloat-selfcheck -- the button 25 pages asked for, and the pages it refuses to appear on\n");

// ---- 1. THE FILE EXISTS AND THE CALL SITES STILL WANT IT (no browser needed) --------------------------------
{
    console.log("1. THE 404 THAT WAS HALF A FAILURE REPORT");
    ok("!! ui/recordFloat.js exists", fs.existsSync(path.join(ENG, "ui", "recordFloat.js")),
        "25 pages load it as the last tag before </body>; every one of them 404'd on every load");
    const pages = fs.readdirSync(ENG).filter((f) => f.endsWith(".html"))
        .filter((f) => /recordFloat/.test(fs.readFileSync(path.join(ENG, f), "utf8")));
    ok("!! ...and the call sites are still there, so it is not dead weight", pages.length >= 20, pages.length + " pages load it");
    const src = fs.readFileSync(path.join(ENG, "ui", "recordFloat.js"), "utf8");
    ok("!! it drives the EXISTING recorder rather than a second one",
        /from "\.\/canvasRecorder\.js"/.test(src) && /installRecorder\(\)/.test(src),
        "canvasRecorder.js already owns start/stop/recording and picks the largest canvas; a second capture " +
        "implementation here would be the two-declarations defect with a MediaRecorder attached");
    // Comments stripped: recordFloat.js's header EXPLAINS the canCapture mistake, and a raw scan reads the
    // explanation as the offence. Third time this trap has been walked into in this tree's own new checks.
    const code = src.split(/\r?\n/).map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
    ok("!! ...and reads canRecord, the field describeCapture actually returns",
        /cap\.canRecord === false/.test(code) && !/canCapture/.test(code),
        "*** THE FIRST DRAFT TESTED cap.canCapture, WHICH DOES NOT EXIST *** -- and an undefined field is never " +
        "=== false, so the guard would have passed silently on every page and proven nothing. A guarded read of " +
        "a wrong name is indistinguishable from a working check until the day it needs to fire.");
}

if (skip) {
    console.log("\nrecordFloat-selfcheck: SKIPPED -- " + skip + " (the source checks above ran)");
    process.exit(fails ? 1 : 0);
}

// ---- 2. DRIVEN IN A REAL BROWSER ----------------------------------------------------------------------------
const b = await chromium.launch({ executablePath: HEADLESS_SHELL });
async function mount(withCanvas) {
    const page = await b.newPage();
    const errs = []; page.on("pageerror", (e) => errs.push(e.message));
    await page.route("**/*", (r) => {
        const u = new URL(r.request().url());
        // Matched on PATHNAME, not hostname: the first version of this harness matched the host and served the
        // PAGE for the script tag too, which looked exactly like the button failing to appear.
        if (u.pathname === "/page.html") {
            const c = withCanvas ? '<canvas id="c" width="320" height="200"></canvas>' : "<p>no canvas here</p>";
            return r.fulfill({ status: 200, contentType: "text/html",
                body: '<!doctype html><html><body>' + c + '<script type="module" src="/ui/recordFloat.js"></script></body></html>' });
        }
        const p = path.join(ENG, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile())
            return r.fulfill({ status: 200, contentType: "text/javascript", body: fs.readFileSync(p) });
        return r.fulfill({ status: 404, body: "nope" });
    });
    await page.goto("http://t/page.html", { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(500);
    return { page, errs };
}
{
    console.log("\n2. *** ON A PAGE WITH SOMETHING TO RECORD ***");
    const A = await mount(true);
    ok("!! the button appears", !!(await A.page.$("#swekRecFloat")));
    ok("...and it installed the recorder", await A.page.evaluate(() => !!window.swekRecord));
    ok("...reading Record before any click", ((await A.page.textContent("#swekRecFloat").catch(() => "")) || "").trim() === "Record");
    ok("!! clicking it REALLY starts a recording, not just a label change",
        await A.page.evaluate(async () => {
            document.getElementById("swekRecFloat").click();
            await new Promise((r) => setTimeout(r, 250));
            return !!(window.swekRecord && window.swekRecord.recording && window.swekRecord.recording());
        }),
        "driven against a real MediaRecorder in headless chromium -- a button whose only proof is its own caption " +
        "is the decoration this file refuses to be");
    ok("!! ...and the caption follows the RECORDER, not the click",
        /^Stop/.test(((await A.page.textContent("#swekRecFloat")) || "").trim()),
        "the recorder can stop on its own, so the label is polled from recording() -- a button reading Stop over " +
        "a finished take is the lying flag one layer in");
    ok("no page errors", A.errs.length === 0, A.errs.join(" | "));
}
{
    console.log("\n3. *** AND ON A PAGE IT CANNOT RECORD, IT STAYS AWAY ***");
    const B = await mount(false);
    ok("!! no canvas, no button",
        !(await B.page.$("#swekRecFloat")),
        "*** NINE OF THE TWENTY-FIVE PAGES HAVE NO <canvas>. *** A record button there would fail on click, and " +
        'render-qa quotes this tree\'s own rule for it: "v2579 A flag that lies is worse than no flag."');
    ok("...and no page errors from staying away", B.errs.length === 0, B.errs.join(" | "));
    await B.page.evaluate(() => { const c = document.createElement("canvas"); c.width = 64; c.height = 64; document.body.appendChild(c); });
    await B.page.waitForTimeout(500);
    ok("!! a canvas built AFTER load still gets the button -- the WebGL case, which is most of them",
        !!(await B.page.$("#swekRecFloat")),
        "these pages create their canvas in JS, sometimes after an await; a single check at load would find " +
        "nothing on exactly the pages most worth recording");
}
await b.close();
console.log(fails ? "\nrecordFloat-selfcheck: " + fails + " FAILED" : "\nrecordFloat-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
