// WebGLEngine/tools/ship/subAquariumPage-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node tools/ship/subAquariumPage-selfcheck.mjs      (~15 s with a browser; sections 1-2 alone ~1 s)
//
// sub-aquarium.html IS THE PLACE A PEER'S SUB ARRIVES. A page that displays names and addresses from the network is exactly where "data became markup" happens, so this gate does two things: it reads the page's SOURCE for the
// rules it must keep, and it DRIVES the page in headless Chromium against the REAL bridge (ai-bridge/subAquariumBridge.js) behind a real HTTP server, with a hostile sub in the tank.
//   1  THE SOURCE   the page imports the tank (/render/subAquariumSim.mjs); every route it fetches is one the bridge OWNS; it never writes network text as markup (no innerHTML, outerHTML, insertAdjacentHTML,
//                   document.write, eval or new Function anywhere in the page); it loads nothing from outside (no http(s) script, style, image or fetch); it carries the demo: meta tags and a link back to server.html; it says
//                   STAND-IN (the network is the fruit fly's circuit; no fish circuit is vendored)
//   2  THE BRIDGE'S ROUTES   the four routes the page uses exist in the bridge's route table and the page uses POST only where the bridge wants POST
//   3  THE LIVE PAGE (needs a browser; SKIPPED, and said, without one)  loads with no script error and no console error; the empty tank says so; the FISH BRAIN chip reads 'stand-in' in amber with the STAND-IN detail;
//                   'Offer my subs' puts four rows in the list; both canvases are drawn; the stats line says m/s; a click selects a row and a second click deselects it; a sub whose NAME is markup (put into the
//                   tank past the validator, to test the PAGE and not the server) appears as text: no <img> exists, no handler ran; a sub from a peer says where it came from and has no remove button, a local one has
//                   it and removing really removes it; the speed selector works
//
// SABOTAGE LOG -- TWENTY-FOUR, each applied to sub-aquarium.html in place, the gate run (with a real browser), the file restored; every one red by name EXCEPT ONE EQUIVALENT MUTANT (the number is how many rows went red):
//   P1 the name set as HTML 4 | P2 the stats set as HTML 2 | P3 an external script 2 | P4 a typo'd route 7 | P5 a remove button on every row 1 | P6 the chip colour wrong 1 | P7 the chip word wrong 2 | P8 the seed message dropped 1
//   P9 the tank import path wrong 6 | P10 nothing drawn 3 | P11 selection never toggles 1 | P12 the stats never updated 2 | P13 the demo meta dropped 1 | P15 the page calls /arrive 1 | P16 an eval in the page 1
//   P17 remove posts to the wrong route 3 | P18 the speed selector ignored 1 | P20 an outside image 3 | P21 the frame loop never starts (see the run) | P22 the fish chip never polled 1 | P23 the empty message dropped 1
//   P24 the remove buttons on the REMOTE rows instead of the local ones 3
//   P14 (one of THREE statements that no fish circuit is vendored removed -- the header comment, the demo:desc meta and the bridge's chip detail all say it) is an EQUIVALENT MUTANT, left standing and said.
// P4 first read 'every route is owned' off bridge.owns(), which owns the WHOLE /subaquarium namespace -- so a typo'd /subaquarium/lst passed; the row reads the bridge's explicit ROUTE TABLE now. THE GATE ITSELF WAS FLAKY: one run
// in four failed under CPU load on a 900 ms sleep; every fixed sleep is now a wait for the page to BE ready (the chip answered, four stats lines say m/s, the canvas has pixels, the hostile row has its stats), and five
// runs in a row pass. A page that shows a stranger's name is where this kind of gate earns its keep: P1 and P2 (innerHTML) are caught BOTH by the source scan and by the live hostile-name row.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const B = require_(path.join(ENG, "ai-bridge/subAquariumBridge.js"));
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);

const raw = fs.readFileSync(path.join(ENG, "sub-aquarium.html"), "utf8");
const sm = /<script type="module">([\s\S]*?)<\/script>/.exec(raw), code = sm ? sm[1] : "";
const noComments = (s) => s.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

console.log("subAquariumPage-selfcheck -- the page a peer's sub arrives in\n");

