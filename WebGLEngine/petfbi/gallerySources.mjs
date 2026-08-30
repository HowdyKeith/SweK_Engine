// FILE: petfbi/gallerySources.mjs
// VERSION: v4162 -- get the FULL-SIZE photo out of a post gallery, using what the page already declared.
//
// Keith: "the targetted issue is on Nextdoor page, then people post pics of the pet, if it is in a gallery,
// it is harder to download."
//
// *** THE PROBLEM IS NOT ACCESS. THE ADMIN IS LOOKING AT THE PHOTO; THEIR BROWSER ALREADY HAS IT. *** The
// problem is that a gallery shows a THUMBNAIL VARIANT, and right-click-save hands you that variant -- 200px of
// a dog, useless on a flyer somebody is meant to recognise a pet from. So this module does not fetch anything,
// log into anything, or crawl anything. It reads the variants THE PAGE ITSELF DECLARED and picks the biggest.
//
// *** AND THAT IS WHY IT NEEDS NO SITE-SPECIFIC KNOWLEDGE, WHICH IS THE WHOLE DESIGN. *** Responsive images
// exist because the browser has to choose a size, and to choose it the page must LIST the options:
//
//     <img src="dog_400.jpg" srcset="dog_400.jpg 400w, dog_1024.jpg 1024w, dog_2048.jpg 2048w">
//
// The full-resolution URL is right there, in the markup, on every responsive image on the web. Nothing here is
// tuned to Nextdoor and nothing breaks when Nextdoor redecorates: the same code reads PawBoost, Facebook, a
// PetFBI report page, or a plain WordPress gallery, because they all speak srcset. A per-site CDN rule table
// would have been the obvious build and it would have been wrong -- it rots the first time a CDN changes its
// query parameters, and this tree has a folder full of notes about exactly that kind of scraping.
//
// PetFBI's README already draws this line for the other end of the pipeline: "Facebook Groups have no official
// posting API and browser-bot posting violates Facebook's ToS -- so we only ever ASSIST the human." Reading a
// login-walled feed with a headless browser is the same trade with the same answer. An admin's account IS their
// reach; a scraper that gets it suspended costs more than every photo it ever saved. So this runs in the
// admin's OWN browser, on the ONE post they already opened, as a bookmarklet -- no automation, no session
// driving, no crawl, nothing that touches a page they did not choose to look at.

/** Below this displayed area a picture is furniture -- an avatar, a reaction icon, a nav logo. Measured against
 *  the DISPLAYED box rather than the natural size, because a 16px icon served at 512px is still an icon. */
export const MIN_AREA = 120 * 120;

/** Wider or taller than this and it is a banner or a divider, not a photograph of an animal. */
export const MAX_ASPECT = 4;

/** Query parameters that name a SIZE rather than an image. Stripping them is how two variants of one photo are
 *  recognised as one photo. */
export const SIZE_PARAMS = new Set(["w", "h", "width", "height", "size", "s", "sz", "fit", "crop", "resize",
                                    "quality", "q", "dpr", "scale", "max", "maxwidth", "maxheight", "stp"]);

/**
 * Parse a srcset attribute into its candidates.
 *
 * *** THE COMMAS CANNOT BE SPLIT ON NAIVELY, AND THAT IS THE ONE REAL TRAP IN THIS FILE. *** A URL may contain
 * a comma -- data: URIs and several CDNs' transform syntax do, routinely -- so `srcset.split(",")` tears a
 * perfectly good URL in half and yields two broken candidates. The separator is a comma that FOLLOWS a
 * descriptor or whitespace, so the parse walks the string instead: take a run of non-space as the URL, then an
 * optional descriptor, then require a comma before the next candidate.
 */
