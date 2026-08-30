// WebGLEngine/tools/ship/orrery-selfcheck.mjs -- v4185
//
// GATES world/orrery.mjs and tools/ship/orreryScan.mjs.
//
// *** SECTION 1 IS THE ONE WITH A HISTORY. *** Three separate times in one session a scan of mine for "a
// licence file" missed a real one -- MIT-LICENSE.txt, IBMPlexSerif-OFL.txt, and a LICENSE nested under
// quickjs/. In this model that mistake is not cosmetic: it is the difference between CAPTURED and UNPAPERED,
// which is a false accusation that a properly licensed dependency has no paperwork. All three are fixtures
// here.
//
// Section 5 is the ratchet: a vendored body with no licence provenance is not a rendering problem, it is
// something this repository ships without saying it may.
//
// Run: node tools/ship/orrery-selfcheck.mjs   (exit 0 all-pass, 1 on any fail)

import { isLicenceFile, licenceFor, orbitFor, radiusFor, buildOrrery, report,
         CAPTURED, UNPAPERED, REACHED, UNPAPERED_BASELINE } from "../../world/orrery.mjs";
import { scan, listFiles, dirBytes, firstSeen } from "./orreryScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  FAIL  " + m); } };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO = path.resolve(ENG, "..");

// 1) *** THE THREE LICENCE FILENAMES MY OWN SCANS MISSED, AS FIXTURES. ***
{
    ok(isLicenceFile("LICENSE") && isLicenceFile("LICENCE") && isLicenceFile("COPYING"), "the ordinary spellings");
    ok(isLicenceFile("MIT-LICENSE.txt"),
        "*** MIT-LICENSE.txt -- jeromeetienne/fireworks.js, which a pattern anchored on 'starts with licen' reports as having NO licence ***");
    ok(isLicenceFile("IBMPlexSerif-OFL.txt"),
        "*** IBMPlexSerif-OFL.txt -- vendor/fonts, the SIL Open Font Licence under the font's own name ***");
    ok(isLicenceFile("ATTRIBUTION.txt"), "ATTRIBUTION.txt -- how vendor/keyhunt carries its provenance");
    ok(isLicenceFile("NOTICE") && isLicenceFile("APACHE-2.0.txt") && isLicenceFile("UNLICENSE"), "and the other bare forms real trees use");

    // and it must not fire on ordinary files, or every body would read as papered
    ok(!isLicenceFile("index.js") && !isLicenceFile("README.md") && !isLicenceFile("package.json"),
        "ordinary files are not licences");
    ok(!isLicenceFile("licensing-ui.js"),
        "and a filename that merely CONTAINS the word inside another word is not one either -- otherwise a UI module would paper over a missing licence");
    ok(!isLicenceFile("") && !isLicenceFile(null) && !isLicenceFile(42), "empty and non-string inputs are refused rather than throwing");
}

// 2) ROOT BEATS NESTED, and the depth is reported, because they are different qualities of evidence.
{
    const root = licenceFor(["LICENSE", "src/a.js", "vendor/x/LICENSE"]);
    ok(root.found && root.path === "LICENSE" && root.depth === 0, "a root-level licence wins and reports depth 0");
    const nested = licenceFor(["a.js", "quickjs/quickjs-emscripten-core/LICENSE"]);
    ok(nested.found && nested.depth === 2, `a nested one is still found, and its depth is reported (${nested.depth})`);
    const two = licenceFor(["deep/a/b/LICENSE", "near/LICENSE"]);
    ok(two.path === "near/LICENSE", "the SHALLOWEST nested licence is preferred, since it covers more of the body");
    ok(licenceFor(["a.js", "b.wasm"]).found === false, "a body with none is reported as having none");
    ok(licenceFor([]).found === false && licenceFor(null).found === false, "and empty or missing input does not throw");
}

// 3) *** THE ORBIT CARRIES MEANING RATHER THAN BEING DECORATION. *** Age sets the axis; the period follows
//    Kepler's third law FROM that axis, so the two cannot disagree.
{
    const fresh = orbitFor(0), old = orbitFor(100);
    ok(old.a > fresh.a, "a body that arrived long ago sits further out");
    ok(old.period > fresh.period, "and therefore moves slower -- Keith's 'some energetic' is the recent ones");
    for (const d of [0, 1, 7, 30, 365]) {
        const o = orbitFor(d);
        ok(Math.abs(o.period * o.period - o.a * o.a * o.a) < 1e-9,
            `T^2 = a^3 holds exactly at ${d} days (T=${o.period.toFixed(3)}, a=${o.a.toFixed(3)})`);
    }
    ok(orbitFor(-5).a === orbitFor(0).a, "a negative age (a clock skew, a bad date) clamps rather than producing an orbit inside the star");
    // the same law physics/orbits/kepler.js integrates, so a placed body and a simulated one agree
    ok(orbitFor(10).period === Math.sqrt(orbitFor(10).a ** 3), "and the period is derived, never a second free parameter that could drift from the axis");
}

// 4) SIZE is a cube root, so a body a thousand times larger is ten times wider rather than a thousand.
{
    // *** TWO CLAIMS, TESTED SEPARATELY, BECAUSE THE FLOOR BREAKS THE RATIO AND THE FIRST VERSION CONFLATED
    //     THEM. *** It compared radiusFor(1000) against radiusFor(1e9) and expected exactly 100x. But 1000
    //     bytes lands UNDER the minimum size and clamps to the floor, so the measured ratio was 40 and the
    //     check went red against correct code. (It also contained "Math.abs(x - 1000) > 900 === false", which
    //     parses as (comparison) === false and is not the claim it looks like.)
    const a = radiusFor(1e6), b = radiusFor(1e9);      // both comfortably above the floor
    ok(b > a, "a larger body is wider");
    ok(Math.abs(b / a - 10) < 1e-9,
        `and a body a THOUSAND times larger is exactly ${(b / a).toFixed(1)}x wider -- the cube root, not proportional`);
    ok(radiusFor(1000) === radiusFor(1), "below the floor, sizes clamp together rather than shrinking to nothing");
    ok(radiusFor(0) > 0 && radiusFor(null) > 0, "and an empty or unknown body still has a size rather than vanishing");
}

