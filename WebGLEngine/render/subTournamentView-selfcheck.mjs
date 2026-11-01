// WebGLEngine/render/subTournamentView-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time). (~6 s with a browser; the arithmetic alone ~1 s)
//
// Run: node render/subTournamentView-selfcheck.mjs
//
// THE SUB TOURNAMENT PAGE (sub-tournament.html) AND ITS PURE HALF (render/subTournamentView.mjs):
//   1  THE ROSTER    from the files the repository ships: seven sides in a fixed order (the hand baseline, the same doctrine with the fruit fly network, the tuned and the search-ping champions, the tuned doctrine with the network, and the two leagues'
//                    last generations); a side whose file is missing is not offered (no weights: no network sides; nothing: the baseline alone); a malformed file does not throw
//   2  THE MATRIX    rows and columns in rating order, "W-D-L" from the row's side, the diagonal empty and "self", the mirror cell reading the other way round; a lead is green only if it is at least DECISIVE (0.05) AND MIN_Z standard errors
//                    (a precise zero is "even": hand against hand+net is 2-0-2 with a standard error of 0.0003 and must not be painted a loss)
//   3  THE REPLAY    frameAt finds the last frame at or before a clock (binary search over 5 frames a second), the first before the start, the last after the end, null for no trace; bounds enclose every boat and torpedo with a floor of 200 m;
//                    toScreen keeps the scale equal both ways, centres, and puts +y UP the screen
//   4  THE DRAWING   with a context that records its calls: a line and a nose dot per boat, a dot per running torpedo, a dead boat dimmed, the hit-point bars in proportion, the label text, and an empty frame says what to do
//   5  THE PAGE      (a browser; SKIPPED, and said, without one) it loads the seven sides, runs a three-side tournament on one geometry into a table with a row and a column per side and a rating bar each, measures the seat, and watches a duel onto a canvas
//
// SABOTAGE LOG -- TWENTY-FIVE, each applied in place, the gate run, the file restored; every one red by name (rows red):
//   render/subTournamentView.mjs: V1 no network side 3 | V2 no tuned side 6 | V3 a league's FIRST generation 1 | V4 the tuned+net side without weights 1 | V5 the matrix not in rating order 1 | V6 the record read from the wrong side 1 | V7 a lead painted without DECISIVE 2
//   V8 a lead painted without MIN_Z 1 | V9 the diagonal not empty 2 | V10 a clock past the end shows the first frame 1 | V11 the frame just AFTER the clock 1 | V12 an empty trace not null (a crash) | V13 no padding and no 200 m floor 1 | V14 +y not flipped 1
//   V15 the scale from the width alone 0 THE FIRST TIME (the test canvas was square: 1) | V16 a dead boat not dimmed 1 | V17 the hit-point bar full 1 | V18 no torpedoes 1 | V19 the empty text 1
//   sub-tournament.html: P1 the roster unticked 1 | P2 only the first pairs flown 1 | P3 the seat's worth not shown 1 | P4 the replay without a trace 1 | P6 a file name typo 5 | P7 the checkboxes disabled 0 THE FIRST TIME (the row now asks that none is disabled: 1)
"use strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as V from "./subTournamentView.mjs";
import * as T from "../brain/subTournament.mjs";
import * as D from "../brain/subDuel.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL, webglLaunchArgs } from "../tools/ship/playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const report = (l) => console.log("  ----  " + l);
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const rd = (f) => JSON.parse(fs.readFileSync(path.join(ENG, "brain", f), "utf8"));
const FILES = { weights: rd("pilotSubWeightsWip.json"), theta: rd("subTacticsThetaWip.json"), ping: rd("subTacticsThetaSearchPingWip.json"), league: rd("subTacticsLeagueWip.json") };
const rec = () => { const calls = []; return new Proxy({}, { get: (_, k) => (k === "calls" ? calls : (...a) => { calls.push([k, ...a]); }), set: (_, k, v) => { calls.push(["set:" + k, v]); return true; } }); };