export function parseSrcset(srcset) {
    const out = [];
    const s = String(srcset || "");
    let i = 0;
    while (i < s.length) {
        while (i < s.length && /[\s,]/.test(s[i])) i++;      // skip separators
        if (i >= s.length) break;
        let start = i;
        while (i < s.length && !/\s/.test(s[i])) i++;         // the URL runs to whitespace
        let url = s.slice(start, i);
        // *** A CANDIDATE WITH NO DESCRIPTOR ENDS AT ITS OWN COMMA, AND THE FIRST DRAFT GLUED THAT COMMA ON. ***
        // "a.jpg, b.jpg 2x" produced ONE candidate whose URL was "a.jpg," -- the second image vanished and the
        // first pointed at a URL that 404s. Caught by the gate's own descriptor case, which is the cheapest
        // possible place to find it and a great deal cheaper than a lost-pet post carrying a broken link.
        // Trailing commas terminate the token (the HTML srcset grammar says so); an INTERNAL comma does not,
        // which is what keeps the CDN-transform case above working.
        if (/,$/.test(url)) {
            url = url.replace(/,+$/, "");
            if (url) out.push({ url, w: null, d: null });
            continue;
        }
        while (i < s.length && /\s/.test(s[i]) && s[i] !== "\n") i++;
        let desc = "";
        while (i < s.length && s[i] !== "," ) { desc += s[i]; i++; }
        i++;                                                  // step over the comma
        desc = desc.trim();
        const mw = /^(\d+(?:\.\d+)?)w$/.exec(desc);
        const md = /^(\d+(?:\.\d+)?)x$/.exec(desc);
        if (url) out.push({ url, w: mw ? +mw[1] : null, d: md ? +md[1] : null });
    }
    return out;
}

/**
 * The stable part of an image URL -- what is left once every size token is removed.
 *
 * Two URLs with the same key are two SIZES OF ONE PHOTO. That is the only way to tell a gallery of six pictures
 * from a gallery of six pictures times four variants each, and it is done without knowing whose CDN it is.
 *
 * IT ONLY STRIPS UNAMBIGUOUS SIZE TOKENS -- `800x600`, `w_800`, `?w=800`, `@2x`. A BARE `_400` IS LEFT ALONE
 * HERE ON PURPOSE, and the reason is the whole hazard of this file: `IMG_2024.jpg` and `IMG_2025.jpg` are two
 * photographs from somebody's camera, and a rule that strips `_2024` because it looks like a width merges two
 * different dogs into one entry. Losing a photo of a lost pet to a tidy regex is not a trade worth making.
 * Bare numeric variants are merged LATER, by mergeByDeclaredWidth, which has evidence this function does not.
 */
export function identityKey(url) {
    let u = String(url || "");
    let q = "";
    const qi = u.indexOf("?");
    if (qi >= 0) { q = u.slice(qi + 1); u = u.slice(0, qi); }
    // path segments that are purely a size: /w_800/, /800x600/, /s512/, /resize/1024/
    u = u.replace(/\/(?:[wh]_?\d+|\d+x\d+|s\d+|resize\/\d+|sized?\/\d+)(?=\/|$)/gi, "/");
    // filename suffixes: _800x600, -1024, @2x, .400w
    u = u.replace(/([._-])(?:\d+x\d+|\d{2,5}w|\d+x)(?=\.[a-z0-9]{2,5}$|$)/gi, "");
    u = u.replace(/@\d+(?:\.\d+)?x(?=\.[a-z0-9]{2,5}$|$)/gi, "");
    const kept = [];
    for (const pair of q.split("&")) {
        if (!pair) continue;
        const k = pair.split("=")[0].toLowerCase();
        if (!SIZE_PARAMS.has(k)) kept.push(pair);
    }
    kept.sort();
    return u + (kept.length ? "?" + kept.join("&") : "");
}

/**
 * Every URL one image element declares, with the width each one claims.
 *
 * `el` is a plain object so this is testable without a DOM: { src, currentSrc, srcset, dataset, sources,
 * clientWidth, clientHeight }. `sources` carries any <source srcset> from an enclosing <picture>.
 *
 * LAZY ATTRIBUTES ARE READ TOO, because a gallery below the fold has not swapped them into src yet -- which is
 * precisely the case that makes a gallery "harder to download" in the first place.
 */
