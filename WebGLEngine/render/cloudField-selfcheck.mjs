// WebGLEngine/render/cloudField-selfcheck.mjs — v4055
//
// Run: node render/cloudField-selfcheck.mjs   (~0.2s; no browser, no GPU)
//
// Keith: "we also have great clouds we made to pass through." They were great and they were UNREACHABLE: the
// puffs were generated inline inside render/cloudLayer.js's WebGL2 renderer, so a Three.js page could not have
// them without a second copy of the placement. render/cloudField.js is the half that ports.
//
// *** AND THE EXTRACTION MADE A CLAIM POSSIBLE THAT COULD NOT BE MADE BEFORE. *** The original called
// Math.random() directly, so no gate could ever assert anything about a PARTICULAR sky -- only that some
// numbers landed inside some ranges. Seeded on mulberry32 (the same PRNG world/procPlanet.js uses), a seed now
// names a cloud field, and "the engine's sky and the planet's sky come from one generator" becomes checkable
// rather than aspirational.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };

const CF = await import(pathToFileURL(path.join(HERE, "cloudField.js")).href);
const PS = await import(pathToFileURL(path.join(ROOT, "world", "planetSurface.js")).href);
const PP = await import(pathToFileURL(path.join(ROOT, "world", "procPlanet.js")).href);

console.log("cloudField-selfcheck -- one generator, two skies, and a seed that names a sky\n");

console.log("1. *** SEEDED: THE SAME SEED IS THE SAME SKY, AND A DIFFERENT ONE IS NOT ***");
{
    const a = CF.buildPuffsFlat({ type: "cumulus", seed: 7 });
    const b = CF.buildPuffsFlat({ type: "cumulus", seed: 7 });
    const c = CF.buildPuffsFlat({ type: "cumulus", seed: 8 });
    ok("!! *** the same seed rebuilds a BYTE-IDENTICAL field -- impossible before, when this was Math.random() ***",
        a.length > 0 && JSON.stringify(a) === JSON.stringify(b),
        a.length + " puffs, identical across two calls with seed 7");
    ok("!! ...and a different seed really is a different sky (the seed is not being ignored)",
        JSON.stringify(a) !== JSON.stringify(c),
        "seed 8 differs from seed 7 -- a generator that ignored its seed would pass the check above perfectly");
    ok("...and an unknown type yields nothing rather than throwing",
        CF.buildPuffsFlat({ type: "nope", seed: 1 }).length === 0 &&
        CF.buildPuffsShell({ type: "nope", seed: 1 }).length === 0);
}

console.log("\n2. *** EVERY TYPE STAYS INSIDE ITS OWN DECLARED CHARACTER ***");
{
    let worst = "";
    const inBand = CF.CLOUD_TYPES.every((name) => {
        const t = CF.cloudType(name);
        const puffs = CF.buildPuffsFlat({ type: name, seed: 1234 });
        const nClusters = t.clouds;
        if (puffs.length < nClusters * t.puffs[0] || puffs.length > nClusters * t.puffs[1]) { worst = name + " count " + puffs.length; return false; }
        for (const p of puffs) {
            // towering types shrink their upper puffs by up to 35%, so the low bound relaxes for those
            const lowW = t.w[0] * (t.tower ? 0.65 : 1) - 1e-9;
            if (p.w < lowW || p.w > t.w[1] + 1e-9) { worst = name + " w " + p.w.toFixed(2); return false; }
            if (p.h < t.h[0] - 1e-9 || p.h > t.h[1] + 1e-9) { worst = name + " h " + p.h.toFixed(2); return false; }
            if (p.density <= 0 || p.density > t.density + 1e-9) { worst = name + " density " + p.density.toFixed(3); return false; }
            if (Math.abs(p.y - t.altitude) > t.spreadY + 5) { worst = name + " y " + p.y.toFixed(1); return false; }
        }
        return true;
    });
    ok("!! all six types generate puff counts, sizes, densities and altitudes inside their own table",
        inBand, worst || "cumulus, cumulonimbus, stratus, stratocumulus, cirrus, nimbostratus all in band");

    ok("!! ...and a towering type really does stack upward while a flat one does not",
        (() => {
            const tow = CF.buildPuffsShell({ type: "cumulonimbus", seed: 5, sizeScale: 0.02 });
            const flat = CF.buildPuffsShell({ type: "stratus", seed: 5, sizeScale: 0.02 });
            const spread = (ps) => Math.max(...ps.map((p) => p.radius)) - Math.min(...ps.map((p) => p.radius));
            return spread(tow) > spread(flat) * 2;
        })(),
        "cumulonimbus is the anvil: its puffs must span a much larger RADIAL range than a stratus sheet's");
}