console.log("subTournamentView-selfcheck -- the sub tournament page\n");

console.log("1. THE ROSTER");
{
    const all = V.roster(FILES);
    ok("!! seven sides, in a fixed order, each a real side (a fresh tactician per call, the 963-weight network where its id says +net)", all.map((s) => s.id).join() === "hand,hand+net,champ,champ+net,ping,league7001,league7000" && all.every((s) => typeof s.side.side === "function" && s.label && s.note) && all[1].side.weights.length === 963 && all[3].side.weights.length === 963 && all[0].side.weights === null && all[4].side.weights === null);
    ok("!! the league sides are the LAST generation of each league (generation 4 of five thetas: the one that had trained against the default and the three before it)", all[5].label.endsWith("generation 4") && JSON.stringify(all[5].side.theta) === JSON.stringify(T.makeSide("x", { theta: FILES.league.league7001.thetas[4] }).theta) && JSON.stringify(all[6].side.theta) === JSON.stringify(T.makeSide("y", { theta: FILES.league.league7000.thetas.at(-1) }).theta));
    ok("!! no weights file: no network sides (five remain); no files: the baseline alone; a malformed file does not throw and offers nothing it cannot build", V.roster({ ...FILES, weights: null }).map((s) => s.id).join() === "hand,champ,ping,league7001,league7000" && V.roster({}).map((s) => s.id).join() === "hand" && V.roster({ weights: { weights: "no" }, league: { league7001: { thetas: [] } } }).map((s) => s.id).join() === "hand" && V.roster().length === 1);
}

console.log("\n2. THE MATRIX");
{
    const sum = (wins, draws, losses, edge, z) => ({ winsX: wins, draws, winsY: losses, edge, z, se: 0.1, n: 4, fights: 8, floorX: 0, floorY: 0 });
    const result = { ids: ["a", "b", "c"], scenarios: 4, pairs: { "a|b": { summary: sum(7, 0, 1, 2.0, 5) }, "a|c": { summary: sum(4, 0, 4, 0.0001, 40) }, "b|c": { summary: sum(1, 1, 6, -1.0, -3) } } };
    const m = V.matrixModel(result), row = (id) => m.rows.find((r) => r.id === id), cell = (x, y) => row(x).cells.find((c) => c.id === y);
    ok("!! rows and columns are in RATING order (a beats b, b loses to c: a, then c, then b), the diagonal is empty and 'self'", m.order.join() === "a,c,b" && m.rows.map((r) => r.id).join() === "a,c,b" && row("a").cells.map((c) => c.id).join() === "a,c,b" && cell("a", "a").tone === "self" && cell("a", "a").text === "" && cell("c", "c").text === "");
    ok("!! a cell is the ROW's record against the column ('7-0-1' for a over b), the mirror cell reads the other way round (1-0-7), and a pair flown the other way round is flipped", cell("a", "b").text === "7-0-1" && cell("b", "a").text === "1-0-7" && cell("c", "b").text === "6-1-1" && cell("b", "c").text === "1-1-6" && near(cell("b", "a").edge, -2.0));
    ok("!! tones: a lead of 2.0 at z 5 is a WIN (green), its mirror a LOSS; 4-0-4 with an edge of 0.0001 at z 40 is EVEN (a precise zero, not a lead); -1.0 at z -3 for b over c is a loss", cell("a", "b").tone === "win" && cell("b", "a").tone === "loss" && cell("a", "c").tone === "even" && cell("c", "a").tone === "even" && cell("b", "c").tone === "loss" && cell("c", "b").tone === "win");
    ok("a lead of 1.0 at z 1.5 is EVEN (not decisive), and an edge just under 0.05 at z 9 is EVEN", (() => { const r2 = { ids: ["p", "q"], scenarios: 1, pairs: { "p|q": { summary: sum(1, 0, 0, 1.0, 1.5) } } }; const r3 = { ids: ["p", "q"], scenarios: 1, pairs: { "p|q": { summary: sum(1, 0, 0, 0.0499, 9) } } }; return V.matrixModel(r2).rows[0].cells[1].tone === "even" && V.matrixModel(r3).rows[0].cells[1].tone === "even"; })());
    ok("a rating comes with each row (the fit), and a missing pair reads '?'", typeof m.rows[0].rating === "number" && m.rows[0].rating > m.rows[2].rating && V.matrixModel({ ids: ["p", "q", "r"], scenarios: 1, pairs: { "p|q": { summary: sum(1, 0, 0, 1, 5) }, "q|r": { summary: sum(1, 0, 0, 1, 5) } } }).rows.some((r) => r.cells.some((c) => c.text === "?")));
}

