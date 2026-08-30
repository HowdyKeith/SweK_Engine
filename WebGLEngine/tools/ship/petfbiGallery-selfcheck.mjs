// WebGLEngine/tools/ship/petfbiGallery-selfcheck.mjs -- v4162
//
// Run: node tools/ship/petfbiGallery-selfcheck.mjs   (fast -- pure functions and one file comparison)
//
// GATES petfbi/gallerySources.mjs and the bookmarklet generated from it.
//
// *** THE STAKES DECIDE THE TOLERANCES HERE, AND THEY ARE NOT SYMMETRIC. *** This tool exists so an admin
// reposting a lost pet gets the 2048px photo instead of the 400px one a gallery hands to right-click-save. Two
// ways to be wrong:
//   SHOWING ONE PHOTO TWICE -- the admin scrolls past a duplicate. Costs seconds.
//   MERGING TWO PHOTOS INTO ONE -- a photograph of somebody's missing dog is never seen again.
// So every ambiguous case resolves toward NOT merging, and the check that guards it is the one marked as
// load-bearing below. A regex that tidied `_2024` out of a filename would read as an improvement and would
// quietly eat the second of two camera photos.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSrcset, identityKey, variantsFromImg, isLikelyChrome, galleryFrom,
         mergeByDeclaredWidth, upliftOf, MIN_AREA, MAX_ASPECT, SIZE_PARAMS } from "../../petfbi/gallerySources.mjs";
import { build, inlineModule, asHref, SOURCE, OUT, DRIVER } from "../petfbi/buildGalleryBookmarklet.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const report = (m) => console.log("  ....  " + m);
console.log("petfbiGallery-selfcheck -- the full-size photo the page already declared\n");

// ---- 1. srcset, and the comma that is not a separator ------------------------------------------------------
console.log("1. reading what the page declared");
{
    const basic = parseSrcset("a.jpg 400w, b.jpg 1024w, c.jpg 2048w");
    ok("!! a plain srcset parses to its candidates and widths",
        basic.length === 3 && basic[2].url === "c.jpg" && basic[2].w === 2048, JSON.stringify(basic.map((x) => x.w)));
    // *** THE TRAP: A URL MAY CONTAIN A COMMA. *** Several CDNs put transform lists in the path and data: URIs
    // always do. srcset.split(",") tears one URL into two broken ones, and the broken halves then look like
    // extra photos -- so the failure is not "a missing image", it is "phantom images", which reads as success.
    const commas = parseSrcset("https://cdn/t/w_400,c_fill/dog.jpg 400w, https://cdn/t/w_2048,c_fill/dog.jpg 2048w");
    ok("!! *** a comma INSIDE a URL does not split it ***",
        commas.length === 2 && commas[1].url === "https://cdn/t/w_2048,c_fill/dog.jpg" && commas[1].w === 2048,
        commas.map((c) => c.url).join(" | "));
    ok("...pixel-density descriptors are read too", parseSrcset("a.jpg, b.jpg 2x")[1].d === 2);
    ok("...and a bare srcset with no descriptor still yields the URL", parseSrcset("only.jpg")[0].url === "only.jpg");
    ok("!! lazy attributes are read, which is the whole reason a gallery is hard",
        variantsFromImg({ dataset: { src: "https://cdn/big.jpg" }, src: "" }).some((v) => v.url === "https://cdn/big.jpg"),
        "an image below the fold has not swapped data-src into src yet");
    ok("...data: URIs and SVGs are never candidates",
        variantsFromImg({ src: "data:image/png;base64,AAA", srcset: "icon.svg 20w" }).length === 0,
        "a base64 placeholder and a vector icon are not somebody's pet");
    ok("...a <picture>'s <source srcset> counts as a declaration",
        variantsFromImg({ sources: ["big.jpg 1600w"], src: "small.jpg" }).some((v) => v.w === 1600));
}

