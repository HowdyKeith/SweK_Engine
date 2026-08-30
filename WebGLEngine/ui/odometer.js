// FILE: ui/odometer.js -- v4181
//
// The SVG half of the odometer. Ported from coderitual/bounty (MIT (c) 2017 coderitual); all the arithmetic
// lives in ui/odometerModel.mjs and is graded there.
//
// *** THE ORIGINAL'S ES7 FUNCTION-BIND SYNTAX DID NOT SURVIVE, AND SHOULD NOT HAVE. *** bounty is written in
// `svg::append("g")::attr("id", x)` -- the `::` bind operator, a 2017 proposal that never reached the
// language and needs a Babel transform to run at all. This tree ships source the browser executes directly,
// so the chain is written as plain calls. Nothing about the effect is lost: the operator was styling.
//
// WHAT IS FAITHFUL: the eleven-cell digit strip (0..9 then 0 again, so the wrap has no seam), the three
// rotations, the vertical fade mask, and the per-digit Gaussian blur driven by strip velocity.
"use strict";

import { planRoll, digitAt, totalDuration, DEFAULTS, DIGITS } from "./odometerModel.mjs";

const NS = "http://www.w3.org/2000/svg";
const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, String(a[k])); return e; };
let _uid = 0;

/**
 * The vertical fade. Digits enter and leave the window softened rather than clipped -- a hard edge reads as
 * text being cut off, a fade reads as a wheel turning behind a slot.
 */
function buildMask(defs, id) {
    const grad = el("linearGradient", { id: `odo-grad-${id}`, x1: "0%", y1: "0%", x2: "0%", y2: "100%" });
    for (const [offset, opacity] of [[0, 0], [0.2, 1], [0.8, 1], [1, 0]]) {
        grad.appendChild(el("stop", { offset, "stop-color": "white", "stop-opacity": opacity }));
    }
    defs.appendChild(grad);
    const mask = el("mask", { id: `odo-mask-${id}` });
    mask.appendChild(el("rect", { x: 0, y: 0, width: "100%", height: "100%", fill: `url(#odo-grad-${id})` }));
    defs.appendChild(mask);
}

/**
 * Mount an odometer into a host element.
 *
 * @param opts.value        the value to show now
 * @param opts.fontSize     px; the strip step is fontSize * lineHeight
 * @param opts.fill         text colour
 * @returns { el, set(value), destroy(), isRolling() }
 */
