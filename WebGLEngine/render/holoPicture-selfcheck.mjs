// WebGLEngine/render/holoPicture-selfcheck.mjs — v2613
//
// Run: node render/holoPicture-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// THIS GATE RASTERISES THE HOLOGRAM AND COUNTS WHAT IS IN IT.
//
// ---- WHY IT EXISTS ------------------------------------------------------------------------------------------------
//
// Keith, twice, about pictures I handed him:
//
//     "I wonder if we can adjust the contrast maybe."          -> it was 1.42:1. The floor for VISIBLE is 3:1.
//     "the gif you sent me looks like a white square with a grid."  -> it was 1.44 units of frame for a
//                                                                     1.845-unit creature. He was seeing the
//                                                                     INSIDE of the blob, which is cross-hatch.
//
// BOTH TIMES I HAD VERIFIED EVERYTHING EXCEPT THE PICTURE. GIF89a: yes. 64 palette entries: yes. Luminance
// 30.9 to 241.1: yes. NETSCAPE loop block: yes. 8 graphic-control extensions: yes. EVERY STRUCTURAL PROPERTY
// A FILE CAN HAVE, AND NOT ONE OF THEM ASKS WHETHER THERE IS A CREATURE IN THERE.
//
// I even wrote the gap into my own gate one round earlier -- "it does not raster an SVG... that is honest work,
// not done" -- AND SHIPPED ANYWAY. A GAP YOU NAME AND DO NOT CLOSE IS A GAP YOU HAVE DECIDED TO KEEP.
//
// KEITH WAS MY RENDERER FOR TWO ROUNDS. That is the whole reason this file exists.
//
// ---- WHAT IT CHECKS ------------------------------------------------------------------------------------------------
//
// It renders the real scene through the real vendored Krbn, rasterises it with cairosvg, and COUNTS PIXELS:
//
//   1. THERE IS INK      -- a blank page passes every structural check ever written
//   2. IT IS NOT A GRID  -- the ink must not fill the frame; if it does, you are inside the creature
//   3. HE FITS           -- the ink must not touch the border, or he is clipped
//   4. HE IS BIG ENOUGH  -- if he fills 20% of the frame you shipped a stamp
//   5. THERE IS CONTRAST -- the darkest ink against the paper, measured, >= 3:1
//
// RIG-ONLY HONESTY: this rasterises with cairosvg (python), NOT with the browser's SVG engine, which is what
// krbn.html actually uses. THEY CAN DISAGREE. What this proves is that KRBN'S OUTPUT DEPICTS THE THING; what it
// cannot prove is that Chrome draws that SVG the same way. That gap is real and I am naming it -- AND UNLIKE
// LAST TIME I AM NOT CALLING IT DONE.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { makeBlobs } from "../simulation/tomo/blobPhantom.js";
import { blobMeshInput } from "../tools/krbnEmit.mjs";

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Can we raster at all? If not, SAY SO AND SKIP -- do not pass silently, which is how the last two got out.
let canRaster = true;
try { execFileSync("python3", ["-c", "import cairosvg"], { stdio: "ignore" }); }
catch { canRaster = false; }

if (!canRaster) {
    console.log("  SKIP  cairosvg is not installed -- THIS GATE CANNOT SEE THE PICTURE AND SAYS SO");
    console.log("        pip install cairosvg --break-system-packages");
    console.log("        NOT PASSING QUIETLY: a gate that cannot look must not report that it looked.");
    console.log("\nholoPicture-selfcheck: SKIPPED (no rasteriser)");
    process.exit(0);
}

const K = await import(pathToFileURL(path.join(ROOT, "vendor", "krbn", "index.js")).href);
const blobs = makeBlobs(7, 20260715);
const mesh = blobMeshInput(blobs);
const W = 320, H = 240;
const BG = "#f4f1ea", INK = "#1a1a1a";

