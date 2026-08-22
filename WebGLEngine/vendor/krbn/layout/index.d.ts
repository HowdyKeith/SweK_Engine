import type { Camera, Vec3 } from "../math/types.js";
import type { Scene } from "../scene/scene.js";
/** The one thing every shippable scene file exports: it can produce an SVG. */
export interface Drawing {
    toSvg(): string;
}
/** Wrap a pre-built SVG string as a Drawing. */
export declare const raw: (svg: string) => Drawing;
/** Ship a single 3-D scene: bind it to a camera. */
export declare const view: (scene: Scene, cam: Camera) => Drawing;
/** A `<text>` label anchored at the screen projection of a world point. */
export declare function textAt(cam: Camera, world: Vec3, text: string, anchor?: "start" | "middle" | "end"): string;
/** Inject label `<text>` elements just before the closing tag of a rendered SVG. */
export declare function withLabels(svg: string, labels: readonly string[]): string;
/** Strip the outer `<svg>` wrapper so a rendered panel can be re-nested. */
export declare function stripSvg(svg: string): string;
/** A left-anchored caption `<text>`. */
export declare const label: (x: number, y: number, s: string) => string;
/** A centered caption `<text>` (for column headers). */
export declare const labelC: (x: number, y: number, s: string) => string;
/** Ship a composed figure: a grid of rendered panels (row/column labels). */
export declare function grid(vp: Camera["viewport"], rows: string[][], opts?: {
    rowLabels?: string[];
    colLabels?: string[];
}): Drawing;
/** Ship a composed figure: two panels stacked vertically with captions. */
export declare function stack(top: string, bottom: string, vp: Camera["viewport"], labels: {
    top: string;
    bottom: string;
}): Drawing;
/** A deliverable that emits several *separate* SVGs from one scene file — each
 *  entry writes its own `<name>.svg` beside the source. Use it when one file
 *  produces a set of stills that should stay separate rather than be stitched
 *  into a single `grid`/`stack` sheet (e.g. one render per imported model). */
export interface Figures {
    readonly figures: {
        name: string;
        drawing: Drawing;
    }[];
}
/** Ship a set of independently-named drawings (see `Figures`). */
export declare function figures(items: {
    name: string;
    drawing: Drawing;
}[]): Figures;
/** A multi-frame deliverable. Each frame is a normal rendered `Drawing`, so a
 *  frame composes with the very same `view`/`grid`/`stack`/`shapes` helpers as a
 *  still — the only thing "animation" adds is a driven sequence. The render CLI
 *  writes the frames beside the source and drops in a `flipbook()` viewer. */
export interface Film {
    /** ordered frames, already rendered to SVG (name = `frame-000.svg` …). */
    readonly frames: {
        name: string;
        svg: string;
    }[];
    /** stage size for the flipbook viewer (defaults to 640×480). */
    readonly viewport?: Camera["viewport"];
    /** flipbook playback rate (default 12 fps). */
    readonly fps?: number;
}
/**
 * Build a `Film` from a frame function. `frame(k)` returns the `k`-th frame as a
 * `Drawing` (compose it however you like — a single `view`, a `grid`, …). Frames
 * are rendered eagerly and in order, so a stateful driver (a `FrameSession`) steps
 * correctly. This is the whole "animation" seam: successive frame generation over
 * the same static-frame machinery.
 */
export declare function film(count: number, frame: (k: number) => Drawing, opts?: {
    viewport?: Camera["viewport"];
    fps?: number;
    onFrame?: (k: number) => void;
}): Film;
/** A one-file flipbook viewer that *references* the sibling `frame-###.svg` files
 *  (so the frames stay reusable on their own). Preloads them for instant scrub. */
export declare function flipbook(f: Film): string;
//# sourceMappingURL=index.d.ts.map