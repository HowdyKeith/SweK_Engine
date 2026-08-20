// WebGLEngine/ui/morphSvg-selfcheck.mjs -- v3663
//
// Run: node ui/morphSvg-selfcheck.mjs
//
// v3662 wired the gauge attention slot and DECLINED the morph, because ui/morphDigits.js appends its cells INTO
// the target and an SVG <text> renders nothing but tspans -- the morph would have silently blanked the number.
// morphNumberSvg puts the cells BESIDE the text instead. This grades that.
//
// *** THE KEY IS NOT "DOES IT ANIMATE". IT IS: AT EVERY INSTANT, INCLUDING MID-MORPH, IS THE TRUE VALUE STILL
// IN THE DOM? v3531's rule says a morph shows shapes that are not valid digits, so the morph may only ever be
// PAINT over a number that is already correct. If this function threw on frame two the readout must still read
// the right thing. That is checkable, and it is checked below at three points in the animation. ***
//
// DRIVEN WITH AN INJECTED CLOCK AND A MINIMAL DOM. morphDigits takes doc/now/raf as parameters -- its own
// header says that is so "a gate must be able to import it and drive it with its own clock" -- so no browser
// and no jsdom is needed, and the frames are stepped rather than waited for.

import { readFileSync } from "node:fs";
import { morphNumberSvg, morphNumber } from "./morphDigits.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- the smallest DOM that can hold the question -----------------------------------------------------------
function makeNode(tag) {
    const n = {
        tagName: tag, namespaceURI: "http://www.w3.org/2000/svg", childNodes: [], parentNode: null,
        attrs: Object.create(null), style: {}, textContent: "",
        setAttribute(k, v) { this.attrs[k] = String(v); },
        getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
        removeAttribute(k) { delete this.attrs[k]; },
        appendChild(c) { c.parentNode = this; this.childNodes.push(c); return c; },
        removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
        querySelector(sel) {
            const m = /^\[([a-z-]+)="([^"]*)"\]$/.exec(sel);
            if (!m) return null;
            const hit = (n2) => { if (n2.getAttribute && n2.getAttribute(m[1]) === m[2]) return n2;
                for (const k of n2.childNodes) { const r = hit(k); if (r) return r; } return null; };
            for (const k of this.childNodes) { const r = hit(k); if (r) return r; }
            return null;
        },
    };
    return n;
}
const doc = { createElementNS: (_ns, tag) => makeNode(tag), createElement: (tag) => makeNode(tag) };
/** A stepped clock + raf queue: nothing waits, everything is advanced on purpose. */
function makeClock() {
    let t = 0; const q = [];
    return {
        now: () => t,
        raf: (fn) => q.push(fn),
        advance(dt, steps = 1) {
            for (let i = 0; i < steps; i++) {
                t += dt / steps;
                const batch = q.splice(0, q.length);
                for (const fn of batch) fn(t);
            }
        },
        pending: () => q.length,
    };
}
const stage = (value) => {
    const svg = makeNode("svg"), text = makeNode("text");
    text.textContent = value;
    text.setAttribute("x", "21"); text.setAttribute("y", "25");
    text.setAttribute("font-size", "11"); text.setAttribute("text-anchor", "middle");
    svg.appendChild(text);
    return { svg, text };
};
const cellsOf = (svg) => svg.querySelector('[data-morph-cells="1"]');

// --- 1. THE VALUE NEVER LEAVES THE DOM ------------------------------------------------------------------------
{
    say("1. THE TRUE VALUE MUST BE READABLE AT EVERY INSTANT -- v3531's rule, in SVG.");
    const { svg, text } = stage("47");
    const c = makeClock();
    const r = morphNumberSvg(text, { ms: 400, doc, now: c.now, raf: c.raf });
    ok("it accepted a plain integer", !!r);
    const at = [];
    at.push({ when: "start", txt: text.textContent, cells: !!cellsOf(svg) });
    c.advance(120, 6); at.push({ when: "mid", txt: text.textContent, cells: !!cellsOf(svg) });
    c.advance(120, 6); at.push({ when: "late", txt: text.textContent, cells: !!cellsOf(svg) });
    c.advance(400, 8); at.push({ when: "end", txt: text.textContent, cells: !!cellsOf(svg) });
    for (const a of at) say("     " + a.when.padEnd(6) + " text=" + JSON.stringify(a.txt) + "  morph cells present: " + a.cells);
    ok("!! the text reads 47 at every point, including mid-morph", at.every((a) => a.txt === "47"),
        "the cells are a SIBLING <g>, so the <text> is never emptied and never display:none -- only made " +
        "transparent. IF THIS FUNCTION THREW ON FRAME TWO THE READOUT WOULD STILL BE CORRECT");
    ok("!! and the cells are gone once it settles", at[at.length - 1].cells === false && at[1].cells === true,
        "present during, absent after -- a morph that leaves its scaffolding behind would block the gauge set's " +
        "own next update from being seen");
    ok("the text's paint is restored, not left transparent", text.getAttribute("fill-opacity") === null,
        "there was no fill-opacity before, so there must be none after; a morph that leaves the number invisible " +
        "is worse than one that never ran");
}

