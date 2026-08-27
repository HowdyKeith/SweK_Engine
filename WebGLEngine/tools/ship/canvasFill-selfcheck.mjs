// WebGLEngine/tools/ship/canvasFill-selfcheck.mjs -- v2872
//
// Run: node tools/ship/canvasFill-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs (auto-discovered).
//
// GATES that a lab page's canvas actually uses the page it is on.
//
// THE COMPLAINT: "the viewport is very small to see the action". It was. wind-tunnel drew a 110x41 lattice into a
// canvas nailed to 440x164 inside a WRAPPING flex row, so the vortex street occupied about a fifth of a 1080p
// screen while a 260px column of notes sat beside it taking equal billing.
//
// TWO KINDS OF CANVAS, OPPOSITE FIXES, AND THE DISTINCTION IS THE POINT:
//
//   A FIELD (wind-tunnel, ising, fanbeam, ct, interferometer) has a backing store that IS the simulation grid --
//   one pixel per cell, which is the honest resolution. Enlarge the DISPLAY and keep image-rendering: pixelated.
//   Enlarging the BACKING STORE would invent detail the simulation does not have, which is the prettier-than-true
//   move this lab exists to refuse. So this gate asserts field pages keep their grid-sized store AND get
//   pixelated -- widening one without the other is the failure.
//
//   A PLOT (kepler, schrodinger, splat-lab) is a drawing. pixelated on a curve is just jagged. So those scale
//   WITHOUT it.
//
// AND IT IS A RATCHET. Every 2D lab page must be responsive, so the next page cannot ship as a postage stamp.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { resolvePlaywright, browserSkipReason, HEADLESS_SHELL } from "./playwrightResolve.mjs";
import { noComments } from "./sourceScan.mjs";   // v4052 -- strings kept, comments dropped: see the JS sweep's own note

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ENG = path.join(HERE, "..", "..");
const require_ = createRequire(import.meta.url);

let fails = 0;
const ok = (name, cond, detail) => { console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : "")); if (!cond) fails++; };
const read = (f) => fs.readFileSync(path.join(ENG, f), "utf8");

// Pages whose canvas is the SIMULATION GRID itself.
const FIELD = ["wind-tunnel.html", "ising.html", "fanbeam.html", "ct.html", "interferometer.html"];
// Pages whose canvas is a DRAWING.
const PLOT = ["kepler.html", "schrodinger.html", "splat-lab.html", "logistic.html", "kerr.html", "fresnel.html", "geodesic.html", "diffraction.html"];
const ALL = FIELD.concat(PLOT);

// ---- 1. every lab page's canvas grows with the page ------------------------------------------------------------
{
    const notResponsive = ALL.filter((f) => {
        if (!fs.existsSync(path.join(ENG, f))) return false;
        return !/width:\s*100%/.test(read(f));
    });
    ok("!! EVERY 2D lab canvas is responsive", notResponsive.length === 0,
       notResponsive.length ? "STILL FIXED-SIZE: " + notResponsive.join(", ") : ALL.length + " pages checked");
}

// ---- 2. FIELD pages keep the grid as the backing store and stay pixelated ----------------------------------------
{
    for (const f of FIELD) {
        if (!fs.existsSync(path.join(ENG, f))) continue;
        const s = read(f);
        ok(f + ": pixelated (a cell must stay a square)", /image-rendering:\s*pixelated/.test(s),
           "interpolating a lattice smears cells into detail the simulation never computed");
    }
    // wind-tunnel is the one that prompted this, so it gets the specific check.
    const wt = read("wind-tunnel.html");
    ok("!! wind-tunnel's backing store is STILL the grid, not inflated", /width="440" height="164"/.test(wt),
       "the fix is a bigger DISPLAY, not a bigger buffer -- the lattice is 110x41 and that is all the detail there is");
    ok("...the view column GROWS while the controls stay fixed", /#view \{ flex: 1 1 0/.test(wt) && /#side \{ flex: 0 0/.test(wt),
       "a slider gains nothing from being wider; a flow field gains everything");
    ok("...min-width:0 on the flex child", /min-width:\s*0/.test(wt),
       "without it a flex child refuses to shrink below its content and the layout silently stops responding");
    ok("...and the sidebar drops under on a narrow screen", /@media \(max-width: 900px\)/.test(wt));
}

