// ui/morphDigits.js
//
// v3531 -- THE MORPH ON A REAL NUMBER, AND THE RULE FOR WHICH NUMBERS MAY HAVE IT.
//
// Keith asked whether server.html's CPU gauge could count with the morph. THE ANSWER IS NO, AND THE REASON IS
// THIS TREE'S OWN: *** A MORPH MAKES INTERMEDIATE FRAMES SHOW SHAPES THAT ARE NOT VALID DIGITS. *** For a
// counter that is the charm; for a diagnostic readout it means at any instant a reader may be looking at
// something that is not the value -- TWO THINGS WEARING ONE LABEL, a rendering artefact indistinguishable from
// a reading, which is the shape this project names more than any other.
//
// It is worse for CPU specifically: that gauge moves in its last digit on nearly every poll, so it would be
// PERMANENTLY MID-MORPH AND NEVER SETTLED. And there is history -- v3476 found those gauges never filled in at
// all because nvidia-smi was blocking the endpoint, so a gauge that is hard to read has already cost a
// diagnosis once.
//
// *** THE RULE, WRITTEN DOWN SO IT IS NOT RE-LITIGATED: A NUMBER MAY MORPH ONLY IF A READER WOULD NEVER NEED
// TO TRUST IT MID-TRANSITION. *** That admits numbers which change SLOWLY AND DISCRETELY, where the transition
// itself is the information -- a gate count ticking once a round, a version marker, a peer count. It excludes
// every live gauge, every measurement, and anything somebody would read while it moves.
//
// THE GATE COUNT ON case-study.html IS THE CASE THAT PASSES: `staleness --fix` maintains it, it moves once per
// round, and the true value STAYS IN THE DOM AS TEXT. This is progressive enhancement -- the number is already
// correct with no JavaScript at all, staleness keeps editing it exactly as before, and the morph is a reveal on
// top. IF THIS SCRIPT NEVER RUNS THE PAGE IS STILL RIGHT.
//
// ONE DECLARATION OF THE GLYPHS: the digit strokes are imported from physics/mesh/strokeMorph.mjs, the module
// the lab grades. A copy here would be a second declaration of what a "2" looks like, and the two would drift
// the first time somebody nudged a curve.
import { DIGIT_STROKES, parseStroke, resample, pairStrokes, morphAt, toPathD } from "../physics/mesh/strokeMorph.mjs";

const N = 48;                 // samples per glyph; the gate proves the keys hold at 64 and this is the same shape
const BOX = 24;               // the glyph box the strokes are authored in
const DEFAULT_MS = 420;
// Resolved lazily so this module LOADS outside a browser -- a gate must be able to import it and drive it with
// its own clock. Referencing the globals at module scope would throw on import, which is the difference between
// a module a gate can grade and one it can only read.
const defaultNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const defaultRaf = (fn) => (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame(fn) : setTimeout(fn, 16));

const cache = new Map();
function glyph(ch) {
    if (!cache.has(ch)) cache.set(ch, resample(parseStroke(DIGIT_STROKES[ch]), N));
    return cache.get(ch);
}

/** One digit cell that can morph from one character to another. */
export function makeDigit(doc = document) {
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", `0 0 ${BOX} ${BOX}`);
    svg.setAttribute("aria-hidden", "true");           // the readable value is the DOM text beside it
    svg.style.width = "0.62em"; svg.style.height = "1em"; svg.style.verticalAlign = "-0.12em";
    const p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "2"); p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
    let shown = null;
    return {
        node: svg,
        set(ch) { shown = ch; p.setAttribute("d", toPathD(glyph(ch))); },
        // *** THE CLOCK AND THE SCHEDULER ARE INJECTED ALL THE WAY DOWN, AND MY FIRST VERSION STOPPED ONE
        // LEVEL SHORT: morphTo took them but morphNumber called it with the browser defaults baked in, so the
        // gate hit `requestAnimationFrame is not defined` the moment it drove the real entry point. AN
        // INJECTION THAT ONLY THE INNER FUNCTION HONOURS IS AN INJECTION THE CALLER CANNOT USE.
        morphTo(ch, ms = DEFAULT_MS, now = defaultNow, raf = defaultRaf) {
            if (shown === ch) return;
            const a = glyph(shown ?? ch), { target } = pairStrokes(a, glyph(ch));
            const t0 = now();
            const step = () => {
                // A CLAMPED FRACTION, not a frame counter: a dropped frame must SHORTEN the animation rather
                // than stretch it, or a busy tab leaves the number unreadable for longer than anybody agreed to.
                const t = Math.min(1, (now() - t0) / ms);
                p.setAttribute("d", toPathD(morphAt(a, target, t)));
                if (t < 1) raf(step); else shown = ch;
            };
            raf(step);
        },
    };
}

/**
 * Replace an element's numeric text with morphing digits, counting up from zero as a reveal.
 *
 * THE TEXT IS KEPT, NOT REPLACED: it moves into a visually-hidden span so screen readers and
 * copy-paste still get the real number, and so a reader is never asked to read the morph itself.
 */
export function morphNumber(el, { ms = DEFAULT_MS, doc = document, now = defaultNow, raf = defaultRaf } = {}) {
    const text = (el.textContent || "").trim();
    if (!/^\d+$/.test(text)) return null;              // REFUSES anything that is not a plain integer
    const digits = [...text];
    const sr = doc.createElement("span");
    sr.textContent = text;
    sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    el.textContent = "";
    el.appendChild(sr);
    const cells = digits.map((d) => {
        const c = makeDigit(doc);
        c.set("0");
        el.appendChild(c.node);
        return c;
    });
    // The reveal: every cell starts at 0 and morphs to its digit. It SETTLES IMMEDIATELY and the true value is
    // already in the DOM, so nothing is unreadable for longer than one transition.
    cells.forEach((c, i) => c.morphTo(digits[i], ms, now, raf));
    return { cells, value: text };
}

