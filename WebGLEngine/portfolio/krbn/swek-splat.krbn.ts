// swek-splat.krbn.ts -- a Gaussian splat cloud, drawn as a pencil technical drawing.
//
// WHY THIS EXISTS. v2530 measured that Krbn's wobble does not boil (89/89 paths at 0.056px under a camera nudge)
// but that OUR marched blob re-tessellates under motion, so the strokes drawn on it have nothing to be stable
// about. Reading src/pipeline/wobble.ts explains why, mechanically: the wobble is a 3-D noise field keyed on each
// vertex's OBJECT-SPACE position. A marched blob is ONE object whose vertices SLIDE THROUGH that stationary field
// -- so the wobble under them changes. That is the boil.
//
// A Gaussian splat is the opposite by construction. Scthe/gaussian-splatting-webgpu's own type says it:
//     interface GaussianSplats { count; positions; rotationsBuffer; scalesBuffer; colorsBuffer; indicesBuffer }
// A splat is position + scale + rotation, addressed by an INDEX. Splat #47 is splat #47 forever. Move it and it is
// still itself -- its object space travels with it, so its noise field does too.
//
// So: each splat becomes its own Ellipsoid with its own stable id. This is the shape of a scene that would NOT
// boil. Fixed seeds, because a drawing you cannot reproduce is not a drawing you can diff.
import type { Camera } from "../../src/math/types.js";
import { Scene } from "../../src/scene/scene.js";
import { ellipsoid } from "../../src/primitives/quadric.js";
import { view } from "../../src/layout/index.js";

const cam: Camera = {
  eye: [7.5, 5.5, 4.0], target: [0, 0, 0], up: [0, 0, 1],
  projection: "perspective", scale: Math.PI / 4.2, viewport: { width: 720, height: 560 },
};

const scene = new Scene({ svg: { background: "#faf9f5" }, light: { direction: [-0.4, -0.5, -0.75] } });

// A deterministic LCG. Not Math.random(): the whole point is that this drawing is diffable.
let s = 20250716;
const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

// A little cloud with structure, so the drawing has something to say: a dense core, a sparse halo.
const N = 44;
for (let i = 0; i < N; i++) {
  const core = i < N * 0.55;
  const r = core ? 1.5 : 3.0;
  const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1), rad = r * Math.cbrt(rnd());
  const c: [number, number, number] = [
    rad * Math.sin(ph) * Math.cos(th),
    rad * Math.sin(ph) * Math.sin(th),
    rad * Math.cos(ph) * 0.62,
  ];
  // Real splats are anisotropic -- that is the whole reason they beat point clouds.
  const radii: [number, number, number] = [
    0.30 + rnd() * (core ? 0.34 : 0.20),
    0.22 + rnd() * (core ? 0.30 : 0.16),
    0.16 + rnd() * (core ? 0.24 : 0.13),
  ];
  // THE ID IS THE POINT. Krbn seeds its wobble per element; a splat's index is a stable identity across frames,
  // so the stroke drawn on splat 12 next frame is the SAME stroke, not a new one that happens to be nearby.
  scene.add(ellipsoid(c, radii, `splat-${i}`)).style({ wobble: 0.34, hatch: { mode: core ? "cross" : "single", angle: 18 + (i % 5) * 11 } });
}

export default view(scene, cam);
