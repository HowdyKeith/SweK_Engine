// WebGLEngine/mesh/mesherFlag-selfcheck.mjs — v2579
//
// Run: node mesh/mesherFlag-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES the ?mesher=greedy flag in voxel-viewer.html.
//
// A FLAG IS A PROMISE ABOUT WHICH CODE RAN. Three ways that promise breaks, and all three are silent:
//
//   1. THE DEFAULT MOVED. If the flag's absence stops meaning "the old mesher", every existing link and every
//      screenshot Keith has ever taken now shows something else. THE FLAG WAS SUPPOSED TO PROTECT EXACTLY THAT.
//   2. THE FLAG LIES. If ?mesher=greedy silently falls back when the module fails to load, the page renders the
//      OLD mesh while the URL says NEW. Then Keith compares two screenshots of the same mesher and concludes
//      they are identical. A FLAG THAT CANNOT FAIL IS DECORATION; A FLAG THAT LIES IS WORSE THAN NO FLAG.
//   3. THE PAGE BREAKS ON LOAD. voxel-viewer.html is a PLAIN <script>, not type="module". Turning it into a
//      module would make every function DEFERRED AND MODULE-SCOPED, and every onclick in the markup would stop
//      finding its callback -- THE PAGE WOULD BREAK IN A WAY THAT LOOKS LIKE NOTHING HAPPENING.
//
// This gate cannot render the page. It CAN prove the wiring has the shape that makes those three impossible,
// and it does that by reading the page's own text -- WHICH IS GRADING PROSE, and is labelled as such below.
// The real proof is Keith loading it twice, once with the flag, once without. THIS ROUND EXISTS TO MAKE THAT
// POSSIBLE, NOT TO REPLACE IT.
import fs from "node:fs";
import { codeOnly } from "../tools/ship/sourceScan.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildVoxelMeshGreedy } from "./voxelMeshGreedy.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(here, "..", "voxel-viewer.html");
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const src = fs.readFileSync(PAGE, "utf8");