/**
 * *** THE SVG-NATIVE MORPH, v3663. morphNumber() appends its digit cells INTO the target, which works for an
 * HTML element and CANNOT work for an SVG <text>: nothing renders inside <text> except tspans, so v3662's
 * gauge wiring correctly DECLINED rather than silently blanking the number. The digits were never the problem
 * -- makeDigit() already builds an <svg> with a morphing <path>. THE CONTAINER WAS. ***
 *
 * So the cells go BESIDE the text, in the same canvas, positioned where the text is:
 *   - a sibling <g> is inserted into the <text>'s own parent
 *   - the <text> keeps its textContent for the whole animation and is only made TRANSPARENT (fill-opacity 0),
 *     never display:none and never emptied
 *   - when the morph finishes the <g> is removed and the fill is restored
 *
 * *** THE TEXT NEVER LEAVING THE DOM IS THE WHOLE SAFETY ARGUMENT AND IT IS v3531's RULE IN SVG FORM: at every
 * instant, including mid-morph, the true value is present and readable to anything that reads the document --
 * a screen reader, a selection, a scraper, the gauge set's own next update. The morph is paint. If this
 * function throws on frame two, the number is still correct. ***
 *
 * Returns null (and does nothing) when the content is not a plain integer, exactly as morphNumber does.
 */
export function morphNumberSvg(textEl, { ms = DEFAULT_MS, doc = document, now = defaultNow, raf = defaultRaf } = {}) {
    if (!textEl || !textEl.parentNode) return null;
    const text = String(textEl.textContent || "").trim();
    if (!/^\d+$/.test(text)) return null;
    const NS = "http://www.w3.org/2000/svg";

    // one <g> at a time: a second call while the first is running would stack cells nobody removes
    const prior = textEl.parentNode.querySelector && textEl.parentNode.querySelector('[data-morph-cells="1"]');
    if (prior) { try { prior.parentNode.removeChild(prior); } catch (e) {} }

    const num = (v, d) => { const f = parseFloat(v); return Number.isFinite(f) ? f : d; };
    const size = num(textEl.getAttribute("font-size"), 11);
    const x = num(textEl.getAttribute("x"), 0), y = num(textEl.getAttribute("y"), 0);
    const anchor = textEl.getAttribute("text-anchor") || "start";
    const w = size * 0.62, total = w * text.length;
    // middle/end anchors are the common case on a dial, so the cells are placed the same way the text was
    const left = anchor === "middle" ? x - total / 2 : anchor === "end" ? x - total : x;

    const g = doc.createElementNS(NS, "g");
    g.setAttribute("data-morph-cells", "1");
    g.setAttribute("aria-hidden", "true");            // the readable value is the <text> still sitting under it
    const cells = [...text].map((d, i) => {
        const c = makeDigit(doc);
        // makeDigit authors in a BOX-unit box; place and scale it into user space rather than re-authoring it
        c.node.setAttribute("x", String(left + i * w));
        c.node.setAttribute("y", String(y - size * 0.82));
        c.node.setAttribute("width", String(w));
        c.node.setAttribute("height", String(size));
        c.set("0");
        g.appendChild(c.node);
        return c;
    });
    textEl.parentNode.appendChild(g);

    const restoreFill = textEl.getAttribute("fill-opacity");
    textEl.setAttribute("fill-opacity", "0");
    const done = () => {
        try { if (g.parentNode) g.parentNode.removeChild(g); } catch (e) {}
        try {
            if (restoreFill == null) textEl.removeAttribute("fill-opacity");
            else textEl.setAttribute("fill-opacity", restoreFill);
        } catch (e) {}
    };
    cells.forEach((c, i) => c.morphTo(text[i], ms, now, raf));
    // one settle, fenced so it fires exactly once however the frames land
    let fired = false;
    const settle = () => { if (fired) return; fired = true; done(); };
    const t0 = now();
    const watch = () => { if (now() - t0 >= ms) settle(); else raf(watch); };
    raf(watch);
    return { cells, value: text, settle };
}

/**
 * Wire every element carrying data-morph-stat. DECLARED IN THE MARKUP so the rule above is visible in the page
 * rather than hidden in a selector list here -- a page that morphed a gauge would have to say so out loud.
 *
 * *** THE ATTRIBUTE SITS ON THE PARENT AND NOT ON THE NUMBER, AND THAT IS NOT COSMETIC. *** My first version
 * put `data-morph-number` on the <b> itself and `staleness --fix` IMMEDIATELY WENT RED: it finds the gate count
 * by matching that element literally, so decorating it broke the one tool that keeps the number honest. The
 * marker staleness owns is left EXACTLY as it was and the opt-in moved up a level. A SECOND SPELLING TAUGHT TO
 * staleness WOULD HAVE BEEN THE WRONG FIX -- it would make a derived-number checker carry a presentation
 * concern, and the next decoration would break it again.
 */
export function initMorphNumbers(doc = document) {
    const out = [];
    for (const host of doc.querySelectorAll("[data-morph-stat]")) {
        const el = host.querySelector("b") || host;
        const r = morphNumber(el, { doc });
        if (r) out.push(r);
    }
    return out;
}
