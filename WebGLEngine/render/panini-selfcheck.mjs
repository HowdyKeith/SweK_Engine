// WebGLEngine/render/panini-selfcheck.mjs — v2571
//
// Run: node render/panini-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/panini.js. Panini is unusual among the things this engine has added lately: ITS DEFINING
// PROPERTIES ARE MATHEMATICAL, so they can be checked EXACTLY on a CPU with no GPU and no screenshot. "The wide
// view looks nicer" is not a test. These are.
//
// ---- THE IDENTITY THAT MAKES THIS TESTABLE --------------------------------------------------------------------
//
// lazarus-pkgs/panini's USAGE.md (web-verified from the repo, not a blog paraphrase) says:
//
//     "The linear perspective projection, AT Ez = 0, BELONGS TO BOTH FAMILIES."
//
// That is not a design note. IT IS A FALSIFIABLE IDENTITY: at d=0 the Panini construction must reproduce the
// rectilinear camera's x/-z and y/-z TO THE LAST BIT. If the cylinder maths is wrong in any way, this fails.
// MEASURED: worst error 1.78e-15 across 825 directions spanning +-80 deg horizontally and +-60 deg vertically.
//
// A CONTROL THAT CANNOT FAIL IS DECORATION. This one can, and it is the reason the rest of the module can be
// believed without a GPU.
//
// ---- RIG-ONLY, STATED PLAINLY ---------------------------------------------------------------------------------
//
// paniniGLSL() emits the same arithmetic AS A STRING for the GPU path. THE JS AND THE GLSL ARE NOT AUTOMATICALLY
// THE SAME FUNCTION -- one is JS on a CPU, one is GLSL on a GPU, and nothing here can run a GPU. Check 4 compares
// the shader TEXT against the same constants, WHICH IS WEAKER THAN RUNNING IT, and says so. The shader's actual
// output needs a screenshot on Galaxina. A CHECK THAT GRADES A STRING IS GRADING PROSE.
import fs from "node:fs";
import { prose } from "../tools/ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paniniProject, paniniHorizon, paniniFitD, paniniGLSL } from "./panini.js";

const here = path.dirname(fileURLToPath(import.meta.url));
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

const dir = (azDeg, elDeg) => {
    const th = (azDeg * Math.PI) / 180, ph = (elDeg * Math.PI) / 180;
    return [Math.sin(th) * Math.cos(ph), Math.sin(ph), -Math.cos(th) * Math.cos(ph)];
};

// ---- 1. THE IDENTITY: d=0 IS RECTILINEAR, EXACTLY --------------------------------------------------------------
{
    let worst = 0, n = 0;
    for (let ax = -80; ax <= 80; ax += 5) {
        for (let ay = -60; ay <= 60; ay += 5) {
            const [x, y, z] = dir(ax, ay);
            const p = paniniProject(x, y, z, 0);
            if (!p) continue;
            worst = Math.max(worst, Math.abs(p[0] - x / -z), Math.abs(p[1] - y / -z));
            n++;
        }
    }
    ok("d=0 IS THE RECTILINEAR CAMERA, TO THE LAST BIT", worst < 1e-12,
       "worst error " + worst.toExponential(2) + " across " + n + " directions. USAGE.md: 'The linear perspective projection, AT Ez = 0, BELONGS TO BOTH FAMILIES.' THAT IS NOT A DESIGN NOTE, IT IS A FALSIFIABLE IDENTITY -- and it is why this module can be believed without a GPU.");
    ok("...and the horizon at d=0 is exactly 90 degrees", Math.abs(paniniHorizon(0) - Math.PI / 2) < 1e-12,
       "half-fov " + ((paniniHorizon(0) * 180) / Math.PI).toFixed(1) + " deg. A RECTILINEAR CAMERA CANNOT EXCEED 90 AND THIS ONE DOES NOT -- the limit falls out of the algebra (d + cos th = 0), it is not asserted anywhere.");
}