// ---- 1. THE DEFAULT DID NOT MOVE ---------------------------------------------------------------------------------
{
    ok("the page's OWN buildVoxelMesh still exists, exactly once", (src.match(/function buildVoxelMesh\(voxels\)/g) || []).length === 1,
       "the per-face mesher is the DEFAULT and is UNTOUCHED. Every link Keith has and every screenshot he has taken still means what it meant.");
    // v3079 -- PROPERTY, NOT WORDING. This demanded the literal `return buildVoxelMesh;`. The page now returns a
    // WRAPPER that calls buildVoxelMesh and records the index count on window.__swekMesher -- an improvement,
    // and one this check called a regression. FOURTH time this session a gate pinned to a MECHANISM went red
    // when the mechanism was correctly extended, which is the exact debt gateQuality-selfcheck (v3071) ratchets.
    //
    // The property that actually matters is stronger than the old string ever was: on the no-flag path the
    // page's OWN buildVoxelMesh is what gets invoked, and the picker SAYS so via used='default'. A wrapper that
    // quietly called something else would pass the old check and fail this one.
    ok("...and pickMesher RETURNS IT when no flag is given", (() => {
        const tail = src.slice(src.indexOf("function pickMesher"));
        const body = tail.slice(0, tail.indexOf("\n}"));
        const afterFlag = body.slice(body.lastIndexOf("__swekMesher.used = 'default'"));
        return /__swekMesher\.used = 'default'/.test(body) && /buildVoxelMesh\(voxels\)/.test(afterFlag) && !/Greedy/.test(afterFlag);
    })(),
       "the fallthrough is the old path. IF THE FLAG'S ABSENCE EVER STOPS MEANING 'THE OLD MESHER', THE FLAG HAS DEFEATED ITS OWN PURPOSE.");
    // v3535 -- *** THIS PINNED `=== 2` AND WENT RED WHEN A THIRD VIEWER CALL SITE WAS CORRECTLY ADDED. *** A
    // COUNT PINNED WHERE THE DISTINCTION WAS THE POINT -- the species this tree has committed twenty-three
    // times -- and the count was never the claim. THE CLAIM IS THAT NO CALL SITE BYPASSES THE PICKER, which
    // stays true whatever the page grows, and is what "the flag decides the mesher" actually means.
    //
    // ASSERTED BY EXCLUSION rather than by tally: every buildVoxelMesh / buildVoxelMeshGreedy call must sit
    // INSIDE pickMesher (its two returned closures) or BE the function declaration. Anything else is a site
    // that meshes without asking the flag, which is the defect -- and a bypassing site would be invisible to a
    // count of `pickMesher()(` however that count was chosen.
    // *** AND MY FIRST VERSION OF THIS FLAGGED A COMMENT. *** The page carries "// buildVoxelMesh (below)
    // emits one quad per face", and matching the raw source read that as a bypassing call site. PROSE-AS-CODE,
    // in the check written this round to avoid a DIFFERENT trap -- twenty-plus instances in this tree and it
    // still arrives inside the fix for something else. codeOnly() blanks comments AND string literals, which is
    // right here because a mesh call is an IDIOM rather than text the page contains.
    ok("...and NO call site bypasses the picker", (() => {
        const src = codeOnly(fs.readFileSync(PAGE, "utf8"));
        const pickStart = src.indexOf("function pickMesher");
        const pickEnd = src.indexOf("\n}", pickStart);
        const outside = [];
        const re = /\bbuildVoxelMesh(?:Greedy)?\s*\(/g;
        let m;
        while ((m = re.exec(src))) {
            const i = m.index;
            if (i >= pickStart && i <= pickEnd) continue;                 // the picker's own closures
            if (/function\s+$/.test(src.slice(Math.max(0, i - 12), i))) continue;  // the declaration itself
            outside.push(i);
        }
        return outside.length === 0;
    })(),
       "every mesh-building call sits inside pickMesher or is its declaration. THE SITES ARE COUNTED AND " +
       "REPORTED (" + (codeOnly(fs.readFileSync(PAGE, "utf8")).match(/pickMesher\(\)\(/g) || []).length + " go through the picker today) BUT NOT " +
       "PINNED -- a viewer gaining a fourth is progress, and a gate that failed on it would teach people to " +
       "delete gates.");
}

// ---- 2. THE FLAG CANNOT LIE --------------------------------------------------------------------------------------
{
    ok("a MISSING greedy module WARNS, it does not fall back silently", /console\.warn\('\[voxel-viewer\] \?mesher=greedy requested/.test(src),
       "IF ?mesher=greedy SILENTLY FELL BACK, THE PAGE WOULD RENDER THE OLD MESH WHILE THE URL SAID NEW -- and Keith would compare two screenshots of the same mesher and conclude they were identical. A FLAG THAT LIES IS WORSE THAN NO FLAG.");
    ok("...and the flag is read from the URL, not a constant", /new URLSearchParams\(location\.search\)\.get\('mesher'\)/.test(src),
       "this page had NEVER taken a URL flag before -- there was no URLSearchParams anywhere in it");
}

// ---- 3. THE PAGE STILL LOADS AS A CLASSIC SCRIPT -----------------------------------------------------------------
{
    const firstTag = src.slice(src.indexOf("<script"), src.indexOf("<script") + 30);
    ok("the MAIN script tag is still a PLAIN <script>", /^<script>/.test(firstTag.trim()),
       "'" + firstTag.trim().split("\\n")[0] + "'. TURNING IT INTO type=module WOULD MAKE EVERY FUNCTION DEFERRED AND MODULE-SCOPED, and every onclick in the markup would stop finding its callback -- THE PAGE WOULD BREAK IN A WAY THAT LOOKS LIKE NOTHING HAPPENING.");
    ok("...and the greedy import lives in a SEPARATE module tag", /<script type="module">\s*import \{ buildVoxelMeshGreedy \}/.test(src),
       "so the classic script keeps its globals. Module scripts are DEFERRED, and the picker only reads window.buildVoxelMeshGreedy AT CALL TIME -- inside a fetch handler, long after defer resolves. THE ORDERING IS THE REASON THIS WORKS, and it was checked (:449 is inside a fetch .then, not at parse time) rather than hoped.");
    ok("...and it hangs the builder where the classic script can see it", /window\.buildVoxelMeshGreedy = buildVoxelMeshGreedy/.test(src),
       "a module-scoped import the plain script cannot reach would make ?mesher=greedy warn forever");
}

// ---- 4. and the thing behind the flag actually works --------------------------------------------------------------
{
    const v = [];
    for (let x = 0; x < 6; x++) for (let y = 0; y < 6; y++) for (let z = 0; z < 6; z++) v.push([x, y, z, 1]);
    const m = buildVoxelMeshGreedy(v);
    ok("the module behind the flag returns a real mesh", m.quadCount === 6 && m.indices.length === 36,
       "a 6x6x6 single-colour cube -> " + m.quadCount + " quads / " + (m.indices.length / 3) + " triangles. The default path emits 216 faces / 432 triangles for the same cube.");
    ok("...and this gate GRADES THE PAGE'S TEXT, which is grading prose", true,
       "IT CANNOT RENDER. The real proof is Keith loading the page twice -- once with ?mesher=greedy, once without -- and looking. THIS ROUND EXISTS TO MAKE THAT POSSIBLE, NOT TO REPLACE IT.");
}

console.log(fails ? "\nmesherFlag-selfcheck: " + fails + " FAILED" : "\nmesherFlag-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
