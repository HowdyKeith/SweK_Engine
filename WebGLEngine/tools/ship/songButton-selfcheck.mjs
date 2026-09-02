#!/usr/bin/env node
// WebGLEngine/tools/ship/songButton-selfcheck.mjs -- v4298
//
// GATES THE SONG BUTTON: server.html's bSongTerrain -> /index.html?song=1 -> a rising sweep flown at once and
// a chooser on screen -> a LOCAL file picked in the chooser walked as terrain. Keith's ask, verbatim: "audio
// file to terrain, with a big button on the right side of server.html." The terrain half shipped at v4280
// (world/songHeightfield.mjs, gated by songHeightfield-selfcheck.mjs) and was console-only. This gates the
// other half, the part a person actually touches.
//
// *** WHY THE DEEP LINK CANNOT JUST OPEN A FILE DIALOG, AND WHAT THIS CHECKS INSTEAD. *** A file picker opens
// only from a user gesture; a page cannot click <input type=file> for itself on boot, and the browser is right
// to refuse. So ?song=1 flies the sweep immediately (something must happen when the button is pressed with
// nothing filled in) and puts a chooser on screen whose click IS the gesture. Section B drives that chooser
// the way a person would, through Playwright's setInputFiles, with a WAV written by this file -- a pure tone
// at a known frequency, so the terrain it produces has a ridge in a PREDICTABLE column. A decoder that
// silently returned the sweep again, a chooser wired to nothing, a File that took the URL path and hit
// fetch(undefined): each of those leaves the ridge where the sweep put it, and this says so by name.
//
// Section A reads the source, so the gate still says something on a box without a browser.
"use strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
// index.html lives in WebGLEngine/, so http://swek.local/ is ENG, not the repo root.