export function mountOdometer(host, opts = {}) {
    const id = ++_uid;
    const fontSize = opts.fontSize ?? 22;
    const lineHeight = opts.lineHeight ?? DEFAULTS.lineHeight;
    const step = fontSize * lineHeight;
    const fill = opts.fill || "#cfe";
    const family = opts.fontFamily || "ui-monospace, SFMono-Regular, Menlo, monospace";
    // The window shows ONE cell plus the fade margins. The margin is the original's: half the leading, plus a
    // tenth of the font size, which is what keeps a digit optically centred rather than sitting high.
    const marginBottom = (step - fontSize) / 2 + fontSize / 10;
    const baseline = step - marginBottom;
    const height = step + marginBottom;

    const root = el("svg", { height, style: "overflow:hidden;display:block" });
    const defs = el("defs");
    root.appendChild(defs);
    buildMask(defs, id);
    const stage = el("g", { mask: `url(#odo-mask-${id})` });
    root.appendChild(stage);
    host.innerHTML = "";
    host.appendChild(root);

    let cells = [];           // { isDigit, node, filter, x }
    let current = String(opts.value ?? "0");
    let raf = null, rollingUntil = 0;

    const layout = () => {
        // A monospace advance is assumed and stated: proportional digits would need per-glyph measurement,
        // which needs a laid-out document, which is the thing this file is trying not to require.
        const adv = fontSize * (opts.advance ?? 0.62);
        let x = 0;
        for (const c of cells) { c.x = x; c.node.setAttribute("transform", `translate(${x}, ${c.y})`); x += adv; }
        root.setAttribute("width", String(Math.max(1, x)));
        root.setAttribute("viewBox", `0 0 ${Math.max(1, x)} ${height}`);
    };

    const build = (plan) => {
        while (stage.firstChild) stage.removeChild(stage.firstChild);
        for (const f of defs.querySelectorAll("filter")) f.remove();
        cells = plan.map((p, i) => {
            if (!p.isDigit) {
                const g = el("g");
                const t = el("text", { fill, "font-size": fontSize, "font-family": family });
                t.textContent = p.char;
                g.appendChild(t);
                stage.appendChild(g);
                return { isDigit: false, node: g, y: baseline, x: 0 };
            }
            const fid = `odo-blur-${id}-${i}`;
            // width/x give the blur room to spread beyond the glyph box; a filter region left at its default
            // clips the blur and the digit appears to get a hard edge as it speeds up.
            const filt = el("filter", { id: fid, width: "300%", x: "-100%" });
            const blur = el("feGaussianBlur", { in: "SourceGraphic", stdDeviation: "0 0" });
            filt.appendChild(blur);
            defs.appendChild(filt);
            const g = el("g", { filter: `url(#${fid})` });
            // ELEVEN cells: 0..9 and then 0 again. The repeat is what makes the modulo wrap seamless -- with
            // ten, the strip would jump from 9 back to 0 across the visible window.
            for (let d = 0; d <= DIGITS; d++) {
                const t = el("text", { y: -d * step, fill, "font-size": fontSize, "font-family": family });
                t.textContent = String(d % DIGITS);
                g.appendChild(t);
            }
            stage.appendChild(g);
            return { isDigit: true, node: g, blurNode: blur, y: baseline, x: 0, plan: p };
        });
        layout();
    };

    /** Place every cell for a given time into the roll. */
    const apply = (tMs) => {
        for (const c of cells) {
            if (!c.isDigit) { c.node.setAttribute("transform", `translate(${c.x}, ${c.y})`); continue; }
            const s = digitAt(tMs, c.plan, opts);
            c.node.setAttribute("transform", `translate(${c.x}, ${c.y + s.offsetSteps * step})`);
            c.blurNode.setAttribute("stdDeviation", `0 ${s.blur.toFixed(1)}`);
        }
    };

    const set = (value, setOpts = {}) => {
        const next = String(value);
        if (next === current && !setOpts.force) return false;
        const plan = planRoll(current, next, opts);
        build(plan);
        const total = totalDuration(plan.filter((p) => p.isDigit).length, opts);
        const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
        const t0 = now();
        rollingUntil = t0 + total;
        if (raf) cancelAnimationFrame(raf);
        const tick = () => {
            const dt = now() - t0;
            apply(dt);
            if (dt < total) raf = requestAnimationFrame(tick);
            else {
                // *** LAND EXACTLY. *** Stopping when dt >= total leaves the last computed frame on screen,
                // which is a hair off the target offset -- so a finished odometer sits permanently a fraction
                // of a digit high, and the blur never quite reaches zero.
                apply(total);
                raf = null;
            }
        };
        apply(0);
        raf = requestAnimationFrame(tick);
        current = next;
        return true;
    };

    set(current, { force: true });
    return {
        el: root,
        set,
        isRolling: () => raf !== null,
        value: () => current,
        destroy() { if (raf) cancelAnimationFrame(raf); raf = null; try { host.innerHTML = ""; } catch (e) {} },
    };
}

export { totalDuration };

/**
 * Mount every element carrying data-odometer.
 *
 * *** THE ATTRIBUTE IS DELIBERATELY NOT data-morph-stat. *** ui/morphDigits.js has claimed that one since
 * v3531 and does a different transition on it -- glyph strokes bending rather than a strip scrolling. Two
 * initialisers claiming one element would both write to it, the later one would win, and the loss would be
 * invisible: the same class of bug as a draw-in overwriting a dashed edge's stroke-dasharray (v4180). The
 * selectors are disjoint, the gate asserts no element carries both, and choosing between the two transitions
 * stays a decision somebody makes per number.
 */
export function initOdometers(doc = document) {
    const out = [];
    for (const host of doc.querySelectorAll("[data-odometer]")) {
        const value = host.getAttribute("data-odometer") || host.textContent.trim() || "0";
        const fontSize = parseInt(host.getAttribute("data-odometer-size") || "0", 10) || undefined;
        try { out.push(mountOdometer(host, { value, fontSize })); } catch (e) {}
    }
    return out;
}