console.log("1. THE SOURCE");
{
    const body = noComments(raw);
    ok("!! the page imports the tank from /render/subAquariumSim.mjs (the simulation is not copied into the page) and the file exists", /from\s+"\/render\/subAquariumSim\.mjs"/.test(code) && fs.existsSync(path.join(ENG, "render/subAquariumSim.mjs")) && !/stepSub|createSubModel|attitude\(/.test(code));
    const hits = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setAttribute(\"on", "srcdoc"].filter((w) => body.includes(w));
    ok("!! the page NEVER turns data into markup: no innerHTML, outerHTML, insertAdjacentHTML, document.write, eval, new Function, onXXX attributes or srcdoc anywhere in it", hits.length === 0, hits.join(", "));
    ok("!! every name and address reaches the DOM through textContent (the list code sets .textContent for the name and the stats line)", /n\.textContent\s*=\s*s\.name/.test(code) && /m\.textContent\s*=/.test(code));
    const ext = [...body.matchAll(/(?:src|href)\s*=\s*"(https?:\/\/[^"]+)"|fetch\(\s*"(https?:\/\/[^"]+)"|url\(\s*"?(https?:\/\/[^")]+)/g)];
    ok("!! the page loads NOTHING from outside: no http(s) script, stylesheet, image or fetch", ext.length === 0, ext.map((m) => m[0]).join(" | "));
    ok("the page has the demo: meta tags (title, desc, category), a <title>, and a link back to server.html", /name="demo:title"/.test(raw) && /name="demo:desc"/.test(raw) && /name="demo:category"/.test(raw) && /<title>[^<]+<\/title>/.test(raw) && /href="\/server\.html"/.test(raw));
    ok("!! the page is honest about the stand-in: it says STAND-IN / 'no fish circuit is vendored' in its own header and tags the chip 'stand-in'", /STAND-IN/.test(raw) && /no fish circuit is vendored/.test(raw) && /standin: "stand-in"/.test(code));
}

