#!/usr/bin/env node
// WebGLEngine/tools/ship/songGlobe-selfcheck.mjs -- v4302
//
// GATES world/songGlobe.mjs AND song-globe.html -- a song heightfield wrapped onto a sphere (#141). Section A
// is arithmetic on the pure module: a constant field is a sphere of radius R to the vertex and to 4 pi R^2
// in area; a pure tone is a RING (one latitude, the same radius all the way round, at the column
// binOfFrequency predicts); a rising sweep is a SPIRAL (the ridge column climbs monotonically with
// longitude); the seam closes to 1e-12; silence sits at sea level R; every index is in range and nothing
// is NaN. Section B boots the real page in a real browser and checks that what it built is what the module
// builds for the same input, and that the renderer actually drew that many triangles.
//
// Run: node tools/ship/songGlobe-selfcheck.mjs
"use strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as S from "../../world/songHeightfield.mjs";
import * as G from "../../world/songGlobe.mjs";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";

const require_ = createRequire(import.meta.url);
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (c, name, detail) => { console.log(`  ${c ? "PASS" : "FAIL"}${c ? "  " : "  !! "}${name}${detail ? "   " + detail : ""}`); if (!c) fails++; };
const sec = (t) => console.log("\n" + t);
const grid = 64;

// ---------------------------------------------------------------------------------------------------------
sec("A1. A CONSTANT FIELD IS A SPHERE, TO THE VERTEX AND TO THE AREA");
// ---------------------------------------------------------------------------------------------------------
{
    const flat = { heights: new Array(grid * grid).fill(-20), grid, min: -20, max: -20, water: { areas: [] } };
    const g = G.globeFromField(flat, { radius: 2 });
    ok(g.radiusMin === 2 && g.radiusMax === 2, "*** every vertex sits at exactly R = 2 ***", `${g.radiusMin} .. ${g.radiusMax}`);
    const want = 4 * Math.PI * 4;
    ok(Math.abs(g.area - want) / want < 0.002, "and the triangle areas sum to 4 pi R^2 within 0.2%", `${g.area.toFixed(4)} vs ${want.toFixed(4)}`);
    ok(g.vertexCount === (grid + 1) * grid + 2 && g.triangleCount === 2 * grid * (grid - 1) + 2 * grid,
       "vertex and triangle counts are the closed forms (grid+1)*grid+2 and 2*grid*(grid-1)+2*grid", `${g.vertexCount} vertices, ${g.triangleCount} triangles`);
    ok(g.outward === true, "the surface faces outward (first triangle's normal points away from the centre)");
    let bad = 0; for (const i of g.indices) if (i >= g.vertexCount) bad++;
    let nonFinite = 0; for (const x of g.positions) if (!Number.isFinite(x)) nonFinite++; for (const x of g.normals) if (!Number.isFinite(x)) nonFinite++;
    ok(bad === 0 && nonFinite === 0, "every index is in range and no position or normal is NaN");
}