// --- 2. THE REFUSAL, AND IT IS THE SAME ONE ---------------------------------------------------------------------
{
    say("2. NOT-AN-INTEGER IS REFUSED, exactly as the HTML path refuses it.");
    for (const v of ["–", "", "12.5", "96%", "n/a", "1 2"]) {
        const { text } = stage(v);
        const c = makeClock();
        ok("refuses " + JSON.stringify(v), morphNumberSvg(text, { doc, now: c.now, raf: c.raf }) === null &&
            text.textContent === v, "and leaves the content untouched");
    }
    const { text } = stage("8");
    const c = makeClock();
    ok("...and accepts a single digit", !!morphNumberSvg(text, { doc, now: c.now, raf: c.raf }));
}

// --- 3. REPEATED CALLS MUST NOT STACK ----------------------------------------------------------------------------
{
    say("3. A SECOND CALL WHILE THE FIRST IS RUNNING -- the gauge polls every 2s and the slot ticks every 500ms.");
    const { svg, text } = stage("3");
    const c = makeClock();
    morphNumberSvg(text, { ms: 400, doc, now: c.now, raf: c.raf });
    c.advance(100, 2);
    morphNumberSvg(text, { ms: 400, doc, now: c.now, raf: c.raf });
    morphNumberSvg(text, { ms: 400, doc, now: c.now, raf: c.raf });
    const groups = svg.childNodes.filter((n) => n.getAttribute && n.getAttribute("data-morph-cells") === "1");
    say("     morph groups in the canvas after three overlapping calls: " + groups.length);
    ok("!! exactly one group exists, however many calls overlap", groups.length === 1,
        "each call removes any prior group before adding its own. THREE OVERLAPPING CALLS LEAVING THREE SETS OF " +
        "CELLS IS THE FAILURE THIS PREVENTS, and on a 500ms tick against a 420ms morph they WILL overlap");
    c.advance(900, 10);
    ok("and after settling there are none", svg.childNodes.filter((n) => n.getAttribute && n.getAttribute("data-morph-cells") === "1").length === 0);
    ok("the text still reads 3", text.textContent === "3");
}

// --- 4. it is placed where the text was ----------------------------------------------------------------------------
{
    say("4. THE CELLS LAND WHERE THE NUMBER WAS -- a dial's readout is text-anchor=middle.");
    const { svg, text } = stage("100");
    const c = makeClock();
    morphNumberSvg(text, { ms: 400, doc, now: c.now, raf: c.raf });
    const g = cellsOf(svg);
    const xs = g.childNodes.map((n) => parseFloat(n.getAttribute("x")));
    const w = 11 * 0.62, expectLeft = 21 - (w * 3) / 2;
    say("     three cells at x = " + xs.map((v) => v.toFixed(2)).join(", ") + "   (anchor=middle at x=21, cell width " + w.toFixed(2) + ")");
    ok("!! a middle-anchored number is centred on its own x, not left-aligned from it",
        Math.abs(xs[0] - expectLeft) < 1e-9 && Math.abs(xs[2] - (expectLeft + 2 * w)) < 1e-9,
        "left edge " + expectLeft.toFixed(2) + " -- ignoring text-anchor would have put a three-digit morph a " +
        "full glyph and a half to the right of the number it is replacing");
    c.advance(900, 10);
}

// --- 5. scope --------------------------------------------------------------------------------------------------------
{
    say("5. SCOPE.");
    const src = readFileSync(new URL("./morphDigits.js", import.meta.url), "utf8");
    ok("the SVG path shares makeDigit with the HTML path -- ONE declaration of what a digit looks like",
        /export function morphNumberSvg/.test(src) && (src.match(/makeDigit\(doc\)/g) || []).length >= 2,
        "the glyphs still come from physics/mesh/strokeMorph.mjs, the module the lab grades. A second copy of " +
        "the strokes for SVG would be the drift this file's header already refuses");
    ok("morphNumber (the HTML path) is untouched and still exported", typeof morphNumber === "function");
    say("   WIRED: server.html's gauge slot now calls morphNumberSvg where v3662 declined. THIS NOTE SAID 'NOT");
    say("   DONE' UNTIL THE WIRING LANDED IN THE SAME ROUND -- a scope note that outlives its own round is the");
    say("   stale-prose defect these gates keep catching, so it moved with the code rather than after it.");
    say("   NOT CHECKED: that it LOOKS right. The stub proves the value is present, the cells are placed and");
    say("   removed, and nothing stacks. IT CANNOT PROVE A DIGIT ROLLED, and no headless check can.");
}

console.log("morphSvg-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