// 5) *** THE REAL TREE, AND THE RATCHET. ***
{
    const sys = scan(ENG, REPO, { today: "2026-08-30" });
    ok(sys.bodies.length >= 12, `${sys.bodies.length} bodies scanned out of vendor/`);
    ok(sys.centre === "SweK", "SweK at the centre");
    ok(sys.captured >= 10, `${sys.captured} carry licence provenance`);

    // the two the wider matcher rescued
    const fonts = sys.bodies.find((b) => b.name === "fonts");
    ok(fonts && fonts.state === CAPTURED && /OFL/.test(fonts.licence || ""),
        "vendor/fonts reads as CAPTURED via its OFL file -- a narrower matcher called it unpapered");
    const wasm = sys.bodies.find((b) => b.name === "wasm");
    ok(wasm && wasm.state === CAPTURED && wasm.licenceDepth > 0,
        `vendor/wasm reads as CAPTURED via a NESTED licence (depth ${wasm?.licenceDepth})`);

    // *** AND THE TWO THAT GENUINELY HAVE NONE. ***
    ok(sys.unpapered.length <= UNPAPERED_BASELINE,
        `UNPAPERED is ${sys.unpapered.length}, at or below the baseline of ${UNPAPERED_BASELINE} -- vendoring something new without licence provenance pushes this over and the check goes red`);
    ok(sys.unpapered.includes("box3d") && sys.unpapered.includes("htmx"),
        `and they are named rather than counted: ${sys.unpapered.join(", ")}`);
    ok(UNPAPERED_BASELINE > 0, "the baseline is honestly non-zero -- there is real paperwork outstanding, not a clean sheet");

    // ordering and determinism
    const again = scan(ENG, REPO, { today: "2026-08-30" });
    ok(JSON.stringify(sys.bodies.map((b) => b.name)) === JSON.stringify(again.bodies.map((b) => b.name)), "two scans agree");
    ok(sys.bodies.every((b, i) => i === 0 || b.a >= sys.bodies[i - 1].a), "and are sorted outward, so a renderer draws them in order and a diff between rounds is readable");

    // *** THE NEWEST ARRIVALS ORBIT CLOSEST, which is the whole "over time" reading ***
    const inner = sys.bodies[0], outer = sys.bodies[sys.bodies.length - 1];
    ok(inner.ageDays <= outer.ageDays, `the innermost body is the youngest (${inner.name}, ${inner.ageDays}d) and the outermost the oldest (${outer.name}, ${outer.ageDays}d)`);
    ok(["draco", "grass", "keyhunt"].includes(inner.name), `and the innermost is one of the three captured today (${inner.name})`);
}

// 6) STATES are exclusive, and a REACHED body is never called unpapered.
{
    const sys = buildOrrery([
        { name: "vendored", paths: ["LICENSE", "a.js"], bytes: 100, arrived: "2026-08-01" },
        { name: "bare", paths: ["a.js"], bytes: 100, arrived: "2026-08-01" },
        { name: "streamed", paths: [], bytes: 0, arrived: "2026-08-01", reached: true },
    ], { today: "2026-08-30" });
    ok(sys.bodies.find((b) => b.name === "vendored").state === CAPTURED, "a licensed vendored body is CAPTURED");
    ok(sys.bodies.find((b) => b.name === "bare").state === UNPAPERED, "an unlicensed vendored body is UNPAPERED");
    ok(sys.bodies.find((b) => b.name === "streamed").state === REACHED,
        "*** and a body that is only REACHED is never UNPAPERED -- nothing was taken, so there is no paperwork owed. Streaming a Khronos model is not vendoring it (see gpu/khronosSamples.mjs) ***");
    ok(!sys.unpapered.includes("streamed"), "so it stays off the outstanding list");
    ok(sys.captured === 1 && sys.reached === 1 && sys.unpapered.length === 1, "the three counts are exclusive");
    ok(/UNPAPERED/.test(report(sys)) && /streamed|reached/.test(report(sys).toLowerCase()), "and the report names them");
}

// 7) THE SCANNER's own primitives.
{
    ok(listFiles(path.join(ENG, "vendor", "grass")).length > 0, "listFiles finds files");
    ok(listFiles(path.join(ENG, "vendor", "nope-not-here")).length === 0, "and returns nothing for a missing directory rather than throwing");
    ok(dirBytes(path.join(ENG, "vendor", "grass")) > 0, "dirBytes measures");
    ok(dirBytes(path.join(ENG, "vendor", "nope")) === 0, "and is zero for a missing one");
    const d = firstSeen(REPO, "WebGLEngine/vendor/three");
    ok(/^\d{4}-\d{2}-\d{2}$/.test(d || ""), `firstSeen returns a date from git (${d})`);
    ok(firstSeen(REPO, "WebGLEngine/vendor/definitely-not-a-real-path") === null,
        "and NULL for a path git has never seen -- which is a real answer and is not the same as 'arrived today'");
}

console.log(`orrery-selfcheck: ${pass} passed, ${fail} failed`);
console.log("unchecked here: the VIEW. This round is the data model, deliberately: an orrery whose bodies are\n" +
            "invented is a screensaver, so every field comes from vendor/, the licence files inside it, and the\n" +
            "date git says each arrived. A renderer can now be written against facts rather than deciding them.");
process.exit(fail ? 1 : 0);