// ---------------------------------------------------------------------------------------------------------
sec("A2. A PURE TONE IS A RING, AT THE LATITUDE THE ARITHMETIC PREDICTS");
// ---------------------------------------------------------------------------------------------------------
{
    const field = S.songHeightfield(S.tone(1000, 2), { grid });
    const g = G.globeFromField(field);
    const col = G.columnOfHz(field, 1000);
    const predicted = Math.floor(S.binOfFrequency(1000, field.stats.sampleRate, field.stats.frameSize) * grid / field.stats.binCount);
    ok(col === predicted, "the tone's column is binOfFrequency scaled to the grid", `column ${col} of ${grid}`);
    const ridge = new Set(); for (let li = 0; li < grid; li++) ridge.add(g.ridgeColumnAt(li));
    ok(ridge.size === 1 && ridge.has(col), "*** the ridge is at that ONE column on every meridian: a ring ***", `columns seen: ${[...ridge].join(",")}`);
    let lo = Infinity, hi = -Infinity; for (let li = 0; li < grid; li++) { const r = g.radii[g.vertexOf(li, col)]; lo = Math.min(lo, r); hi = Math.max(hi, r); }
    ok(hi - lo < 1e-12 && Math.abs(hi - g.radius * (1 + g.amp)) < 1e-6, "and the ring's radius is constant all the way round, at R (1 + amp)", `${lo} .. ${hi}`);
    const { lat } = G.lonLatOf(0, col, grid);
    ok(lat > -Math.PI / 2 && lat < 0, "1 kHz on an 8 kHz clip is in the southern hemisphere (bass at the south pole, treble at the north)", `${(lat * 180 / Math.PI).toFixed(1)} degrees`);
    ok(g.waterVertices > 0.9 * g.vertexCount, "and everything that is not the ring is at sea -- a pure tone is mostly silence", `${g.waterVertices} of ${g.vertexCount}`);
    ok(g.radiusMin === g.radius, "sea level is exactly R", `${g.radiusMin}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("A3. A RISING SWEEP IS A SPIRAL, AND THE SEAM CLOSES");
// ---------------------------------------------------------------------------------------------------------
{
    const field = S.songHeightfield(S.sweep(200, 3000, 4), { grid });
    const g = G.globeFromField(field);
    const ridge = []; for (let li = 0; li < grid; li++) ridge.push(g.ridgeColumnAt(li));
    let mono = 0; for (let i = 1; i < ridge.length; i++) if (ridge[i] >= ridge[i - 1]) mono++;
    ok(mono === ridge.length - 1 && ridge[ridge.length - 1] - ridge[0] > grid / 3,
       "*** the ridge column never falls as longitude advances, and climbs more than a third of the way pole to pole ***",
       `from column ${ridge[0]} to ${ridge[ridge.length - 1]} over ${grid} meridians`);
    // Sabotage B (the seam repeating row 1 instead of row 0) left the first draft of this check GREEN: it
    // compared the two seam columns with each other, and both were row 1. So the seam is now checked against
    // the FIELD -- the radius at the seam must be row 0's own height -- not against its twin.
    let seam = 0, seamField = 0;
    for (let c = 0; c < grid; c++) {
        const a = g.vertexOf(0, c), b = g.vertexOf(grid, c);
        for (let k = 0; k < 3; k++) seam = Math.max(seam, Math.abs(g.positions[a * 3 + k] - g.positions[b * 3 + k]));
        const want = G.waterMaskOf(field)[c] ? g.radius : g.radius * (1 + g.amp * (field.heights[c] - field.min) / (field.max - field.min));
        seamField = Math.max(seamField, Math.abs(g.radii[b] - want));
    }
    ok(seam < 1e-12 && seamField < 1e-6, "the seam column IS row 0, to the bit and to the field: the song's end meets its start",
       `twin difference ${seam.toExponential(1)}, difference from row 0's own heights ${seamField.toExponential(1)}`);
    const half = S.songHeightfield(Float64Array.from([...S.tone(500, 1), ...new Float64Array(8000)]), { grid });
    const g2 = G.globeFromField(half);
    ok(g2.waterVertices >= 0.5 * g2.vertexCount && g2.radiusMin === 1, "a clip that is silent for its second half puts at least half the globe at sea level", `${g2.waterVertices} of ${g2.vertexCount}`);
    const mask = G.waterMaskOf(half);
    ok(mask.reduce((a, v) => a + v, 0) === half.stats.waterCells, "the water mask rebuilt from the field's rectangles has the field's own waterCells count", `${half.stats.waterCells}`);
    // Sabotage C (water not pinned to sea level) went 0 red on the first draft: a songHeightfield's water cells
    // sit at its minimum anyway, so h01 was already 0 and the pin was unfalsifiable on that input. A hand-made
    // field with a LAKE ABOVE THE FLOOR is the input that reaches the branch: the lake must be at R while a
    // land cell of the same height stands proud of it.
    const gh = 16, heights = new Array(gh * gh).fill(-80);
    heights[3 * gh + 5] = -50;                                         // land at -50
    for (let c = 8; c < 12; c++) heights[3 * gh + c] = -50;            // a lake at -50, cells (3, 8..11)
    const lake = { heights, grid: gh, min: -80, max: -20, water: { areas: [{ path: "lake", poly: [[1 - 3 / gh, 8 / gh], [1 - 3 / gh, 12 / gh], [1 - 4 / gh, 12 / gh], [1 - 4 / gh, 8 / gh]] }] } };
    const gl = G.globeFromField(lake);
    const lakeR = [8, 9, 10, 11].map((c) => gl.radii[gl.vertexOf(3, c)]), landR = gl.radii[gl.vertexOf(3, 5)];
    ok(lakeR.every((r) => r === gl.radius) && landR > gl.radius * 1.1 && gl.waterVertices === 4,
       "*** a lake ABOVE the floor is pinned to sea level while land of the same height stands proud ***",
       `lake ${lakeR.map((r) => r.toFixed(3)).join(",")} vs land ${landR.toFixed(3)} at R ${gl.radius}`);
}

// ---------------------------------------------------------------------------------------------------------
sec("A4. THE DOORS: server.html's button, the page, and songTerrain.globe()");
// ---------------------------------------------------------------------------------------------------------
{
    const server = fs.readFileSync(path.join(ENG, "server.html"), "utf8"), main = fs.readFileSync(path.join(ENG, "main.js"), "utf8");
    ok(/id="bSongGlobe"/.test(server) && /_sg\.onclick[^;]*song-globe\.html/.test(server), "server.html has a Song Globe button that opens song-globe.html");
    const st = server.indexOf('id="bSongTerrain"'), sg = server.indexOf('id="bSongGlobe"');
    ok(st > 0 && sg > st && sg - st < 1500, "beside Song Terrain", `${sg - st} chars apart`);
    ok(fs.existsSync(path.join(ENG, "song-globe.html")), "song-globe.html exists");
    ok(/globe\(url\)[^}]*song-globe\.html/.test(main), "window.songTerrain.globe(url) opens it from the engine console");
    const page = fs.readFileSync(path.join(ENG, "song-globe.html"), "utf8");
    ok(/S\.sweep\(200, 2000, 4, sampleRate\)/.test(page) && /S\.sweep\(200, 2000, 4, sampleRate\)/.test(main),
       "the page's default sweep is the engine's own, character for character", "so the globe with no song is the terrain with no song, wrapped");
}