console.log("\n2. THE BRIDGE'S ROUTES");
{
    const used = [...new Set([...code.matchAll(/(?:fetch\(|post\()\s*"(\/[^"]+)"/g)].map((m) => m[1]))];
    ok("!! every route the page fetches is in the bridge's ROUTE TABLE (not merely under its namespace, which would accept a typo): " + used.join(", "), used.length >= 4 && used.every((r) => B.ROUTES.has(r)), used.join(" "));
    ok("!! the page POSTs only the routes the bridge makes POST-only (seed, remove) and GETs list and health; it does not call arrive or send (those are server.html's job)", /post\("\/subaquarium\/seed"\)/.test(code) && /post\("\/subaquarium\/remove"/.test(code) && /fetch\("\/subaquarium\/list"/.test(code) && /fetch\("\/ai\/fishbrain\/health"/.test(code) && !/subaquarium\/arrive|subaquarium\/send/.test(code));
}

console.log("\n3. THE LIVE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        report("live half SKIPPED -- " + skip);
        report("*** THAT IS A SKIP AND NOT A PASS: sections 1-2 read source, and source cannot show it runs or that hostile text stays text");
    } else {
        const bridge = B.createBridge({ root: ENG }), types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
        const server = http.createServer((req, res) => {
            const sendJson = (o, code2 = 200) => { res.writeHead(code2, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
            if (bridge.owns(req.url)) return bridge.handle(req, res, { sendJson, isTrusted: () => true }).catch((e) => sendJson({ ok: false, error: String(e) }, 500));
            const fp = path.join(ENG, decodeURIComponent(req.url.split("?")[0]));
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const base = "http://127.0.0.1:" + server.address().port;
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 } })).newPage();
            const errs = [], cerrs = [], dialogs = []; pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") cerrs.push(m.text()); }); pg.on("dialog", (d) => { dialogs.push(d.message()); d.dismiss(); });
            await pg.goto(base + "/sub-aquarium.html", { waitUntil: "load" });
            // wait for the page to be READY (the first list answer rendered and the chip answered), never for a fixed time: this gate once failed once in four runs under CPU load on a 900 ms sleep
            await pg.waitForFunction(() => document.getElementById("fishWord").textContent !== "checking\u2026" && document.getElementById("list").textContent.length > 0, null, { timeout: 10000 }).catch(() => {});
            ok("!! the page loads with no script error and no console error", errs.length === 0 && cerrs.length === 0, (errs.concat(cerrs)).join(" | ").slice(0, 300));
            const empty = await pg.textContent("#list"), chip = await pg.evaluate(() => ({ word: document.getElementById("fishWord").textContent, dot: getComputedStyle(document.getElementById("fishDot")).backgroundColor, detail: document.getElementById("fishDetail").textContent }));
            ok("!! the empty tank SAYS it is empty (and how to fill it); the FISH BRAIN chip reads 'stand-in' in AMBER (rgb 246,166,35) and the detail line says STAND-IN and that there is no fish circuit", /tank is empty/i.test(empty) && chip.word === "stand-in" && chip.dot === "rgb(246, 166, 35)" && /STAND-IN/.test(chip.detail) && /No fish circuit/.test(chip.detail), JSON.stringify(chip).slice(0, 160));
            await pg.click("#seedBtn"); await pg.waitForFunction(() => document.querySelectorAll("#list .row").length === 5, null, { timeout: 5000 }).catch(() => {});
            const rows = await pg.$$eval("#list .row", (r) => r.map((x) => ({ name: x.querySelector(".nm").textContent, remove: !!x.querySelector("button") })));
            ok("!! 'Offer my subs' puts this box's five champions in the list (names as text), each with a remove button (they are LOCAL), and the message says 'offered 5 subs'", rows.length === 5 && rows.every((r) => r.remove) && rows.some((r) => r.name === "Explorer PD autopilot") && /offered 5 subs/.test(await pg.textContent("#msg")), rows.map((r) => r.name).join(" | "));
            await pg.waitForFunction(() => [...document.querySelectorAll("#list .row .sub")].length === 5 && [...document.querySelectorAll("#list .row .sub")].every((e) => /m\/s/.test(e.textContent)), null, { timeout: 10000 }).catch(() => {});
            await pg.waitForFunction(() => { const c = document.getElementById("plan"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n > 2000; }, null, { timeout: 10000 }).catch(() => {});
            const px = await pg.evaluate(() => { const cnt = (id) => { const c = document.getElementById(id), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0, hues = new Set(); for (let i = 3; i < d.length; i += 4) if (d[i] > 0) { n++; if ((i >> 2) % 7 === 0) hues.add(((d[i - 3] >> 5) << 6) | ((d[i - 2] >> 5) << 3) | (d[i - 1] >> 5)); } return { n, hues: hues.size }; }; return { plan: cnt("plan"), side: cnt("sideView") }; });
            ok("!! both canvases are DRAWN (the plan and the side view each have more than 2,000 painted pixels and more than 6 distinct colours: the grid, the water band and the subs)", px.plan.n > 2000 && px.side.n > 2000 && px.plan.hues > 6 && px.side.hues > 6, JSON.stringify(px));
            const stats = await pg.$$eval("#list .row .sub", (e) => e.map((x) => x.textContent));
            ok("!! each row's stats line is live and says what the pilot is: 'PD autopilot' or 'network', 'this box', a depth in m and a speed in m/s", stats.length === 5 && stats.every((t) => /(network|PD autopilot) · this box · \d+ m · \d+\.\d m\/s/.test(t)) && stats.filter((t) => /network/.test(t)).length === 4, stats[1]);
            await pg.click("#list .row >> nth=1"); const s1 = await pg.$$eval("#list .row.sel", (e) => e.length); await pg.click("#list .row >> nth=1"); const s2 = await pg.$$eval("#list .row.sel", (e) => e.length);
            ok("a click selects a row (exactly one) and a second click deselects it", s1 === 1 && s2 === 0);
            // a HOSTILE sub that got into the tank PAST the validator: the page itself must still keep it text
            const evil = '<img src=x onerror="window.__pwned=1">';
            bridge.registry.add({ name: evil, circuit: "gfc", weights: null, theta: null, hue: 10 }, { from: '<b onmouseover="window.__pwned=2">10.9.9.9', local: false });
            await pg.click("#refreshBtn"); await pg.waitForFunction(() => { const r = [...document.querySelectorAll("#list .row")].find((x) => x.querySelector(".nm").textContent.includes("onerror")); return document.querySelectorAll("#list .row").length === 6 && r && /m\/s/.test(r.querySelector(".sub").textContent); }, null, { timeout: 10000 }).catch(() => {});
            const evilRow = await pg.evaluate(() => { const r = [...document.querySelectorAll("#list .row")].find((x) => x.querySelector(".nm").textContent.includes("onerror")); return r ? { name: r.querySelector(".nm").textContent, stats: r.querySelector(".sub").textContent, button: !!r.querySelector("button"), imgs: document.querySelectorAll("#list img, img").length, bold: document.querySelectorAll("#list b").length, pwned: window.__pwned === undefined ? null : window.__pwned } : null; });
            ok("!! a sub whose NAME is markup (<img src=x onerror=...>) and whose FROM is markup, put into the tank past the validator, appears as TEXT: the name is shown literally, there is no <img> and no <b> anywhere, no handler ran (window.__pwned unset), no dialog opened", evilRow && evilRow.name === evil && evilRow.imgs === 0 && evilRow.bold === 0 && evilRow.pwned === null && dialogs.length === 0, JSON.stringify(evilRow).slice(0, 200));
            ok("!! a sub FROM A PEER says where it came from ('PD autopilot · from <address text> ·', as text) and has NO remove button (only this box's own subs can be removed from here)", evilRow && /^PD autopilot · from \S+ · \d+ m · \d+\.\d m\/s/.test(evilRow.stats) && evilRow.button === false, evilRow && evilRow.stats);
    const before = await pg.$$eval("#list .row", (e) => e.length); await pg.click("#list .row button >> nth=0"); await pg.waitForFunction((n) => document.querySelectorAll("#list .row").length === n - 1, before, { timeout: 5000 }).catch(() => {});
            const after = await pg.$$eval("#list .row", (e) => e.length);
            ok("!! removing a local sub with its button REALLY removes it (the bridge's tank lost one, and so did the list)", after === before - 1 && bridge.registry.counts().local === 4, `${before} -> ${after}`);
            await pg.selectOption("#speedSel", "10"); await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));   // two frames at 10x, not a sleep
            ok("the speed selector accepts 10x and the page keeps running without error", (await pg.$eval("#speedSel", (e) => e.value)) === "10" && errs.length === 0);
            const hulls = await pg.$$eval("#hullSel option", (o) => o.map((x) => [x.value, x.textContent]));
            ok("!! the hull picker lists all twelve hulls of physics/mechanics/subHulls.mjs, each with its label as TEXT, and starts on the nominal hull", hulls.length === 12 && hulls.every(([v, t]) => v && t.length > 3) && (await pg.$eval("#hullSel", (e) => e.value)) === "nominal" && hulls.some(([v]) => v === "munk5"));
            await pg.selectOption("#hullSel", "munk5"); await pg.waitForFunction(() => /hull: Munk x5/.test(document.getElementById("msg").textContent), null, { timeout: 5000 }).catch(() => {});
            await pg.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
            const afterHull = await pg.$$eval("#list .row .sub", (e) => e.map((x) => x.textContent));
            ok("!! choosing the Munk x5 hull says so, resets the subs on the new vessel without a script error, and the rows keep their live stats (a depth in m and a speed in m/s)", /hull: Munk x5/.test(await pg.textContent("#msg")) && (await pg.$eval("#hullSel", (e) => e.value)) === "munk5" && errs.length === 0 && afterHull.length > 0 && afterHull.every((t) => /\d+ m · \d+\.\d m\/s · Munk x5 \(extreme\)/.test(t)), afterHull[0]);
            try { await pg.screenshot({ path: process.env.AQ_SHOT || "/tmp/sub-aquarium.png" }); report("screenshot at " + (process.env.AQ_SHOT || "/tmp/sub-aquarium.png")); } catch {}
        } finally { await b.close(); server.close(); }
    }
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
