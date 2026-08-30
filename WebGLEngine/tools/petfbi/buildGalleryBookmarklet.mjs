// WebGLEngine/tools/petfbi/buildGalleryBookmarklet.mjs -- v4162
//
// Run: node tools/petfbi/buildGalleryBookmarklet.mjs --write
//
// GENERATES petfbi/galleryPull.bookmarklet.js FROM petfbi/gallerySources.mjs, so the logic an admin runs on a
// Nextdoor page and the logic the gate exercises ARE THE SAME BYTES.
//
// *** A BOOKMARKLET CANNOT IMPORT, WHICH IS WHY THIS EXISTS. *** It runs on somebody else's origin with no
// module loader and no network of its own, so its code has to be inline -- and the obvious way to get it there
// is to paste a copy of the algorithm into it. That copy is the defect this tree names more often than any
// other: A SECOND IMPLEMENTATION OF A MEASUREMENT. The two would agree on the day they were written and
// nowhere after. So the module is the source, this strips its `export` keywords, and the bookmarklet is
// OUTPUT rather than an artefact somebody maintains.
//
// The gate re-runs this and compares, so a hand-edit of the generated file is caught rather than inherited.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const SOURCE = path.join(ENG, "petfbi", "gallerySources.mjs");
export const OUT = path.join(ENG, "petfbi", "galleryPull.bookmarklet.js");

/** The in-page half: read the DOM into the plain objects gallerySources takes, then show what it found.
 *
 *  IT DOES NOT DOWNLOAD ANYTHING, AND THAT IS A BROWSER RULE RATHER THAN A CHOICE. `<a download>` is ignored
 *  cross-origin, so a link to a CDN image opens it instead of saving it -- every "one-click download" bookmarklet
 *  for a foreign site is either lying or re-fetching the image through a server. So the honest buttons are OPEN
 *  (the full-size file, in a tab, where Ctrl+S saves the big one) and COPY (the URLs, for PetFBI's existing
 *  pipeline, which already downloads by URL server-side). */
export const DRIVER = `
(function () {
  var els = [];
  document.querySelectorAll("img").forEach(function (im) {
    var sources = [];
    var pic = im.closest && im.closest("picture");
    if (pic) pic.querySelectorAll("source[srcset]").forEach(function (s) { sources.push(s.getAttribute("srcset")); });
    els.push({
      src: im.getAttribute("src") || "", currentSrc: im.currentSrc || "",
      srcset: im.getAttribute("srcset") || "", sources: sources,
      dataset: Object.assign({}, im.dataset),
      clientWidth: im.clientWidth, clientHeight: im.clientHeight
    });
  });
  var g = galleryFrom(els);
  var old = document.getElementById("__petfbi_pull"); if (old) old.remove();
  var box = document.createElement("div");
  box.id = "__petfbi_pull";
  box.style.cssText = "position:fixed;z-index:2147483647;right:12px;top:12px;width:340px;max-height:86vh;overflow:auto;background:#12161d;color:#dfe6f0;font:13px/1.45 system-ui,sans-serif;border:1px solid #2c3a4c;border-radius:8px;padding:10px;box-shadow:0 8px 28px rgba(0,0,0,.5)";
  var head = document.createElement("div");
  head.innerHTML = "<b>PetFBI &mdash; gallery pull</b><br><span style='color:#8e9bb0'>" + g.summary + "</span>";
  box.appendChild(head);
  var bar = document.createElement("div"); bar.style.margin = "8px 0";
  var mk = function (label, fn) {
    var b = document.createElement("button");
    b.textContent = label;
    b.style.cssText = "font:inherit;margin:0 6px 0 0;padding:4px 9px;background:#1d2735;color:#dfe6f0;border:1px solid #3a4d66;border-radius:5px;cursor:pointer";
    b.onclick = fn; return b;
  };
  var urls = g.photos.map(function (p) { return p.url; });
  bar.appendChild(mk("Copy " + urls.length + " URL(s)", function () {
    navigator.clipboard.writeText(urls.join("\\n")).then(function () { head.querySelector("span").textContent = "copied " + urls.length + " URL(s) -- paste into PetFBI"; });
  }));
  bar.appendChild(mk("Close", function () { box.remove(); }));
  box.appendChild(bar);
  g.photos.forEach(function (p, i) {
    var row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px;align-items:center;padding:6px 0;border-top:1px solid #223";
    var th = document.createElement("img");
    th.src = p.url; th.style.cssText = "width:64px;height:64px;object-fit:cover;border-radius:4px;background:#0b0f15";
    var up = (p.displayed && p.displayed.w && p.width) ? (p.width / p.displayed.w) : null;
    var meta = document.createElement("div"); meta.style.flex = "1";
    meta.innerHTML = "<b>" + (p.width ? p.width + "px" : "size not declared") + "</b>"
      + (up ? " <span style='color:#8fe0ae'>" + up.toFixed(1) + "x what the gallery showed</span>" : "")
      + "<br><span style='color:#8e9bb0;font-size:11px'>" + p.from + ", " + p.variants + " variant(s)</span>";
    var open = mk("Open", function () { window.open(p.url, "_blank", "noopener"); });
    row.appendChild(th); row.appendChild(meta); row.appendChild(open);
    box.appendChild(row);
  });
  if (g.dropped.length) {
    var d = document.createElement("div");
    d.style.cssText = "margin-top:8px;color:#8e9bb0;font-size:11px;border-top:1px solid #223;padding-top:6px";
    d.textContent = "skipped " + g.dropped.length + ": " + g.dropped.slice(0, 3).map(function (x) { return x.why; }).join("; ");
    box.appendChild(d);
  }
  document.body.appendChild(box);
})();
`;

/** Strip the module's export keywords -- nothing else is touched, so the algorithm is byte-for-byte the same. */
export function inlineModule(src) {
    return String(src).replace(/^export\s+(function|const|class)\s/gm, "$1 ");
}

export function build() {
    const mod = fs.readFileSync(SOURCE, "utf8");
    const banner = "// GENERATED by tools/petfbi/buildGalleryBookmarklet.mjs -- DO NOT EDIT.\n" +
                   "// The algorithm lives in petfbi/gallerySources.mjs; this file is its inlined copy, because a\n" +
                   "// bookmarklet cannot import. Edit the module and regenerate; the gate compares the two.\n";
    return banner + "(function(){\n\"use strict\";\n" + inlineModule(mod) + "\n" + DRIVER + "\n})();\n";
}

/** The `javascript:` one-liner an admin drags to their bookmarks bar. */
export function asHref(body) {
    return "javascript:" + encodeURIComponent(body).replace(/%20/g, " ");
}

if (process.argv[1] && process.argv[1].endsWith("buildGalleryBookmarklet.mjs")) {
    const out = build();
    if (process.argv.includes("--write")) {
        fs.writeFileSync(OUT, out);
        console.log("[gallery] wrote " + path.relative(ENG, OUT) + " (" + out.length + " chars, href " + asHref(out).length + ")");
    } else {
        console.log("[gallery] would write " + out.length + " chars (pass --write)");
    }
}