// ---------------------------------------------------------------------------------------------------------
sec("B. IN A REAL BROWSER: THE PAGE BUILDS WHAT THE MODULE BUILDS, AND DRAWS IT");
// ---------------------------------------------------------------------------------------------------------
const { chromium, from: pwFrom } = resolvePlaywright(require_);
const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
if (skip) { console.log("  SKIP  section B -- " + skip); } else {
    const expect = G.globeFromField(S.songHeightfield(S.sweep(200, 2000, 4, 8000), { grid: 128 }));
    const browser = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
    await page.route("**/*", (route) => {
        const u = new URL(route.request().url());
        if (u.hostname === "swek.local") {
            const p = path.join(ENG, decodeURIComponent(u.pathname));
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                const ext = path.extname(p);
                return route.fulfill({ status: 200, contentType: ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : "text/javascript", body: fs.readFileSync(p) });
            }
        }
        return route.fulfill({ status: 404, body: "not found" });
    });
    try {
        await page.goto("http://swek.local/song-globe.html", { waitUntil: "domcontentloaded", timeout: 30000 });
        let err = null;
        await page.waitForFunction(() => window.songGlobe && window.songGlobe.last && window.songGlobe.lastRender && window.songGlobe.lastRender.frame > 3,
            undefined, { timeout: 45000 }).catch((e) => { err = e; });
        ok(!err, "*** song-globe.html boots, builds the sweep globe, and has rendered frames ***", err ? String(err).slice(0, 140) : "built and drawn");
        const got = await page.evaluate(() => ({ last: window.songGlobe.last, render: window.songGlobe.lastRender }));
        if (got.last) {
            ok(got.last.vertexCount === expect.vertexCount && got.last.triangleCount === expect.triangleCount,
               "*** the page's vertex and triangle counts equal the module's for the same sweep at grid 128 ***",
               `${got.last.vertexCount} vertices, ${got.last.triangleCount} triangles`);
            ok(Math.abs(got.last.radiusMax - expect.radiusMax) < 1e-6 && got.last.radiusMin === expect.radiusMin && got.last.waterVertices === expect.waterVertices,
               "and the same radii and the same number of vertices at sea", `${got.last.waterVertices} at sea, R ${got.last.radiusMin} .. ${got.last.radiusMax.toFixed(4)}`);
            ok(got.render.triangles >= expect.triangleCount, "*** the renderer drew at least that many triangles in the last frame ***",
               `${got.render.triangles} triangles in ${got.render.calls} draw calls (the globe plus the star field)`);
            ok(got.last.label === "a rising sweep" && got.last.outward === true, "labelled as the sweep, facing outward");
        }
        ok(errors.length === 0, "no page errors", errors.join(" | "));
        // the chooser: a picked 2 kHz WAV rebuilds the globe as a ring
        const os = await import("node:os");
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "songGlobe-")), wav = path.join(tmp, "tone-2000hz.wav");
        { const sr = 8000, n = sr * 2, data = Buffer.alloc(n * 2);
          for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(0.6 * 32767 * Math.sin(2 * Math.PI * 2000 * i / sr)), i * 2);
          const h = Buffer.alloc(44); h.write("RIFF", 0); h.writeUInt32LE(36 + data.length, 4); h.write("WAVE", 8); h.write("fmt ", 12);
          h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28);
          h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write("data", 36); h.writeUInt32LE(data.length, 40);
          fs.writeFileSync(wav, Buffer.concat([h, data])); }
        await page.setInputFiles("#chooser input[type=file]", wav);
        let err2 = null;
        await page.waitForFunction(() => window.songGlobe.last && window.songGlobe.last.label === "tone-2000hz.wav", undefined, { timeout: 45000 }).catch((e) => { err2 = e; });
        const tone = err2 ? null : await page.evaluate(() => window.songGlobe.last);
        ok(!err2 && tone && Math.abs(tone.peaks[0].hz - 2000) < tone.hzPerBin * tone.binCount / tone.grid,
           "*** a picked 2 kHz WAV rebuilds the globe with its peak in the 2 kHz column ***",
           err2 ? String(err2).slice(0, 120) : `peak ${tone.peaks[0].hz.toFixed(0)} Hz, ${tone.waterVertices} of ${tone.vertexCount} at sea`);
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
    } catch (e) {
        ok(false, "section B ran to its end", String(e && e.message || e).slice(0, 160));
    } finally { await browser.close(); }
}

