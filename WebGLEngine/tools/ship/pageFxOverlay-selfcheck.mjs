// WebGLEngine/tools/ship/pageFxOverlay-selfcheck.mjs -- v4434
//
// Run: node tools/ship/pageFxOverlay-selfcheck.mjs
//
// The first gate ui/pageFxOverlay.js has ever had. It was named as ungated at v4424 and stayed that way for
// ten rounds; the first thing driving it produced was a listener leak.
//
// *** SECTION 1 COUNTS THE REGISTRATION SET, AND THREE EARLIER INSTRUMENTS MEASURED THEMSELVES INSTEAD. ***
//   (1) counting calls to removeEventListener said the listener had gone -- but removeEventListener(t,
//       undefined) is a silent no-op, so the call count and the effect are different numbers;
//   (2) dispatching a probe event through a WRAPPED addEventListener registered a wrapper the probe's own
//       removeEventListener could not match, so the reading counted leaked probes and went 1, 2, 3, 4 for
//       cumulative loads of 1, 3, 6, 11;
//   (3) injecting window's originals into globalThis BEFORE wrapping left the overlay -- which calls the BARE
//       global addEventListener -- using the unwrapped pair, and every reading came back 0.
// Keeping the set of (type, handler) pairs is what finally measured the thing itself.
"use strict";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// *** A MISSING DEV DEPENDENCY MUST SKIP RATHER THAN THROW, AND THIS IMPORT THREW. *** Repaired at v4435.
// tools/ship/placementRender-selfcheck.mjs states the tree's convention in its own header -- jsdom is not
// vendored, it is `npm i jsdom --no-save`, and a static import makes the shipped tree CRASH WITH A STACK
// TRACE instead of saying what is missing, which reads as a broken gate rather than an absent tool. This
// gate imported it statically and so exited 1 with ZERO FAIL LINES on any box without it. A SKIP NAMES WHAT
// IS MISSING; A CRASH DOES NOT -- and per v4402, a skip must SAY SO rather than pass quietly.
let JSDOM = null;
try { ({ JSDOM } = await import("jsdom")); } catch { /* named below, not swallowed */ }

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

if (!JSDOM) {
    console.log("  SKIP  jsdom is not installed, so ui/pageFxOverlay.js cannot be mounted here.");
    console.log("        Install it with:  npm install jsdom --no-save");
    console.log("        *** THIS IS A SKIP AND NOT A PASS. Nothing below ran, and the listener-leak check");
    console.log("        this gate exists for is UNANSWERED on this box rather than answered green. ***");
    console.log("\npageFxOverlay-selfcheck: SKIPPED -- jsdom absent, 0 checks run");
    process.exit(0);
}
const say = (m) => console.log("  ----  " + m);

/* ---------------------------------------------------------------------------------------------------------
 * A DOM just real enough to drive the overlay, and a registration set to watch it with.
 * ------------------------------------------------------------------------------------------------------ */
function harness() {
    const dom = new JSDOM("<!doctype html><body></body>", { url: "https://x/", pretendToBeVisual: true });
    const { window } = dom;
    const ctx = (c) => ({
        canvas: c, globalAlpha: 1, fillStyle: "#000",
        drawImage() {}, fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
        createRadialGradient: () => ({ addColorStop() {} }),
        getImageData(x, y, w, h) {
            const d = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < w * h; i++) { d[i * 4] = 140; d[i * 4 + 1] = 190; d[i * 4 + 2] = 230; d[i * 4 + 3] = 255; }
            return { data: d, width: w, height: h };
        },
    });
    window.HTMLCanvasElement.prototype.getContext = function (k) { return k === "2d" ? ctx(this) : null; };
    window.HTMLCanvasElement.prototype.toDataURL = () => "data:,";
    window.requestAnimationFrame = () => 1;
    window.cancelAnimationFrame = () => {};

    const live = new Map();
    const add = window.addEventListener.bind(window), rem = window.removeEventListener.bind(window);
    window.addEventListener = (t, f, o) => { if (!live.has(t)) live.set(t, new Set()); live.get(t).add(f); return add(t, f, o); };
    window.removeEventListener = (t, f, o) => { if (live.has(t)) live.get(t).delete(f); return rem(t, f, o); };

    // *** AFTER the wrap, never before -- see (3) in the header. ***
    for (const k of ["document", "HTMLCanvasElement", "Image", "devicePixelRatio", "innerWidth", "innerHeight",
                     "requestAnimationFrame", "cancelAnimationFrame", "addEventListener", "removeEventListener",
                     "Node", "Element", "HTMLElement", "getComputedStyle"]) {
        try { Object.defineProperty(globalThis, k, { value: window[k], configurable: true, writable: true }); } catch (e) {}
    }
    globalThis.window = window;
    const img = new window.Image();
    Object.defineProperty(img, "naturalWidth", { value: 240 });
    Object.defineProperty(img, "naturalHeight", { value: 320 });
    const stillLive = () => [...live.entries()].map(([t, s]) => [t, s.size]).filter(([, n]) => n > 0);
    return { window, img, stillLive, types: () => [...live.keys()] };
}

