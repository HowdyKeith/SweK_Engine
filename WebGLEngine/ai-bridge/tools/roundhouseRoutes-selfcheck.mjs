// WebGLEngine/ai-bridge/tools/roundhouseRoutes-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node ai-bridge/tools/roundhouseRoutes-selfcheck.mjs      (~10 s: it boots the REAL server)
//
// THE ROUTES THAT WERE ANSWERED BY THE WRONG BRIDGE. Keith's rig, physics-lab.html: "roundhouse/lab-scenes: Failed to load resource: 404" and the "Initiate AI workers" button "not doing anything".
// The cause was not in the page. ai-bridge/server.js asks roundhouseBridge.owns(req.url) at the top of its router, and owns() said yes to ALL of /roundhouse/; fingerprintBridge.js, which defines
// /roundhouse/lab-scenes, /roundhouse/lab-scene-run and /roundhouse/lab-replay, is mounted some twelve thousand lines further down. So roundhouseBridge answered each of the three with its own
// {"error":"unknown-route"} and a 404, and the lab page's panel, the lab home page and race-brain's replay button were dead on the real server from the day they were written.
//
// *** WHY NO GATE SAW IT: every gate that "drove the route for real" (lab-scene-run-selfcheck, raceKnob-selfcheck) called fingerprintBridge.handle(req, res) directly, which is the handler and
// not the ROUTER; and the check that "the bridge owns /roundhouse/lab-scene-run" was a regular expression over the source text, which finds the route's name and cannot find that another
// owner answers first. A route is reachable when the server routes to it, so this gate boots the server and asks. ***
//
//   1  THE LIST      roundhouseBridge.ELSEWHERE is the set of /roundhouse/ routes fingerprintBridge.js declares, and every /roundhouse/ route a page fetches is answered by one of the two bridges
//   2  THE OWNER     owns() declines the three (with a query, with a longer name) and keeps its own, the bare prefix and an unknown route (which stays a named 404 of its own)
//   4  THE PAGE     physics-lab.html in a real browser (a static server, a request that never answers, the real server): against a server with no bridge (the 404 case) it SAYS the bridge is not reachable and why (HTTP 404) and its button is disabled; against the real server a scene
//                    with a proposer reads 'registered' with the button live and a press RUNS it (the pane names the proposer and says nothing was applied), and a scene without one reads 'refused' with the reason on the page
//   3  THE REAL SERVER  booted on a throwaway port: lab-scenes answers with the scenes (pile registered); lab-scene-run says no-proposer for a scene without one and RUNS the proposer for one with one;
//                    lab-replay says no-replay by name; /roundhouse/status is still roundhouseBridge's; an unknown /roundhouse/ route is still its unknown-route 404
//
// SABOTAGE LOG -- SEVENTEEN, each applied in a scratch worktree, the gate run, the files restored; every one red by name (the number is how many rows went red):
//   X1 lab-replay is not declined 4 | X2 status is declined too 3 | X3 only the bare prefix is owned 2 | X4 owns() says yes to all of /roundhouse/ (the original: the rig's state) 5 | X5 a longer name is not declined 1
//   X6 the unknown route answers 200 1 | X7 the replay route is renamed in fingerprintBridge 2 | X8 the page fetches a route nobody answers 1 | X9 a non-string is owned 1 | X10 the route is cut one character too far 1
//   Y1 the page does not say why it has no scene list 1 | Y3 a refused scene's button is enabled 1 | Y4 the button always runs the pile 1 | Y5 the reader is not told to restart the server 1 | Y6 the reason is not shown on the page 1
//   Y7 a network failure leaves the dash 1
// THREE WENT 0 RED THE FIRST TIME: Y4 (the button always running the pile -- only the pile was pressed: the centrifuge is pressed now), Y7 (a failed request leaving the dash -- no row made a request fail: the browser now aborts it) and Y2 (the unreachable branch not disabling
// the button), which was an EQUIVALENT MUTANT: the button is disabled in the markup and nothing enables it while there is no scene list, so the line was dead and has been removed.
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../../tools/ship/playwrightResolve.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, "..", ".."), require = createRequire(import.meta.url);
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const RB = require("../roundhouseBridge.js");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
console.log("roundhouseRoutes-selfcheck -- the routes under /roundhouse, driven through the real router\n");