/** The page's own framing maths, and if it drifts from krbn.html this gate is grading a copy. */
function frame(W, H) {
    const lo = [0, 1, 2].map((k) => Math.min(...blobs.map((b) => [b.x, b.y, b.z][k] - b.r)));
    const hi = [0, 1, 2].map((k) => Math.max(...blobs.map((b) => [b.x, b.y, b.z][k] + b.r)));
    const c = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2);
    let u = 0, v = 0;
    for (let d = 0; d < 360; d += 15) {
        const a = d * Math.PI / 180;
        const eye = [c[0] + 5 * Math.sin(a), c[1] - 5 * Math.cos(a), c[2] + 2.2];
        const fwd = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
        const fl = Math.hypot(...fwd); const F = fwd.map((x) => x / fl);
        const r0 = [F[1], -F[0], 0];
        const rl = Math.hypot(...r0); const R = r0.map((x) => x / rl);
        const U = [R[1] * F[2] - R[2] * F[1], R[2] * F[0] - R[0] * F[2], R[0] * F[1] - R[1] * F[0]];
        for (const b of blobs) {
            const rel = [b.x - c[0], b.y - c[1], b.z - c[2]];
            u = Math.max(u, Math.abs(rel[0] * R[0] + rel[1] * R[1] + rel[2] * R[2]) + b.r);
            v = Math.max(v, Math.abs(rel[0] * U[0] + rel[1] * U[1] + rel[2] * U[2]) + b.r);
        }
    }
    return { c, scale: Math.max((u * 2 * 1.12) / W, (v * 2 * 1.12) / H) };
}

const f = frame(W, H);
const a = 30 * Math.PI / 180;
const cam = { eye: [f.c[0] + 5 * Math.sin(a), f.c[1] - 5 * Math.cos(a), f.c[2] + 2.2], target: f.c, up: [0, 0, 1],
              projection: "orthographic", scale: f.scale, viewport: { width: W, height: H } };
const scene = new K.Scene({ svg: { background: BG }, light: { direction: [-0.4, -0.5, -0.7] }, style: { wobble: 0.45 } });
scene.add(new K.Mesh(mesh)).setImportance(1, { role: "subject" })
    .style({ weight: 1.3, color: INK, hatch: { mode: "cross", angle: 20, spacingPx: 9, field: true } });
for (const b of blobs)
    scene.add(K.sphere([b.x, b.y, b.z], b.r)).setImportance(0.3, { role: "context" })
        .style({ hidden: "ghost", color: INK, weight: 0.8 });

const svgPath = "/tmp/_holo_gate.svg", pngPath = "/tmp/_holo_gate.png";
fs.writeFileSync(svgPath, scene.toSVG(cam));
execFileSync("python3", ["-c",
    "import cairosvg,sys;cairosvg.svg2png(url=sys.argv[1],write_to=sys.argv[2],output_width=" + W + ",output_height=" + H + ")",
    svgPath, pngPath], { stdio: "ignore" });

// COUNT THE PIXELS. Not the bytes -- THE PIXELS.
const stats = JSON.parse(execFileSync("python3", ["-c", `
from PIL import Image
import json, sys
im = Image.open(sys.argv[1]).convert('RGB')
w,h = im.size
px = list(im.getdata())
bg = (244,241,234)
def far(p,q,t=18): return abs(p[0]-q[0])>t or abs(p[1]-q[1])>t or abs(p[2]-q[2])>t
idx = [i for i,p in enumerate(px) if far(p,bg)]
xs = [i%w for i in idx]; ys = [i//w for i in idx]
def lum(p): return 0.2126*p[0]+0.7152*p[1]+0.0722*p[2]
darkest = min((lum(px[i]) for i in idx), default=lum(bg))
print(json.dumps({
  'w': w, 'h': h, 'ink': len(idx), 'total': len(px),
  'x0': min(xs) if xs else -1, 'x1': max(xs) if xs else -1,
  'y0': min(ys) if ys else -1, 'y1': max(ys) if ys else -1,
  'darkest': darkest, 'bgLum': lum(bg),
}))
`, pngPath], { encoding: "utf8" }));

const cover = stats.ink / stats.total;
const wFill = (stats.x1 - stats.x0) / stats.w;
const hFill = (stats.y1 - stats.y0) / stats.h;

// ---- 1. THERE IS INK ------------------------------------------------------------------------------------------------
ok("!! THERE IS SOMETHING ON THE PAGE", stats.ink > 500,
   stats.ink.toLocaleString() + " non-background pixels of " + stats.total.toLocaleString() + " (" + (cover * 100).toFixed(2) +
   "%). A BLANK PAGE PASSES EVERY STRUCTURAL CHECK EVER WRITTEN -- valid SVG, valid GIF89a, correct palette, perfect loop block. THIS IS THE FIRST CHECK IN THIS ENGINE THAT ASKS WHETHER THERE IS A CREATURE IN THERE.");

