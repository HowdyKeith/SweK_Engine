// WebGLEngine/simulation/carrySpawn-selfcheck.mjs — v4082
//
// Run: node simulation/carrySpawn-selfcheck.mjs   (pure sections instant; live section needs Chromium, skips
// cleanly without)
//
// Keith: "when we are looking at the SPAWN panel, if i select a KAIJU -> Sky, where is the 'Spawn' button to
// put the object on the page? Can we have a spawn to center of screen with the object hanging from the
// cursor? so i can move the mouse cursor somewhere on screen and place it? Can the hanging spawned object
// sway when i move it across the screen?"
//
// ui/assetSpawnPanel.js's existing workflow (arm an asset, click a voxel in SANDBOX to drop it there) had no
// dedicated Spawn button and nothing followed the cursor. simulation/carrySpawn.js is a SECOND placement path:
// spawn immediately at screen centre, then follow the cursor with a damped spring (the sway) until a left
// click drops it or a right click / Esc cancels it.
//
// PURE SECTIONS run against fake router/camera/canvas stand-ins (a plain object recording router.exec() calls,
// and Node's own built-in EventTarget as the fake canvas -- it really implements addEventListener/
// removeEventListener/dispatchEvent, so the class's real listener-wiring is exercised, not a mock of it).
"use strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("carrySpawn-selfcheck -- spawn-and-drag placement, with real sway physics\n");

const { CarrySpawn } = await import(pathToFileURL(path.join(HERE, "carrySpawn.js")).href);

// A fake camera looking down -Z from the origin (yaw=0 convention this tree's own comments use elsewhere),
// with a real getForwardVector() so the lean math has something non-degenerate to read.
function makeFakeCamera() {
    return {
        position: { x: 0, y: 10, z: 0 },
        getForwardVector() { return { x: 0, y: 0, z: -1 }; },
    };
}
// A minimal, deterministic ndcToWorldRay stand-in: NOT the real pickerCore.js function (that needs real FOV/
// aspect math this gate does not need to re-verify -- section 3 checks it is actually IMPORTED FROM there,
// so a real regression in that shared function still shows up as a wiring failure). This fake just turns NDC
// into a proportional world-space offset, which is exactly enough to prove the spring chases whatever target
// the ray produces.
function fakeNdcToWorldRay(camera, canvas, ndcX, ndcY) {
    return { origin: { x: camera.position.x, y: camera.position.y, z: camera.position.z }, dir: { x: ndcX, y: ndcY, z: -1 } };
}
function makeFakeRouter() {
    const calls = [];
    return {
        calls,
        _nextId: 1,
        exec(cmd) {
            calls.push(cmd);
            if (cmd.type === "entity:spawnMesh") return { ok: true, id: this._nextId++ };
            return { ok: true };
        },
    };
}

console.log("1. *** start() SPAWNS AT SCREEN CENTRE, NOT WHEREVER THE CURSOR HAPPENED TO BE LAST ***");
{
    const router = makeFakeRouter();
    const camera = makeFakeCamera();
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const cs = new CarrySpawn({ router, camera, canvas, ndcToWorldRay: fakeNdcToWorldRay });

    const started = cs.start({ assetId: "kaiju_sky", kind: "kaiju_sky", scale: 1.2, label: "Sky" });
    ok("!! start() returns true and spawns via entity:spawnMesh", started === true && router.calls.some((c) => c.type === "entity:spawnMesh"));
    const spawnCmd = router.calls.find((c) => c.type === "entity:spawnMesh");
    ok("!! *** the spawn point is directly along the camera's OWN forward vector -- screen centre, not (0,0,0) ***",
        Math.abs(spawnCmd.x - 0) < 1e-9 && Math.abs(spawnCmd.z - (-6)) < 1e-9,
        "spawned at (" + spawnCmd.x.toFixed(2) + ", " + spawnCmd.y.toFixed(2) + ", " + spawnCmd.z.toFixed(2) + ") -- 6 units along forward=(0,0,-1) from camera (0,10,0)");
    ok("isActive() is true immediately after a successful start()", cs.isActive() === true);
    cs.cancel();
}