console.log("1. THE LIST");
{
    const fp = read("ai-bridge/fingerprintBridge.js"), declared = [...new Set([...fp.matchAll(/url\.startsWith\("(\/roundhouse\/[a-z-]+)"\)/g)].map((m) => m[1]))].sort();
    ok("!! roundhouseBridge.ELSEWHERE is exactly the set of /roundhouse/ routes fingerprintBridge.js declares (a route added there and not here would be shadowed again, and one left here that is gone there would be a 404 nobody answers)", declared.length >= 3 && JSON.stringify([...RB.ELSEWHERE].sort()) === JSON.stringify(declared) && Object.isFrozen(RB.ELSEWHERE), declared.join(", "));
    const own = new Set([...read("ai-bridge/roundhouseBridge.js").matchAll(/route === "(\/[a-z-]*)"/g)].map((m) => "/roundhouse" + (m[1] === "/" ? "" : m[1])));
    const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith(".html")), called = new Map();
    for (const f of pages) { const src = read(f); for (const m of src.matchAll(/fetch\(\s*["'`](\/roundhouse\/[a-z-]+)/g)) (called.get(m[1]) || called.set(m[1], []).get(m[1])).push(f); }
    const orphans = [...called.keys()].filter((r) => !own.has(r) && !RB.ELSEWHERE.includes(r));
    ok("!! every /roundhouse/ route a page fetches is answered by one of the two bridges -- roundhouseBridge's own or one in ELSEWHERE; none is a name nobody answers", called.size >= 4 && orphans.length === 0, `${called.size} routes fetched by pages (${[...called.keys()].join(", ")}); unanswered: ${orphans.join(", ") || "none"}`);
}

console.log("\n2. THE OWNER");
{
    const no = ["/roundhouse/lab-scenes", "/roundhouse/lab-scenes?x=1", "/roundhouse/lab-scene-run?scene=pile", "/roundhouse/lab-replay?scene=race", "/roundhouse/lab-scenes-extra"], yes = ["/roundhouse", "/roundhouse/status", "/roundhouse/run?dry=1", "/roundhouse/devices", "/roundhouse/export?mode=x", "/roundhouse/nope", "/roundhouse?x=1"];
    ok("!! owns() DECLINES THE THREE ROUTES ANOTHER BRIDGE ANSWERS (bare, with a query string, and with a longer name, as fingerprintBridge's own startsWith reads them) so the router falls through to it", no.every((u) => RB.owns(u) === false), no.map((u) => RB.owns(u)).join());
    ok("!! ...and keeps its own: the bare prefix, /status, /run, /devices, /export, a query on the prefix, and an UNKNOWN /roundhouse/ route (which must stay owned, so that it is a named 404 and not a silent fall-through); a non-string is nobody's", yes.every((u) => RB.owns(u) === true) && RB.owns(undefined) === false && RB.owns(42) === false && RB.owns("/roundhousefoo") === false, yes.map((u) => RB.owns(u)).join());
}

console.log("\n3. THE REAL SERVER");
{
    // v4611's rule for a throwaway instance: SWEK_TEST_SERVER keeps the sysadmin boot scan off this box; PORT=0 would fall back to 8787 (0 is falsy there), so a fixed odd port
    const PORT = "19788", env = Object.assign({}, process.env, { PORT, SWEK_TEST_SERVER: "1" });
    const srv = spawn(process.execPath, [path.join(ROOT, "ai-bridge", "server.js")], { env, stdio: ["ignore", "pipe", "pipe"] });
    let up = false, buf = ""; srv.stdout.on("data", (d) => { buf += d.toString(); if (buf.includes(":" + PORT)) up = true; }); srv.stderr.on("data", () => {});
    const get = (p) => new Promise((res) => { const q = http.get({ host: "127.0.0.1", port: PORT, path: p, timeout: 90000 }, (r) => { let b = ""; r.on("data", (d) => (b += d)); r.on("end", () => { let j = null; try { j = JSON.parse(b); } catch { } res({ status: r.statusCode, json: j, text: b.slice(0, 120) }); }); }); q.on("error", (e) => res({ status: 0, error: String(e.message) })); });
    for (let i = 0; i < 80 && !up; i++) await new Promise((r) => setTimeout(r, 250));
    if (!up) { ok("!! the real server booted on the gate's port", false, "no listening line in 20 s: " + buf.slice(0, 200)); }
    else {
        const ls = await get("/roundhouse/lab-scenes"), pile = ls.json && ls.json.scenes && ls.json.scenes.find((r) => r.scene === "pile");
        ok("!! /roundhouse/lab-scenes THROUGH THE REAL ROUTER answers 200 with the lab's scenes (not roundhouseBridge's 404): more than ten of them, `pile` among them with a registered proposer", ls.status === 200 && ls.json && ls.json.ok === true && ls.json.scenes.length > 10 && !!pile && pile.registered === true, `${ls.status} ${ls.json && ls.json.scenes ? ls.json.scenes.length + " scenes" : ls.text}`);
        const aq = await get("/roundhouse/lab-scene-run?scene=aquarium"), unk = await get("/roundhouse/lab-scene-run?scene=not-a-scene");
        ok("!! /roundhouse/lab-scene-run says what it means: a scene with no proposer is a 400 `no-proposer` naming the scene and its knob, a scene that does not exist is a 400 `unknown-scene` -- neither is the 404 unknown-route of the wrong bridge", aq.status === 400 && aq.json && aq.json.error === "no-proposer" && aq.json.scene === "aquarium" && unk.status === 400 && unk.json && unk.json.error === "unknown-scene", `${aq.status} ${aq.json && aq.json.error} | ${unk.status} ${unk.json && unk.json.error}`);
        const run = await get("/roundhouse/lab-scene-run?scene=pile");
        ok("!! ...and for a scene WITH a proposer it RUNS it through the real router (what the Initiate button asks for): ok, at least one run that names its proposer, tried candidates and says whether the key accepted one -- and applies nothing", run.status === 200 && run.json && run.json.ok === true && Array.isArray(run.json.runs) && run.json.runs.length >= 1 && typeof run.json.runs[0].id === "string" && run.json.runs[0].tried > 0 && Object.prototype.hasOwnProperty.call(run.json.runs[0], "accepted"), `${run.status} ${run.json && run.json.runs ? run.json.runs.map((r) => r.id + " " + r.tried + " tried").join(", ") : run.text}`);
        const rp = await get("/roundhouse/lab-replay?scene=never-run-scene"), bad = await get("/roundhouse/lab-replay?scene=BAD%20NAME");
        ok("!! /roundhouse/lab-replay answers by name: no stored replay is `no-replay` (404, naming the scene and the button that makes one), a name that is not a scene name is `bad-scene` (400)", rp.status === 404 && rp.json && rp.json.error === "no-replay" && rp.json.scene === "never-run-scene" && bad.status === 400 && bad.json && bad.json.error === "bad-scene", `${rp.status} ${rp.json && rp.json.error} | ${bad.status} ${bad.json && bad.json.error}`);
        const st = await get("/roundhouse/status"), nope = await get("/roundhouse/nope"), dv = await get("/roundhouse/devices");
        ok("!! roundhouseBridge's OWN routes are still its own: /roundhouse/status and /roundhouse/devices answer ok, and an unknown /roundhouse/ route is still its named `unknown-route` 404 (the fix declined three names, not the prefix)", st.status === 200 && st.json && st.json.ok === true && dv.status === 200 && dv.json && dv.json.ok === true && Array.isArray(dv.json.devices) && nope.status === 404 && nope.json && nope.json.error === "unknown-route" && nope.json.route === "/nope", `${st.status} ${dv.status} ${nope.status} ${nope.json && nope.json.error}`);
    }
    // ---- 4. THE PAGE, in a real browser: against a server with no bridge at all, and against the real one (the server above is still up)
    console.log("\n4. THE PAGE");
    const { chromium, from: pwFrom } = resolvePlaywright(require), skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) { console.log("  SKIP  " + skip + "\n  ----  *** NOT A PASS. ***"); fails++; }
    else if (up) {
        const MIME = { ".js": "text/javascript", ".mjs": "text/javascript", ".html": "text/html", ".json": "application/json", ".wasm": "application/wasm" };
        const stat = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(String(q.url).split("?")[0])); if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end("no"); } r.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); r.end(fs.readFileSync(f)); });
        await new Promise((r) => stat.listen(0, "127.0.0.1", r));
        const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: [...webglLaunchArgs().args] });
        const page = async (base, scene) => { const pg = await (await browser.newContext()).newPage(); await pg.goto(`${base}/physics-lab.html#scene=${scene}`, { waitUntil: "load" }); return pg; };
        const text = (pg, id) => pg.evaluate((i) => document.getElementById(i).innerText, id).catch(() => "");
        const settle = (pg, re, id = "rhVerdict") => pg.waitForFunction(([i, src]) => new RegExp(src).test(document.getElementById(i).innerText), [id, re.source], { timeout: 30000 }).catch(() => {});
        const pStatic = await page(`http://127.0.0.1:${stat.address().port}`, "aquarium"); await settle(pStatic, /not reachable/); await pStatic.waitForTimeout(300);
        const sv = await text(pStatic, "rhVerdict"), sk = await text(pStatic, "rhKey"), sd = await pStatic.evaluate(() => document.getElementById("initiateBtn").disabled);
        ok("!! WITH NO BRIDGE AT ALL (a static server: the 404 on Keith's rig) THE PAGE SAYS SO AND SAYS WHY: the verdict reads 'bridge not reachable', the line under it names the HTTP 404 for /roundhouse/lab-scenes and tells the reader to restart the server, and the Initiate button is disabled", /not reachable/.test(sv) && /HTTP 404/.test(sk) && /lab-scenes/.test(sk) && /restart/i.test(sk) && sd === true, `${sv} | ${sk.slice(0, 90)} | disabled ${sd}`);
        const ctxN = await browser.newContext(); await ctxN.route("**/roundhouse/lab-scenes", (r) => r.abort()); const pNet = await ctxN.newPage(); await pNet.goto(`http://127.0.0.1:${stat.address().port}/physics-lab.html#scene=pile`, { waitUntil: "load" }); await settle(pNet, /not reachable/); await pNet.waitForTimeout(300);
        const nk = await text(pNet, "rhKey"), nd = await pNet.evaluate(() => document.getElementById("initiateBtn").disabled);
        ok("!! WHEN THE REQUEST NEVER ANSWERS (the connection refused or reset: here aborted in the browser) THE PAGE SAYS THAT TOO, DIFFERENTLY -- 'no SweK server answered at this address' and the port to look for -- and the button stays disabled", /no SweK server answered/.test(nk) && /8787/.test(nk) && !/HTTP/.test(nk) && nd === true, nk.slice(0, 120));
        const base = `http://127.0.0.1:${PORT}`, pPile = await page(base, "pile"); await settle(pPile, /registered/);
        const pv = await text(pPile, "rhVerdict"), pd0 = await pPile.evaluate(() => document.getElementById("initiateBtn").disabled);
        await pPile.click("#initiateBtn").catch(() => {}); await settle(pPile, /pile-friction/, "rhRun");
        const pr = await text(pPile, "rhRun");
        ok("!! AGAINST THE REAL SERVER A SCENE WITH A PROPOSER IS LIVE: the pile reads 'registered' with its knob, the Initiate button is enabled, and pressing it RUNS the proposer -- the pane names pile-friction, the candidates tried, and says PROPOSED, NOT APPLIED", /registered/.test(pv) && pd0 === false && /pile-friction/.test(pr) && /candidates/.test(pr) && /PROPOSED, NOT APPLIED/.test(pr), `${pv} | enabled ${!pd0} | ${pr.slice(0, 80).replace(/\s+/g, " ")}`);
        const pCen = await page(base, "centrifuge"); await settle(pCen, /registered/); await pCen.click("#initiateBtn").catch(() => {}); await settle(pCen, /cfg-spin/, "rhRun"); const cr = await text(pCen, "rhRun");
        ok("!! THE BUTTON RUNS THE SCENE THAT IS SELECTED: the centrifuge's press names its own proposer (cfg-spin), not the pile's", /cfg-spin/.test(cr) && !/pile-friction/.test(cr) && /PROPOSED, NOT APPLIED/.test(cr), cr.slice(0, 80).replace(/\s+/g, " "));
        const pAq = await page(base, "aquarium"); await settle(pAq, /refused|candidate/);
        const av = await text(pAq, "rhVerdict"), ak = await text(pAq, "rhKey"), ad = await pAq.evaluate(() => document.getElementById("initiateBtn").disabled);
        ok("!! A SCENE WITHOUT ONE IS REFUSED ON THE PAGE, WITH THE REASON WHERE A READER SEES IT: the aquarium (the scene Keith had open) reads 'refused' with its knob, the reason text is on the page, and the button is disabled by design rather than by a missing server", /refused/.test(av) && /tempK/.test(av) && ak.length > 20 && ad === true, `${av} | ${ak.slice(0, 70)}`);
        await browser.close(); stat.close();
    }
    srv.kill();
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