const H = harness();
const M = await import(path.join(ENG, "ui", "pageFxOverlay.js"));

// ---- 1. *** EVERY WINDOW LISTENER THE OVERLAY REGISTERS MUST BE REMOVED, WHATEVER IT IS CALLED *** ----------
{
    say("open/close the overlay repeatedly and count what is still registered");
    const rows = [];
    let done = 0;
    for (const n of [1, 2, 3, 5]) {
        while (done < n) { await M.openPageFx(H.img, "burn"); M.closePageFx(); done++; }
        rows.push([done, H.stillLive()]);
    }
    for (const [n, l] of rows) say(`  after ${String(n).padStart(2)} cycles: ` + (l.length ? l.map(([t, c]) => t + " x" + c).join("  ") : "nothing left registered"));
    const last = rows[rows.length - 1][1];
    ok("!! *** NOTHING the overlay registers on the window outlives closePageFx ***",
        last.length === 0 && H.types().length >= 2,
        `${H.types().length} listener types were registered across ${done} cycles (${H.types().join(", ")}) and ` +
        "0 remain. BEFORE v4434 `pointerup` accumulated EXACTLY ONE PER CYCLE -- 1, 2, 3, 5 over the same " +
        "loads -- because it was an anonymous arrow closePageFx had no reference to remove");
    ok("the host element is out of the document too",
        H.window.document.body.children.length === 0,
        `${H.window.document.body.children.length} child element(s) left after ${done} open/close cycles`);
}

// ---- 2. THE THROW PATH: A HANDLER STASHED ON THE LAST LINE IS NOT STASHED AT ALL ---------------------------
{
    say("");
    let threw = false;
    try { await M.openPageFx(H.img, "no-such-filter"); } catch (e) { threw = true; }
    M.closePageFx();
    const left = H.stillLive();
    say("  after a throwing open + close: " + (left.length ? left.map(([t, c]) => t + " x" + c).join("  ") : "nothing left registered"));
    ok("!! an open that THROWS still leaves nothing registered",
        threw && left.length === 0,
        "openPageFx assigned host._resize on its LAST line, so anything throwing in between left the resize " +
        "listener up with nothing holding a reference to it. Both handlers are stashed at registration now");
    ok("...and no host element survives the failed open either",
        H.window.document.body.children.length === 0);
}

