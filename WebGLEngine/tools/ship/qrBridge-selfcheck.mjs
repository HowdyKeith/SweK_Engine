#!/usr/bin/env node
// WebGLEngine/tools/ship/qrBridge-selfcheck.mjs
//
// GATES ai-bridge/qrBridge.js -- the local, server-side QR renderer wired behind fabric.html's HOP 3
// "remote viewer" button, replacing a call out to the external api.qrserver.com just to draw a QR image.
//
// Run: node tools/ship/qrBridge-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered -- any *-selfcheck.mjs anywhere in the tree).
//
//   SABOTAGE LOG:
//     A. (section 4, reproduced HERE on every run, via a scratch copy that never touches the shipped
//        file) qrBridge.js's own length-bound check -- `if (str.length > MAX_DATA_LEN)` -- reverted to
//        `if (false)`. Effect, confirmed live: a string one char past MAX_DATA_LEN, which section 3
//        confirms the REAL file rejects with {ok:false}, renders successfully (169 modules) through the
//        sabotaged copy instead. Scratch file deleted immediately after.
//        *** SECTION 5'S SABOTAGE (below) FOUND A BUG IN THIS GATE ITSELF DURING DEVELOPMENT: *** its
//        first draft targeted the bare substring `require("@napi-rs/canvas")`, which also appears
//        verbatim in this file's OWN header prose above -- and String.replace() (first match only)
//        silently patched THAT comment instead of the executable require() call, so the "scratch copy"
//        was functionally identical to the real file. Caught because section 5's own "did status()
//        actually change" assertions went red on a sabotage that was supposed to make them redder --
//        i.e. the gate correctly flagged its OWN broken sabotage attempt as a real failure rather than
//        passing quietly. Fixed by targeting the full statement (`_canvasMod = require(...);`, unique).
//     B. (manual, against the REAL shipped ai-bridge/qrBridge.js, at dev time -- not reproduced
//        automatically here, since it edits the shipped file in place rather than a scratch copy) line
//        138's `if (expected !== drawn) return { ok:false, ... }` inside _verifyPixels() commented out.
//        `node tools/ship/qrBridge-selfcheck.mjs` re-run against the broken file: RED, exactly section
//        2b's "negative control" assertion, exit 1, 1 FAILED -- section 2 (which decodes the actual
//        returned PNG bytes independently and does not call _verifyPixels() at all) stayed green
//        throughout, which is exactly why section 2b exists: it is the only section that would notice
//        THIS specific break on a box whose draw pipeline is otherwise correct. File restored from a
//        pre-edit copy (byte-identical diff confirmed), re-run: all green again, exit 0. Real terminal
//        output from both runs is quoted in the task write-up.
//
// *** WHY SECTION 2's PIXEL CHECK DECODES THE RETURNED PNG BYTES INSTEAD OF TRUSTING qrBridge.js's OWN
// INTERNAL CHECK: *** qrBridge.js's own _verifyPixels() only ever looks at the in-memory canvas BEFORE
// toBuffer() runs -- proof the DRAW was right, not proof the PNG ENCODE+DECODE round-trip preserved it.
// This gate instead takes the actual PNG bytes renderQrPng() returned, decodes them via
// @napi-rs/canvas's loadImage() onto a FRESH canvas (a genuinely different code path than qrBridge.js's
// own pre-encode getImageData() call), and checks THOSE pixels against a SEPARATELY-BUILT QR encoder
// instance's isDark() -- not the instance qrBridge built internally. Same bar canvasBridge.js's
// _readPngHeader() and webcodecsBridge.js's _verifyMp4() hold themselves to: independent verification
// of encoder output, not just "did not throw" -- done again here, from OUTSIDE the file, as a second,
// independent check on top of qrBridge.js's own.
"use strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require_ = createRequire(import.meta.url);
// Scoped to ai-bridge/ itself (not this file's own tools/ship/ location) so require("@napi-rs/canvas")
// resolves against ai-bridge/node_modules the same way qrBridge.js's own require() does -- this file's
// own location has no node_modules chain that reaches it.
const requireAiBridge = createRequire(path.join(ENG, "ai-bridge", "qrBridge.js"));
const Q = requireAiBridge(path.join(ENG, "ai-bridge", "qrBridge.js"));

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
console.log("qrBridge-selfcheck -- the local QR render behind fabric.html's HOP 3\n");