// ---- 2. THE LOAD-BEARING ONE: what may be merged, and what may not -----------------------------------------
console.log("\n2. one photo at two sizes, versus two photos");
{
    ok("!! identityKey strips UNAMBIGUOUS size tokens",
        identityKey("https://cdn/p/abc_800x600.jpg?w=800&fit=crop&sig=z") === identityKey("https://cdn/p/abc_1600x1200.jpg?w=1600&sig=z"),
        "800x600 / 1600x1200 and the w= parameter are sizes by their shape alone");
    ok("!! ...and REFUSES to strip a bare trailing number",
        identityKey("https://cdn/p/IMG_2024.jpg") !== identityKey("https://cdn/p/IMG_2025.jpg"),
        "2024 is a plausible width AND a plausible camera index -- the shape cannot tell them apart");
    ok("...@2x is a density token, not an image", identityKey("logo@2x.png") === identityKey("logo.png"));
    ok("...size query parameters are dropped and the rest is kept and ordered",
        identityKey("u?sig=b&w=9&h=9&id=a") === identityKey("u?id=a&sig=b"), "a signature is identity, a width is not");

    const one = galleryFrom([{ srcset: "https://cdn/p/abc_400.jpg 400w, https://cdn/p/abc_2048.jpg 2048w", clientWidth: 320, clientHeight: 240 }]);
    ok("!! *** abc_400 and abc_2048 ARE one photo, because the page declared those numbers as the widths ***",
        one.photos.length === 1 && one.photos[0].width === 2048 && one.photos[0].variants === 2,
        one.photos[0].url);
    const two = galleryFrom([
        { srcset: "https://cdn/p/IMG_2024.jpg 1200w", clientWidth: 300, clientHeight: 300 },
        { srcset: "https://cdn/p/IMG_2025.jpg 1200w", clientWidth: 300, clientHeight: 300 }]);
    // *** THE CHECK THIS WHOLE FILE IS BUILT AROUND. ***
    ok("!! *** IMG_2024 and IMG_2025 STAY TWO PHOTOS -- 1200w is declared, 2024 is not ***",
        two.photos.length === 2,
        "merging these loses a photograph of somebody's missing dog, and it would look like tidier output");
    const none = galleryFrom([
        { src: "https://cdn/p/xyz_400.jpg", clientWidth: 300, clientHeight: 300 },
        { src: "https://cdn/p/xyz_2048.jpg", clientWidth: 300, clientHeight: 300 }]);
    ok("!! with NO declared width, nothing merges at all",
        none.photos.length === 2,
        "a duplicate costs the admin seconds; a swallowed photo costs the dog -- so no evidence means no merge");
    ok("...and a merged photo says how many variants it absorbed",
        one.photos[0].variants === 2 && Array.isArray(one.photos[0].mergedKeys),
        "an admin seeing 6 photos where there should be 7 can find which group swallowed one");
}

// ---- 3. furniture is not a pet -----------------------------------------------------------------------------
console.log("\n3. telling a photograph from page furniture");
{
    ok("!! an avatar-sized image is dropped", isLikelyChrome({ clientWidth: 32, clientHeight: 32 }), "under " + MIN_AREA + "px^2");
    ok("!! a banner is dropped", isLikelyChrome({ clientWidth: 1200, clientHeight: 90 }), "aspect over " + MAX_ASPECT);
    ok("...a normal photo is kept", !isLikelyChrome({ clientWidth: 400, clientHeight: 300 }));
    ok("!! ...and an image with NO measured box is KEPT, not dropped",
        !isLikelyChrome({ clientWidth: 0, clientHeight: 0 }),
        "a lazy image that has never been laid out has width 0 -- dropping those would discard exactly the " +
        "off-screen gallery items this tool exists to reach");
    const g = galleryFrom([
        { srcset: "https://cdn/p/dog_1600.jpg 1600w", clientWidth: 400, clientHeight: 300 },
        { src: "https://cdn/avatar/u9.jpg", clientWidth: 32, clientHeight: 32 }]);
    ok("...and the drop is REPORTED with its reason, not silent",
        g.photos.length === 1 && g.dropped.length === 1 && /avatar or icon/.test(g.dropped[0].why), g.dropped[0].why);
    ok("!! the uplift over right-click-save is stated as a number",
        Math.abs(upliftOf(g.photos[0]) - 4) < 1e-9,
        "1600px declared against 400px displayed = 4x. IF THIS EVER READS 1.0 THE TOOL DID NOTHING and the " +
        "admin should know rather than assume");
    ok("...an empty page says so instead of returning a confusing zero", galleryFrom([]).photos.length === 0 &&
        /no photographs found/.test(galleryFrom([]).summary));
}

