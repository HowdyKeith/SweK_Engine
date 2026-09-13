// WebGLEngine/tools/ship/carViews-selfcheck.mjs -- v4589 (task 78): a view window per car on race-brain.html
//
// Run: node tools/ship/carViews-selfcheck.mjs
//
// render/carViews.mjs held headless -- the first-person and turret cameras as pure functions of the pose (a point ahead projects
// to the window's centre; a point behind is null; the sight turns with the turret), the view cycle, the policies' activations
// through the kernel's twin equal to forward(), the brain rows and the bars they draw -- and then race-brain.html in the harness:
// one window per car, a click cycling its view with its label saying so, a first-person window carrying the scene's pixels
// (read back from a render target and put into the 2D canvas) and a brain window carrying bars. Over the ship-time budget, as
// every page-boot gate of the racing line is.
//
// SABOTAGE LOG -- v4589, each applied to the file named, the gate run (two harness boots), the file restored.
//   A  render/carViews.mjs: the first-person camera looking backward           -> 3 red: the ahead point, the behind point, the yaw.
//   B  render/carViews.mjs: the sight along the chassis forward, not the barrel -> 1 red: the point along the barrel.
//   C  render/carViews.mjs: the activations without the output tanh            -> 2 red: both policies' outputs.
//   D  render/carViews.mjs: the view cycle stuck on first-person               -> 3 red: the cycle, the click on both boots.
//   E  race-brain.html: the page never refreshing its windows                  -> 3 red: the scene, the bars, the WebGPU boot.
//   FINDING, measured while writing this gate: on this harness a PRESENTED WebGPU canvas device is LOST at its first frame
//   (device.lost: "A valid external Instance reference no longer exists"; every mapAsync after it fails), while an offscreen
//   device reads back indefinitely and a presented WebGL2 canvas keeps reading targets back under a running loop. So the
//   windows' pixels are held on ?webgl=1 here and the WebGPU boot on what survives the loss; and the page caps its readback
//   failures at three, says so in the labels, and keeps the brain windows live -- the first draft stopped refreshing them too.
//   AND ONE MORE, found by the round's sweep: the first draft wrote that failure message into the gunner's HUD line (#gun),
//   which tools/ship/raceTurret-selfcheck.mjs reads for "hand gunner" -- the new page code turned the older gate red. The
//   windows have their own line now (#viewsNote), and this gate reads that one.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import * as CV from "../../render/carViews.mjs";
import * as G from "../../render/gpuDriven.mjs";
import * as D from "../../brain/drivePolicy.mjs";
import * as GP from "../../brain/gunnerPolicy.mjs";
import * as U from "../../physics/turret.mjs";
import { yawQuat } from "../../physics/raceCar.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (label, cond, detail) => { if (!cond) fails++; console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? "   " + detail : ""}`); };
const report = (s) => console.log(`  ----  ${s}`);
const sec = (s) => console.log("\n" + s);
const near = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const W = CV.VIEW_DRAW.width, H = CV.VIEW_DRAW.height, aspect = W / H;
console.log("carViews-selfcheck -- a view window per car: the cameras, the cycle, the brain rows, the page");