let fails = 0;
const ok = (c, name, detail) => {
    console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`);
    if (!c) fails++;
};
const sec = (t) => console.log("\n" + t);

const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");

// ---------------------------------------------------------------------------------------------------------
sec("A. THE BUTTON, THE DEEP LINK, THE CHOOSER, AND THE FILE PATH ARE ALL IN THE SOURCE");
// ---------------------------------------------------------------------------------------------------------
{
    ok(/id="bSongTerrain" class="go-link"/.test(server),
       "server.html has bSongTerrain, dressed as a go-link like its neighbour bRepoTerrain",
       "an engine deep-link, not a page -- it exists only while the engine is running");
    ok(/_st\.onclick[^;]*index\.html\?song=1/.test(server),
       "*** and its click goes to /index.html?song=1 ***", "a button that looks right and goes nowhere is worse than none");
    const rt = server.indexOf('id="bRepoTerrain"'), st = server.indexOf('id="bSongTerrain"');
    ok(rt > 0 && st > rt && st - rt < 2000, "it sits beside GitHub Terrain in the same panel, the way the ask put it",
       `${st - rt} chars apart`);
    ok(/URLSearchParams\(location\.search\)\.get\("song"\)/.test(main),
       "main.js reads ?song= at boot", "the same shape as ?terrain=");
    ok(/window\.songTerrain\.load\(wantsSweep \? \{\} : \{ url: q \}\)/.test(main),
       "*** ?song=1 flies the sweep and ?song=<url> walks that file ***",
       "something must happen when the button is pressed with nothing filled in");
    ok(/window\.songTerrain\.chooser\(\)/.test(main) && /window\.songTerrain\.chooser = function/.test(main),
       "and the chooser is both defined and called from the deep link",
       "a picker needs a gesture; the chooser is where the gesture comes from");
    ok(/o\.file \? await o\.file\.arrayBuffer\(\)/.test(main),
       "*** load({file}) decodes the File's own bytes, not fetch(undefined) ***",
       "one decoder for URL and File: the bytes differ in where they came from, not in what they are");
    ok(/\?song= failed:/.test(main), "a failed deep-link load is warned, not swallowed");
    // v4298's own discovery, made while writing section B: ?terrain=1 hung on the load event and the load
    // event had already fired. Both links must now go through afterBoot, which checks readyState first.
    const ab = main.match(/function afterBoot\(fn[^{]*\{([\s\S]*?)\n\}/);
    ok(!!ab && /document\.readyState === "complete"/.test(ab[1]) && /addEventListener\("load"/.test(ab[1]),
       "*** afterBoot checks readyState BEFORE listening for load, because load has usually already fired here ***",
       "the v4267 link waited for an event that had happened while the engine was still importing");
    const songBlock = main.slice(main.indexOf('.get("song")'), main.indexOf('.get("song")') + 600);
    const terrainBlock = main.slice(main.indexOf('.get("terrain")'), main.indexOf('.get("terrain")') + 600);
    ok(/afterBoot\(/.test(songBlock) && !/addEventListener\("load"/.test(songBlock),
       "?song= goes through afterBoot, not a bare load listener");
    ok(/afterBoot\(/.test(terrainBlock) && !/addEventListener\("load"/.test(terrainBlock),
       "*** and so does ?terrain=, the link that was dead from v4267 to v4297 ***",
       "thirty-one rounds of a button that booted a plain engine");
    ok(/id = "songChooser"/.test(main) && /accept="audio\/\*"/.test(main) && /addEventListener\("drop"/.test(main),
       "the chooser has a stable id, accepts audio, and takes a dropped file",
       "dropping is the second gesture that works without a dialog");
}

// ---------------------------------------------------------------------------------------------------------
sec("B. IN A REAL BROWSER: THE DEEP LINK FLIES THE SWEEP, AND A PICKED FILE MOVES THE RIDGE");
// ---------------------------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) {
    console.log("  SKIP  section B -- " + skip);
} else {
    // A PCM16 mono WAV of a pure tone. Written here rather than vendored: a fixture that is generated is a
    // fixture whose frequency the gate can state.
    const TONE_HZ = 2000, WAV_SR = 8000, WAV_SEC = 3;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "songButton-"));
    const wav = path.join(tmp, "tone-" + TONE_HZ + "hz.wav");
    {
        const n = WAV_SR * WAV_SEC, data = Buffer.alloc(n * 2);
        for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(0.6 * 32767 * Math.sin(2 * Math.PI * TONE_HZ * i / WAV_SR)), i * 2);
        const h = Buffer.alloc(44);
        h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8);
        h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
        h.writeUInt32LE(WAV_SR, 24); h.writeUInt32LE(WAV_SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
        h.write("data", 36); h.writeUInt32LE(data.length, 40);
        fs.writeFileSync(wav, Buffer.concat([h, data]));
    }

    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL });
    const page = await browser.newPage();
    const warns = [];
    page.on("console", (m) => { if (m.type() === "warning" || m.type() === "error") warns.push(m.text().slice(0, 200)); });
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === "swek.local") {
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                const type = ext === ".mjs" || ext === ".js" ? "text/javascript"
                    : ext === ".html" ? "text/html" : ext === ".json" ? "application/json"
                    : ext === ".css" ? "text/css" : "application/octet-stream";
                return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
            }
        }
        return route.fulfill({ status: 404, body: "not found" });
    });

    try {
        // First the link that was dead. window.repoTerrain does not exist until main.js assigns it, so a
        // setter trap installed before ANY page script wraps .load the moment it is assigned, and records the
        // call without running a repository scan (which would want a list server this fixture does not have).
        const tp = await browser.newPage();
        await tp.addInitScript(() => {
            let held;
            Object.defineProperty(window, "repoTerrain", {
                configurable: true, enumerable: true,
                get() { return held; },
                set(v) { held = v; if (v && typeof v.load === "function") {
                    v.load = (o) => { window.__terrainLinkFired = JSON.stringify(o); return Promise.resolve({}); }; } },
            });
        });
        await tp.route("**/*", (route) => {
            const u = new URL(route.request().url());
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (u.hostname === "swek.local" && fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                return route.fulfill({ status: 200, contentType: ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : ext === ".json" ? "application/json" : "text/javascript", body: fs.readFileSync(p) });
            }
            return route.fulfill({ status: 404, body: "not found" });
        });
        await tp.goto("http://swek.local/index.html?terrain=1", { waitUntil: "domcontentloaded", timeout: 30000 });
        let terr = null;
        await tp.waitForFunction(() => window.__terrainLinkFired !== undefined, undefined, { timeout: 45000 }).catch((e) => { terr = e; });
        const fired = terr ? null : await tp.evaluate(() => window.__terrainLinkFired);
        ok(!terr && fired === "{}",
           "*** ?terrain=1 now reaches repoTerrain.load({}) -- the GitHub Terrain button is alive for the first time since v4267 ***",
           terr ? "load was never called: " + String(terr).slice(0, 120) : "called with " + fired);
        await tp.close();

        await page.goto("http://swek.local/index.html?song=1", { waitUntil: "domcontentloaded", timeout: 30000 });
        let err = null;
        // waitForFunction(fn, ARG, options): the options object goes THIRD. Passed second it becomes fn's
        // argument and the timeout silently stays at the 30 s default -- caught while writing this file.
        await page.waitForFunction(() => window.songTerrain && window.songTerrain.lastField && document.getElementById("songChooser"),
            undefined, { timeout: 45000 }).catch((e) => { err = e; });
        ok(!err, "*** ?song=1 boots the engine, flies the sweep, and puts the chooser on screen -- unprompted ***",
           err ? String(err).slice(0, 160) : "lastField set and #songChooser present");

        const sweep = await page.evaluate(() => {
            const f = window.songTerrain.lastField;
            return { grid: f.grid, hzPerBin: f.stats.hzPerBin, binCount: f.stats.binCount, peakHz: f.peaks[0] && f.peaks[0].hz,
                     heights: f.heights.slice(0, 64), chooser: document.getElementById("songChooser").textContent.trim(),
                     hasInput: !!document.querySelector("#songChooser input[type=file]") };
        });
        ok(sweep.hasInput && /choose a song/i.test(sweep.chooser), "the chooser carries a file input and says what it is for",
           JSON.stringify(sweep.chooser));

        // Now the gesture. setInputFiles is Playwright standing in for the person; the change event is real.
        await page.setInputFiles("#songChooser input[type=file]", wav);
        let err2 = null;
        await page.waitForFunction((was) => window.songTerrain.lastField && window.songTerrain.lastField.stats.hzPerBin !== was,
            sweep.hzPerBin, { timeout: 45000 }).catch((e) => { err2 = e; });
        // The sweep was synthesised at 8 kHz; the picked file is decoded at the AudioContext's own rate, so
        // hzPerBin changing is the first, cheapest sign a NEW decode replaced the field rather than a re-run.
        ok(!err2, "*** picking a file in the chooser walks it: the field was replaced by a fresh decode ***",
           err2 ? String(err2).slice(0, 160) : "hzPerBin changed, so the sample rate is the decoder's, not the sweep's");

        const tone = await page.evaluate(() => {
            const f = window.songTerrain.lastField;
            return { grid: f.grid, hzPerBin: f.stats.hzPerBin, binCount: f.stats.binCount, seconds: f.stats.seconds,
                     peakHz: f.peaks[0] && f.peaks[0].hz, heights: f.heights.slice(0, 64),
                     chooser: document.getElementById("songChooser").textContent.trim() };
        });
        const columnHz = tone.hzPerBin * tone.binCount / tone.grid;   // one grid column spans this many Hz
        ok(Math.abs(tone.peakHz - TONE_HZ) <= columnHz,
           `*** the ridge stands in the ${TONE_HZ} Hz column, so the bytes walked were the picked file's ***`,
           `peak at ${tone.peakHz.toFixed(0)} Hz, a column is ${columnHz.toFixed(0)} Hz wide at ${tone.hzPerBin.toFixed(1)} Hz/bin`);
        ok(Math.abs(tone.seconds - WAV_SEC) < 0.5, "and its length is the WAV's length", `${tone.seconds.toFixed(2)} s of ${WAV_SEC}`);
        ok(JSON.stringify(tone.heights) !== JSON.stringify(sweep.heights),
           "control: the tone field differs from the sweep field", "if these matched, the ridge check above was measuring the sweep");
        // load() resolves only after the fly-in lands (~22 s of flight), and the chooser's label changes
        // from "decoding" to "choose another" on that resolution -- so this is the one check that the whole
        // promise chain came back without a rejection, not just that the field was stamped.
        let err3 = null;
        await page.waitForFunction(() => /choose another/i.test(document.getElementById("songChooser").textContent),
            undefined, { timeout: 60000 }).catch((e) => { err3 = e; });
        const label = await page.evaluate(() => document.getElementById("songChooser").textContent.trim());
        ok(!err3 && /tone-2000hz\.wav/.test(label),
           "the chooser names the file it walked and offers another, once the flight has landed", JSON.stringify(label));
        const songWarns = warns.filter((w) => /songTerrain/.test(w));
        ok(songWarns.length === 0, "no [songTerrain] warning was logged along the way", songWarns.join(" | "));
    } catch (e) {
        // A boot that never produced the sweep leaves the later evaluates with nothing to read; that is a
        // red of its own, not a crash. Sabotage C found this: the gate exited 1 by exception, which counts,
        // but a gate should say what it could not do.
        ok(false, "section B ran to its end", String(e && e.message || e).slice(0, 160));
    } finally {
        await browser.close();
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    }
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  server.html: the bSongTerrain onclick removed.
//      -> exit=1, section A, one line: "its click goes to /index.html?song=1". A button that looks right and
//      goes nowhere is the failure mode bRepoTerrain had for real (see C).
//
//   B  main.js: load() ignores o.file and takes the URL path for everything.
//      -> exit=1, SIX lines. Section A names the missing branch; section B's picked file fails to decode
//      ("Unable to decode audio data" -- fetch(undefined) fetched the page), the field stays the sweep's
//      (peak at 251 Hz, 3.90 s, heights identical to the control), and the chooser reports "could not walk".
//      The control line is the one that matters: without it, a ridge check against an unchanged field is
//      measuring the sweep and calling it the song.
//
//   C  main.js: afterBoot reverted to a bare window.addEventListener("load") -- the exact v4267 shape.
//      -> exit=1. Section A names the shape; section B shows BOTH links dead: repoTerrain.load never called,
//      no sweep, no chooser. This sabotage is the state the tree shipped in from v4267 to v4297, and this
//      file is the first gate that would have gone red over it.
//
//   D  main.js: the deep link never calls songTerrain.chooser().
//      -> exit=1, section A ("both defined and called") and section B (no #songChooser on screen).
//
//   Also caught while writing, not by sabotage: page.waitForFunction takes its options THIRD; passed second
//   the timeout silently stayed at 30 s. And the first draft served http://swek.local/ from the repo root
//   rather than WebGLEngine/, so index.html was a 404 -- the gate reported a timeout, not the real cause.
//   Both are why section B's first red lines carry the error text.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: the drop path (section B drives the input, not a DataTransfer), and any audio " +
    "format beyond PCM WAV -- decodeAudioData's coverage is the browser's, not this file's.");
process.exit(fails ? 1 : 0);