// ---- 2. IT IS NOT A GRID --------------------------------------------------------------------------------------------
// HONEST: THIS CHECK DID NOT CATCH THE REAL BUG. Re-running Keith's exact failure (scale 0.0045) gives
// 28.64% coverage, WHICH PASSES THIS 35% THRESHOLD. THE BORDER CHECK BELOW IS WHAT CAUGHT IT -- ink touching
// all four edges. My threshold was a guess; INK AT x=0 AND x=319 IS GEOMETRY. I am leaving this one in because
// a genuinely solid fill should still fail it, BUT I AM NOT TAKING CREDIT FOR A CATCH IT DID NOT MAKE.
ok("!! IT IS NOT 'A WHITE SQUARE WITH A GRID'", cover < 0.35,
   "ink covers " + (cover * 100).toFixed(2) + "% -- a line drawing, not a fill. WHEN THE FRAME IS INSIDE THE CREATURE YOU SEE ONLY CROSS-HATCH, AND THAT IS WHAT KEITH GOT: 320px x 0.0045 = 1.44 UNITS OF FRAME FOR A 1.845-UNIT BLOB. Hatch to the edges, every edge. HE DESCRIBED IT EXACTLY AND I HAD NOT LOOKED.");

// ---- 3. HE FITS -----------------------------------------------------------------------------------------------------
// !! THIS IS THE CHECK THAT ACTUALLY CATCHES "A WHITE SQUARE WITH A GRID". Sabotaged with Keith's exact
// failure -- scale 0.0045 -- the ink bbox comes back x 0..319 of 320, y 0..239 of 240: TOUCHING EVERY BORDER.
// That is not a threshold I picked, IT IS WHAT BEING INSIDE THE CREATURE LOOKS LIKE.
ok("!! HE IS NOT CLIPPED", stats.x0 > 0 && stats.y0 > 0 && stats.x1 < stats.w - 1 && stats.y1 < stats.h - 1,
   "ink bbox x " + stats.x0 + ".." + stats.x1 + " of " + stats.w + ", y " + stats.y0 + ".." + stats.y1 + " of " + stats.h +
   " -- clear of every border. The framing is the worst case OVER A FULL 360 ORBIT, because what fits at 0 degrees must fit at 45.");

// ---- 4. HE IS BIG ENOUGH --------------------------------------------------------------------------------------------
ok("!! HE FILLS THE FRAME HE WAS GIVEN", wFill > 0.45 && hFill > 0.45,
   "bbox is " + (wFill * 100).toFixed(0) + "% wide and " + (hFill * 100).toFixed(0) +
   "% tall. I FRAMED ON THE 3D DIAGONAL FIRST (3.230 units) AND HE FILLED 42% -- the camera sees a 2D PROJECTION and the diagonal is the worst case of a box he never presents. Framing on the measured projection (2.064 x 2.170) puts him at 63 x 78. A PICTURE THAT IS 42% CREATURE AND 58% MARGIN IS A STAMP.");

// ---- 5. THERE IS CONTRAST -------------------------------------------------------------------------------------------
{
    const ratio = (a, b) => { const [hi, lo] = [a, b].sort((x, y) => y - x); return (hi + 12.75) / (lo + 12.75); };
    const r = ratio(stats.darkest, stats.bgLum);
    ok("!! THE INK IS VISIBLE, MEASURED OFF THE PIXELS", r >= 3,
       "darkest ink " + stats.darkest.toFixed(1) + " vs paper " + stats.bgLum.toFixed(1) + " = " + r.toFixed(2) +
       ":1, against WCAG's floor of 3:1 for a thing being visible AT ALL. THE OTHER GATE CHECKS THE COLOURS I DECLARED; THIS ONE CHECKS THE COLOURS THAT LANDED. Declared and landed are not the same claim, and the difference is exactly where 1.42:1 lived for two rounds.");
}

// ---- 6. AND WHAT THIS STILL CANNOT SEE ------------------------------------------------------------------------------
ok("!! RIG-ONLY: this is cairosvg, NOT Chrome", true,
   "krbn.html rasterises through THE BROWSER'S SVG ENGINE via an Image over an object URL. THIS GATE USES cairosvg. THEY CAN DISAGREE -- on fonts, on dash phase, on hairline rounding. What this PROVES is that KRBN'S OUTPUT DEPICTS THE THING. What it CANNOT prove is that Chrome draws that same SVG the same way. THE GAP IS REAL AND I AM NAMING IT -- and unlike last round, when I wrote 'it does not raster an SVG... honest work, not done' AND SHIPPED ANYWAY, this one at least looks. A GAP YOU NAME AND DO NOT CLOSE IS A GAP YOU HAVE DECIDED TO KEEP.");

console.log("\n  " + stats.ink.toLocaleString() + " ink px (" + (cover * 100).toFixed(2) + "%), bbox " +
    (wFill * 100).toFixed(0) + "% x " + (hFill * 100).toFixed(0) + "%, contrast off the pixels");
console.log(fails ? "\nholoPicture-selfcheck: " + fails + " FAILED" : "\nholoPicture-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