console.log("\n3. THE REPLAY");
{
    const tr = Array.from({ length: 11 }, (_, i) => ({ tick: i * 6, boats: [{ id: 1, x: i * 10, y: -5 * i, depth: 20, heading: 0, pitch: 0, hp: 100, alive: true, ammo: 4 }, { id: 2, x: 300 - i * 10, y: 100, depth: 30, heading: Math.PI, pitch: 0, hp: 100, alive: true, ammo: 4 }], torps: i === 5 ? [{ id: 1, owner: 1, x: 50, y: -25, depth: 20 }] : [] }));
    ok("!! frameAt: the last frame at or before the clock (frames at 0, 6, 12 ... ticks, 0.2 s apart), the first for a negative or NaN clock, the last past the end, null for no trace or an empty one", V.frameAt(tr, 0).tick === 0 && V.frameAt(tr, 0.19).tick === 0 && V.frameAt(tr, 0.2).tick === 6 && V.frameAt(tr, 0.5).tick === 12 && V.frameAt(tr, 1.0).tick === 30 && V.frameAt(tr, 99).tick === 60 && V.frameAt(tr, -3).tick === 0 && V.frameAt(tr, NaN).tick === 0 && V.frameAt(null, 1) === null && V.frameAt([], 1) === null);
    const b = V.boundsOf(tr);
    ok("!! bounds enclose every boat and torpedo (x -> 0..300, y -> -50..100) with padding, and a trace of nothing gets a 200 m box", b.x0 < 0 && b.x1 > 300 && b.y0 < -50 && b.y1 > 100 && (() => { const e = V.boundsOf([]); return e.x1 - e.x0 === 200 && e.y1 - e.y0 === 200; })() && (() => { const tiny = V.boundsOf([{ tick: 0, boats: [{ x: 0, y: 0 }], torps: [] }]); return tiny.x1 - tiny.x0 >= 200 && tiny.y1 - tiny.y0 >= 200; })());
    const bb = { x0: 0, x1: 200, y0: 0, y1: 100 }, c = V.toScreen(bb, 100, 50, 400, 400), lo = V.toScreen(bb, 0, 0, 400, 400), hi = V.toScreen(bb, 200, 100, 400, 400);
    const wide = V.toScreen(bb, 200, 100, 600, 200);
    ok("!! toScreen on a WIDE canvas (600 x 200 for 200 m x 100 m) is limited by the height: 2 px a metre, centred across (the right edge at x 500, not 600)", near(wide[0], 500) && near(wide[1], 0), JSON.stringify(wide));
    ok("!! toScreen: the centre of the bounds is the centre of the canvas, the scale is EQUAL both ways (200 m x 100 m into 400 x 400 is 2 px a metre: 400 x 200 px, centred, 100 px above and below), and +y is UP the screen", near(c[0], 200) && near(c[1], 200) && near(lo[0], 0) && near(lo[1], 300) && near(hi[0], 400) && near(hi[1], 100), JSON.stringify([c, lo, hi]));
}