console.log("\n2. *** THE SWAY IS A DAMPED SPRING TOWARD THE CURSOR, NOT A SNAP ***");
{
    const router = makeFakeRouter();
    const camera = makeFakeCamera();
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    const cs = new CarrySpawn({ router, camera, canvas, ndcToWorldRay: fakeNdcToWorldRay });
    cs.start({ assetId: "x", kind: "x", scale: 1 });
    const p0 = { ...cs.pos };

    // move the (fake) cursor hard to one side
    cs._ndcX = 1; cs._ndcY = 0;
    cs._tick(1 / 60);   // one frame
    const p1 = { ...cs.pos };
    const movedOneFrame = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    ok("!! *** one frame does NOT jump straight to the target -- that is the whole point of a spring ***",
        movedOneFrame > 0 && movedOneFrame < 0.5,
        "moved " + movedOneFrame.toFixed(4) + " of a full 1-unit NDC swing in one 60fps frame");

    for (let i = 0; i < 300; i++) cs._tick(1 / 60);   // 5 simulated seconds
    const settled = { ...cs.pos };
    const distToTarget = Math.hypot(settled.x - 1 * 0 /*origin.x*/, 0, 0);   // sanity placeholder, real check below
    const targetNow = fakeNdcToWorldRay(camera, canvas, cs._ndcX, cs._ndcY);
    const targetPoint = { x: camera.position.x + targetNow.dir.x * 6, y: camera.position.y + targetNow.dir.y * 6, z: camera.position.z + targetNow.dir.z * 6 };
    const remaining = Math.hypot(settled.x - targetPoint.x, settled.y - targetPoint.y, settled.z - targetPoint.z);
    ok("!! ...but it DOES converge on the target given enough time (this is a spring, not a drift)",
        remaining < 0.01, "remaining gap after 5s: " + remaining.toFixed(5));
    cs.cancel();
}

console.log("\n3. *** THE HANG POINT IS pickerCore.js's OWN ndcToWorldRay -- NOT A SECOND, POSSIBLY-DISAGREEING PROJECTION ***");
{
    const mainSrc = (await import("node:fs")).readFileSync(path.join(ROOT, "main.js"), "utf8");
    ok("!! main.js imports ndcToWorldRay from simulation/pickerCore.js -- the SAME function SandboxMode's own click-to-place raycast uses",
        /import\s*\{\s*ndcToWorldRay\s*\}\s*from\s*"\.\/simulation\/pickerCore\.js"/.test(mainSrc));
    ok("!! ...and passes it (not a re-derived copy) into CarrySpawn's constructor",
        /new CarrySpawn\(\{\s*router,\s*camera,\s*canvas,\s*ndcToWorldRay\s*\}\)/.test(mainSrc));
}

console.log("\n4. *** finalize() KEEPS THE ENTITY; cancel() DESPAWNS IT -- TWO DIFFERENT ENDINGS, MEASURED ***");
{
    const router = makeFakeRouter();
    const camera = makeFakeCamera();
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });

    const csFinalize = new CarrySpawn({ router, camera, canvas, ndcToWorldRay: fakeNdcToWorldRay });
    csFinalize.start({ assetId: "x", kind: "x", scale: 1 });
    const idF = csFinalize.entityId;
    csFinalize.finalize();
    ok("!! finalize() ends carry mode (isActive() false)", csFinalize.isActive() === false);
    ok("!! ...and NEVER calls entity:despawn for the finalized entity -- it stays where it was dropped",
        !router.calls.some((c) => c.type === "entity:despawn" && c.id === idF));

    const csCancel = new CarrySpawn({ router, camera, canvas, ndcToWorldRay: fakeNdcToWorldRay });
    csCancel.start({ assetId: "x", kind: "x", scale: 1 });
    const idC = csCancel.entityId;
    csCancel.cancel();
    ok("!! cancel() ends carry mode too", csCancel.isActive() === false);
    ok("!! *** ...but cancel() DOES call entity:despawn for exactly the entity it carried ***",
        router.calls.some((c) => c.type === "entity:despawn" && c.id === idC));
}

console.log("\n5. *** MOUSE EVENTS ARE WIRED FOR REAL, AND UN-WIRED ON END (NO LISTENER LEAK) ***");
{
    const router = makeFakeRouter();
    const camera = makeFakeCamera();
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000 });
    // use the REAL ndcToWorldRay import for this section, confirming the class's actual wiring (not the fake)
    const real = (await import(pathToFileURL(path.join(HERE, "pickerCore.js")).href)).ndcToWorldRay;
    const cs2 = new CarrySpawn({ router, camera, canvas, ndcToWorldRay: real });
    cs2.start({ assetId: "x", kind: "x", scale: 1 });

    let moved = false;
    // a mousemove dispatched on the fake canvas should update the tracked NDC via the class's own listener
    const before = { x: cs2._ndcX, y: cs2._ndcY };
    canvas.dispatchEvent(Object.assign(new Event("mousemove"), { clientX: 750, clientY: 250 }));
    ok("!! a real mousemove event updates the tracked cursor NDC", cs2._ndcX !== before.x || cs2._ndcY !== before.y,
        "ndc now (" + cs2._ndcX.toFixed(3) + ", " + cs2._ndcY.toFixed(3) + ")");

    // finalize should remove the listeners -- fire another mousemove and confirm NDC no longer updates
    cs2.finalize();
    const beforeAfterEnd = { x: cs2._ndcX, y: cs2._ndcY };
    canvas.dispatchEvent(Object.assign(new Event("mousemove"), { clientX: 10, clientY: 10 }));
    ok("!! ...and after finalize(), the listener is gone -- a further mousemove does nothing",
        cs2._ndcX === beforeAfterEnd.x && cs2._ndcY === beforeAfterEnd.y);
}