// ---- 1. STATUS MATCHES THE SIBLING BRIDGE SHAPE --------------------------------------------------------
{
    console.log("1. STATUS() MATCHES THE SIBLING BRIDGE SHAPE");
    const st = Q.status();
    ok("status() carries the sibling shape (ok, platform, arch, available, tool, note)",
        !!st && st.ok === true && typeof st.platform === "string" && typeof st.arch === "string" &&
        typeof st.available === "boolean" && typeof st.tool === "string" && typeof st.note === "string",
        JSON.stringify(st));
    ok("!! @napi-rs/canvas is actually available on THIS box (an optionalDependency already installed for canvasBridge.js's own spike)",
        st.available === true && st.tool === "@napi-rs/canvas",
        "a box without it degrades honestly instead -- see section 5 below");
}

// ---- 2. renderQrPng() ON A REAL URL, VERIFIED FROM OUTSIDE qrBridge.js -----------------------------------
{
    console.log("\n2. renderQrPng() ON A REAL URL -- VERIFIED FROM OUTSIDE qrBridge.js, NOT JUST 'DID NOT THROW'");
    const url = "https://example-tunnel.trycloudflare.com/fabric.html";
    const r = await Q.renderQrPng(url);
    ok("!! renders successfully", r && r.ok === true,
        r.ok ? (r.width + "x" + r.height + ", " + r.moduleCount + " modules, " + r.cellSize + "px/cell") : JSON.stringify(r));

    if (r && r.ok) {
        // Magic bytes, checked TWICE -- once completely independent of qrBridge.js, once through its
        // own exported _readPngHeader() -- so this section does not depend on qrBridge's own parser
        // being the only thing that agrees with itself.
        const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
        ok("magic bytes are a real PNG signature (checked directly here, not through qrBridge)",
            Buffer.isBuffer(r.png) && r.png.length >= 8 && r.png.slice(0, 8).equals(PNG_SIG));
        const hdr = Q._readPngHeader(r.png);
        ok("!! ...and qrBridge's own _readPngHeader() independently re-parses the same IHDR dimensions",
            hdr.ok && hdr.width === r.width && hdr.height === r.height, JSON.stringify(hdr));

        // Declared pixel dimensions self-consistent with the reported cellSize/moduleCount -- derived
        // generically (a positive, EVEN quiet-zone margin on all sides) rather than by re-typing
        // qrBridge's own margin formula, so this does not just echo qrBridge's arithmetic back at it.
        const matrixPx = r.moduleCount * r.cellSize;
        const marginPx = r.width - matrixPx;
        ok("!! width/height are self-consistent with the reported cellSize and moduleCount",
            r.width === r.height && marginPx > 0 && marginPx % 2 === 0,
            "width=" + r.width + ", moduleCount*cellSize=" + matrixPx + ", margin=" + marginPx);

        // THE INDEPENDENT DECODE. A second, separately-built QR encoder instance -- own dynamic import
        // of the exact same vendored ui/vendor/qrcode.mjs qrBridge.js itself uses, but a DIFFERENT
        // in-memory instance -- as the isDark() oracle, checked against the PNG BYTES renderQrPng()
        // actually returned, decoded fresh via @napi-rs/canvas's loadImage(). See the file header for
        // why this is a materially stronger check than trusting qrBridge.js's own internal verification.
        const { qrcode } = await import(pathToFileURL(path.join(ENG, "ui", "vendor", "qrcode.mjs")));
        const qr2 = qrcode(0, "M");
        qr2.addData(url);
        qr2.make();
        ok("!! the gate's OWN separately-built encoder instance agrees with qrBridge's reported moduleCount",
            qr2.getModuleCount() === r.moduleCount, qr2.getModuleCount() + " vs " + r.moduleCount);

        const mod = requireAiBridge("@napi-rs/canvas");
        const img = await mod.loadImage(r.png);
        const decodeCanvas = mod.createCanvas(r.width, r.height);
        const dctx = decodeCanvas.getContext("2d");
        dctx.drawImage(img, 0, 0);
        const pixels = dctx.getImageData(0, 0, r.width, r.height);
        const isDarkPixel = (row, col) => {
            const x = Math.floor(marginPx / 2) + col * r.cellSize + (r.cellSize >> 1);
            const y = Math.floor(marginPx / 2) + row * r.cellSize + (r.cellSize >> 1);
            const i = (y * pixels.width + x) * 4;
            return pixels.data[i] < 128 && pixels.data[i + 1] < 128 && pixels.data[i + 2] < 128;
        };
        const spots = [
            ["top-left finder", 3, 3],
            ["top-right finder", 3, r.moduleCount - 4],
            ["bottom-left finder", r.moduleCount - 4, 3],
            ["timing module", 6, 8],
            ["data module A", r.moduleCount >> 1, r.moduleCount >> 1],
            ["data module B", 10, Math.max(10, r.moduleCount - 10)],
        ];
        let allMatch = true;
        const detail = [];
        for (const [label, row, col] of spots) {
            const expected = qr2.isDark(row, col), drawn = isDarkPixel(row, col);
            detail.push(label + (expected === drawn ? "=match" : "=MISMATCH(exp " + expected + " got " + drawn + ")"));
            if (expected !== drawn) allMatch = false;
        }
        ok("!! the DECODED PNG's own pixels match a SEPARATELY-BUILT encoder's isDark() at " + spots.length + " independent module positions",
            allMatch, detail.join(", "));
    } else {
        console.log("  (skipping the rest of section 2 -- nothing to independently verify against a failed render)");
    }
}

