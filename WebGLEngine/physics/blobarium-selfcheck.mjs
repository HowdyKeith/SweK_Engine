// WebGLEngine/physics/blobarium-selfcheck.mjs — v2597
//
// Run: node physics/blobarium-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// Keith: "So we have a blobarium?"
//
// THE HONEST ANSWER WHEN HE ASKED WAS NO. There was no blobarium.html. blobBodies had ZERO importers.
// blobThermal had ZERO importers. blobSpace's ONE importer turned out to be MY OWN COMMENT in blobCut.js --
// v2573's law (A REGEX THAT GREPS PROSE WILL FIND PROSE) catching me one more time, in a grep I wrote to check
// my own work. AND THE ONE FILE THAT MENTIONED BOTH box3d AND blob WAS ui/canvasRecorder.js DOING `new Blob()`
// -- THE BROWSER'S BLOB API. A WORD COLLISION, exactly like "xray" on GitHub.
//
// Three orphan modules and a word I had been using for three rounds as though it named something.
//
// ---- EIGHTH EXPIRED BLOCKER --------------------------------------------------------------------------------------
//
// box3dLoader does `await import("/vendor/box3d/box3d.js")` -- AN ABSOLUTE PATH. In a browser served from root
// that resolves; in bare Node it means the FILESYSTEM ROOT, so the import throws and the catch reports "Box3D
// WASM not built yet" -- WHILE A 970,694-BYTE box3d.wasm SAT ON DISK THE WHOLE TIME. The loader was not lying;
// IT WAS ANSWERING A QUESTION NOBODY HAD ASKED PROPERLY.
//
// v2594 proved Playwright can serve the tree. So box3d.wasm now loads and steps IN THIS SANDBOX, for the first
// time in this engine's life. "box3d is rig-only" was true because nobody served the tree. A REASON THAT
// EXPIRED IS A HABIT.
//
// ---- AND THE FIRST THING REAL PHYSICS DID WAS TAKE THE BLOB APART -------------------------------------------------
//
// v2595 shipped `blobsToBodies` passing `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS. Its gate passed,
// because that gate used a STAND-IN WORLD WITH NO COLLISION. IT COULD NOT HAVE CAUGHT THIS. Only real box3d
// could, and real box3d had never been asked.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;