console.log("\n3. *** THE SPHERICAL PLACEMENT PUTS WEATHER ON A WORLD, ABOVE ITS ACTUAL GROUND ***");
{
    const spec = PP.planetSpec(42), R = 17, AMP = 0.035, ALT = 1.2;
    const dir = [0, 0, 1];
    const puffs = CF.buildPuffsShell({ type: "cumulus", center: [0, 0, 0], groundRadius: R, altitude: ALT, dir, coverage: 0.45, sizeScale: 0.02, seed: 99 });
    ok("!! the shell builder produces puffs at all", puffs.length > 10, puffs.length + " puffs");

    // *** THE CHECK THAT TIES CLOUDS TO THE REAL TERRAIN: every puff must clear the DISPLACED ground beneath
    // it, not the mean radius. Relief reaches ~0.39 units on this planet, so a cloud deck placed against the
    // mean sphere can sit inside a mountain -- the same class of bug v4053's descent had to avoid.
    let minClear = Infinity;
    for (const p of puffs) {
        const ground = PS.surfaceRadiusAt(spec, p.up, { radius: R, ampFrac: AMP });
        minClear = Math.min(minClear, p.radius - ground);
    }
    ok("!! *** EVERY PUFF CLEARS THE DISPLACED TERRAIN UNDER IT, not just the mean radius ***",
        minClear > 0,
        "worst clearance " + minClear.toFixed(4) + " units at altitude " + ALT + "; relief on this planet " +
        "reaches ~0.39, so clearing the MEAN sphere would not have been enough");

    // clusters land inside the requested cone -- generating a whole globe's weather to fly through one patch
    // of it is puffs nobody sees.
    const cosMax = Math.min(...puffs.map((p) => p.up[0] * dir[0] + p.up[1] * dir[1] + p.up[2] * dir[2]));
    ok("!! ...and the field stays inside the coverage cone it was asked for",
        Math.acos(Math.max(-1, Math.min(1, cosMax))) < 0.45 + 0.25,
        "furthest puff is " + Math.acos(Math.max(-1, Math.min(1, cosMax))).toFixed(3) +
        " rad off axis for a 0.45 rad cone (cluster spread widens it slightly, by design)");

    ok("!! ...and each puff carries the planet's own radial up, so a tower grows away from the surface",
        puffs.every((p) => Math.abs(Math.hypot(p.up[0], p.up[1], p.up[2]) - 1) < 1e-9),
        "every puff.up is a unit vector");

    // altitude is the CALLER's, not the type's -- the load-bearing separation this module's header argues for.
    const high = CF.buildPuffsShell({ type: "cumulus", groundRadius: R, altitude: 5, dir, seed: 99, sizeScale: 0.02 });
    ok("!! *** ALTITUDE COMES FROM THE CALLER, NOT THE TYPE TABLE ***",
        Math.min(...high.map((p) => p.radius)) > Math.max(...puffs.map((p) => p.radius)),
        "TYPES.cumulus says altitude 135 -- correct for an engine world, and eight planet-radii out in space " +
        "here. altitude 5 really does sit above altitude 1.2, so the caller's number is the one that counts");
}