// ---- 2b. _verifyPixels() ITSELF, UNIT-TESTED WITH SYNTHETIC INPUT (positive AND negative controls) --------
//
// Section 2 proves the real drawing pipeline on THIS box is correct end to end -- but that means a
// mismatch this box's own draw never produces (a corrupted Skia build, an off-by-one in a future edit)
// would sail through section 2 undetected even if qrBridge.js's own internal _verifyPixels() were
// completely disabled, because section 2 never calls that internal helper at all. This section closes
// that gap by unit-testing the EXPORTED _verifyPixels() directly with synthetic imageData/isDark input
// built to contain a deliberate, known mismatch -- so a real break in ITS OWN logic (not the draw) is
// caught here even when the box's draw pipeline is fine. Same "positive control that would be forgiven,
// negative control that must not be" shape as browserSafety-selfcheck.mjs's own synthetic fixtures.
{
    console.log("\n2b. _verifyPixels() ITSELF, UNIT-TESTED WITH SYNTHETIC INPUT (not the real draw)");
    const moduleCount = 21, cellSize = 4, margin = 16;
    const width = moduleCount * cellSize + margin * 2;
    const centerOf = (row, col) => ({ x: margin + col * cellSize + (cellSize >> 1), y: margin + row * cellSize + (cellSize >> 1) });
    const paint = (data, row, col, dark) => {
        const { x, y } = centerOf(row, col);
        const i = (y * width + x) * 4;
        const v = dark ? 0 : 255;
        data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255;
    };
    const checkedPositions = [[3, 3], [3, moduleCount - 4], [moduleCount - 4, 3], [6, 8], [moduleCount >> 1, moduleCount >> 1]];
    const qrStub = { isDark: () => true }; // the stub oracle claims every checked module is dark

    const goodData = new Uint8ClampedArray(width * width * 4).fill(255); // canvas starts white
    for (const [row, col] of checkedPositions) paint(goodData, row, col, true); // paint every checked cell dark, matching the stub
    const good = Q._verifyPixels({ width, data: goodData }, qrStub, moduleCount, cellSize, margin);
    ok("!! positive control: pixels matching isDark() everywhere checked -> {ok:true}",
        good && good.ok === true && good.checked === checkedPositions.length, JSON.stringify(good));

    const badData = goodData.slice(); // same fixture, ONE checked cell now left white against a stub claiming dark
    paint(badData, 6, 8, false); // "timing module" position, deliberately wrong
    const bad = Q._verifyPixels({ width, data: badData }, qrStub, moduleCount, cellSize, margin);
    ok("!! negative control: ONE checked cell painted wrong -> {ok:false}, naming exactly which one",
        bad && bad.ok === false && bad.row === 6 && bad.col === 8, JSON.stringify(bad));
}

