// tools/ship/sphereImpostorPage-selfcheck.mjs
//
// Run: node tools/ship/sphereImpostorPage-selfcheck.mjs   (instant)
//
// v3179 -- THE CLAIM, PUT WHERE IT CAN BE DISPROVED.
//
// v3177 lit ev.html's planets as sphere impostors. v3178 made the light draggable, because a STATIC lit sphere
// and a STATIC shaded disc look identical. But finding a planet inside a space sim to check a shading claim is
// a poor test, and v3178 left Keith hunting.
//
// *** THIS PAGE DRAWS THE FAILING CASE BESIDE THE CLAIM. *** A flat disc with ONE constant normal on the left,
// the sphere impostor on the right, BOTH FROM THE SAME LIGHT. Drag the sun: the left boundary stays STRAIGHT,
// the right one BOWS and goes crescent at grazing. A CLAIM ABOUT ABSENCE MUST BE SHOWN FAILING -- and the flat
// disc is that failing case, drawn on purpose rather than described.
//
// ONE SHADER, TWO MODES, and the mode is a UNIFORM rather than two programs -- so a difference between the
// panels CANNOT come from a difference in the code that drew them. If they ever agree, it is the normal and
// not the plumbing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const page = fs.readFileSync(path.join(ENG, "sphere-impostor.html"), "utf8");
const srv = fs.readFileSync(path.join(ENG, "server.html"), "utf8");
const man = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));

// ---- 1. THE COMPARISON IS THE POINT ----------------------------------------------------------------------------
{
    ok("!! *** the FAILING CASE is drawn beside the claim ***",
        /vec3 flatN = vec3\(0\.0, 0\.0, 1\.0\);/.test(page) && /vec3 sphN  = vec3\(p\.x, -p\.y, sqrt\(max\(sz, 0\.0\)\)\);/.test(page),
        "one constant normal against the analytic sphere normal. A lit sphere and a shaded disc look the same " +
        "in a still frame, and the ONLY way to see the difference is to have the wrong one in view");

    ok("!! ONE shader, TWO modes -- the mode is a uniform, not a second program",
        /uniform float u_sphere/.test(page) && /mix\(flatN, sphN, u_sphere\)/.test(page) &&
        (page.match(/const FS = `/g) || []).length === 1,
        "so a difference between the panels CANNOT come from a difference in the code that drew them. IF THEY " +
        "EVER AGREE IT IS THE NORMAL, NOT THE PLUMBING");

    ok("!! both panes take the SAME light",
        /p\.gl\.uniform3f\(p\.uL, light\[0\], light\[1\], light\[2\]\)/.test(page),
        "one vector, both draws, in one loop. Two light variables would make an honest disagreement look like " +
        "a shading result");

    ok("...and the rim is guarded, again",
        /sqrt\(max\(sz, 0\.0\)\)/.test(page) && /if \(sz < 0\.0\) discard;/.test(page),
        "the discard already covers it, and relying on an EARLIER discard to protect a LATER sqrt is trusting " +
        "the order of two decisions -- v3177's reasoning, restated because this is a different shader");
}

// ---- 2. UNSUPPORTED, FAILED AND RAN STAY APART -------------------------------------------------------------------
{
    ok("!! a browser with no WebGL2 is UNSUPPORTED and says so, not blank",
        /UNSUPPORTED: /.test(page) && /not\s+a\s+defect\s+in\s+the\s+page/.test(page) && /unsupported: true/.test(page),
        "v3120's law: one word for 'this box has no WebGL2' and 'the shader is broken' makes every limited " +
        "machine look defective. A blank canvas says neither");

    ok("!! and a REAL failure is RETHROWN so render-qa sees it",
        /if \(!\(e && e\.unsupported\)\) throw e;/.test(page),
        "swallowing it would leave a page that reports its own breakage in a div nobody automated reads -- the " +
        "pageerror hook is what turns it into a red run");
}

// ---- 3. BOTH HALVES OF REACHABILITY ------------------------------------------------------------------------------
{
    ok("!! linked from server.html AND in the render-qa manifest",
        /sphere-impostor\.html/.test(srv) && man.pages.some((p) => p.name === "sphere-impostor"),
        "v3123 found pages IN the manifest and linked from NOTHING; v3135 found the same with the halves " +
        "swapped. MACHINE-REACHABLE AND HUMAN-UNREACHABLE is the worse of the two, because every automated " +
        "surface reports it fine");

    ok("!! its requirement DERIVES, with no hand-written declaration",
        await (async () => {
            const P = await import(pathToFileURL(path.join(ENG, "tools", "render-qa", "pageRequirements.mjs")).href);
            const r = P.requirementsOf(path.join(ENG, "sphere-impostor.html"));
            return r.ok && r.needs.includes("webgl2");
        })(),
        "v3170's scanner picked up webgl2 from the getContext call without anybody adding a needs: field. A " +
        "typed one would be a SECOND DECLARATION ABOUT ONE THING");

    // v3180 -- THIS PINNED THE NOTE'S WORDING AND WENT RED WHEN THE NOTE WAS REWRITTEN. Twenty-first
    // mechanism-pin, mine, one round later. The PROPERTY is that SOME entry for this page explains why a
    // capability-less box still passes -- not that a particular sentence survives an edit.
    ok("...and some manifest entry for this page explains the capability-less pass",
        man.pages.filter((p) => p.url === "/sphere-impostor.html")
                 .some((p) => /capability-less|no WebGL2/i.test(p.note || "")),
        "v3135's note on economy.html: a page that went blank without its dependency would fail QA for a " +
        "NON-DEFECT, get excluded, and never be checked again. MY v3180 REWRITE DROPPED THAT REASONING and " +
        "only this check noticed -- restored");
}

console.log();
console.log("  ----  WHAT THIS BOX CANNOT SEE: either disc. No GPU here -- the SHADER SOURCE and the wiring are");
console.log("  ----  asserted and nothing has run them. ON THE RIG: open it from server.html and drag the sun.");
console.log("  ----  THE LEFT BOUNDARY MUST STAY STRAIGHT AND THE RIGHT ONE MUST BOW. If they look alike, the");
console.log("  ----  impostor normal is not reaching the fragment -- and the flat disc is there so you can tell.");
if (fails) { console.log("sphereImpostorPage-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("sphereImpostorPage-selfcheck: all checks pass");