console.log("\n4. THE DRAWING");
{
    const frame = { tick: 0, boats: [{ id: 1, x: 0, y: 0, depth: 22, heading: 0, pitch: 0, hp: 50, alive: true, ammo: 3 }, { id: 2, x: 100, y: 0, depth: 30, heading: Math.PI, pitch: 0, hp: 0, alive: false, ammo: 0 }], torps: [{ id: 1, owner: 1, x: 30, y: 10, depth: 20 }, { id: 2, owner: 1, x: 40, y: 12, depth: 20 }] };
    const g = rec(), r = V.drawReplay(g, 400, 300, frame, { x0: -50, x1: 150, y0: -50, y1: 50 }, { names: ["alpha", "beta"] }), c = g.calls;
    ok("!! two boats and two torpedoes drawn: a line per boat (moveTo/lineTo) with a nose dot, an arc per torpedo plus one per boat nose (4 arcs), and the labels name the sides with hit points, depth and torpedoes", r.boats === 2 && r.torps === 2 && c.filter((x) => x[0] === "lineTo").length === 2 && c.filter((x) => x[0] === "arc").length === 4 && c.some((x) => x[0] === "fillText" && /alpha +50 hp +22 m +3 torp/.test(x[1])) && c.some((x) => x[0] === "fillText" && /beta +0 hp +30 m +0 torp/.test(x[1])));
    ok("!! a dead boat is dimmed (globalAlpha 0.3 for it, 1 for the living) and the hit-point bars are in proportion (50 hp is half the 160 px bar, 0 hp none)", c.filter((x) => x[0] === "set:globalAlpha").map((x) => x[1]).join() === "1,1,0.3,1" && (() => { const bars = c.filter((x) => x[0] === "fillRect" && x[4] === 10); return bars.length === 4 && near(bars[1][3], 80) && near(bars[3][3], 0) && near(bars[0][3], 160); })(), c.filter((x) => x[0] === "set:globalAlpha").map((x) => x[1]).join());
    const e = rec(), re = V.drawReplay(e, 400, 300, null, { x0: 0, x1: 1, y0: 0, y1: 1 });
    ok("!! an empty frame draws no boat and says what to do", re.boats === 0 && re.torps === 0 && e.calls.some((x) => x[0] === "fillText" && /pick two sides/.test(x[1])));
}