// ---- 3. BAD INPUT IS REJECTED CLEANLY -- NO UNCAUGHT THROW ------------------------------------------------
{
    console.log("\n3. BAD INPUT IS REJECTED CLEANLY -- NO UNCAUGHT THROW");
    const empty = await Q.renderQrPng("");
    ok("empty data -> {ok:false}, not a throw", empty && empty.ok === false, empty.error);
    const nullish = await Q.renderQrPng(null);
    ok("null data -> {ok:false}, not a throw", nullish && nullish.ok === false, nullish.error);
    const over = await Q.renderQrPng("x".repeat(Q.MAX_DATA_LEN + 1));
    ok("!! one char over MAX_DATA_LEN (" + Q.MAX_DATA_LEN + ") -> {ok:false}, not silently accepted",
        over && over.ok === false, over.error);
    const wayOver = await Q.renderQrPng("x".repeat(Q.MAX_DATA_LEN * 5));
    ok("!! ...and a much larger string is refused the same way, not treated differently",
        wayOver && wayOver.ok === false, wayOver.error);
    const atMax = await Q.renderQrPng("x".repeat(Q.MAX_DATA_LEN));
    ok("...and exactly AT the bound still renders (the guard is 'over', not 'at or over')",
        atMax && atMax.ok === true, atMax.ok ? (atMax.moduleCount + " modules") : atMax.error);
}

// ---- 4. SABOTAGE: THE LENGTH-BOUND CHECK, REVERTED -------------------------------------------------------
//
// A scratch copy of the REAL shipped source with one real check reverted, required fresh, tested, and
// deleted immediately -- the shipped ai-bridge/qrBridge.js on disk is never touched by this section. The
// scratch file lives inside ai-bridge/ itself (not the OS temp dir) so its own relative
// `import("../ui/vendor/qrcode.mjs")` still resolves against the real tree.
{
    console.log("\n4. SABOTAGE: THE LENGTH-BOUND CHECK, REVERTED (scratch copy -- the shipped file is untouched)");
    const realSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "qrBridge.js"), "utf8");
    const target = 'if (str.length > MAX_DATA_LEN)';
    ok("!! the check this sabotage targets is really present in the shipped source",
        realSrc.includes(target));
    const brokenSrc = realSrc.replace(target, "if (false /* SABOTAGED for qrBridge-selfcheck section 4 */)");
    ok("!! ...and the replacement actually changed the source (not a no-op string match)",
        brokenSrc !== realSrc && brokenSrc.includes("SABOTAGED"));

    const scratchPath = path.join(ENG, "ai-bridge", "__qrBridge.sabotage." + process.pid + ".js");
    try { fs.unlinkSync(scratchPath); } catch {} // clean up any leftover from a previous crashed run
    fs.writeFileSync(scratchPath, brokenSrc);
    try {
        delete require_.cache[require_.resolve(scratchPath)];
        const Broken = require_(scratchPath);
        // +1, not further over -- the vendored encoder has its OWN hard ceiling (~2300 bytes at level M,
        // confirmed empirically: 3000 'x' chars throws "code length overflow" even with this guard
        // disabled), so a test value picked too far past MAX_DATA_LEN would fail for the ENCODER'S
        // reason and mask whether THIS guard specifically was bypassed. +1 is squarely inside the
        // encoder's own capacity, so a pass here can only mean the length-bound check itself let it through.
        const over = await Broken.renderQrPng("x".repeat(Q.MAX_DATA_LEN + 1));
        ok("!! RED BY NAME, REPRODUCED: with the length-bound check reverted, the SAME over-length input " +
            "section 3 confirmed the real file rejects now renders instead",
            over && over.ok === true,
            over.ok
                ? "sabotage confirmed live: encoded anyway (moduleCount=" + over.moduleCount + ") -- the REAL " +
                  "file (section 3 above, same run) correctly rejects the identical input"
                : "sabotage did NOT reproduce -- the replacement above did not actually disable the guard: " + JSON.stringify(over));
    } finally {
        try { fs.unlinkSync(scratchPath); } catch {}
    }
}

