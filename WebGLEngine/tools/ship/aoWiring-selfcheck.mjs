// WebGLEngine/tools/ship/aoWiring-selfcheck.mjs -- v2831
//
// Run: node tools/ship/aoWiring-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES ambientOcclusion + occlusionRamp REACHING A LIVE PAGE.
//
// Both were built and gated in v2764 -- and rendered by NOTHING for sixty-seven versions. The engine's own
// predictions.html states the gap in as many words: "this proves the occlusion QUANTITY is real and correctly
// signed on the CPU mesh; wiring the ramp into the live blob/flesh pages is the rendering step". mc-flesh.html
// is now that page.
//
// So what is gated here is NOT the occlusion maths (ambientOcclusion-selfcheck already owns that) but that the
// live page consults it, that the result is not flat, and that the SIGN is physical on the actual field the page
// builds -- a crease between two metaballs must be MORE occluded than an outer tip. An AO term with the sign
// inverted still looks like shading, which is why it needs a measurement rather than a glance.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wyvill, wyvillGrad, marchingTets, ambientOcclusion, occlusionRamp } from "../../physics/mesh/marchingCubes.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };

const html = fs.readFileSync(path.join(ENG, "mc-flesh.html"), "utf8");
const code = html.replace(/<!--[\s\S]*?-->/g, "").replace(/^\s*\/\/[^\n]*/gm, "");

// 1. THE WIRING EXISTS -- the gap predictions.html named
{
    ok("mc-flesh imports both AO functions", /import \{[^}]*ambientOcclusion[^}]*occlusionRamp[^}]*\} from ".\/physics\/mesh\/marchingCubes\.js"/.test(html));
    ok("...and calls ambientOcclusion on the mesh it built", /ambientOcclusion\(mesh\.verts/.test(code));
    ok("...and turns it into colour with occlusionRamp", /occlusionRamp\(ao\)/.test(code));
    ok("occlusion is TOGGLEABLE, so it can be shown to be doing something", /id="ao"/.test(html) && /useAO\s*=\s*!useAO/.test(code));
    ok("the measured range is reported on the page, not just used", /occlusion.*aoRange\[0\]|aoRange\[0\].*aoRange\[1\]/.test(code));
}

// 2. AO MULTIPLIES THE AMBIENT TERM rather than replacing the light
{
    ok("AO scales the AMBIENT term, leaving the Lambert term intact", /amb\s*=\s*useAO\s*\?[^;]*f\.occ/.test(code) && /shade\s*=\s*amb\s*\+\s*0\.85\s*\*\s*nl/.test(code));
    ok("...and the reason is recorded where the next person will read it", /darkens what is not directly|flat-lit/i.test(html));
    ok("with AO off the page still renders (the toggle is not a crash path)", /useAO \? f\.tint : \[/.test(code));
}

// 3. ON THE REAL FIELD THE PAGE BUILDS -- not a convenient fixture
{
    // reproduce mc-flesh's own seeded metaballs exactly
    const rng = (s) => { let x = s * 2654435761 >>> 0; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
    const r = rng(3), n = 3 + (r() * 3 | 0), balls = [];
    for (let i = 0; i < n; i++) balls.push({ cx: (r() - 0.5) * 1.3, cy: (r() - 0.5) * 1.3, cz: (r() - 0.5) * 1.3, r: 0.6 + r() * 0.5, s: 1 });
    const field = (x, y, z) => wyvill(balls, x, y, z);
    const grad = (x, y, z) => wyvillGrad(balls, x, y, z);
    const mesh = marchingTets(field, grad, { N: 40, lo: -1.9, hi: 1.9, iso: 0.3 });
    ok("the page's own parameters produce a real mesh", mesh.verts.length > 1000 && mesh.tris.length > 2000, `${mesh.verts.length} verts`);

    const t0 = Date.now();
    const ao = ambientOcclusion(mesh.verts, field, grad, { iso: 0.3, radius: 0.25 });
    const ms = Date.now() - t0;
    ok("AO is fast enough to run on every rebuild", ms < 2000, ms + "ms for " + mesh.verts.length + " verts");

    let lo = Infinity, hi = -Infinity;
    for (const v of ao) { if (v < lo) lo = v; if (v > hi) hi = v; }
    ok("occlusion VARIES across the surface (a constant would be decoration)", hi - lo > 0.05, `${lo.toFixed(4)} .. ${hi.toFixed(4)}`);
    ok("occlusion stays in [0,1]", lo >= 0 && hi <= 1);

    // THE PHYSICAL CLAIM: a vertex sitting inside two metaballs sees more of itself than an outer tip does.
    // An inverted sign still LOOKS like shading, so this is measured rather than eyeballed.
    let creaseSum = 0, creaseN = 0, tipSum = 0, tipN = 0;
    for (let i = 0; i < mesh.verts.length; i++) {
        const v = mesh.verts[i];
        const d = Math.hypot(v[0], v[1], v[2]);
        let near = 0;
        for (const b of balls) if (Math.hypot(v[0] - b.cx, v[1] - b.cy, v[2] - b.cz) < b.r * 1.15) near++;
        if (near >= 2) { creaseSum += ao[i]; creaseN++; } else if (d > 1.0) { tipSum += ao[i]; tipN++; }
    }
    ok("the sample split found both creases and tips", creaseN > 20 && tipN > 20, `${creaseN} crease, ${tipN} tip`);
    ok("CREASES ARE MORE OCCLUDED THAN TIPS -- the sign is physical", creaseSum / creaseN > tipSum / tipN,
        `crease ${(creaseSum / creaseN).toFixed(4)} vs tip ${(tipSum / tipN).toFixed(4)}`);

    const rgb = occlusionRamp(ao);
    ok("the ramp emits three channels per vertex", rgb.length === ao.length * 3);
    // an unoccluded vertex takes the bright end; a fully occluded one would take the dark end
    const bright = occlusionRamp(new Float32Array([0]));
    const dark = occlusionRamp(new Float32Array([1]));
    ok("the ramp runs bright -> dark as occlusion rises", bright[0] > dark[0] && bright[1] > dark[1] && bright[2] > dark[2],
        `${bright[0].toFixed(2)} -> ${dark[0].toFixed(2)}`);
}

// 4. the page is under render QA, so a black canvas cannot ship unnoticed
{
    const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
    const { discover } = await import("../render-qa/discover.mjs");
    const res = discover({ dir: ENG, manifest: man });
    const entry = res.pages.find((p) => String(p.url) === "/mc-flesh.html");
    ok("mc-flesh.html is in the render-QA page list", !!entry);
    ok("...with a canvas check, so a flat or black render fails", !!entry && (entry.checks || []).some((c) => c.type === "notAllBlack"));
}

console.log("aoWiring-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