console.log("\n6. *** LIVE: THE ACTUAL SPAWN PANEL, IN A REAL BROWSER -- BUTTON, DRAG, DROP, AND CANCEL ***");
{
    const fs = await import("node:fs");
    const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live check SKIPPED -- " + skip);
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
            pg.on("pageerror", (e) => errs.push(String(e).slice(0, 300)));
            await pg.setViewportSize({ width: 1400, height: 900 });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/index.html", { waitUntil: "load", timeout: 60000 });
            await pg.waitForTimeout(6000);
            // dismiss the two first-run modals that would otherwise eat every mouse event
            await pg.evaluate(() => { document.getElementById("frFull")?.click(); });
            await pg.waitForTimeout(500);
            await pg.evaluate(() => { document.getElementById("swek-welcome")?.remove(); });

            await pg.evaluate(() => {
                const tabs = [...document.querySelectorAll(".dock-tab-right")];
                const t = tabs.find((el) => /^spawn$/i.test((el.textContent || "").trim()));
                t.click();
            });
            await pg.waitForTimeout(400);
            const armed = await pg.evaluate(() => {
                const row = [...document.querySelectorAll("div")].find((d) => (d.textContent || "").trim() === "Sky" && d.title && /assetId=kaiju_sky/.test(d.title));
                if (!row) return { ok: false };
                row.click();
                return { ok: true, armed: window._armedAsset };
            });
            ok("!! arming 'Sky' from the KAIJU category sets window._armedAsset", armed.ok && armed.armed?.assetId === "kaiju_sky", JSON.stringify(armed));

            const clicked = await pg.evaluate(() => {
                const btn = [...document.querySelectorAll("div")].find((d) => /Spawn \(drag to place\)/.test(d.textContent || "") && d.textContent.trim().startsWith("🎯"));
                if (!btn) return { ok: false };
                btn.click();
                return { ok: true };
            });
            await pg.waitForTimeout(300);
            const afterStart = await pg.evaluate(() => ({ active: window._carrySpawn?.isActive?.(), id: window._carrySpawn?.entityId, pos: window._carrySpawn?.pos }));
            ok("!! *** clicking the real 'Spawn (drag to place)' button spawns and enters carry mode ***",
                clicked.ok && afterStart.active === true && Number.isFinite(afterStart.id), JSON.stringify(afterStart));

            const canvasBox = await pg.evaluate(() => { const c = document.getElementById("glCanvas"); const r = c.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
            const before = { ...afterStart.pos };
            await pg.mouse.move(canvasBox.x + canvasBox.w * 0.25, canvasBox.y + canvasBox.h * 0.75, { steps: 5 });
            await pg.waitForTimeout(600);
            const after = await pg.evaluate(() => ({ ...window._carrySpawn.pos }));
            const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
            ok("!! *** moving the real mouse across the canvas actually moves the carried entity (the sway) ***",
                moved > 0.5, "moved " + moved.toFixed(3) + " world units");

            await pg.mouse.down({ button: "left" }); await pg.mouse.up({ button: "left" });
            await pg.waitForTimeout(200);
            const droppedId = await pg.evaluate(() => window._carrySpawn.entityId);
            const stillThere = await pg.evaluate((id) => { const ecs = window.router?.env?.ecs; return ecs ? ecs.entities.has(id) : null; }, droppedId);
            const stillActive = await pg.evaluate(() => window._carrySpawn.isActive());
            ok("!! *** left-click drops it: carry mode ends AND the entity remains in the world ***",
                stillActive === false && stillThere === true);

            // second cycle: arm a DIFFERENT asset (Sky is already armed and would just toggle off), spawn, cancel
            await pg.evaluate(() => {
                const row = [...document.querySelectorAll("div")].find((d) => (d.textContent || "").trim() === "Space" && d.title && /assetId=kaiju_space/.test(d.title));
                row.click();
            });
            await pg.evaluate(() => {
                const btn = [...document.querySelectorAll("div")].find((d) => /Spawn \(drag to place\)/.test(d.textContent || "") && d.textContent.trim().startsWith("🎯"));
                btn.click();
            });
            await pg.waitForTimeout(300);
            const secondId = await pg.evaluate(() => window._carrySpawn.entityId);
            await pg.mouse.move(canvasBox.x + canvasBox.w * 0.25, canvasBox.y + canvasBox.h * 0.75);
            await pg.mouse.down({ button: "right" }); await pg.mouse.up({ button: "right" });
            await pg.waitForTimeout(400);
            const cancelActive = await pg.evaluate(() => window._carrySpawn.isActive());
            const cancelGone = await pg.evaluate((id) => { const ecs = window.router?.env?.ecs; return ecs ? !ecs.entities.has(id) : null; }, secondId);
            ok("!! *** right-click cancels: carry mode ends AND the entity is despawned, not left behind ***",
                cancelActive === false && cancelGone === true);

            ok("...and none of this threw a page error", errs.length === 0, errs.length ? errs[0] : "clean");
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