// ---- 5. GRACEFUL DEGRADE WHEN @napi-rs/canvas IS UNAVAILABLE ----------------------------------------------
//
// Never touches the REAL installed node_modules/@napi-rs/canvas -- this gate is auto-discovered and runs
// on every ship, and mutating a shared native module on disk mid-suite is a real hazard if the process
// died before restoring it (canvasBridge.js's own spike verified this exact degrade path by renaming the
// real install aside, manually, ONCE, during development -- not as a standing, repeatedly-run gate). A
// scratch copy with its require("@napi-rs/canvas") call pointed at a package name that cannot resolve
// reproduces the identical code path (_canvas()'s own try/catch) safely and repeatably instead.
{
    console.log("\n5. GRACEFUL DEGRADE WHEN @napi-rs/canvas IS UNAVAILABLE -- NO UNCAUGHT THROW");
    const realSrc = fs.readFileSync(path.join(ENG, "ai-bridge", "qrBridge.js"), "utf8");
    // The bare substring `require("@napi-rs/canvas")` also appears in this file's OWN header comment
    // (documenting the pattern in prose) -- matched here BEFORE the real code below by
    // String.prototype.replace()'s first-match behavior, and a first draft of this section targeted
    // that bare substring and silently patched the COMMENT instead of the live require() call, passing
    // the "source changed" check while sabotaging nothing executable. The full statement, assignment and
    // semicolon included, is unique to the real code.
    const target = '_canvasMod = require("@napi-rs/canvas");';
    ok("!! the require() call this targets is really present in the shipped source, exactly once",
        realSrc.split(target).length - 1 === 1);
    const brokenSrc = realSrc.replace(target, '_canvasMod = require("@napi-rs/canvas-DOES-NOT-EXIST");');
    ok("!! ...and the replacement actually changed the source", brokenSrc !== realSrc);

    const scratchPath = path.join(ENG, "ai-bridge", "__qrBridge.nocanvas." + process.pid + ".js");
    try { fs.unlinkSync(scratchPath); } catch {}
    fs.writeFileSync(scratchPath, brokenSrc);
    try {
        delete require_.cache[require_.resolve(scratchPath)];
        const NoCanvas = require_(scratchPath);
        const st = NoCanvas.status();
        ok("!! status() reports available:false honestly instead of throwing",
            st.ok === true && st.available === false && st.tool === "unavailable", JSON.stringify(st));
        const r = await NoCanvas.renderQrPng("https://example.com/");
        ok("!! renderQrPng() degrades to {ok:false} instead of throwing", r && r.ok === false, r.error);
    } finally {
        try { fs.unlinkSync(scratchPath); } catch {}
    }
}

// ---- 6. THERE IS A DOOR ------------------------------------------------------------------------------------
{
    console.log("\n6. THERE IS A DOOR");
    const server = fs.readFileSync(path.join(ENG, "ai-bridge", "server.js"), "utf8");
    ok("!! GET /qr.png is dispatched", /"\/qr\.png"/.test(server));
    ok("...and qrBridge.js is required LAZILY, not at module load, so a tree missing the file still boots",
        /require\("\.\/qrBridge\.js"\)/.test(server) && !/^const qrBridge\b/m.test(server));
    ok("!! missing `data` is rejected with 400 before qrBridge is ever asked to render",
        /sendJson\(\{ ok: false, error: "missing data" \}, 400\)/.test(server));
    ok("!! over-length `data` is rejected with 400 using qrBridge's OWN MAX_DATA_LEN, not a second hardcoded number",
        /data\.length > qrBridge\.MAX_DATA_LEN/.test(server));
    ok("!! a render failure answers with a status an <img onerror> will catch (non-2xx)",
        /sendJson\(r \|\| \{ ok: false, error: "qr render failed" \}, 503\)/.test(server));
}

// ---- 7. fabric.html IS A REAL CONSUMER -- LOCAL FIRST, EXTERNAL FALLBACK KEPT ------------------------------
{
    console.log("\n7. fabric.html's HOP 3 BUTTON IS A REAL CONSUMER -- LOCAL FIRST, EXTERNAL FALLBACK KEPT");
    const html = fs.readFileSync(path.join(ENG, "fabric.html"), "utf8");
    ok("!! the h3btn handler's PRIMARY <img src> is the new local route",
        /qrLocal = "\/qr\.png\?data="/.test(html));
    ok("!! ...and the ORIGINAL external api.qrserver.com URL is kept, not deleted",
        /api\.qrserver\.com\/v1\/create-qr-code/.test(html));
    ok("!! ...wired as an <img onerror> fallback, so a box without @napi-rs/canvas (or a transient local failure) keeps working exactly as before",
        /onerror="this\.onerror=null;this\.src=this\.dataset\.fallback;"/.test(html) &&
        /data-fallback="'\+esc\(qrExternal\)\+'"/.test(html));
}

console.log(fails ? `\nqrBridge-selfcheck: ${fails} FAILED` : "\nqrBridge-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