export function variantsFromImg(el) {
    const seen = new Map();
    const add = (url, w, why) => {
        if (!url || typeof url !== "string") return;
        const u = url.trim();
        if (!u || u.startsWith("data:") || /\.svg(\?|$)/i.test(u)) return;
        const prev = seen.get(u);
        if (!prev || (w || 0) > (prev.w || 0)) seen.set(u, { url: u, w: w || null, why });
    };
    for (const c of parseSrcset(el && el.srcset)) add(c.url, c.w, c.d ? "srcset " + c.d + "x" : "srcset");
    for (const src of (el && el.sources) || []) for (const c of parseSrcset(src)) add(c.url, c.w, "picture/source");
    add(el && el.currentSrc, null, "currentSrc");
    add(el && el.src, null, "src");
    const d = (el && el.dataset) || {};
    for (const k of ["src", "original", "lazy", "lazySrc", "fullSrc", "large", "hires", "zoomSrc", "imageSrc"]) {
        if (d[k]) add(d[k], null, "data-" + k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()));
    }
    for (const k of ["srcset", "lazySrcset"]) if (d[k]) for (const c of parseSrcset(d[k])) add(c.url, c.w, "data-srcset");
    return [...seen.values()];
}

/** Is this element page furniture rather than a photograph somebody posted? */
export function isLikelyChrome(el) {
    const w = (el && el.clientWidth) || 0, h = (el && el.clientHeight) || 0;
    if (!w || !h) return false;                      // unknown box: keep it, and say so downstream
    if (w * h < MIN_AREA) return true;
    const ar = w > h ? w / h : h / w;
    return ar > MAX_ASPECT;
}

/**
 * The gallery: one entry per distinct photo, each carrying the largest URL the page declared for it.
 *
 * Ranked by declared width descending, so the picture most worth putting on a flyer is first. Every entry says
 * WHERE its winning URL came from and how many variants it beat, because an admin who cannot see that the tool
 * found a 2048px version has no reason to believe it did.
 */
/**
 * *** MERGE `abc_400.jpg` WITH `abc_2048.jpg` -- BUT ONLY ON EVIDENCE. ***
 *
 * The commonest variant spelling of all is a bare number in the filename, and identityKey deliberately refuses
 * to strip it (see there: IMG_2024 and IMG_2025 are two dogs). What separates a SIZE from a SEQUENCE NUMBER is
 * not the number's shape -- 2024 is a plausible width and a plausible camera index -- but whether THE PAGE
 * DECLARED THAT NUMBER AS THE WIDTH:
 *
 *     <img srcset="abc_400.jpg 400w, abc_2048.jpg 2048w">   the numbers ARE the widths -> one photo, two sizes
 *     <img srcset="IMG_2024.jpg 1200w"> <img srcset="IMG_2025.jpg 1200w">   numbers are not the widths -> two photos
 *
 * So two groups merge only when their keys differ in exactly one numeric run AND, in each, that number equals
 * the width the page declared for it. WITH NO DECLARED WIDTH NOTHING MERGES: an admin seeing the same dog twice
 * loses a few seconds, and an admin never seeing the second dog loses the dog.
 */