// ---- 3. THE FILTER TABLE, DRIVEN HEADLESSLY THROUGH THE REAL VOXEL MODULE ----------------------------------
{
    say("");
    const { voxelizePage } = await import(path.join(ENG, "fx", "voxelize", "pageVoxels.js"));
    const src = fs.readFileSync(path.join(ENG, "ui", "pageFxOverlay.js"), "utf8");
    const keys = [...src.matchAll(/^\s{4}(\w+): \{ label:/gm)].map((m) => m[1]);
    say("  filters declared: " + keys.join(", "));
    ok("the table has the five the header names, each with a label",
        keys.length === 5 && ["burn", "ripple", "melt", "shatter", "plasma"].every((k) => keys.includes(k)),
        keys.join(", "));

    // *** EACH ENTRY MUST MOVE THE GRID, AND THE FIVE MUST MOVE IT DIFFERENTLY. *** Counting keys says a table
    // has five rows; it says nothing about whether any row does anything. FILTERS is exported for exactly this.
    const mk = () => { const d = new Uint8ClampedArray(120 * 160 * 4);
        for (let i = 0; i < 120 * 160; i++) { d[i * 4] = 140; d[i * 4 + 1] = 190; d[i * 4 + 2] = 230; d[i * 4 + 3] = 255; }
        return voxelizePage(d, 120, 160, { cell: 6 }); };
    const sig = (vg) => vg.voxels.reduce((a, v) =>
        a + (v.px || 0) * 7.1 + (v.py || 0) * 13.3 + (v.pz || 0) * 5.9 + (v.alpha ?? 1) * 3.7, 0);
    // *** THE RANDOMNESS MUST BE PINNED OR THE DISTINCTNESS CHECK IS SATISFIED BY NOISE. *** ripple calls
    // dropAt at Math.random positions, so two filters with IDENTICAL bodies still produce different
    // signatures -- giving plasma ripple's exact init and update cost ZERO RED. With Math.random replaced by
    // a fixed sequence, identical behaviour produces identical numbers and the duplicate goes red.
    const realRandom = Math.random;
    let seed = 0x5EED;
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

    ok("the filter table is EXPORTED, so this section can drive it rather than read it",
        M.FILTERS && typeof M.FILTERS === "object" && Object.keys(M.FILTERS).length === keys.length,
        "un-exporting it used to crash this gate rather than fail it by name, which is not a red anybody can read");
    if (!M.FILTERS) { Math.random = realRandom; }
    const rest = sig(mk());
    const moved = new Map(), inert = [];
    for (const k of M.FILTERS ? keys : []) {
        if (k === "shatter") continue;              // its init awaits a physics backend; section 1 drives it live
        // *** AND THE STREAM MUST RESTART FOR EACH FILTER, NOT MERELY BE PINNED. *** With one shared sequence
        // plasma continues from wherever ripple left it, so two IDENTICAL filters still draw different
        // numbers and the duplicate check passed a second time. Same seed, same starting point, every entry.
        seed = 0x5EED;
        const vg = mk(), st = { target: { x: 1, y: 0 }, rainT: 0 };
        M.FILTERS[k].init(vg, st);
        let t = 0;
        for (let i = 0; i < 20; i++) { t += 0.05; M.FILTERS[k].update(vg, t, 0.05, st); }
        const v = sig(vg);
        moved.set(k, v);
        if (Math.abs(v - rest) < 1e-9) inert.push(k);
    }
    say(`  grid: ${mk().voxels.length} voxels, resting signature ${rest.toFixed(3)}`);
    for (const [k, v] of moved) say(`    ${k.padEnd(8)} -> ${v.toFixed(3)}  (delta ${(v - rest).toFixed(3)})`);
    ok("!! every filter that can run headlessly MOVES the grid -- an inert entry is not a filter",
        inert.length === 0 && moved.size === 4,
        inert.length ? "inert: " + inert.join(", ") : `${moved.size} driven, all four changed the grid`);
    ok("...and no two of them move it the SAME way, or the table has a duplicate wearing two labels",
        moved.size > 0 && new Set([...moved.values()].map((v) => v.toFixed(6))).size === moved.size,
        [...moved.entries()].map(([k, v]) => k + " " + v.toFixed(3)).join("   ") +
        " -- driven under a PINNED Math.random, without which two identical filters still differ by noise");
    Math.random = realRandom;
}

// ---- 4. THE FILE'S OWN SHAPE: WHAT THE LEAK COST, AND THAT THE FIX IS THE ONE DESCRIBED ---------------------
{
    say("");
    const src = fs.readFileSync(path.join(ENG, "ui", "pageFxOverlay.js"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    const adds = [...code.matchAll(/(?<!\.)\baddEventListener\("(\w+)"/g)].map((m) => m[1]);
    const rems = [...code.matchAll(/(?<!\.)\bremoveEventListener\("(\w+)"/g)].map((m) => m[1]);
    say("  window addEventListener types in source: " + adds.join(", ") + "   removeEventListener: " + rems.join(", "));
    ok("!! every window listener type ADDED in the source is also REMOVED in the source",
        adds.length > 0 && adds.every((t) => rems.includes(t)),
        "the runtime check in section 1 is the real evidence; this is the same claim readable without a DOM, " +
        "and it is comment-stripped because the fix's own comment names both handlers");
    ok("...and no anonymous handler is registered on the window, which is what made the leak unremovable",
        !/(?<!\.)\baddEventListener\("\w+", ?(\(\)|function)/.test(code),
        "an arrow written inline at the call site cannot be passed to removeEventListener later");
}

console.log("pageFxOverlay-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
