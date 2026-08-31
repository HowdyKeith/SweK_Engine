// fx/cssKeyframes.mjs -- v4222 -- the tree's own @keyframes rules, read as data.
//
// Idea from gibbok/keyframes-tool (MIT), which converts CSS @keyframes into the keyframes object the Web
// Animations API takes. Written here rather than vendored: the tool is a Node CLI built on the `css` parser
// and Ramda, and what is worth having is the TRANSFORM, which is about thirty lines once the dependencies go.
//
// *** WHY THIS AND NOT MORE OF ui/domAnimation.mjs. *** v4191 took the other half of this idea from the same
// author's animatelo: a hand-written KEYFRAMES table plus quietStateOf(), so the dirty flag could be told
// about DOM animation at all. Its header measured the corpus that motivated it -- 86 DISTINCT @keyframes
// RULES ACROSS 34 FILES -- and then converted none of them. Those 86 are still CSS-only: readable by a
// browser, invisible to a test, and impossible for engine/frameDirty.js to reason about except through
// document.getAnimations() at runtime. This module is what turns them into the same kind of data v4191's
// table already is.
//
// Pure: no DOM, no CSSOM, no stylesheet object. It reads text, which is what lets a gate run it over the
// tree's real rules rather than over a fixture.
"use strict";

/**
 * Strip CSS comments, RESPECTING STRING LITERALS.
 *
 * A bare /\*[\s\S]*?\*\/ is wrong for CSS because `content: "/*"` is a legal declaration, and it is wrong
 * for anything else for the same reason. This walks the text instead.
 */
export function stripComments(css) {
    const src = String(css == null ? "" : css);
    let out = "", i = 0;
    while (i < src.length) {
        const c = src[i];
        if (c === '"' || c === "'") {                       // copy a string literal through untouched
            let j = i + 1;
            while (j < src.length && src[j] !== c) { if (src[j] === "\\") j++; j++; }
            out += src.slice(i, Math.min(j + 1, src.length));
            i = j + 1;
            continue;
        }
        if (c === "/" && src[i + 1] === "*") {
            const end = src.indexOf("*/", i + 2);
            out += " ";
            i = end < 0 ? src.length : end + 2;
            continue;
        }
        out += c; i++;
    }
    return out;
}

/**
 * The offset a keyframe selector names. `from` is 0, `to` is 1, `50%` is 0.5.
 * Returns null for anything else, so a caller can report it rather than silently animating at 0.
 */
export function offsetOf(selector) {
    const s = String(selector).trim().toLowerCase();
    if (s === "from") return 0;
    if (s === "to") return 1;
    const m = /^([+-]?\d*\.?\d+)%$/.exec(s);
    if (!m) return null;
    const v = parseFloat(m[1]) / 100;
    return Number.isFinite(v) ? v : null;
}

/**
 * A CSS property name as the Web Animations API wants it.
 *
 * *** THE VENDOR-PREFIX CASE IS THE ONE TO GET RIGHT, AND keyframes-tool GETS IT WRONG. *** Its regex is
 * str.replace(/[-_]([a-z])/g, m => m[1].toUpperCase()), which has no special case for a LEADING dash -- so
 * `-webkit-transform` comes out `WebkitTransform`, capital W. The CSSOM rule is that the leading dash is
 * dropped and the next letter stays lower case: `webkitTransform`. A capitalised key is simply ignored by
 * WAAPI, so the property silently does not animate -- which is the kind of failure that looks like a CSS
 * problem for an afternoon. This tree has 41 -webkit- declarations, so it is not hypothetical.
 */