// ---- 4. ONE IMPLEMENTATION, NOT TWO --------------------------------------------------------------------------
console.log("\n4. the bookmarklet is generated, not maintained");
{
    const onDisk = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : "";
    ok("!! the generated bookmarklet exists", onDisk.length > 0, path.relative(ENG, OUT));
    // *** REGENERATE AND COMPARE. *** A hand-edit of the generated file is the exact way the two copies start
    // to disagree, and it is invisible until an admin gets a wrong answer on a real post.
    ok("!! *** regenerating produces the SAME BYTES -- nobody hand-edited the copy ***", build() === onDisk,
        onDisk.length ? "identical (" + onDisk.length + " chars)" : "MISSING -- run tools/petfbi/buildGalleryBookmarklet.mjs --write");
    const mod = fs.readFileSync(SOURCE, "utf8");
    ok("!! and the copy is the module VERBATIM, not a paraphrase of it",
        onDisk.includes(inlineModule(mod)),
        "A SECOND IMPLEMENTATION OF A MEASUREMENT is the defect this tree names most; the only edit is the " +
        "export keyword, which a bookmarklet has no loader for");
    ok("...the href form is a real javascript: URL", asHref("x=1").startsWith("javascript:"));
    ok("...and it fits in a bookmark", asHref(onDisk).length < 65536, asHref(onDisk).length + " chars");
}

// ---- 5. WHAT IT DOES NOT CLAIM -------------------------------------------------------------------------------
console.log("\n5. the boundary, asserted rather than promised");
{
    const src = fs.readFileSync(SOURCE, "utf8") + DRIVER;
    ok("!! nothing here fetches, logs in, or crawls",
        !/\bfetch\s*\(|XMLHttpRequest|axios|puppeteer|playwright/.test(src),
        "the admin is already looking at the photo -- their browser has it. Reading a login-walled feed with a " +
        "headless browser risks the account, and an admin's account IS their reach");
    ok("!! it never pretends to download cross-origin",
        !/download\s*=|\.download\b/.test(DRIVER) && /window\.open/.test(DRIVER),
        "<a download> is IGNORED cross-origin, so a one-click-save button would silently open the file " +
        "instead. The buttons are Open (full size, where Ctrl+S saves the big one) and Copy (URLs, for the " +
        "pipeline that already downloads by URL server-side)");
    ok("!! it reads only the page the admin already opened",
        !/location\s*=|location\.href\s*=|window\.location/.test(DRIVER),
        "no navigation, so it cannot walk a feed");
    ok("...and it is removable -- it cleans up its own panel before drawing another",
        /getElementById\("__petfbi_pull"\)/.test(DRIVER) && /old\.remove\(\)/.test(DRIVER));
    report("PetFBI's README already draws this line at the other end: \"browser-bot posting violates Facebook's " +
           "ToS -- so we only ever ASSIST the human.\" Reading Nextdoor is the same trade with the same answer.");
}

console.log("\n" + (fails ? "FAIL -- " + fails + " check(s)" : "ALL GREEN") +
            "\nunchecked here: whether Nextdoor's markup declares srcset at all. THAT IS DELIBERATE -- no fixture " +
            "on this box can answer it, and a per-site rule guessed from the outside is what rots. The uplift " +
            "number on the panel is how an admin sees the answer on a real post, in one look.");
process.exit(fails ? 1 : 0);