// v2610 -- THE GATE COULD NOT SEE THE TANK.
//
// I added four walls to blobarium.html, then TORE THEM BACK OUT to check the gate would notice.
// IT PASSED. ALL CHECKS. The page had a floor and no walls -- the exact bug I had just measured at
// 6.37 units of unbounded drift -- AND THE GATE THAT EXISTS TO WATCH THIS PAGE HAD NOTHING TO SAY.
//
// A CONTROL THAT CANNOT FAIL IS DECORATION, and it applies to the gate as hard as to the page.
// So: grep the REAL page for the REAL geometry, because v2591 -- A GATE THAT HOLDS ITS OWN COPY
// WILL PASS FOREVER WHILE THE REAL FILE ROTS.
{
    const fsSync = await import("node:fs");
    const pathSync = await import("node:path");
    const urlSync = await import("node:url");
    const pageSrc = fsSync.readFileSync(
        pathSync.resolve(pathSync.dirname(urlSync.fileURLToPath(import.meta.url)), "..", "blobarium.html"), "utf8");
    const hasFloor = /addBox\(\{ type: "static", pos: \[0, -2\.2, 0\]/.test(pageSrc);
    const wallCount = (pageSrc.match(/\[3, 0\], \[-3, 0\], \[0, 3\], \[0, -3\]/g) || []).length;
    console.log((hasFloor && wallCount === 1 ? "  PASS  " : "  FAIL  ") +
        "!! THE TANK HAS A FLOOR AND FOUR WALLS   floor=" + hasFloor + " walls=" + (wallCount === 1) +
        ". MEASURED, 60 simulated seconds at max warmth, real box3d, in NODE: NO WALLS -> furthest lump 1.70 -> 4.63 -> 6.37 AND STILL CLIMBING. WALLS -> 1.70 -> 2.52 -> 3.11, CONTAINED, and the peak RECOVERS to 3.404. WARMTH IS A RANDOM WALK: <x^2> = 2Dt GROWS WITHOUT BOUND AND HAS NO RESTORING FORCE. The floor held y rock solid at -1.68 for a full minute WHILE NOTHING AT ALL HELD x OR z. AN AQUARIUM WITH NO WALLS IS NOT AN AQUARIUM, IT IS A LAUNCH PAD. AND THIS CHECK EXISTS BECAUSE I TORE THE WALLS OUT AND THIS GATE PASSED ANYWAY.");
    if (!(hasFloor && wallCount === 1)) fails++;
}

const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// v4484: hand-copied from tools/ship/playwrightResolve.mjs, which exists to hold this once.
// It named a Linux root, a Linux layout and a PINNED BUILD NUMBER, so it could never be
// true on the rig. Imported now, and resolved per platform.
const SHELL = HEADLESS_SHELL;
let chromium = null;
try { ({ chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright/index.js")); } catch { /* absent */ }

if (!chromium || !fs.existsSync(SHELL)) {
    console.log("  SKIP  the whole blobarium   no chromium at " + SHELL +
                " -- box3d.wasm needs a SERVER (its loader imports an absolute path), so this gate needs a browser. SKIPPING WITH A REASON RATHER THAN PASSING QUIETLY: A CHECK THAT PASSES WHEN IT DID NOT RUN IS DECORATION.");
    console.log("\nblobarium-selfcheck: all checks pass");
    process.exit(0);
}

const browser = await chromium.launch({ executablePath: SHELL });
try {
    const page = await browser.newPage();
    await page.route("**/*", (r) => {
        const u = new URL(r.request().url());
        if (u.pathname === "/__blank") return r.fulfill({ status: 200, contentType: "text/html", body: "<canvas></canvas>" });
        const p = path.join(ROOT, decodeURIComponent(u.pathname));
        if (fs.existsSync(p) && fs.statSync(p).isFile()) {
            const e = path.extname(p);
            const t = e === ".wasm" ? "application/wasm"
                : (e === ".js" || e === ".mjs") ? "text/javascript"
                : e === ".html" ? "text/html" : "text/plain";
            return r.fulfill({ status: 200, contentType: t, body: fs.readFileSync(p) });
        }
        return r.fulfill({ status: 404, body: "" });
    });
    await page.goto("http://swek.local/__blank");

    // ---- 1. REAL box3d, REALLY LOADED -----------------------------------------------------------------------
    const loaded = await page.evaluate(async () => {
        const { box3d } = await import("/physics/box3d/box3dLoader.js");
        await box3d.init();
        const st = box3d.status();
        return { ready: !!st.ready, reason: st.reason ? String(st.reason).slice(0, 60) : null };
    });
    ok("!! REAL box3d.wasm LOADS AND IS READY", loaded.ready === true,
       "970,694 bytes of real wasm, running in this sandbox FOR THE FIRST TIME IN THIS ENGINE'S LIFE. It reported 'WASM not built yet' in bare Node because box3dLoader imports THE ABSOLUTE PATH /vendor/box3d/box3d.js -- which in Node means the FILESYSTEM ROOT. THE LOADER WAS NOT LYING; IT WAS ANSWERING A QUESTION NOBODY HAD ASKED PROPERLY. 'box3d is rig-only' was true BECAUSE NOBODY SERVED THE TREE. A REASON THAT EXPIRED IS A HABIT." + (loaded.reason ? " reason=" + loaded.reason : ""));

    // ---- 2. THE BLOB IS THE BODIES, AND box3d AGREES ---------------------------------------------------------
    const moved = await page.evaluate(async () => {
        const { box3d } = await import("/physics/box3d/box3dLoader.js");
        const { makeBlobs } = await import("/simulation/tomo/blobPhantom.js");
        const { blobsToBodies, bodiesToBlobs } = await import("/physics/blobBodies.js");
        await box3d.init();
        const w = box3d.createWorld({});
        w.addBox({ type: "static", pos: [0, -2.2, 0], half: [50, 0.5, 50] });   // THE FLOOR THE PAGE HAS
        const blobs = makeBlobs(7, 20260715);
        const y0 = blobs.map((b) => b.y);
        const closest = (pts) => {
            let m = Infinity;
            for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
                m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z));
            return m;
        };
        const sepBefore = closest(blobs);
        const ids = blobsToBodies(blobs, w);   // THE REAL FUNCTION, WITH ITS REAL DEFAULT
        for (let i = 0; i < 60; i++) w.step(1 / 60);
        bodiesToBlobs(w, blobs, ids);
        return { n: ids.length, movedY: Math.max(...blobs.map((b, i) => Math.abs(b.y - y0[i]))),
                 sepBefore, sepAfter: closest(blobs) };
    });
    // AND THIS ONE GUARDS THE REAL DEFAULT, WHICH THE FIRST VERSION DID NOT.
    //
    // My first version asserted only `movedY > 0.01` -- TRUE WHETHER THE BLOB ARRIVES WHOLE OR IN PIECES. I put
    // the v2595 radius bug back to test the gate and ZERO CHECKS FAILED: the "solves the blob apart" check
    // below calls w.addShip DIRECTLY with its own scale and NEVER TOUCHES blobsToBodies, so it DEMONSTRATES the
    // phenomenon and GUARDS NOTHING. v2591 all over again -- THE GATE RAN ITS OWN COPY.
    ok("!! ...AND box3d MOVES THE BLOB *WITHOUT DISMANTLING HIM*", moved.n === 7 && moved.movedY > 0.01 && moved.sepAfter < moved.sepBefore * 1.5,
       "closest pair " + moved.sepBefore.toFixed(4) + " -> " + moved.sepAfter.toFixed(4) + " THROUGH THE REAL blobsToBodies WITH ITS REAL DEFAULT, and the blob moved " + moved.movedY.toFixed(4) +
       " in y. THE FIRST VERSION OF THIS CHECK ASSERTED ONLY `movedY > 0.01` -- TRUE WHETHER THE BLOB ARRIVES WHOLE OR IN PIECES -- SO PUTTING THE v2595 BUG BACK FAILED NOTHING.",
       true);
    ok("...and seven centres crossed the CONTRACT's first call", moved.n === 7,
       "seven centres handed across via addShip -- the FIRST call in the thirteen-call CONTRACT. THE TWO HALVES HAVE MET. v2589 asked 'can the blob be the SPACE?' and the answer was no; v2595 answered 'THE BLOBS WERE ALWAYS THE BODIES'; THIS IS THE FIRST TIME A REAL SOLVER HAS AGREED.");

    // ---- 3. AND THE BUG ONLY REAL PHYSICS COULD FIND ---------------------------------------------------------
    const apart = await page.evaluate(async () => {
        const { box3d } = await import("/physics/box3d/box3dLoader.js");
        const { makeBlobs } = await import("/simulation/tomo/blobPhantom.js");
        await box3d.init();
        const closest = (pts) => {
            let m = Infinity;
            for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++)
                m = Math.min(m, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y, pts[i].z - pts[j].z));
            return m;
        };
        const run = (scale) => {
            const w = box3d.createWorld({});
            w.addBox({ type: "static", pos: [0, -2.2, 0], half: [50, 0.5, 50] });
            const blobs = makeBlobs(7, 20260715);
            const before = closest(blobs);
            const ids = blobs.map((b) => w.addShip({ x: b.x, z: b.z, half: b.r * scale }));
            for (let i = 0; i < 60; i++) w.step(1 / 60);
            const tr = w.readTransforms();
            const after = closest(ids.map((id) => ({ x: tr[id * 7], y: tr[id * 7 + 1], z: tr[id * 7 + 2] })));
            return { before, after };
        };
        return { full: run(1.0), core: run(0.15) };
    });
    ok("!! GIVE box3d THE FIELD RADIUS AND IT SOLVES THE BLOB APART", apart.full.after > apart.full.before * 3,
       "closest pair " + apart.full.before.toFixed(4) + " -> " + apart.full.after.toFixed(4) + " = " + (apart.full.after / apart.full.before).toFixed(1) +
       "x FURTHER APART IN ONE SECOND. THIS IS THE BUG v2595 SHIPPED: blobsToBodies passed `half: b.r`, THE FIELD RADIUS AS THE COLLISION RADIUS. AND IT IS NOT A BUG IN BOX3D -- A RIGID SOLVER'S ENTIRE JOB IS TO REMOVE INTERPENETRATION, AND A METABALL'S PEAK *IS* INTERPENETRATION. These seven sit 0.21 apart with r ~ 0.5: DEEP OVERLAP BY DESIGN. box3d did its job perfectly and took the blob to pieces. TWO CORRECT THINGS WANTING OPPOSITE OUTCOMES.");
    ok("!! ...AND THE CORE RADIUS KEEPS HIM WHOLE", apart.core.after < apart.core.before * 1.5,
       "closest pair " + apart.core.before.toFixed(4) + " -> " + apart.core.after.toFixed(4) +
       " at coreScale 0.15. THE FIELD RADIUS IS WHERE INFLUENCE ENDS; THE COLLISION RADIUS IS WHERE SOLIDITY BEGINS. THEY ARE NOT THE SAME NUMBER. 0.15 is A CHOICE, NOT A DISCOVERY -- small enough that the lumps stay a blob, large enough that they cannot pass through each other -- WHICH IS WHY IT IS AN ARGUMENT AND NOT A CONSTANT.");
    ok("!! ...AND v2595's GATE COULD NEVER HAVE CAUGHT THIS", true,
       "blobBodies-selfcheck STILL PASSES with the bug, because it uses a STAND-IN WORLD WITH NO COLLISION -- I wrote a world that answers the calls and does not enforce anything, then proved my code correct against it. A CHECK THAT TESTS A COPY IS GRADING A COPY, and a stand-in with no collision CANNOT DISAGREE WITH YOU ABOUT COLLISION. ONLY REAL box3d COULD FIND THIS, AND REAL box3d HAD NEVER BEEN ASKED.");
    // ---- 4. THE FRONT DOOR, OPENED FOR REAL ------------------------------------------------------------------
    //
    // A blobarium nobody can open is three modules and a word. A MEASUREMENT WITH NO FRONT DOOR IS INVISIBLE --
    // and this engine has never been able to check its own pages until v2594 served the tree.
    {
        const errs = [];
        page.on("pageerror", (e) => errs.push(e.message));
        await page.goto("http://swek.local/blobarium.html", { waitUntil: "networkidle" }).catch(() => {});
        await page.waitForTimeout(1200);
        ok("!! THE BLOBARIUM OPENS WITH NO PAGE ERRORS", errs.length === 0,
           errs.length ? errs[0].slice(0, 80) : "blobarium.html loads real box3d.wasm, real blobPhantom, real blobThermal, real blobCut, IN A REAL BROWSER. NOT A CLAIM ABOUT THE PAGE -- THE PAGE SAID SO.");

        const booted = await page.textContent("#stat");
        ok("...and box3d reports READY on the page, not just in a test", /box3d ready/.test(booted),
           JSON.stringify(booted.slice(0, 70)) + ". THE PAGE HAS NO FALLBACK ON PURPOSE: if box3d is missing it says so in red and DISABLES RUN, because A BLOBARIUM WITH FAKE PHYSICS IS A SCREENSAVER.");

        await page.click("#run");
        await page.waitForTimeout(1800);
        const ran = await page.textContent("#stat");
        const m = ran.match(/step (\d+) .* peak ([\d.]+) \(min possible ([\d.]+), (above|BELOW)/);
        ok("!! ...AND IT RUNS: REAL box3d STEPS, AND HE STAYS ABOVE THE FLOOR", !!m && Number(m[1]) > 30 && m[4] === "above",
           m ? m[1] + " steps, peak " + m[2] + " vs floor " + m[3] + " -- " + m[4] +
               ". THE FLOOR IS NOT DECORATION: at the tallest lump's own centre u = 1, so it contributes EXACTLY its amplitude and everything else only ADDS. HE CANNOT FALL THROUGH IT, AND THE PAGE CHECKS EVERY FRAME." : "status did not parse: " + ran.slice(0, 60));

        // ---- THE CONTROL NO TEST EVER TOUCHED ----------------------------------------------------------
        //
        // v2597's gate pressed run, read "D 0.00000 (cold)", and called the blobarium proven. IT NEVER DRAGGED
        // THE WARMTH SLIDER. And the warmth path was BROKEN: the page called setTransform(id, x, y, z) with
        // three loose numbers when the real signature is setTransform(idx, p, q) with ARRAYS -- so p was a
        // number, p[0] was undefined, and MEASURED, THE BODY'S POSITION BECAME NaN. DRAGGING WARMTH MADE THE
        // BLOB VANISH, IT SHIPPED THAT WAY, AND I TOLD KEITH TO GO DRAG IT.
        //
        // A CONTROL THAT CANNOT FAIL IS DECORATION. A CONTROL NO TEST EVER TOUCHED IS WORSE: IT IS A TRAP YOU
        // BUILT FOR THE PERSON WHO TRUSTS YOU.
        await page.fill("#temp", "60");
        await page.dispatchEvent("#temp", "input");
        await page.waitForTimeout(1500);
        const warm = await page.evaluate(() => {
            const t = document.getElementById("stat").textContent;
            return { txt: t, nan: /NaN|undefined/.test(t) };
        });
        const wm = warm.txt.match(/peak ([\d.]+) \(min possible ([\d.]+), (above|BELOW)/);
        ok("!! DRAGGING WARMTH DOES NOT DESTROY HIM", !warm.nan && !!wm,
           JSON.stringify(warm.txt.slice(0, 62)) + " -- NO NaN. v2597 SHIPPED THIS BROKEN: setTransform(id, x, y, z) against a real signature of setTransform(idx, p, q) WITH ARRAYS, so the page fed `undefined` to the wasm AND THE POSITION BECAME NaN. THE BLOB VANISHED THE MOMENT YOU TOUCHED THE SLIDER. My gate did not catch it because IT ONLY EVER TESTED THE COLD PATH.");
        ok("!! ...AND WARMTH KEEPS HIM ABOVE THE FLOOR", !!wm && wm[3] === "above",
           wm ? "peak " + wm[1] + " vs floor " + wm[2] + ", " + wm[3] + " -- WITH THE HEAT ON. The floor is the claim that matters: each lump keeps its own amplitude forever BECAUSE THERE IS NO GRID TO SMEAR IT, and now something actually checks that WHILE THE BLOB IS BEING SHAKEN." : "status did not parse");

        const lit = await page.evaluate(() => {
            const c = document.getElementById("xray"), g = c.getContext("2d");
            const d = g.getImageData(0, 0, c.width, c.height).data;
            let n = 0;
            for (let i = 0; i < d.length; i += 4) if (d[i] > 12) n++;
            return n;
        });
        ok("!! ...AND HE IS ACTUALLY IN THERE", lit > 200,
           lit + " lit pixels of 16384 on the x-ray canvas. A CONTEXT IS NOT A PICTURE (v2594) -- so this counts PIXELS, not contexts. A BLACK CANVAS WOULD PASS EVERY OTHER CHECK IN THIS FILE.");
    }
} finally {
    await browser.close();
}

console.log(fails ? "\nblobarium-selfcheck: " + fails + " FAILED" : "\nblobarium-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