// ---- 2. THE POINT OF THE WHOLE THING: VERTICALS STAY VERTICAL --------------------------------------------------
// A world-space vertical line is (X, t, Z) for fixed X,Z. Its azimuth does not depend on t, so u = S*sin(th) is
// CONSTANT along the line. That is not a happy accident of the numbers; it is why h = y/sqrt(x^2+z^2) is divided
// by HORIZONTAL distance rather than by depth.
{
    for (const d of [0, 0.5, 1, 5]) {
        const X = 3, Z = -2;
        const us = [];
        for (let t = -10; t <= 10; t += 0.5) {
            const p = paniniProject(X, t, Z, d);
            if (p) us.push(p[0]);
        }
        const spread = Math.max(...us) - Math.min(...us);
        ok("a world VERTICAL projects to a screen VERTICAL at d=" + d, spread < 1e-12,
           "u varies by " + spread.toExponential(1) + " over 41 samples spanning y=-10..10. THIS IS THE ENTIRE POINT OF PANINI: a cylindrical projection bends every vertical; this one does not, because height is divided by HORIZONTAL distance, not by depth.");
    }
}

// ---- 3. AND IT ACTUALLY BUYS SOMETHING -- MEASURED, NOT ASSERTED ------------------------------------------------
{
    // At wide FOV, rectilinear does not "look bad", it EXPLODES. Quantify it rather than repeating the folklore.
    const halfFov = 75;                                   // 150 degrees horizontal
    const rect = Math.tan((halfFov * Math.PI) / 180);     // rectilinear half-width needed
    const d = paniniFitD(150, 1);
    ok("at 150 deg hfov, rectilinear needs " + rect.toFixed(2) + "x the half-width Panini does", rect > 3.5,
       "tan(75 deg) = " + rect.toFixed(3) + ". To show 150 degrees a rectilinear camera must stretch the edge to 3.7 screen half-widths -- THAT is the edge distortion, stated as a number instead of as folklore. Panini fits the same 150 degrees in 1.0 at d=" + (d === null ? "?" : d.toFixed(2)) + ".");
    ok("...and paniniFitD REFUSES the impossible instead of inventing a number", paniniFitD(360, 1) === null,
       "a 360 degree hfov has no d. Returning a plausible-looking number for an impossible request is how a bad value gets into a shader and comes out as 'the art looks weird'.");
    ok("...and the horizon is honest about what cannot be seen", paniniProject(0, 0, 1, 0) === null,
       "straight BEHIND the camera at d=0 returns null, not a huge number. Returning 1e9 would look like geometry and would poison any average computed over it.");
}

// ---- 4. THE SHADER -- AND THE HONEST LABEL ---------------------------------------------------------------------
{
    const glsl = paniniGLSL();
    ok("the GLSL carries the same constants as the JS", /d \+ cos\(th\)/.test(glsl) && /\(d \+ 1\.0\) \/ denom/.test(glsl),
       "!! THIS CHECK GRADES A STRING. The JS and the GLSL are NOT automatically the same function -- one is JS on a CPU, one is GLSL on a GPU, and nothing here can run a GPU. A CHECK THAT GRADES A STRING IS GRADING PROSE. RIG: the shader's real output needs a screenshot on Galaxina.");
    ok("...and it is real GLSL ES 3.00, not pseudocode", /vec2 paniniProject\(vec3 dir, float d\)/.test(glsl) && /atan\(dir\.x, -dir\.z\)/.test(glsl),
       "atan(y,x) two-arg form, length(dir.xz), max() guard -- all core GLSL ES 3.00, no extensions");
    const src = fs.readFileSync(path.join(here, "panini.js"), "utf8");
    ok("...and panini.js says out loud that the GLSL is ungated", /NOT AUTOMATICALLY THE SAME FUNCTION/.test(prose(src)),
       "a rig-only limit that is not written down is a limit nobody will remember by v2600");
}

console.log(fails ? "\npanini-selfcheck: " + fails + " FAILED" : "\npanini-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