console.log("\n5. THE PAGE");
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    const pageSrc = fs.readFileSync(path.join(ENG, "sub-tournament.html"), "utf8");
    ok("!! the page imports the tournament, the duel and the view, fetches the four files the roster needs from /brain/, and puts nothing from them in the page as markup (textContent only)", /from "\/brain\/subTournament\.mjs"/.test(pageSrc) && /from "\/brain\/subDuel\.mjs"/.test(pageSrc) && /from "\/render\/subTournamentView\.mjs"/.test(pageSrc) && ["pilotSubWeightsWip", "subTacticsThetaWip", "subTacticsThetaSearchPingWip", "subTacticsLeagueWip"].every((f) => pageSrc.includes(`/brain/${f}.json`)) && !/innerHTML/.test(pageSrc));
    if (skip) { report("live half SKIPPED -- " + skip); report("*** THAT IS A SKIP AND NOT A PASS: sections 1-4 are arithmetic; only a page shows the buttons wired"); }
    else {
        const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json" };
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent(req.url.split("?")[0]), fp = path.join(ENG, u);
            if (fp.startsWith(ENG) && fs.existsSync(fp) && fs.statSync(fp).isFile()) { res.writeHead(200, { "Content-Type": types[path.extname(fp)] || "text/plain" }); return res.end(fs.readFileSync(fp)); }
            res.writeHead(404); res.end("not found");
        });
        await new Promise((r) => server.listen(0, "127.0.0.1", r));
        const br = await chromium.launch({ executablePath: HEADLESS_SHELL, args: webglLaunchArgs().args });
        try {
            const pg = await (await br.newContext()).newPage(); const errs = [];
            pg.on("pageerror", (e) => errs.push(String(e.message))); pg.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
            await pg.goto("http://127.0.0.1:" + server.address().port + "/sub-tournament.html", { waitUntil: "load" });
            await pg.waitForFunction(() => document.querySelectorAll("#roster input").length === 7, null, { timeout: 8000 }).catch(() => {});
            const n = await pg.$$eval("#roster input", (e) => e.length), opts = await pg.$$eval("#selA option", (e) => e.length);
            ok("!! the page loads the seven sides into the roster (all ticked) and into both pickers", n === 7 && opts === 7 && (await pg.$$eval("#roster input", (e) => e.every((x) => x.checked && !x.disabled))));
            await pg.evaluate(() => { for (const i of document.querySelectorAll("#roster input")) i.checked = ["hand", "champ", "league7001"].includes(i.dataset.id); document.getElementById("nGeo").value = 1; });
            await pg.click("#runBtn"); await pg.waitForFunction(() => document.querySelectorAll("#matrix tr").length === 4, null, { timeout: 30000 }).catch(() => {});
            const tab = await pg.evaluate(() => ({ rows: document.querySelectorAll("#matrix tr").length, cols: document.querySelectorAll("#matrix tr:first-child th").length, bars: document.querySelectorAll("#ratings .b").length, texts: [...document.querySelectorAll("#matrix td:not(.name)")].map((t) => t.textContent), self: document.querySelectorAll("#matrix td.self").length, msg: document.getElementById("msg").textContent, note: document.getElementById("matrixNote").textContent }));
            ok("!! a three-side tournament on one geometry fills the table (a header and three rows, a column per side and a name column), draws a rating bar per side, shows a record like 1-0-1 in every cell off the diagonal, and says what it flew (3 pairs, 6 duels)", tab.rows === 4 && tab.cols === 4 && tab.bars === 3 && tab.self === 3 && tab.texts.filter((t) => /^\d+-\d+-\d+$/.test(t)).length === 6 && /3 pairs, 6 duels/.test(tab.msg) && /tactician and a pilot together/.test(tab.note), JSON.stringify(tab.texts) + " | " + tab.msg);
            await pg.click("#seatBtn"); await pg.waitForFunction(() => /seat A is worth/.test(document.getElementById("msg").textContent), null, { timeout: 30000 }).catch(() => {});
            const seat = await pg.$eval("#msg", (e) => e.textContent);
            ok("!! 'Measure the seat' reports a number for each ticked side (the default tactician's is large and positive)", /seat A is worth/.test(seat) && /hand \+[3-9]\.\d\d/.test(seat) && /champ [+-]\d/.test(seat) && /league7001 [+-]\d/.test(seat), seat);
            const ink = () => pg.evaluate(() => { const c = document.getElementById("replay"), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let k = 0; for (let i = 0; i < d.length; i += 4) if (d[i] > 60 || d[i + 1] > 60 || d[i + 2] > 80) k++; return k; });
            const before = await ink(); await pg.click("#watchBtn"); await pg.waitForFunction(() => /seat A\) v/.test(document.getElementById("watchMsg").textContent), null, { timeout: 15000 }).catch(() => {}); await pg.waitForTimeout(600);
            const after = await ink(), wm = await pg.$eval("#watchMsg", (e) => e.textContent);
            ok("!! 'Watch' flies the chosen duel and draws it: the message names the sides, the winner and the hit points, and the canvas holds more drawn pixels than the empty one (" + before + " -> " + after + ")", /v .*:/.test(wm) && /hit points \d+ \/ \d+/.test(wm) && after > before + 200, wm);
            ok("  no page or console error", errs.length === 0, errs.join(" | ").slice(0, 200));
        } finally { await br.close(); server.close(); }
    }
}

console.log(`\nsubTournamentView-selfcheck: ${fails === 0 ? "all passed" : fails + " FAILED"}`);
process.exit(fails === 0 ? 0 : 1);
