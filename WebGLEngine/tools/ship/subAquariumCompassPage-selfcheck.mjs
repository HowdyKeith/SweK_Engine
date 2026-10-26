// WebGLEngine/tools/ship/subAquariumCompassPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAquariumCompassPage-selfcheck.mjs      (~35 s; the live half needs a browser and is SKIPPED, and said, without one)
//
// THE LIVE TANK OF sub-aquarium.html: the compass menu, the 'add a sub' menu and the way a sub in the dark is drawn and described. The tank's own rules are held by render/subAquariumCompass-selfcheck.mjs; the page's older rows by tools/ship/subAquariumPage-selfcheck.mjs.
//   1  THE SOURCE  the page imports the tank's own withBelief (it never touches the vessel's attitude), puts the compass menu and the add menu in the bar and says in words what dropout does; a sub added on the page has no weights, is marked as from the page, is kept in the page's own list and is NEVER posted to the bridge (the only
//                  routes the page posts are seed and remove, as before); at most twelve; the estimator kinds are registered only after the dropout view's modules load, and the page says so when they cannot.
//   2  THE LIVE PAGE  the compass starts lit and no row mentions it; set to dropout, rows say 'compass lit' or 'COMPASS DARK n s' and some sub does go dark; the plan canvas has amber ring pixels while a sub is dark and none while all are lit; switched back, the rows stop mentioning the compass; a navigator added from the menu is a row 'PD + navigator 1'
//                      from 'this page' with its own remove button, which removes it; 'Clear added' removes the rest; the bridge's tank (six local subs) never changes; the estimator kinds are offered once the view's modules have loaded and an added one swims without a page error.
// NOT CHECKED, said plainly: how it looks (a screenshot is written); the 3D view (it draws the subs as before and does not mark the dark ones); a touch screen.
//
// SABOTAGE LOG (the thing broken -> the rows that went red; every mutant must be red BY NAME):
//   (filled in when the sabotage is run)
"use strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ENG = path.resolve(HERE, "..", ".."), require_ = createRequire(import.meta.url);
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
console.log("subAquariumCompassPage-selfcheck -- the compass in the live tank\n");
const page = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8"), m = page.match(/<script type="module">([\s\S]*?)<\/script>/), code = m ? m[1] : "";