// ---- SABOTAGE LOG ---------------------------------------------------------------------------------------
//
//   A  lonLatOf swaps the axes: time to latitude, frequency to longitude.
//      -> exit=1, four lines: the area is 62.0 against 50.3 (the grid no longer tiles a sphere), the surface
//      faces inward, the seam opens by 2.5 units, and the page reports inward too.
//
//   B  the seam column repeats row 1 instead of row 0.
//      -> exit=1 -- but on the FIRST draft only the spiral line went red, and the seam line stayed GREEN,
//      because it compared the two seam columns with each other and both were row 1. The check now compares
//      the seam against the field's own row 0; re-run, two lines red.
//
//   C  water is no longer pinned to sea level (h = h01 for every cell).
//      -> ZERO RED on the first draft. A songHeightfield's silent cells already sit at its minimum, so h01
//      was 0 with or without the pin and the branch was never reached: the check was vacuous on that input.
//      A hand-made field with a lake ABOVE the floor reaches it; re-run, one line red (lake at 1.125, not 1).
//
//   D  song-globe.html's default sweep starts at 300 Hz instead of the engine's 200.
//      -> exit=1, two lines: the source comparison, and the page's sea-vertex count no longer matching the
//      module's for the sweep the gate computes.
//
//   Two of four sabotages found a check that could not fail before they found anything about the globe --
//   the same ratio the v4297 sweep and the QR round reported. An input that never reaches the guarded
//   branch makes a check unfalsifiable, and only breaking the branch shows it.
console.log(fails ? "\nFAIL -- " + fails + " check(s)" : "\nALL GREEN");
console.log("unchecked here: what the globe looks like. Counts, radii, ridges and draw calls are asserted; the " +
    "picture is not, beyond the renderer reporting that it drew the triangles.");
process.exit(fails ? 1 : 0);