console.log("\n4. *** ONE GENERATOR, TWO RENDERERS -- cloudLayer NO LONGER CARRIES ITS OWN COPY ***");
{
    const CL = fs.readFileSync(path.join(HERE, "cloudLayer.js"), "utf8");
    ok("!! render/cloudLayer.js imports the shared generator instead of placing puffs inline",
        /from "\.\/cloudField\.js"/.test(CL) && /buildPuffsFlat\(\{/.test(CL),
        "a second copy of the placement is how the engine's sky and the planet's sky drift apart");
    ok("!! ...and its inline TYPES table is GONE, not left beside the shared one",
        !/const TYPES = \{[\s\S]*cumulonimbus:/.test(CL),
        "an unused parallel table is exactly how a 'shared' table stops being shared");
    ok("!! ...and it still exports CLOUD_TYPES, so nothing that consumed it has to change",
        /export const CLOUD_TYPES = FIELD_TYPES;/.test(CL));

    const mod = await import(pathToFileURL(path.join(HERE, "cloudLayer.js")).href);
    ok("!! ...and the re-exported list really is the same six names",
        JSON.stringify(mod.CLOUD_TYPES) === JSON.stringify(CF.CLOUD_TYPES),
        mod.CLOUD_TYPES.join(", "));

    // the engine's own sky must still VARY between regenerates -- seeding must not have frozen it.
    const s1 = CF.buildPuffsFlat({ type: "cumulus", seed: 1 }), s2 = CF.buildPuffsFlat({ type: "cumulus", seed: 2 });
    ok("!! ...and the engine still gets a fresh sky each regenerate (a fresh seed, not a frozen field)",
        /seed: \(Math\.random\(\) \* 0xffffffff\) >>> 0/.test(CL) && JSON.stringify(s1) !== JSON.stringify(s2),
        "seeding is for REPRODUCIBILITY when you want it, not for making every sky identical");
}

console.log("\n5. *** THE PLANET PAGE DRAWS THEM, AND THE ARRIVAL REALLY FLIES THROUGH ***");
{
    const page = fs.readFileSync(path.join(ROOT, "es-box3d-fly3d.html"), "utf8");
    ok("!! es-box3d-fly3d.html builds its deck from the shared generator, not its own placement",
        /import \{ buildPuffsShell \} from "\/render\/cloudField\.js"/.test(page) && /buildPuffsShell\(\{ type: typeName/.test(page),
        "the whole point of the extraction is that the engine's sky and the planet's sky are one function");
    ok("!! ...and it ports cloudLayer's OWN look rather than inventing a second one",
        /smoothstep\(1\.0, 0\.18, r\) \* vDen/.test(page) && /mix\(vBot, vTop, clamp\(vUv\.y \* 0\.5 \+ 0\.5/.test(page),
        "the radial falloff and the two-tone gradient are cloudLayer.js's, line for line -- only the GL plumbing differs");
    ok("!! ...as ONE instanced mesh, not a draw call per puff",
        /InstancedBufferGeometry/.test(page) && /InstancedBufferAttribute/.test(page),
        "a cumulonimbus field is ~40 puffs; 40 draw calls a frame for 40 copies of one quad is not a design");
    ok("!! ...and the deck can be turned OFF, not only cycled",
        /function clearCloudDeck\(\)/.test(page) && /cloudTypeIdx === CLOUD_ORDER\.length/.test(page),
        "a control that cannot reach its own off state is also the only way to tell what it is responsible for on screen");

    const pw = await import(pathToFileURL(path.join(ROOT, "tools", "ship", "playwrightResolve.mjs")).href);
    const { createRequire } = await import("node:module");
    const rr = pw.resolvePlaywright(createRequire(import.meta.url));
    const skip = pw.browserSkipReason(rr.chromium, rr.from, pw.HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  live deck SKIPPED -- " + skip);
        console.log("  ----  *** A SKIP, NOT A PASS: source cannot show that the camera crossed the shell.");
    } else {
        const http = await import("node:http");
        const srv = http.default.createServer((rq, rs) => {
            const p = decodeURIComponent((rq.url || "/").split("?")[0]);
            const f = path.join(ROOT, p);
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
            pg.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
            await pg.setViewportSize({ width: 700, height: 460 });
            await pg.goto("http://127.0.0.1:" + srv.address().port + "/es-box3d-fly3d.html?seed=42", { waitUntil: "load", timeout: 40000 });
            await pg.waitForTimeout(3500);
            const boot = await pg.evaluate(() => window.swekCloudProbe());
            ok("!! a deck exists on load, on a shell above the planet",
                boot && boot.deck && boot.puffs > 10 && boot.minR > 17,
                boot && boot.deck ? boot.puffs + " puffs, shell " + boot.minR.toFixed(2) + ".." + boot.maxR.toFixed(2) : "no deck");

            await pg.evaluate(() => window.swekArrive());
            // *** MEASURE A CROSSING, NOT A SAMPLE INSIDE A THIN BAND. *** The shell is ~0.2 units thick and the
            // camera is doing thousands of units a second through it; asking "was a sample ever between minR and
            // maxR" is asking to win a timing lottery, and it reported a false negative on a flight that plainly
            // went through. Above-then-below is the property that actually means "flew through it".
            let wasAbove = false, endedBelow = false, minR = Infinity;
            for (let i = 0; i < 220; i++) {   // 22.5s of flight, and headless runs ~2x slower than real time
                await pg.waitForTimeout(350);
                const c = await pg.evaluate(() => window.swekCloudProbe());
                const a = await pg.evaluate(() => window.swekArrivalProbe());
                if (c && c.deck) {
                    if (c.camR > c.maxR) wasAbove = true;
                    if (wasAbove && c.camR < c.minR) endedBelow = true;
                    minR = Math.min(minR, c.camR);
                }
                if (a && !a.flying && i > 3) break;
            }
            ok("!! *** THE ARRIVAL CROSSES THE CLOUD DECK: above it, then below it ***",
                wasAbove && endedBelow,
                "started above the shell and finished under it, closest approach r=" + minR.toFixed(2) +
                " -- a crossing, measured as a transition rather than as a sample caught inside a 0.2-unit band");
            ok("!! ...with zero page errors", errs.length === 0, errs[0] || "clean");
        } finally { await b.close(); await new Promise((x) => srv.close(x)); }
    }
}

console.log("\n6. *** offsetDir/norm -- EXPORTED AT v4076 FOR render/mossField.js, AND PROVEN HERE DIRECTLY ***");
{
    // v4076 -- these two were PRIVATE to this file until moss needed the same tangent-offset arithmetic clouds
    // scatter with. Both cluster placements above already exercise them indirectly through buildPuffsShell();
    // this proves the two functions on their own terms, which is what definitionGates-selfcheck's tree-wide
    // ratchet asks of an export -- "closed by ASSERTION, not by mention" -- now that exporting them made them
    // visible to a check outside this file for the first time.
    ok("!! offsetDir(dir, 0, 0) returns dir unchanged -- no offset is no offset",
        JSON.stringify(CF.offsetDir([0, 1, 0], 0, 0)) === JSON.stringify([0, 1, 0]));
    ok("!! offsetDir ALWAYS returns a unit vector, whatever the offset",
        Math.abs(Math.hypot(...CF.offsetDir([0, 0, 1], 0.3, -0.2)) - 1) < 1e-12);
    ok("!! ...even at the pole, where the eastward tangent degenerates and falls back to +x",
        Math.abs(Math.hypot(...CF.offsetDir([0, 1, 0], 0.4, 0.15)) - 1) < 1e-12);
    ok("!! norm() actually normalizes", JSON.stringify(CF.norm([3, 4, 0])) === JSON.stringify([0.6, 0.8, 0]));
}

console.log("\n" + (fails ? fails + " FAILED" : "all passed"));
if (fails) process.exit(1);