sec("1. THE CAMERAS ARE PURE FUNCTIONS OF THE POSE");
{
    const pose = { pos: [0, 1, 0], quat: [0, 0, 0, 1], yaw: 0, vel: [0, 0, 0] }, fp = CV.firstPersonCamera(pose, G, { aspect });
    const seat = CV.VIEW_DRAW.seat, aheadPt = [seat[0], 1 + seat[1], seat[2] + CV.VIEW_DRAW.ahead], px = CV.projectTo(fp.viewProj, aheadPt, W, H);
    ok("!! the first-person eye is the driver's seat and a point `ahead` metres along the chassis forward projects to the window's centre", fp.eye.every((c, i) => near(c, pose.pos[i] + seat[i])) && px && near(px[0], W / 2, 1e-6) && near(px[1], H / 2, 1e-6), `eye ${fp.eye.map((c) => c.toFixed(2))}, ahead -> ${px && px.map((c) => c.toFixed(2))}`);
    ok("a point behind the driver is null (w <= 0), not a pixel", CV.projectTo(fp.viewProj, [0, 1, -5], W, H) === null);
    const yawed = { pos: [3, 1, 5], quat: yawQuat(Math.PI / 2), yaw: Math.PI / 2, vel: [0, 0, 0] }, fy = CV.firstPersonCamera(yawed, G, { aspect });
    ok("...and the camera turns with the chassis: yawed +pi/2 it looks along +x", near(fy.forward[0], 1, 1e-9) && near(fy.forward[2], 0, 1e-9) && near(fy.centre[0], fy.eye[0] + CV.VIEW_DRAW.ahead, 1e-9));
    const t = U.createTurret(); t.yaw = 0.5; t.pitch = 0.2; const tc = CV.turretCamera(pose, t, G, { aspect }), mz = U.muzzle(pose, t);
    const along = CV.projectTo(tc.viewProj, tc.eye.map((c, i) => c + mz.dir[i] * 30), W, H);
    const same = (a, b) => a.every((c, i) => near(c, b[i], 1e-12));
    ok("!! the turret sight looks along the barrel: a point 30 m along the muzzle direction from the eye is the centre, and the eye sits just above and behind the pivot", along && near(along[0], W / 2, 1e-3) && near(along[1], H / 2, 1e-3) && same(tc.forward, mz.dir) && tc.eye[1] > mz.pivot[1], `-> ${along && along.map((c) => c.toFixed(2))}`);
    const t0 = U.createTurret(), c0 = CV.turretCamera(pose, t0, G, { aspect }), c1 = CV.turretCamera(pose, t, G, { aspect });
    ok("...and it turns with the turret: yaw 0.5 and yaw 0 look different ways", !near(c0.forward[0], c1.forward[0], 1e-3));
    ok("cameraFor maps the two 3D views and says null for the brain", CV.cameraFor("first-person", pose, t, G, { aspect }).eye[1] === fp.eye[1] && same(CV.cameraFor("turret", pose, t, G, { aspect }).forward, mz.dir) && CV.cameraFor("brain", pose, t, G, { aspect }) === null);
    ok("the view cycle: first-person -> turret -> brain -> first-person", CV.nextView("first-person") === "turret" && CV.nextView("turret") === "brain" && CV.nextView("brain") === "first-person" && CV.VIEWS.length === 3);
}
sec("2. THE BRAIN VIEW IS THE POLICIES' ACTIVATIONS THROUGH THE KERNEL'S TWIN");
{
    const w = D.handWeights(), x = [1, 0.3, -0.2, 0.1, -0.4, 0.2, 0.5, -0.1, 0], a = CV.activationsOf(D, w, x), f = D.forward(w, x);
    ok("!! the driver's activations end in exactly forward()'s outputs, with 8 hidden values between", a.hidden.length === 8 && a.output.length === 2 && near(a.output[0], f[0]) && near(a.output[1], f[1]), `${Array.from(a.output).map((v) => v.toFixed(4))} vs ${f.map((v) => v.toFixed(4))}`);
    const gw = GP.handWeights(), gx = [1, 0.02, 0, 0.5, 0, 0, 0, 1, 1], ga = CV.activationsOf(GP, gw, gx), gf = GP.forward(gw, gx);
    ok("...and the gunner's likewise, three outputs", ga.output.length === 3 && ga.output.every((v, i) => near(v, gf[i])));
    const rows = CV.brainRows({ driver: { act: a, names: D.FEATURE_NAMES }, gunner: { act: ga, names: GP.FEATURE_NAMES } });
    ok("six rows: features, hidden, outputs for each policy, with their names", rows.length === 6 && rows.map((r) => r.values.length).join() === "9,8,2,9,8,3" && rows[0].names === D.FEATURE_NAMES && rows[5].names.join() === "yaw,pitch,fire");
    const calls = []; const ctx = { fillStyle: "", font: "", fillRect: (...q) => calls.push(q), fillText: () => {} };
    const bars = CV.drawBrainPanel(ctx, W, H, rows, { title: "t" });
    ok("!! the panel draws one bar per value (39) plus the background, inside the window", bars === 39 && calls.length === 40 && calls.slice(1).every((q) => q[0] >= 0 && q[0] + q[2] <= W && q[1] >= 0 && q[1] + q[3] <= H + 1));
    ok("the label says which view and what it costs", /first-person/.test(CV.windowLabel(0, "hand", "first-person")) && /read back every/.test(CV.windowLabel(0, "hand", "first-person")) && /activations/.test(CV.windowLabel(1, "zero", "brain")));
}
sec("3. THE PAGE: ONE WINDOW PER CAR, A CLICK CYCLES IT, THE PIXELS ARE THERE");
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***"); fails++; }
    else {
        // *** THE PAGE IS BOOTED ON ?webgl=1 HERE, AND THE REASON IS MEASURED. *** On this harness (headless Chromium, software
        // WebGPU) a PRESENTED canvas device is LOST at its first frame -- device.lost reads "A valid external Instance reference
        // no longer exists" and every mapAsync after it fails -- while an offscreen device reads back for as long as you like,
        // which is why every device gate uses offscreen: true. A page's main canvas cannot be offscreen, so the windows' readback
        // is verified on the WebGL2 backend here (a presented WebGL2 canvas keeps reading targets back while its loop runs,
        // probed), and the WebGPU boot below is held to what survives the loss: the windows exist, the labels, the click cycle.
        const boot = (query) => runInEngineOrigin({ engineRoot: ENG, timeoutMs: 300000, args: { query }, script: `async (a) => {
            globalThis.__swekStep = "booting race-brain.html" + a.query + " in an iframe";
            const f = document.createElement("iframe"); f.style.width = "1100px"; f.style.height = "760px"; f.src = "/race-brain.html" + a.query; document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const doc = f.contentDocument, txt = (id) => (doc.getElementById(id) || {}).textContent || "";
            const t1 = performance.now(); while (performance.now() - t1 < 150000 && !/a turret on each/.test(txt("tick")) && !/threw|HTTP/.test(txt("be") + txt("tick"))) { globalThis.__swekStep = "waiting: " + txt("tick").slice(0, 60); await new Promise((res) => setTimeout(res, 250)); }
            const booted = /a turret on each/.test(txt("tick"));
            const wait = (ms) => new Promise((res) => setTimeout(res, ms));
            globalThis.__swekStep = "booted, letting the windows refresh"; await wait(4000);
            const wins = [...doc.querySelectorAll("canvas.carView")], labels = [...doc.querySelectorAll(".carWin .viewLabel")].map((l) => l.textContent);
            // lit: a pixel brighter than the window's clear colour (max channel 20) by a margin -- the road, the buildings, the bars
            const lit = (cv) => { const c = cv.getContext("2d"), d = c.getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.max(d[i], d[i + 1], d[i + 2]) > 60) n++; return n / (d.length / 4); };
            const firstPerson = wins.length ? lit(wins[0]) : 0;
            let turretLabel = "", brainLabel = "", brainLit = 0;
            if (wins.length) {
                wins[0].click(); turretLabel = doc.querySelectorAll(".carWin .viewLabel")[0].textContent;
                wins[0].click(); brainLabel = doc.querySelectorAll(".carWin .viewLabel")[0].textContent;
                globalThis.__swekStep = "brain view, waiting for a refresh"; await wait(2500); brainLit = lit(wins[0]);
            }
            return { booted, windows: wins.length, labels, firstPerson, turretLabel, brainLabel, brainLit, gun: txt("viewsNote").slice(0, 200) || txt("gun").slice(0, 200), be: txt("be").slice(0, 160) };
        }` });
        const pg = await boot("?webgl=1");
        ok("the harness booted race-brain.html on WebGL2", pg.ok && pg.result && pg.result.booted, pg.ok ? (pg.result ? pg.result.be : "") : String(pg.reason || JSON.stringify(pg)).slice(0, 300));
        if (pg.ok && pg.result) {
            const p = pg.result;
            report(`${p.windows} windows; first-person lit ${(p.firstPerson * 100).toFixed(1)} %; brain lit ${(p.brainLit * 100).toFixed(1)} %; ${p.gun.slice(0, 80)}`);
            ok("!! one window per car, each labelled first-person to start", p.windows === 4 && p.labels.length === 4 && p.labels.every((l) => /first-person/.test(l)), p.labels.join(" | ").slice(0, 200));
            ok("!! the first-person window carries the scene: read back from its render target into the 2D canvas, at least a tenth of it lit", p.firstPerson > 0.1 && !/view windows off/.test(p.gun), `${(p.firstPerson * 100).toFixed(1)} % lit`);
            ok("!! a click cycles the window's view and its label says so: turret, then brain", /turret/.test(p.turretLabel) && /brain/.test(p.brainLabel), `${p.turretLabel.slice(0, 60)} -> ${p.brainLabel.slice(0, 60)}`);
            ok("...and the brain window carries the bars", p.brainLit > 0.01, `${(p.brainLit * 100).toFixed(1)} % lit`);
        }
        const pw = await boot("");
        ok("...and on the WebGPU boot the windows, the labels and the click cycle are there whatever the harness does to a presented device", pw.ok && pw.result && pw.result.booted && pw.result.windows === 4 && /turret/.test(pw.result.turretLabel) && /brain/.test(pw.result.brainLabel) && pw.result.brainLit > 0.01, pw.ok && pw.result ? `${pw.result.be.slice(0, 40)}; brain lit ${(pw.result.brainLit * 100).toFixed(1)} %; ${pw.result.gun.slice(0, 110)}` : String(pw.reason || "").slice(0, 200));
        if (pw.ok && pw.result) report(`WebGPU boot, first-person window lit ${(pw.result.firstPerson * 100).toFixed(1)} % -- ${/view windows off/.test(pw.result.gun) ? "the presented device was lost on this harness, as measured; the label says so" : "the presented device survived here"}`);
    }
}
console.log(fails ? `\ncarViews-selfcheck: ${fails} FAILED` : "\ncarViews-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