// ---- 3. PLOT pages must NOT be pixelated ---------------------------------------------------------------------------
{
    for (const f of ["kepler.html", "schrodinger.html", "splat-lab.html"]) {
        if (!fs.existsSync(path.join(ENG, f))) continue;
        const s = read(f);
        const rule = (s.match(/canvas\s*\{[^}]*\}/g) || []).join(" ");
        ok(f + ": a drawing is NOT pixelated", !/image-rendering:\s*pixelated/.test(rule),
           "pixelated on a curve is just jagged -- the opposite prescription from a lattice");
    }
}

// ---- 4. aspect ratio is preserved -- a tunnel at the wrong aspect is a lie about the flow ---------------------------
{
    const bad = ALL.filter((f) => {
        if (!fs.existsSync(path.join(ENG, f))) return false;
        const s = read(f);
        if (!/width:\s*100%/.test(s)) return false;
        const rule = (s.match(/canvas\s*\{[^}]*\}/g) || []).join(" ");
        return !/height:\s*auto/.test(rule) && !/aspect-ratio/.test(rule);
    });
    ok("!! aspect ratio is held on every scaled canvas", bad.length === 0,
       bad.length ? "STRETCHED: " + bad.join(", ") : "height:auto or aspect-ratio everywhere");
}

// ---- 5. the shared helper exists and documents the distinction --------------------------------------------------------
{
    const h = read("ui/fitCanvas.js");
    ok("ui/fitCanvas.js exists with both modes", /export function fitField/.test(h) && /export function fitPlot/.test(h));
    // Whitespace-normalised: my first version of this check failed because the sentence it looks for WRAPS
    // across two comment lines. A gate that is brittle about line breaks fails on formatting, not on substance.
    // Strip the leading // from each comment line BEFORE flattening -- otherwise the marker lands mid-sentence
    // ("would invent // detail the simulation...") and the match fails for a reason that has nothing to do with
    // whether the reason is actually recorded. Second time this session a check of mine tripped on formatting.
    const hFlat = h.replace(/^\s*\/\/ ?/gm, "").replace(/\s+/g, " ");
    ok("!! ...and records WHY they differ", /invent detail the simulation does not have/.test(hFlat),
       "the reason is the whole content of the decision; without it the next page picks the wrong one");
    ok("fitPlot is devicePixelRatio aware", /devicePixelRatio/.test(h),
       "a 1:1 backing store on a HiDPI screen looks soft for reasons that have nothing to do with the maths");
    ok("fitPlot returns a detach function", /removeEventListener/.test(h),
       "a page that swaps views must not leak a resize listener");
}