export function camelCase(prop) {
    let s = String(prop).trim();
    let lead = false;
    if (s.startsWith("--")) return s;                     // a custom property keeps its name exactly
    if (s.startsWith("-")) { s = s.slice(1); lead = true; }
    s = s.replace(/[-_]([a-zA-Z])/g, (_, c) => c.toUpperCase());
    return lead ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/** The declarations of one keyframe block, as a plain object. Later duplicates win, as CSS does. */
export function parseDeclarations(text) {
    const out = {};
    for (const part of String(text).split(";")) {
        const i = part.indexOf(":");
        if (i < 0) continue;
        const prop = part.slice(0, i).trim();
        const value = part.slice(i + 1).trim();
        if (!prop || !value) continue;
        out[prop] = value;
    }
    return out;
}

/**
 * Every `@keyframes NAME { ... }` block in a stylesheet, found by BRACE MATCHING rather than by a regex.
 *
 * A keyframes body contains its own `{}` per selector, so a lazy `\{[\s\S]*?\}` stops at the FIRST inner
 * closing brace and returns a fragment -- and the fragment usually still parses into something, which is
 * how a truncated animation gets shipped. Counting braces is the only version that is right.
 */
export function findKeyframeBlocks(css) {
    // *** COMMENTS ARE STRIPPED PER BLOCK, NOT ACROSS THE WHOLE FILE, AND THAT IS FROM A MEASUREMENT. ***
    // The first version stripped first and searched second, which is fine for a stylesheet and wrong for the
    // embedded CSS this tree actually has -- rules living inside JS string literals that get injected as a
    // <style>. In demos_code/home_assistant_control.js the line comment "Talks to the bridge's /ha/* proxy"
    // contains `/ha/*`, which opens a CSS comment that then runs to the next `*/` THIRTEEN THOUSAND NINE
    // HUNDRED AND TWENTY-FIVE CHARACTERS LATER, swallowing two real @keyframes rules on the way. Searching
    // the raw text and stripping only inside a matched block makes an unrelated `/*` upstream harmless.
    // THE TRADE, STATED: a genuinely commented-out @keyframes block is now found rather than ignored. That is
    // the safer direction here -- this module's job is to report what animations exist, and a false positive
    // is visible in the output where a false negative is silent -- and the gate counts them so the number is
    // known rather than assumed.
    const src = String(css == null ? "" : css);
    const out = [];
    const re = /@(?:-[a-z]+-)?keyframes\s+("[^"]+"|'[^']+'|[A-Za-z0-9_-]+)\s*\{/g;
    let m;
    while ((m = re.exec(src))) {
        let depth = 1, i = re.lastIndex;
        for (; i < src.length && depth > 0; i++) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
        }
        if (depth !== 0) break;                            // unbalanced: stop rather than invent a block
        out.push({ name: m[1].replace(/^["']|["']$/g, ""), body: stripComments(src.slice(re.lastIndex, i - 1)) });
        re.lastIndex = i;
    }
    return out;
}

/**
 * The frames of one keyframes body.
 *
 * *** ONE BLOCK CAN NAME SEVERAL OFFSETS, AND THAT IS THE PART A NAIVE READER DROPS. *** `0%,97%,100%{...}`
 * is three frames sharing one declaration set, and this tree writes it that way 41 times, plus 87 uses of
 * `from, to`. Reading only the first selector loses the rest, and the animation then holds its start value
 * and snaps -- which looks like a timing bug rather than a parsing one.
 */
export function parseKeyframeBody(body) {
    const frames = [], unknown = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(String(body)))) {
        const decls = parseDeclarations(m[2]);
        if (!Object.keys(decls).length) continue;
        for (const sel of m[1].split(",")) {
            const s = sel.trim();
            if (!s) continue;
            const offset = offsetOf(s);
            if (offset === null) { unknown.push(s); continue; }
            frames.push({ offset, declarations: decls });
        }
    }
    return { frames, unknown };
}

/**
 * One keyframes body as a Web Animations keyframes array: offsets sorted ascending, properties camelCased,
 * and `animation-timing-function` renamed to `easing`.
 *
 * The easing default is "ease", which is what CSS itself uses when animation-timing-function is absent --
 * NOT "linear", which is what WAAPI defaults to. Converting without saying so changes how every converted
 * animation moves, subtly, everywhere. Pass { easing: null } to leave it off and take WAAPI's default.
 */
export function toKeyframes(body, opts = {}) {
    const { frames, unknown } = parseKeyframeBody(body);
    const defaultEasing = "easing" in opts ? opts.easing : "ease";
    const out = frames.map(({ offset, declarations }) => {
        const f = { offset };
        for (const [prop, value] of Object.entries(declarations)) {
            if (prop.trim().toLowerCase() === "animation-timing-function") { f.easing = value; continue; }
            f[camelCase(prop)] = value;
        }
        if (!("easing" in f) && defaultEasing != null) f.easing = defaultEasing;
        return f;
    });
    // stable sort by offset: two frames at the same offset keep source order, which is what CSS does
    out.sort((a, b) => a.offset - b.offset);
    return { keyframes: out, unknown };
}

/** Every animation in a stylesheet, as { name: keyframes[] }. Later blocks of the same name win, as CSS does. */
export function convert(css, opts = {}) {
    const out = {};
    for (const { name, body } of findKeyframeBlocks(css)) out[name] = toKeyframes(body, opts).keyframes;
    return out;
}

/**
 * Is this what the Web Animations API will actually accept?
 *
 * *** THIS IS A DIFFERENT AND LOOSER QUESTION THAN ui/domAnimation.mjs's validateKeyframes, AND CONFLATING
 * THEM WOULD CONDEMN MOST OF THIS TREE'S OWN CSS. *** WAAPI requires offsets in [0,1] and non-decreasing, and
 * that is all: a PARTIAL keyframe list is legal and useful. `@keyframes spin { to { transform:rotate(360deg) } }`
 * is one frame at offset 1, and the browser fills the start from the element's current value -- it is how you
 * spin something from wherever it happens to be. validateKeyframes is a HOUSE RULE for hand-authored tables,
 * where an implicit endpoint hides an author's intent; it is deliberately stricter and should stay that way.
 * The gate measures the corpus against BOTH and reports the gap rather than calling either one wrong.
 */
export function waapiProblems(frames) {
    const problems = [];
    if (!Array.isArray(frames) || !frames.length) return ["no frames"];
    let last = -Infinity;
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        if (!f || typeof f !== "object") { problems.push(`frame ${i} is not an object`); continue; }
        const o = f.offset;
        if (typeof o !== "number" || !(o >= 0 && o <= 1)) { problems.push(`frame ${i} offset ${o} outside [0,1]`); continue; }
        if (o < last) problems.push(`frame ${i} offset ${o} decreases (previous ${last})`);
        else last = o;
        if (!Object.keys(f).filter((k) => k !== "offset" && k !== "easing").length) problems.push(`frame ${i} animates nothing`);
    }
    return problems;
}

/** True when the list relies on the element's current value for a start or an end -- legal, and worth knowing. */
export function isPartial(frames) {
    if (!Array.isArray(frames) || !frames.length) return true;
    return frames[0].offset !== 0 || frames[frames.length - 1].offset !== 1;
}

export default { convert, toKeyframes, findKeyframeBlocks, parseKeyframeBody, offsetOf, camelCase, waapiProblems, isPartial };
