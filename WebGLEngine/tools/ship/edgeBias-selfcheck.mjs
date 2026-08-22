// tools/ship/edgeBias-selfcheck.mjs
//
// Run: node tools/ship/edgeBias-selfcheck.mjs   (instant)
//
// v3181 -- THE 1/cos SIGNATURE THE HANDOFF SAYS NO GATE CAN SEE.
//
// The standing suspicion about raymarch-live.html is that the compositing boxes are PARTLY BURIED, and buried
// MORE AT THE EDGES. That is a named diagnosis with a named shape: the classic ray-march error where the step
// is taken along a direction not normalized per pixel -- or along z instead of the ray length -- so the
// effective step scales as 1/cos(theta) with angle from the view centre.
//
// *** SYMMETRY IS WHAT MAKES IT A BUG RATHER THAN A SCENE, AND THAT IS THE WHOLE INSTRUMENT. *** cos is EVEN,
// so a 1/cos artefact affects both edges equally. A lopsided scene, a light from one side, or an object nearer
// one edge is NOT symmetric. A single "is it uneven?" check would condemn both; this separates them.
//
// SYNTHETIC VALIDATION, because there is no GPU here: a flat horizon reads 0.0000 bias / 0.0000 asymmetry; a
// symmetric 1/cos sag reads 0.0170 / 0.0009; a one-sided tilt reads -0.0013 / 0.1606. THE TWO FAILURE MODES
// LAND IN DIFFERENT COLUMNS, which is the only property that matters.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const C = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "checks.mjs")).href);
const P = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs")).href);
const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));

const mk = (w, h, topAt) => {
    const d = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const u = (x / w) * 2 - 1, v = (y >= topAt(u) * h) ? 200 : 12, i = (y * w + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    return { width: w, height: h, data: d };
};
const flat   = mk(240, 160, () => 0.35);
const invcos = mk(240, 160, (u) => { const t = u * 0.55; return 0.35 + 0.18 * (1 / Math.cos(t) - 1); });
const tilt   = mk(240, 160, (u) => 0.35 + 0.10 * u);

// ---- 1. THE TWO FAILURE MODES LAND IN DIFFERENT COLUMNS ---------------------------------------------------------
{
    const f = C.edgeBiasProfile(flat, {}), s = C.edgeBiasProfile(invcos, {}), t = C.edgeBiasProfile(tilt, {});

    ok("!! a FLAT horizon reads no bias and no asymmetry",
        Math.abs(f.edgeBias) < 0.002 && f.asymmetry < 0.002 && f.columns >= 40,
        "bias " + f.edgeBias.toFixed(4) + ", asym " + f.asymmetry.toFixed(4) + ". Synthetic, so the answer is " +
        "known BY CONSTRUCTION rather than by agreeing with the thing being measured");

    ok("!! *** a SYMMETRIC 1/cos sag shows BIAS with LOW asymmetry ***",
        s.edgeBias > 0.01 && s.asymmetry < 0.01,
        "bias " + s.edgeBias.toFixed(4) + ", asym " + s.asymmetry.toFixed(4) + ". Positive bias means the EDGES " +
        "SIT LOWER -- geometry buried more at the edges, which is the suspicion stated exactly");

    ok("!! *** and a ONE-SIDED tilt shows ASYMMETRY with almost no bias ***",
        Math.abs(t.edgeBias) < 0.01 && t.asymmetry > 0.1,
        "bias " + t.edgeBias.toFixed(4) + ", asym " + t.asymmetry.toFixed(4) + ". A SINGLE 'is it uneven?' CHECK " +
        "WOULD CONDEMN BOTH THIS AND THE SAG. cos is EVEN, so symmetry is what separates a per-pixel step error " +
        "from a scene that merely leans");

    ok("!! the background is taken from the CORNER, never typed",
        /const c = bg \|\| pixelAt\(img, X0, Y0\)/.test(fs.readFileSync(path.join(ENG, "tools", "render-qa", "checks.mjs"), "utf8")),
        "a hard-coded colour would decide differently the moment somebody changes the page's clear colour -- a " +
        "property of the CSS and not of the geometry");

    ok("...and a column with NO geometry is SKIPPED, not recorded at the floor",
        (() => { const sparse = mk(240, 160, (u) => Math.abs(u) > 0.8 ? 9 : 0.35);   // edges empty
                 const r = C.edgeBiasProfile(sparse, {});
                 return r.ok !== false && r.columns < 48; })(),
        "recording an empty column as top = 1 would read as BURIED TO THE FLOOR and MANUFACTURE exactly the sag " +
        "this is looking for -- an instrument that produces its own finding");
}

// ---- 2. THE PAGE IS NOW LOOKED AT, AND ITS REQUIREMENT NO LONGER LIES --------------------------------------------
{
    const e = man.pages.find((p) => p.name === "raymarch-live");
    ok("!! raymarch-live is in the manifest AT ALL -- it never was",
        !!e && e.canvas === "#c" && (e.checks || []).some((c) => c.type === "edgeBiasProfile"),
        "the handoff has carried 'a 1/cos signature no gate can see' for rounds, and the page was not in this " +
        "file, so NOTHING HAD EVER LOOKED AT IT. Not seeing a thing nobody opens is not a gate limitation");

    ok("!! *** the limits are LOOSE ON PURPOSE and the note says so ***",
        (() => { const c = (e.checks || []).find((x) => x.type === "edgeBiasProfile");
                 return c && c.maxEdgeBias >= 0.2 && /ARE NOT THE ANSWER/.test(e.note || ""); })(),
        "they exist so the run REPORTS the number rather than failing on a value nobody has measured. TYPING A " +
        "THRESHOLD I HAVE NEVER MEASURED is the one thing this tree forbids -- Keith's first run gives the real " +
        "baseline, and it gets tightened then");

    ok("!! *** and the page had been deriving NO requirement, which is worse than a wrong one ***",
        (() => { const r = P.requirementsOf(path.join(ENG, "raymarch-live.html")); return r.ok && r.needs.includes("webgl2"); })(),
        "it acquires its context through acquireGL from /render/glBootstrap.js, so getContext never appears in " +
        "its own source. A PAGE NEEDING A GPU AND CLAIMING TO NEED NOTHING WOULD BE OPENED AND FAILED BY A " +
        "HEADLESS BOX -- v3171 uses these to decide what a machine may judge");

    ok("...and the delegation hole was MEASURED, not guessed at",
        /MEASURED BEFORE FIXING: exactly ONE of 52 manifest pages/.test(
            fs.readFileSync(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs"), "utf8")),
        "one page of fifty-two. The hole is real and it is NARROW, and saying which is the difference between " +
        "a fix and a panic");
}

console.log();
console.log("  ----  WHAT KEITH'S RUN DECIDES: render-qa now REPORTS edgeBias and asymmetry for raymarch-live.");
console.log("  ----  POSITIVE bias with LOW asymmetry = the boxes really are buried more at the edges, and the");
console.log("  ----  1/cos diagnosis stands. HIGH asymmetry = the scene leans and the diagnosis was wrong.");
console.log("  ----  NEAR ZERO BOTH = there was never a burial problem. All three are answers; none was");
console.log("  ----  available before, because nothing opened the page.");
if (fails) { console.log("edgeBias-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("edgeBias-selfcheck: all checks pass");
