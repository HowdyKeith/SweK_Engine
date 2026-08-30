// FILE: ui/textMorph.js -- v4158
//
// *** A READOUT THAT CHANGES SHOULD LOOK LIKE THE SAME VALUE CHANGING, NOT LIKE ONE STRING REPLACED BY ANOTHER. ***
//
// Keith asked for text morphing on the ticker after lochie/torph (MIT). *** IT IS DELIBERATELY NOT ON THE
// TICKER, AND THE ARITHMETIC IS WHY. *** server.html's ticker is a marquee: 0.9px per frame at 60fps is 54px/s
// across a 220px clip, so a message is on screen for 6.0s at 80px wide and 17.5s at 700px, and its queue caps
// at 40 -- roughly five and a half minutes of backlog. Its problem is THROUGHPUT, which no transition fixes.
// Worse, morphing is only worth anything when the old and new strings SHARE STRUCTURE: consecutive log lines
// share almost nothing, so every glyph would fade out and every glyph fade in -- a crossfade with extra
// machinery, and slower to read than the scroll it replaced.
//
// This is pointed at the READOUTS instead, where the two strings always share structure: v4157 -> v4158 keeps
// four of five graphemes, a peer count keeps every character but one. There a morph says "this number moved",
// which is a different statement from "here is a different number", and the difference is the whole point.
//
// ---- GRAPHEMES, NOT CODE POINTS, AND THIS TREE'S UI IS THE REASON ---------------------------------------------
// *** SweK's readouts are full of emoji and half of them are MULTI-CODE-POINT. *** The gear in the server
// header is U+2699 followed by U+FE0F, a variation selector. Split with [...str] that is TWO elements, the
// second of which is an invisible modifier that renders as a stray box on its own -- so a naive morph does not
// merely animate badly, IT CORRUPTS THE TEXT. Intl.Segmenter with granularity "grapheme" keeps it whole.
//
// ---- WHAT IS PURE HERE ----------------------------------------------------------------------------------------
// Segmentation, the diff and the plan are pure functions over strings, so the gate settles every one of them in
// node. Only morph() touches the DOM. Same split as tools/export/reskin.js, for the same reason.
"use strict";
import { springToCssLinear } from "./springMotion.js";

// A morph of five hundred glyphs is five hundred DOM nodes for something nobody can follow. Past this, the
// caller gets a plain swap and is TOLD it happened, rather than a silent animation that never plays.
export const MAX_SEGMENTS = 240;

let _seg = null;
/** Grapheme clusters. Falls back to code points where Intl.Segmenter is missing -- worse, but not wrong. */
export function graphemes(str) {
    const s = String(str == null ? "" : str);
    if (!s) return [];
    try {
        if (_seg === null) _seg = (typeof Intl !== "undefined" && Intl.Segmenter) ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : false;
        if (_seg) return [..._seg.segment(s)].map((x) => x.segment);
    } catch { _seg = false; }
    return [...s];       // code points: still better than [].split(""), which would break surrogate pairs too
}

/**
 * Longest common subsequence, as index pairs into a and b.
 *
 * *** LCS AND NOT A PREFIX/SUFFIX TRIM, WHICH IS THE TEMPTING SHORTCUT. *** Trimming the shared head and tail
 * handles "v4157" -> "v4158" and fails the moment anything moves: "3 peers" -> "13 peers" shares every
 * character, and a trim sees a changed head and rewrites the whole string. LCS keeps the eight that survived
 * and inserts the one that is new, which is what makes the animation read as an insertion.
 */
export function lcsPairs(a, b) {
    const n = a.length, m = b.length;
    if (!n || !m) return [];
    const dp = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
        for (let j = m - 1; j >= 0; j--) {
            dp[i * (m + 1) + j] = a[i] === b[j]
                ? dp[(i + 1) * (m + 1) + (j + 1)] + 1
                : Math.max(dp[(i + 1) * (m + 1) + j], dp[i * (m + 1) + (j + 1)]);
        }
    }
    const out = [];
    let i = 0, j = 0;
    while (i < n && j < m) {
        if (a[i] === b[j]) { out.push([i, j]); i++; j++; }
        else if (dp[(i + 1) * (m + 1) + j] >= dp[i * (m + 1) + (j + 1)]) i++;
        else j++;
    }
    return out;
}

/**
 * What has to happen to turn `from` into `to`: which graphemes SURVIVE (and where they go), which leave, which
 * arrive. Pure, so the gate can assert the plan rather than watch an animation.
 */