console.log("1. THE SOURCE");
{
    ok("!! the page imports the tank's withBelief from /render/subAquariumSim.mjs and does not read the vessel's attitude itself (the estimator kinds are made with it)", /import \{ createTank, withBelief,/.test(code) && /tank\.registerPilot\(kind, \(\) => withBelief\(def\.build\)\)/.test(code) && !/attitude\(/.test(code));
    ok("!! the bar has the compass menu (lit, dropout) and the add menu (PD + navigator at first) with Add and Clear added, and the menu changes the tank through setCompass", /<select id="compassSel"[^>]*><option value="lit">lit<\/option><option value="dropout">dropout<\/option><\/select>/.test(page) && /<select id="addKind"[^>]*><option value="navigator">PD \+ navigator<\/option><\/select>/.test(page) && /id="addBtn"/.test(page) && /id="addClear"/.test(page) && /tank\.setCompass\(\$\("compassSel"\)\.value\)/.test(code));
    ok("!! the page says in words what dropout does: sixteen seconds in every forty-eight, each on its own clock, the amber ring and the ghost line, the navigator's exact rate and that a real gyro cannot give it", /id="compassNote"/.test(page) && /16 s in every 48 s, each sub on its own clock/.test(page) && /ringed in amber/.test(page) && /ghost line/.test(page) && /exact rate is what a simulator can give and a real gyro cannot/.test(page));
    ok("!! a sub added on the page has NO weights, is 'from this page', is not local to the bridge and is kept in the page's own list; the page never posts it: the only routes the page posts are /subaquarium/seed and /subaquarium/remove", /weights: null/.test(code.slice(code.indexOf("$(\"addBtn\").onclick"), code.indexOf("$(\"addClear\")"))) && /from: "this page", local: false/.test(code) && /extras\.push\(/.test(code) && [...code.matchAll(/post\("(\/[^"]+)"/g)].map((x) => x[1]).every((r) => r === "/subaquarium/seed" || r === "/subaquarium/remove") && !/post\("[^"]*",\s*\{[^}]*extras/.test(code));
    ok("!! at most twelve subs can be added, and the list the tank is synced with is the bridge's list followed by the added ones", /extras\.length >= 12/.test(code) && /tank\.sync\(\[\.\.\.lastList, \.\.\.extras\]\)/.test(code) && /lastList = j\.subs; syncTank\(\)/.test(code));
    ok("!! the estimator kinds are registered only after the view's modules loaded (inside the try that follows the mount), say 'not available here' when they cannot, and are offered in the add menu only once registered", /view\.mountDropoutView\(host, \{ circuit \}\);\s*try \{/.test(code) && /the estimator pilots are not available here/.test(code) && /\$\("addKind"\)\.appendChild\(o\)/.test(code) && /KIND_NAMES\[kind\]/.test(code));
    ok("!! a sub in the dark is described and drawn: the row says COMPASS DARK with the seconds left, 'compass lit' otherwise in the dropout mode and nothing in the lit mode; the plan gets an amber dashed ring and a ghost line along the believed heading, the side view a ring", /COMPASS DARK \$\{s\.darkLeft\.toFixed\(0\)\} s/.test(code) && /s\.compass === "dropout" \? " · compass lit" : ""/.test(code) && /function drawDark\(/.test(code) && /strokeStyle = "#f6a623"/.test(code) && /if \(s\.dark\) \{ drawDark\(pg,/.test(code));
}

console.log("\n2. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: section 1 reads source, and source cannot show that a sub goes dark, that the ring is drawn or that an added sub swims"); }
    else {
        const bridge = (await import("../../ai-bridge/subAquariumBridge.js")).createBridge({ root: ENG }), types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const sendJson = (o, c2 = 200) => { res.writeHead(c2, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
            if (bridge.owns(req.url)) return bridge.handle(req, res, { sendJson, isTrusted: () => true }).catch((e) => sendJson({ ok: false, error: String(e) }, 500));
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port, b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await b.newContext({ viewport: { width: 1200, height: 1500 } })).newPage();
            const errs = [], cerrs = []; pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (mm) => { if (mm.type() === "error") cerrs.push(mm.text()); });
            await pg.goto(base + "/sub-aquarium.html", { waitUntil: "load" });
            await pg.click("#seedBtn"); await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 6, null, { timeout: 8000 }).catch(() => {});
            await pg.waitForFunction(() => [...document.querySelectorAll("#list .row .sub")].length === 6 && [...document.querySelectorAll("#list .row .sub")].every((e) => /m\/s/.test(e.textContent)), null, { timeout: 10000 }).catch(() => {});
            await pg.selectOption("#speedSel", "10");
            const texts = () => pg.$$eval("#list .row .sub", (e) => e.map((x) => x.textContent));
            const amberOf = (id) => pg.evaluate((cid) => { const c = document.getElementById(cid), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 246) < 4 && Math.abs(d[i + 1] - 166) < 4 && Math.abs(d[i + 2] - 35) < 6 && d[i + 3] > 250) n++; return n; }, id), amber = () => amberOf("plan"), amberSide = () => amberOf("sideView");
            await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            let t0 = await texts();
            ok("!! the compass starts LIT: the menu says lit and no row mentions the compass, and the plan has no amber ring", (await pg.$eval("#compassSel", (e) => e.value)) === "lit" && t0.length === 6 && t0.every((t) => !/compass/i.test(t)) && (await amber()) === 0, t0[1]);
            await pg.selectOption("#compassSel", "dropout");
            await pg.waitForFunction(() => [...document.querySelectorAll("#list .row .sub")].every((e) => /compass (lit|DARK)/.test(e.textContent)), null, { timeout: 8000 }).catch(() => {});
            let t1 = await texts();
            ok("!! set to dropout, every row says 'compass lit' or 'COMPASS DARK n s', and the message line says the compass is dropout", t1.length === 6 && t1.every((t) => /compass lit|COMPASS DARK \d+ s/.test(t)) && /compass: dropout/.test(await pg.textContent("#msg")), t1[0]);
            await pg.waitForFunction(() => [...document.querySelectorAll("#list .row .sub")].some((e) => /COMPASS DARK/.test(e.textContent)), null, { timeout: 40000 }).catch(() => {});
            const dark = (await texts()).filter((t) => /COMPASS DARK \d+ s/.test(t));
            ok("!! some sub does go DARK within the run (each is dark a third of the time on its own clock), and while one is, the plan and the side view have amber ring pixels (the exact amber of the ring, which no sub's own colour reaches)", dark.length >= 1 && (await amber()) > 8 && (await amberSide()) > 8, `${dark.length} dark, amber ${await amber()} plan, ${await amberSide()} side`);
            await pg.selectOption("#compassSel", "lit");
            await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const t2 = await texts();
            ok("!! switched back to lit, the rows stop mentioning the compass and the amber rings are gone", t2.every((t) => !/compass/i.test(t)) && (await amber()) === 0 && (await amberSide()) === 0);
            await pg.selectOption("#compassSel", "dropout");
            const optsBefore = await pg.$$eval("#addKind option", (o) => o.map((x) => x.value));
            await pg.selectOption("#addKind", "navigator"); await pg.click("#addBtn");
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 7 && [...document.querySelectorAll("#list .row")].every((r) => r.querySelector(".sub").textContent.length > 0), null, { timeout: 8000 }).catch(() => {});
            const rows = await pg.$$eval("#list .row", (r) => r.map((x) => ({ name: x.querySelector(".nm").textContent, stats: x.querySelector(".sub").textContent, remove: !!x.querySelector("button") })));
            const nav = rows.find((r) => r.name === "PD + navigator 1");
            ok("!! 'Add' with PD + navigator puts a row 'PD + navigator 1' in the tank, described as PD + navigator from this page, with a remove button; the message says what was added", !!nav && /^PD \+ navigator · from this page · \d+ m · \d+\.\d m\/s/.test(nav.stats) && nav.remove && /added PD \+ navigator/.test(await pg.textContent("#msg")), J(nav));
            await pg.click("#refreshBtn"); await pg.evaluate(() => new Promise((r) => setTimeout(r, 800)));
            ok("!! an added sub SURVIVES the page's own refresh of the list (the tank is synced with the bridge's list followed by the added ones, not with the bridge's list alone)", (await pg.$$eval("#list .row .nm", (r) => r.map((x) => x.textContent))).includes("PD + navigator 1"));
            ok("!! the bridge's tank is unchanged by it (six local subs): an added sub lives on the page and is never sent", bridge.registry.counts().local === 6 && bridge.registry.counts().total === 6, JSON.stringify(bridge.registry.counts()));
            await pg.waitForFunction(() => document.getElementById("dropoutHost").dataset.ready === "1" && [...document.querySelectorAll("#addKind option")].length === 3, null, { timeout: 40000 }).catch(() => {});
            const opts = await pg.$$eval("#addKind option", (o) => o.map((x) => x.value + ":" + x.textContent));
            ok("!! once the dropout view's modules have loaded the add menu offers the two estimators too (before: only the navigator)", J(optsBefore.length >= 1 ? opts : []) === J(["navigator:PD + navigator", "fly-estimator:PD + fly heading-loop estimator", "er-estimator:PD + random-wiring estimator"]) && optsBefore[0] === "navigator", J(opts));
            await pg.selectOption("#addKind", "er-estimator"); await pg.click("#addBtn");
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 8, null, { timeout: 5000 }).catch(() => {});
            await pg.waitForFunction(() => [...document.querySelectorAll("#list .row")].some((x) => /^PD \+ random-wiring estimator 1/.test(x.querySelector(".nm").textContent) && /\d+ m · \d+\.\d m\/s/.test(x.querySelector(".sub").textContent)), null, { timeout: 15000 }).catch(() => {});
            await pg.evaluate(() => new Promise((r) => setTimeout(r, 1000)));
            const est = (await pg.$$eval("#list .row", (r) => r.map((x) => x.querySelector(".nm").textContent + " | " + x.querySelector(".sub").textContent))).find((x) => /^PD \+ random-wiring estimator 1/.test(x));
            ok("!! an estimator sub added from the menu swims (its row has depth and speed, no page error) in the dropout tank", !!est && /\d+ m · \d+\.\d m\/s/.test(est) && errs.length === 0 && cerrs.length === 0, String(est).slice(0, 120));
            await pg.click("#list .row:has(.nm:text-is('PD + navigator 1')) button");
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 7, null, { timeout: 5000 }).catch(() => {});
            ok("!! the remove button of an added sub removes it from the tank (the other added sub stays), with no call to the bridge", (await pg.$$eval("#list .row .nm", (r) => r.map((x) => x.textContent))).filter((x) => /PD \+/.test(x)).join() === "PD + random-wiring estimator 1" && bridge.registry.counts().total === 6);
            await pg.click("#addClear");
            await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 6, null, { timeout: 5000 }).catch(() => {});
            ok("!! 'Clear added' takes the rest away: six rows again, the six of the bridge, and no error on the page from any of it", (await pg.$$eval("#list .row", (r) => r.length)) === 6 && /the added subs are gone/.test(await pg.textContent("#msg")) && errs.length === 0 && cerrs.length === 0, errs.concat(cerrs).join(" | ").slice(0, 200));
            try { await pg.screenshot({ path: process.env.COMPASS_SHOT || "/tmp/sub-aquarium-compass.png" }); report("screenshot at " + (process.env.COMPASS_SHOT || "/tmp/sub-aquarium-compass.png")); } catch {}
        } finally { await b.close(); server.close(); }
    }
}
function J(v) { return JSON.stringify(v); }
console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
