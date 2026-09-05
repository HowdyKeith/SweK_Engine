// WebGLEngine/tools/render-qa/pageRequirements.mjs -- v3170
//
// WHAT DOES THIS PAGE NEED? Terasology's module.txt idea, made SweK-shaped.
//
// Their modules carry a module.txt declaring dependencies instead of a build file, and fetching a module pulls
// what it needs transitively. THE PART THAT TRANSFERS IS NOT THE FILE FORMAT -- it is that A COMPONENT STATES
// ITS OWN REQUIREMENTS instead of leaving them to be discovered.
//
// MEASURED BEFORE BUILDING: 49 pages in the render-qa manifest, TWENTY-SEVEN of which need WebGL2, and ZERO
// declaring anything. The manifest's keys are name/url/canvas/wait/checks/... -- all about HOW TO TEST a page
// and none about WHAT IT REQUIRES TO RUN.
//
// *** THE TREE HAS ALREADY PAID FOR THIS TWICE. *** population.html was a pure planner that never made a GL
// context, so nothing in the project would ever have compiled its shaders (v3120). economy.html was linked from
// server.html and absent from the manifest (v3135). Both are "nobody knew what this page needed or offered",
// and both were found by accident rather than by asking.
//
// *** DERIVED, NEVER TYPED, AND THAT IS THE WHOLE DESIGN. *** A hand-written `needs: ["webgl2"]` is a second
// declaration about one thing, and this session has found that shape five times -- a predicate against its
// reason, a register's note against its values, a nuisance base against a refinement register, an issue against
// its probe, a brick map's build predicate against its verifier's. The requirement is READ FROM THE PAGE, so it
// cannot disagree with the page.

import fs from "node:fs";
import path from "node:path";

/**
 * Capabilities a page can need, each decided by SOURCE EVIDENCE rather than a guess.
 *
 * The evidence is deliberately narrow: a page that MENTIONS webgl in prose does not need it, so every probe
 * looks for the CALL. Comments are stripped first -- v3153 and v3169 both caught a check counting its own
 * warning, and this file would be the third.
 */
export const CAPABILITIES = {
    // v3181 -- A PAGE CAN DELEGATE ITS CONTEXT, AND raymarch-live.html DOES. It imports acquireGL from
    // /render/glBootstrap.js, so getContext never appears in its own source and this scanner derived NO
    // requirement at all -- which is worse than deriving the wrong one, because v3171 uses these to decide
    // what a headless box may JUDGE. A page needing a GPU and claiming to need nothing would be OPENED AND
    // FAILED by a machine that cannot render it.
    //
    // MEASURED BEFORE FIXING: exactly ONE of 52 manifest pages does this. The hole is real and it is narrow,
    // and saying which is the difference between a fix and a panic.
    //
    // The tell is the IMPORT, not a followed chain: this scanner is deliberately one-file, and resolving
    // imports would make it a second module graph beside the one orphanScan already maintains.
    webgl2:      (s) => /getContext\(\s*["'`]webgl2["'`]/.test(s) || /\bacquireGL\b/.test(s) || /glBootstrap/.test(s),
    // *** v4452 -- THE TELL IS THE IMPORT, AND THIS LINE ONLY EVER KNEW ONE SPELLING OF THE NEED. ***
    // The rule this file states for webgl2 -- match the direct call OR the import that performs it -- was
    // never applied here. MEASURED: of 28 GPU-shaped pages, 26 were derived correctly and TWO were not.
    // gfx-device.html and nebula-device.html hold their WGSL in a string and get the device from
    // ./gfx/device.js, which calls navigator.gpu four times; three.js pages reach it through WebGPURenderer,
    // which does the same inside the library. Both would be RUN on a box with no adapter and reported FAILED
    // -- the collapse of "unsupported" into "broken" that v3120's law exists to prevent, and that --have was
    // built to honour. Still ONE FILE and still no followed chain: these are import spellings, read from the
    // page's own text, which is exactly what the webgl2 line above already does with acquireGL/glBootstrap.
    webgpu:      (s) => /navigator\.gpu\b/.test(s) || /gfx\/device\.js/.test(s) ||
                        /\bWebGPURenderer\b/.test(s) || /three\/webgpu/.test(s),
    float_target:(s) => /EXT_color_buffer_float/.test(s),
    worker:      (s) => /new\s+Worker\s*\(/.test(s),
    camera:      (s) => /getUserMedia\s*\(/.test(s),
    audio:       (s) => /new\s+(AudioContext|webkitAudioContext)\s*\(/.test(s),
    wasm:        (s) => /WebAssembly\.(instantiate|compile)/.test(s),
    // A page that FETCHES from the bridge cannot be judged on a box with no server running -- which is a
    // capability in exactly the same sense as a GPU, and the one a headless QA box is most likely to lack.
    bridge:      (s) => /fetch\(\s*["'`]\//.test(s),
};

const strip = (s) => s.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\/[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");

/** What does ONE page require? Returns the capability names its SOURCE shows it using. */
export function requirementsOf(absPath) {
    let raw;
    try { raw = fs.readFileSync(absPath, "utf8"); }
    // A PAGE THAT CANNOT BE READ HAS UNKNOWN REQUIREMENTS, NOT NONE. Returning [] would read as "needs
    // nothing", which is the most permissive possible answer to a question that failed.
    catch (e) { return { ok: false, why: String((e && e.message) || e), needs: null }; }
    const s = strip(raw);
    return { ok: true, why: null, needs: Object.keys(CAPABILITIES).filter((k) => CAPABILITIES[k](s)) };
}

/** Every page in the render-qa manifest, with what it actually needs. */
export function manifestRequirements(engRoot) {
    const man = JSON.parse(fs.readFileSync(path.join(engRoot, "tools", "render-qa", "manifest.json"), "utf8"));
    return man.pages.map((p) => {
        const rel = String(p.url || "").replace(/^\//, "").split("?")[0];
        const r = requirementsOf(path.join(engRoot, rel));
        return { name: p.name, url: p.url, file: rel, ...r };
    });
}

/**
 * Which pages can a box with THESE capabilities actually judge?
 *
 * *** THIS IS THE POINT OF THE WHOLE MODULE. *** v3120 established that UNSUPPORTED and FAILED must stay apart
 * -- one word for "this laptop has no float targets" and "this shader is broken" makes every limited machine
 * look defective. That distinction lived INSIDE one page. Here it becomes a property of the RUN: a headless box
 * knows which pages it is not entitled to an opinion about, BEFORE it opens them.
 */
export function judgeable(rows, have) {
    const has = new Set(have);
    const can = [], cannot = [];
    for (const r of rows) {
        if (!r.ok) { cannot.push({ ...r, missing: ["UNREADABLE"] }); continue; }
        const missing = r.needs.filter((n) => !has.has(n));
        (missing.length ? cannot : can).push({ ...r, missing });
    }
    return { can, cannot };
}
