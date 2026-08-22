// tools/ship/spriteLighting-selfcheck.mjs
//
// Run: node tools/ship/spriteLighting-selfcheck.mjs   (instant)
//
// v3177 -- THE BILLBOARDS WERE NEVER LIT, AND A NORMAL MAP WAS THE WRONG TOOL.
//
// Keith asked about normal maps on 2D sprites. THE MACHINERY ALREADY EXISTS: ai/MaterialSet.js registers a
// diffuse + height + normal triplet, ui/parallaxPreview.js (Round 175) shades a rotating quad with PARALLAX
// OCCLUSION MAPPING against it, and render/EntityMeshRenderer.js BINDS NORMALS and has four callers.
//
// *** BUT NOTHING IN THE BILLBOARD PATH EVER HAD ONE. *** ev/flightView.js and render/entityVisuals.js contain
// ZERO normal or light references between them -- they read a colour and stop.
//
// *** AND A NORMAL MAP STILL WOULD NOT HAVE HELPED, WHICH IS THE FINDING. *** flightView's sprites are
// gl_PointCoord points drawn PROCEDURALLY FROM VERTEX COLOUR. THERE IS NO TEXTURE TO SAMPLE. Bolting a normal
// map onto them would have been adopting a technique because it was asked for rather than because it fits --
// the shape this session has caught six times, from the other side.
//
// WHAT FITS IS THE SPHERE IMPOSTOR: a point sprite standing in for a sphere has an ANALYTIC normal costing one
// sqrt -- N = vec3(p, sqrt(1 - p.p)) for p across the quad. Exact, not approximated, and free of any texture.
//
// *** THE TERMINATOR IS THE POINT. *** A flat disc lit by a constant reads as a COIN. A sphere impostor has a
// CURVED day/night boundary that moves with the light, which is the one cue that says "this is a ball".

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.resolve(HERE, "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const fv = fs.readFileSync(path.join(ENG, "ev", "flightView.js"), "utf8");
const strip = (s) => s.replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const code = strip(fv);

// ---- 1. THE NORMAL IS ANALYTIC, AND THE RIM IS GUARDED ---------------------------------------------------------
{
    ok("!! the sprite carries a SPHERE normal derived from gl_PointCoord",
        /vec2 sp = \(gl_PointCoord - vec2\(0\.5\)\) \* 2\.0;/.test(code) &&
        /vec3 sphN = vec3\(sp\.x, -sp\.y, sqrt\(max\(sz, 0\.0\)\)\);/.test(code),
        "one sqrt, exact rather than approximated, and NO TEXTURE INVOLVED -- which is why a normal map was the " +
        "wrong tool for sprites drawn procedurally from vertex colour");

    ok("!! *** the rim is guarded: sqrt(max(sz, 0.0)), never sqrt of a negative ***",
        /sqrt\(max\(sz, 0\.0\)\)/.test(code) && !/sqrt\(sz\)/.test(code),
        "outside the disc 1 - p.p goes NEGATIVE and sqrt of it is NaN, which propagates through the dot product " +
        "and paints the WHOLE sprite. The disc is discarded out there anyway -- but relying on a discard that " +
        "happens LATER to protect an earlier NaN is trusting the order of two unrelated decisions");

    ok("!! the night side is DIM, not black",
        /0\.25 \+ 0\.75 \* lam/.test(code),
        "an ambient floor. A planet whose dark limb is pure black reads as a bite taken out of it, and the " +
        "silhouette against space disappears entirely");

    // v3178 -- THIS PINNED THE CONSTANT AND WENT RED WHEN THE CONSTANT CORRECTLY BECAME A UNIFORM.
    // The PROPERTY is "whatever direction is used, it is normalized AT THE POINT OF USE". v3177 asserted the
    // literal vector instead, which is TRUE OF TODAY'S ARRANGEMENT and not of the rule. TWENTIETH MECHANISM-PIN
    // THIS SESSION, MINE, ONE ROUND AFTER THE LAW WAS WRITTEN DOWN AGAIN. Assert the property, never the
    // arrangement that satisfied it today.
    ok("...and whatever direction is used, it is NORMALIZED at the point of use",
        /dot\(sphN, normalize\([A-Za-z_][A-Za-z0-9_]*\)\)/.test(code) || /dot\(sphN, normalize\(vec3\(/.test(code),
        "an unnormalized direction scales the lambert term by its length -- a brightness change that looks like " +
        "a material choice and is an arithmetic error");
}

// ---- 2. IT LIGHTS ONLY WHAT SHOULD BE LIT ------------------------------------------------------------------------
{
    ok("!! *** only planets are shaded -- shots and rings are EMISSIVE ***",
        /if \(v_kind < 0\.5\) c\.rgb \*= shade;/.test(code),
        "a weapon bolt with a dark side would be a bolt that is lit BY something, which is exactly wrong for a " +
        "thing that emits. UNSUPPORTED and FAILED must stay apart, and so must LIT and EMISSIVE");

    ok("!! and the machinery it did NOT use is still there and still right",
        (() => {
            const em = fs.readFileSync(path.join(ENG, "render", "EntityMeshRenderer.js"), "utf8");
            return /normal/i.test(em) && fs.existsSync(path.join(ENG, "ai", "MaterialSet.js"))
                && fs.existsSync(path.join(ENG, "ui", "parallaxPreview.js"));
        })(),
        "MaterialSet's diffuse+height+normal triplet, parallaxPreview's occlusion mapping and " +
        "EntityMeshRenderer's normal binding all predate this and all serve MESHES. THE GAP WAS NEVER MISSING " +
        "MACHINERY -- it was a path that had never asked for any");
}

// ---- 3. WHAT IS STILL FLAT ---------------------------------------------------------------------------------------
{
    // *** v3178 -- THE v3177 CHECK HERE PASSED BECAUSE IT COULD NEVER FAIL, AND KEITH'S QUESTION EXPOSED IT.
    // *** It asserted that render/entityVisuals.js contains no sphN / uLightDir / normalMap, framed as "still
    // unlit, recorded rather than quietly done". BUT THAT FILE IS A LOOKUP TABLE -- ENTITY_COLORS plus
    // colorFor / scaleFor / animFor / shininessFor / targetSizeFor / heightScaleFor, kind-to-value maps with no
    // shader in them. Those tokens COULD NEVER APPEAR THERE, so the check passed trivially and forever: "a
    // system whose checks pass because it does nothing", which this tree names as a failure mode, written by me
    // one round ago. Replaced with the fact that is actually true and actually checkable.
    const ev = fs.readFileSync(path.join(ENG, "render", "entityVisuals.js"), "utf8");
    ok("!! render/entityVisuals.js is a TABLE, not a renderer -- there is nothing there to light",
        /export const ENTITY_COLORS/.test(ev) && /export function colorFor/.test(ev) &&
        !/#version|gl_FragColor|void main\(/.test(ev),
        "it exports ENTITY_COLORS, colorFor, scaleFor, animFor, shininessFor, targetSizeFor and heightScaleFor. " +
        "MY v3177 NOTE CALLED IT 'still unlit', which is true of a spreadsheet and means nothing. The billboard " +
        "I saw at line 153 is a COMMENT on an earth_sky colour entry");
}

// ---- 4. v3178: THE LIGHT MOVES, WHICH IS WHAT MAKES v3177 FALSIFIABLE ------------------------------------------
// *** A STATIC LIT SPHERE AND A STATIC SHADED DISC LOOK THE SAME. *** Both are bright on one side, and one frame
// cannot separate them. The difference is only visible IN MOTION: a flat disc's boundary is STRAIGHT and slides
// across, while a SPHERE'S TERMINATOR BOWS and collapses to a crescent near grazing. v3177 shipped a claim that
// could not be tested from the page; this makes it testable.
{
    const fvSrc = fs.readFileSync(path.join(ENG, "ev", "flightView.js"), "utf8");
    const page = fs.readFileSync(path.join(ENG, "ev.html"), "utf8");

    ok("!! the light is a UNIFORM, not a constant",
        /uniform vec3 u_light;/.test(fvSrc) && /normalize\(u_light\)/.test(strip(fvSrc)) &&
        !/normalize\(vec3\(-0\.45/.test(strip(fvSrc)),
        "v3177's fixed direction could not prove anything from a still frame. A uniform can be dragged, and a " +
        "bowing terminator is unmistakable where a bright side is not");

    ok("!! it is set EVERY FRAME, not once at init",
        /if \(pl\.u_light\) gl\.uniform3f\(pl\.u_light/.test(fvSrc),
        "a uniform is per-program state and this program also draws stars and shots -- setting it once would " +
        "leave whatever the last caller happened to write");

    ok("!! *** a ZERO VECTOR is refused, and the previous direction kept ***",
        await (async () => {
            const M = await import(pathToFileURL(path.join(ENG, "ev", "flightView.js")).href);
            const before = M.lightDir();
            const r = M.setLightDir(0, 0, 0);
            return r.ok === false && /no direction/.test(r.why) && JSON.stringify(M.lightDir()) === JSON.stringify(before);
        })(),
        "normalize(vec3(0)) is NaN in GLSL, and it would paint every planet rather than reporting anything. " +
        "Refusing keeps the last good direction instead of substituting a plausible one");

    ok("!! the shader normalizes AGAIN rather than trusting the caller",
        /normalize\(u_light\)/.test(strip(fvSrc)),
        "a uniform is whatever somebody last wrote into it. An unnormalized direction scales lambert by its " +
        "length -- a brightness change that reads as a material choice and is an arithmetic error. Normalizing " +
        "twice costs nothing; trusting once costs a bug");

    ok("!! the page has a pad, and dragging past the rim CLAMPS to edge-on",
        /id="sunPad"/.test(page) && /rr > 1 \? 1\/Math\.sqrt\(rr\) : 1/.test(page),
        "outside the disc is not a direction on the front hemisphere. Clamping to the rim gives z = 0 -- a light " +
        "exactly edge-on, which is the honest reading of 'dragged past the edge' and also the angle where the " +
        "crescent is most obvious");

    ok("...and the default is unchanged, so a page that never touches it renders as before",
        /let _lightDir = \[-0\.45, 0\.55, 0\.70\];/.test(fvSrc),
        "A CONTROL NOBODY USES MUST NOT CHANGE WHAT ANYBODY SEES");
}

console.log();
console.log("  ----  WHAT THIS BOX CANNOT SEE: the terminator. No GPU here, so the shader SOURCE is asserted and");
console.log("  ----  nothing has run it. ON THE RIG: planets in ev.html should now read as BALLS, with a curved");
console.log("  ----  day/night boundary and a dim rather than black night side. If they look like flat coins,");
console.log("  ----  the sprite is not square and gl_PointCoord is not the unit square this assumes.");
if (fails) { console.log("spriteLighting-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("spriteLighting-selfcheck: all checks pass");