export function planMorph(fromSegs, toSegs) {
    const pairs = lcsPairs(fromSegs, toSegs);
    const keptFrom = new Set(pairs.map((p) => p[0]));
    const keptTo = new Set(pairs.map((p) => p[1]));
    return {
        moves: pairs.map(([f, t]) => ({ from: f, to: t, seg: fromSegs[f] })),
        removes: fromSegs.map((_, i) => i).filter((i) => !keptFrom.has(i)),
        inserts: toSegs.map((_, j) => j).filter((j) => !keptTo.has(j)),
        // A caller that sees `unchanged` can skip the whole animation rather than play a no-op, which is the
        // difference between a readout that ticks and a readout that flickers every poll.
        unchanged: pairs.length === fromSegs.length && pairs.length === toSegs.length,
    };
}

/**
 * FLIP one element's text to a new string.
 *
 * FIRST-LAST-INVERT-PLAY: lay the new text out, measure where every surviving grapheme LANDED, then transform
 * it back to where it CAME FROM and release. The browser animates real layout positions rather than a guess,
 * which is what keeps proportional fonts honest -- a morph that assumed a fixed advance width would drift on
 * every character that is not a digit.
 *
 * Motion comes from springToCssLinear, so it runs on the COMPOSITOR and shares its numbers with every toast
 * this tree already springs. Returns what it did, so a caller can log it and a gate can read it.
 */
export function morph(el, text, opts = {}) {
    if (!el) return { ok: false, error: "no element" };
    const next = String(text == null ? "" : text);
    const prev = el.__morphText != null ? el.__morphText : el.textContent;
    if (prev === next) return { ok: true, unchanged: true };

    const fromSegs = graphemes(prev), toSegs = graphemes(next);
    el.__morphText = next;
    if (fromSegs.length > MAX_SEGMENTS || toSegs.length > MAX_SEGMENTS) {
        el.textContent = next;
        return { ok: true, swapped: true, why: "over " + MAX_SEGMENTS + " graphemes -- swapped rather than morphed" };
    }
    const reduced = (() => { try { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } })();
    if (reduced || opts.animate === false) { el.textContent = next; return { ok: true, swapped: true, why: reduced ? "prefers-reduced-motion" : "animate:false" }; }

    const plan = planMorph(fromSegs, toSegs);
    const spring = springToCssLinear(opts.preset || "snappy");

    // FIRST -- where the survivors are now
    const firstRects = new Map();
    const oldSpans = el.__morphSpans;
    if (oldSpans && oldSpans.length === fromSegs.length) {
        for (const m of plan.moves) { try { firstRects.set(m.to, oldSpans[m.from].getBoundingClientRect()); } catch {} }
    }

    // LAST -- build the new text and let it lay out
    const frag = document.createDocumentFragment();
    const spans = [];
    for (let j = 0; j < toSegs.length; j++) {
        const s = document.createElement("span");
        s.textContent = toSegs[j];
        s.style.display = "inline-block";
        s.style.whiteSpace = "pre";      // a space inside an inline-block collapses without this, so " " vanishes
        frag.appendChild(s); spans.push(s);
    }
    el.textContent = "";
    el.appendChild(frag);
    el.__morphSpans = spans;

    // INVERT + PLAY
    const insertSet = new Set(plan.inserts);
    for (let j = 0; j < spans.length; j++) {
        const s = spans[j];
        if (insertSet.has(j)) {
            s.style.opacity = "0";
            s.style.transform = "translateY(" + (opts.rise || -0.35) + "em)";
        } else {
            const was = firstRects.get(j);
            if (was) {
                const now = s.getBoundingClientRect();
                const dx = was.left - now.left, dy = was.top - now.top;
                if (dx || dy) s.style.transform = "translate(" + dx + "px," + dy + "px)";
            }
        }
    }
    // one reflow, then release everything at once
    void el.offsetWidth;
    for (const s of spans) {
        s.style.transition = "transform " + spring.durationMs + "ms " + spring.easing + ", opacity " + Math.round(spring.durationMs * 0.6) + "ms linear";
        s.style.transform = "translate(0,0)";
        s.style.opacity = "1";
    }
    return { ok: true, moved: plan.moves.length, removed: plan.removes.length, inserted: plan.inserts.length,
             durationMs: spring.durationMs, easing: spring.easing };
}

/** Bind an element so later calls only pass the new value. Returns a setter. */
export function morphBinding(el, opts = {}) {
    return (text) => morph(el, text, opts);
}