export function mergeByDeclaredWidth(groups) {
    const NUM = /\d+/g;
    // Template a key by blanking one numeric run, so two keys that differ in exactly one number share a shape.
    const shapes = (key) => {
        const out = [];
        let m; NUM.lastIndex = 0;
        while ((m = NUM.exec(key))) out.push({ shape: key.slice(0, m.index) + "\u0000" + key.slice(m.index + m[0].length), n: +m[0] });
        return out;
    };
    const declared = (g) => {
        // The number this group's URLs claim as a width, if its own variants agree on one.
        const ws = g.variants.map((v) => v.w).filter((w) => typeof w === "number" && w > 0);
        return ws.length ? Math.max(...ws) : null;
    };
    const list = [...groups.values()];
    const parent = new Map(list.map((g) => [g.key, g.key]));
    const find = (k) => { while (parent.get(k) !== k) k = parent.get(k); return k; };
    const byShape = new Map();
    for (const g of list) {
        const w = declared(g);
        if (w == null) continue;                       // no evidence -> never merged
        for (const s of shapes(g.key)) {
            if (s.n !== w) continue;                   // the number is not the declared width -> not a size token
            const bucket = byShape.get(s.shape) || [];
            bucket.push(g.key);
            byShape.set(s.shape, bucket);
        }
    }
    for (const keys of byShape.values()) {
        for (let i = 1; i < keys.length; i++) {
            const a = find(keys[0]), b = find(keys[i]);
            if (a !== b) parent.set(b, a);
        }
    }
    const merged = new Map();
    for (const g of list) {
        const root = find(g.key);
        const into = merged.get(root);
        if (!into) { merged.set(root, { ...g, variants: g.variants.slice(), mergedKeys: [g.key] }); continue; }
        into.variants.push(...g.variants);
        into.mergedKeys.push(g.key);
        if ((g.displayed.w || 0) * (g.displayed.h || 0) > (into.displayed.w || 0) * (into.displayed.h || 0)) into.displayed = g.displayed;
    }
    return merged;
}

export function galleryFrom(els, { minArea = MIN_AREA } = {}) {
    const groups = new Map();
    const dropped = [];
    for (const el of els || []) {
        const vs = variantsFromImg(el);
        if (!vs.length) continue;
        if (isLikelyChrome(el)) {
            dropped.push({ url: vs[0].url, w: el.clientWidth, h: el.clientHeight,
                           why: (el.clientWidth * el.clientHeight < minArea) ? "too small -- avatar or icon" : "extreme aspect -- banner or divider" });
            continue;
        }
        for (const v of vs) {
            const key = identityKey(v.url);
            const g = groups.get(key) || { key, variants: [], displayed: { w: el.clientWidth || 0, h: el.clientHeight || 0 } };
            g.variants.push(v);
            groups.set(key, g);
        }
    }
    const photos = [...mergeByDeclaredWidth(groups).values()].map((g) => {
        // WIDEST DECLARED WINS. Where nothing declared a width -- a bare src with no srcset -- the entries tie
        // at null and the FIRST is kept, which is the order variantsFromImg lists them: srcset before
        // currentSrc before src before the lazy attributes. That order is deliberate: a declared candidate is
        // better evidence than whatever the browser happened to pick for this viewport.
        const best = g.variants.reduce((a, b) => ((b.w || 0) > (a.w || 0) ? b : a), g.variants[0]);
        return {
            url: best.url, width: best.w, from: best.why,
            variants: g.variants.length, displayed: g.displayed, mergedKeys: g.mergedKeys || [g.key],
            others: g.variants.filter((v) => v.url !== best.url).map((v) => ({ url: v.url, w: v.w })),
        };
    });
    photos.sort((a, b) => (b.width || 0) - (a.width || 0) || a.url.localeCompare(b.url));
    return {
        ok: true, photos, dropped,
        // THE HEADLINE AN ADMIN ACTUALLY NEEDS: did this beat right-click-save, and by how much?
        summary: photos.length === 0
            ? "no photographs found -- everything on this page looked like an icon or a banner"
            : photos.length + " photo(s); largest declared " +
              (photos[0].width ? photos[0].width + "px" : "unknown width") +
              (dropped.length ? ", " + dropped.length + " icon(s)/banner(s) skipped" : ""),
    };
}

/** How much bigger the chosen URL is than what the gallery was showing. The number that says whether this tool
 *  did anything for you at all -- 1.0 means right-click would have been just as good. */
export function upliftOf(photo) {
    const shown = (photo && photo.displayed && photo.displayed.w) || 0;
    if (!shown || !photo.width) return null;
    return photo.width / shown;
}