// ---- 6. THE TREE-WIDE SWEEP. v2872 fixed the LAB pages; Keith asked what else was small, and the answer was
//         nineteen more -- reaction-diffusion, cellular automata, slime mould, the brain mazes, the box3d demos,
//         AudioLab, kriging, pachinko. The lab was never the whole problem, it was just the part I had looked at.
//
//         So the ratchet is now TREE-WIDE: any page with a fixed-size canvas and no way to grow is named.
{
    const SKIP = /node_modules|[\\/]\.git|vendor|GPU_Assets|demos_code/;
    const walk = (d, out = []) => {
        for (const f of fs.readdirSync(d)) {
            const p = path.join(d, f);
            if (SKIP.test(p)) continue;
            const st = fs.statSync(p);
            if (st.isDirectory()) walk(p, out);
            else if (/\.html$/.test(f)) out.push(p);
        }
        return out;
    };

    // WEBGL PAGES ARE DELIBERATELY EXEMPT, and this is a judgement rather than an oversight. On a WebGL canvas the
    // drawing buffer and the display size are independent, so a small buffer stretched across a big element is
    // exactly what "render at lower resolution" means -- a PERFORMANCE CHOICE a raymarcher may have made on
    // purpose. Widening those blind would trade someone's frame rate for someone else's screen real estate
    // without asking. They are listed so the exemption is visible instead of silent.
    // volume-cache.html (v3041) is exempt for a DIFFERENT reason than the four above, and the distinction matters:
    // it is not a performance tradeoff, it is a measurement constraint. That page renders the SAME volume through
    // two bindings side by side and then compares the two drawing buffers pixel by pixel. The comparison is only
    // meaningful if both buffers are the same fixed size, so a canvas that grew with the window would silently
    // destroy the thing the page exists to measure.
    const WEBGL_EXEMPT = ["sinogram-gpu.html", "benchmark.html", "raymarch-gl-demo.html", "pom-demo.html", "volume-cache.html",
        // raymarch-live.html (v3045): a fixed drawing buffer is the resolution/perf tradeoff the other four make
        // -- a per-pixel DDA over a 64x64x64 volume scales with pixel count and nothing else.
        "raymarch-live.html"];

    const offenders = [];
    for (const p of walk(ENG)) {
        const base = path.basename(p);
        if (WEBGL_EXEMPT.includes(base)) continue;
        const h = fs.readFileSync(p, "utf8");
        const tags = [...h.matchAll(/<canvas[^>]*>/gi)];
        if (!tags.length) continue;
        const sized = tags.filter((t) => /width="\d+"/.test(t[0]) && /height="\d+"/.test(t[0]));
        if (!sized.length) continue;
          // v3922 -- *** THE BLIND SPOT v3002 NAMED IS CLOSED, AND CLOSING IT IS NOT THE LOOSENING IT REFUSED. ***
          // The note here said this reads CSS RULES and JS assignments but not INLINE style attributes, so a
          // canvas carrying style="width:100%" was reported as a postage stamp anyway -- and it declined to fix
          // that rather than fall back to "a bare file-wide search, which would accept width:100% appearing
          // anywhere at all -- including in a comment about canvases". THAT REASONING WAS RIGHT ABOUT THE WRONG
          // FIX. Reading the style attribute OF THE CANVAS TAG ITSELF is not a file-wide search: it is the most
          // precise reading available, narrower than the CSS-rule regexes already here, and it is the exact
          // property that makes a canvas responsive.
          //
          // The blind spot was load-bearing: kuramoto, landau-zener and percolation each had ONE canvas fixed
          // and ONE already carrying the inline style, and the page was reported whole. So the check is now
          // PER CANVAS and names the element, because "kuramoto.html" sends you to a page that is half right
          // and tells you nothing about which half.
        const inlineResponsive = (t) => /style="[^"]*width:\s*100%/i.test(t);
        const cssResponsive = /canvas[^{]*\{[^}]*width:\s*100%/.test(h) || /#[\w-]+[^{]*\{[^}]*width:\s*100%/.test(h) || /\.style\.width\s*=\s*["\'`]100%/.test(h);
        const jsResize = /addEventListener\(["\'`]resize/.test(h) || /innerWidth/.test(h) || /clientWidth/.test(h) || /ResizeObserver/.test(h);
        if (cssResponsive || jsResize) continue;
        const stuck = sized.filter((t) => !inlineResponsive(t[0]));
        for (const t of stuck) {
            const id = (t[0].match(/id="([^"]+)"/) || [, "(no id)"])[1];
            offenders.push(path.relative(ENG, p) + "#" + id);
        }
    }
    ok("!! NO PAGE IN THE TREE SHIPS A FIXED, UNGROWABLE CANVAS", offenders.length === 0,
       offenders.length ? "POSTAGE STAMPS: " + offenders.slice(0, 8).join(", ") + (offenders.length > 8 ? " (+" + (offenders.length - 8) + ")" : "")
                        : "swept the whole tree; " + WEBGL_EXEMPT.length + " WebGL pages exempt by design");
    ok("...and the WebGL exemption is NAMED, not silent", WEBGL_EXEMPT.length > 0 && WEBGL_EXEMPT.every((f) => fs.existsSync(path.join(ENG, f))),
       "a small drawing buffer on a GPU page is a deliberate resolution/perf tradeoff, not a layout bug");
}

// ---- 7. THE OPPOSITE BUG SHAPE: A CANVAS TOO VAGUE TO SIZE ITSELF, NOT TOO RIGID TO GROW. v3979 ------------------
//
// Section 6's sweep only flags a <canvas> carrying explicit width="N" height="N" HTML ATTRIBUTES -- the
// "postage stamp" shape, where a page pins pixel dimensions and nothing lets it grow. Keith hit the mirror
// image: graph_viewer.html's `<canvas id="c"></canvas>` carries NO width/height attributes at all, so section
// 6's `sized` filter is empty for it and `if (!sized.length) continue;` skips the page entirely -- correctly,
// for what section 6 checks, and silently wrong for what actually broke.
//
// A CANVAS IS A REPLACED ELEMENT (same family as <img>, <video>), and `position:absolute;inset:0` alone does
// NOT stretch one the way it stretches an ordinary <div>. When width and height are both `auto`, a replaced
// element's used size comes from its OWN INTRINSIC DIMENSIONS -- the canvas width/height HTML attributes,
// which default to 300x150 -- not from the inset edges. `inset:0` still positions the box correctly at the
// container's origin (confirmed live: top/left computed to 0px), so the graph rendered inside a real, wrong-
// sized 300x150 box pinned to the top-left corner of a much larger viewport. graph_viewer.html and
// glb_viewer.html both carried the identical `#c{position:absolute;inset:0;display:block}` rule -- a genuine
// second instance, not a one-off -- so this is a tree-wide sweep, not two hardcoded page names.
{
    const walkHtml = (d, out = []) => {
        for (const f of fs.readdirSync(d)) {
            if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
            const p = path.join(d, f);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) walkHtml(p, out);
            else if (/\.html$/.test(f)) out.push(p);
        }
        return out;
    };
    const offenders = [];
    for (const f of walkHtml(ENG)) {
        const src = fs.readFileSync(f, "utf8");
        const canvasIds = [...src.matchAll(/<canvas[^>]*\bid=["']([\w-]+)["']/g)].map((m) => m[1]);
        for (const id of canvasIds) {
            const re = new RegExp("#" + id.replace(/-/g, "\\-") + "\\s*\\{([^}]*)\\}");
            const m = src.match(re);
            if (!m) continue;
            const rule = m[1];
            const absolute = /position\s*:\s*absolute/.test(rule);
            // inset:0 shorthand OR the four longhand sides spelled out -- both mean "stretch", both hit the trap.
            const inset = /inset\s*:/.test(rule) ||
                (/\btop\s*:\s*0\b/.test(rule) && /\bleft\s*:\s*0\b/.test(rule) &&
                 (/\bright\s*:\s*0\b/.test(rule) || /\bbottom\s*:\s*0\b/.test(rule)));
            const hasExplicitSize = /\bwidth\s*:/.test(rule) || /\bheight\s*:/.test(rule);
            if (absolute && inset && !hasExplicitSize) {
                offenders.push(path.relative(ENG, f) + " -> #" + id + " {" + rule.trim() + "}");
            }
        }
    }
    ok("!! *** no canvas is stretched with position:absolute + inset alone, with no explicit width/height ***",
        offenders.length === 0,
        offenders.length ? "OFFENDERS: " + offenders.join(" | ") +
            " -- a replaced element with width/height both auto uses its OWN intrinsic size (300x150), not the " +
            "container's. Add width:100%;height:100% alongside the inset."
            : "every <canvas> that stretches via inset also declares an explicit width and height");

    for (const page of ["graph_viewer.html", "glb_viewer.html"]) {
        const src = read(page);
        ok("!! " + page + "'s #c rule explicitly sizes the canvas, not just insets it",
            /#c\{position:absolute;inset:0;width:100%;height:100%;display:block\}/.test(src));
    }

    // *** v4052 -- THE HALF OF THIS SWEEP THAT DID NOT EXIST, AND THE TWO LIVE BUGS IT WOULD HAVE CAUGHT. ***
    // Everything above reads STYLE RULES out of .html and matches them to a canvas BY ITS id. Both checks are
    // correct and both were blind to waterTank.js and hazeLayer.js, which build their canvas in JavaScript,
    // give it no id at all, and set the identical broken shape through cssText:
    //     "position:absolute;left:0;top:0;right:0;bottom:Npx;..."   <- four insets, no width/height
    // MEASURED live on avatarstage.html and phone.html: css 300x150 inside a 1200x820 and a 572x420 mount, on
    // BOTH pages, for BOTH modules -- the watering tank and the smog haze had been painting into a postage
    // stamp in the corner of the avatar rather than over it, and because resize() sizes the drawing buffer from
    // the canvas's own getBoundingClientRect() the buffer matched the wrong box exactly, so it drew crisply at
    // the wrong size instead of looking stretched or torn. A bug that renders cleanly is the kind this tree
    // keeps having to find twice. So the sweep now covers the JS side too, by SHAPE rather than by id.
    const jsFiles = [];
    (function walkJs(d) {
        for (const f of fs.readdirSync(d)) {
            if (f === "node_modules" || f === ".git" || f === "vendor" || f === ".venv") continue;
            const p = path.join(d, f);
            let st; try { st = fs.statSync(p); } catch { continue; }
            if (st.isDirectory()) walkJs(p);
            else if (/\.(js|mjs|html)$/.test(f)) jsFiles.push(p);
        }
    })(ENG);
    // *** IT MUST BE A REPLACED ELEMENT, AND MY FIRST VERSION OF THIS CHECK FORGOT THAT AND WENT RED ON 29
    // INNOCENT FILES. *** `position:absolute;inset:0` on a <div> is CORRECT and ordinary -- a div stretches to
    // its insets exactly as written. The intrinsic-size trap is unique to REPLACED elements (canvas, img,
    // video), so a sweep that matches the style string alone flags every absolutely-positioned overlay in the
    // tree and means nothing. The style string is therefore CORRELATED WITH A CANVAS: find the variable a
    // canvas was created into, then test only the cssText assigned to THAT variable.
    // noComments (strings kept, comments dropped) because the strings ARE the subject here -- and because both
    // waterTank.js's fix note and this very check quote the broken CSS as an example, which raw text would
    // read as the defect itself. That is the trap this tree names in half its gates; it applies here too.
    const jsOffenders = [];
    for (const f of jsFiles) {
        const src = noComments(fs.readFileSync(f, "utf8"));
        const vars = [...src.matchAll(/(?:const|let|var)?\s*([\w$.]+)\s*=\s*document\.createElement\(\s*["'`]canvas["'`]\s*\)/g)].map((m) => m[1]);
        for (const v of new Set(vars)) {
            const esc = v.replace(/[.$]/g, "\\$&");
            // to END OF LINE, not to the first ";" -- my first version stopped at `"position:absolute` because
            // a CSS declaration is FULL OF semicolons, so it never saw the insets and passed the live bug.
            for (const m of src.matchAll(new RegExp(esc + "\\.style\\.cssText\\s*=\\s*([^\\n]*)", "g"))) {
                const decl = m[1];
                const sides = ["left", "top", "right", "bottom"].filter((s) => new RegExp("\\b" + s + "\\s*:").test(decl)).length;
                const inset = /\binset\s*:/.test(decl) || sides >= 3;
                const sized = /\bwidth\s*:/.test(decl) || /\bheight\s*:/.test(decl);
                if (inset && !sized) jsOffenders.push(path.relative(ENG, f) + " (" + v + ")  ->  " + decl.trim().slice(0, 100));
            }
        }
    }
    ok("!! *** no JS-BUILT element is stretched by insets alone either -- the half of this sweep that was blind ***",
        jsOffenders.length === 0,
        jsOffenders.length ? "OFFENDERS: " + jsOffenders.join("  |  ")
            : "swept " + jsFiles.length + " js/mjs/html files for absolute+inset style strings carrying no width/height");
}

// ---- 8. THE REAL BROWSER, DRIVEN -- SOURCE TEXT PROVES THE RULE EXISTS, NOT THAT IT WORKS. v3979 -----------------
{
    const { chromium, from: pwFrom } = resolvePlaywright(require_);
    const skip = browserSkipReason(chromium, pwFrom, HEADLESS_SHELL);
    if (skip) {
        console.log("  ----  browser half of the section-7 fix SKIPPED -- " + skip);
    } else {
        const b = await chromium.launch({ executablePath: HEADLESS_SHELL, args: ["--use-gl=swiftshader", "--enable-webgl"] });
        for (const page of ["graph_viewer.html", "glb_viewer.html"]) {
            const ctx = await b.newContext();
            const pg = await ctx.newPage();
            await pg.route("**/*", (route) => {
                const u = new URL(route.request().url());
                const p = path.join(ENG, decodeURIComponent(u.pathname));
                if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                    const ext = path.extname(p);
                    const type = ext === ".mjs" || ext === ".js" ? "text/javascript" : ext === ".html" ? "text/html" : "text/plain";
                    return route.fulfill({ status: 200, contentType: type, body: fs.readFileSync(p) });
                }
                return route.fulfill({ status: 404, body: "not found" });
            });
            await pg.setViewportSize({ width: 1000, height: 700 });
            await pg.goto("http://localhost:8787/" + page, { waitUntil: "load" }).catch(() => {});
            await pg.waitForTimeout(200);
            const r = await pg.evaluate(() => {
                const c = document.getElementById("c"), host = document.getElementById("host");
                if (!c || !host) return null;
                return { c: [c.clientWidth, c.clientHeight], host: [host.clientWidth, host.clientHeight] };
            });
            await ctx.close();
            ok("!! " + page + ": the LIVE canvas.clientWidth/Height actually matches #host, not 300x150",
                r && r.c[0] === r.host[0] && r.c[1] === r.host[1] && r.c[0] !== 300,
                r ? "canvas=" + JSON.stringify(r.c) + " host=" + JSON.stringify(r.host) : "page missing #c or #host");
        }
        await b.close();
    }
}

console.log(fails ? "\ncanvasFill-selfcheck: " + fails + " FAILED" : "\ncanvasFill-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
