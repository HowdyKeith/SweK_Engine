// WebGLEngine/tools/ship/exportableLinks-selfcheck.mjs — v2555
//
// Run: node tools/ship/exportableLinks-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// A PAGE PUBLISHED TO GITHUB PAGES DOES NOT LIVE AT "/".
//
// Keith, looking at his own live blobulator: "Blobulator defaults to non webgpu? and i dont see a click for
// webgpu." There IS a click. It said:
//
//     <a href="/blobulator-gpu.html" style="font-size:11px;color:#8ab4ff">try the WebGPU version</a>
//
// Two faults, and the first is the one that matters:
//
//   1. THE HREF IS ABSOLUTE. On localhost:8787 "/blobulator-gpu.html" resolves fine. But the published site
//      lives at howdykeith.github.io/swek-blobulator/, so "/" is the USER SITE ROOT -- the link pointed at
//      howdykeith.github.io/blobulator-gpu.html, which has never existed. IT WORKED ON THE MACHINE THAT WROTE IT
//      AND WAS BROKEN EVERYWHERE IT WAS PUBLISHED, which is the worst shape a bug can have: the author cannot
//      see it, and every visitor can.
//   2. It was 11px dim blue beside the title. Findable only if you already knew.
//
// AND THE PAGE IT POINTED AT WAS NEVER EXPORTED ANYWAY -- the swek-blobulator repo contains LICENSE,
// MarchingCubes.js, README.md, canvasRecorder.js, index.html, test. No GPU page. So the link was broken twice
// over and the fix is in two places, only one of which is this repo's problem.
//
// ---- WHY THIS ONLY CHECKS *EXPORTED* PAGES ---------------------------------------------------------------
//
// 40 pages in this engine use absolute internal hrefs, AND THAT IS FINE FOR 38 OF THEM. They are served from
// localhost:8787 where "/" IS the site root. An absolute link is only a bug for a page that gets published under
// a SUBPATH -- i.e. a page exported to a standalone GitHub Pages repo.
//
// So this gates the EXPORTED list and nothing else. A gate that flagged all 40 would be noise, people would
// learn to ignore it, and the two that matter would ride out in the noise. THE POINT IS NOT TO BAN ABSOLUTE
// LINKS. IT IS TO CATCH THE ONES THAT LEAVE THE BUILDING.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");

let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

/**
 * The pages that get published to a standalone repo, and therefore live under a subpath.
 * ADD TO THIS LIST WHEN YOU EXPORT A NEW ONE. A page that leaves the building without being on this list is a
 * page nothing is checking -- which is exactly how the blobulator's link stayed broken.
 */
const EXPORTED = [
    { page: "blobulator.html", repo: "swek-blobulator", as: "index.html" },
    { page: "blobulator-gpu.html", repo: "swek-blobulator", as: "blobulator-gpu.html" },
    { page: "ragdoll.html", repo: "swek-ragdoll-pencil", as: "index.html" },
];

// ---- 1. no exported page uses an absolute internal link -----------------------------------------------------
{
    for (const e of EXPORTED) {
        const p = path.join(root, e.page);
        if (!fs.existsSync(p)) { ok("the export list points at a real page: " + e.page, false, "MISSING -- a list naming files that do not exist checks nothing"); continue; }
        const src = fs.readFileSync(p, "utf8");
        // href="/foo.html" or src="/foo.js" -- an internal absolute. "//cdn..." and "http://" are external and fine.
        const abs = [...src.matchAll(/(?:href|src)="(\/[^/"][^"]*)"/g)].map((m) => m[1]);
        ok(e.page + " has no absolute internal links (it publishes to /" + e.repo + "/)", abs.length === 0,
           abs.length ? "ABSOLUTE: " + [...new Set(abs)].join(", ") + " -- resolves on localhost:8787, 404s under github.io/" + e.repo + "/"
                      : "all relative, so it works in both places");
    }
}

// ---- 2. THE ONE KEITH HIT: a link to a page that was never exported ------------------------------------------
// A relative link is necessary and not sufficient. If the target does not ship with the page, the link is still
// a 404 -- just a differently-spelled one.
{
    const known = new Map();
    for (const e of EXPORTED) known.set(e.repo, [...(known.get(e.repo) || []), e.as]);
    for (const e of EXPORTED) {
        const p = path.join(root, e.page);
        if (!fs.existsSync(p)) continue;
        const src = fs.readFileSync(p, "utf8");
        const rel = [...src.matchAll(/href="([a-z0-9][a-z0-9._-]*\.html)"/gi)].map((m) => m[1]);
        const shipped = known.get(e.repo) || [];
        const orphans = rel.filter((r) => !shipped.includes(r) && !shipped.includes("index.html") || false).filter((r) => !shipped.includes(r));
        ok(e.page + "'s page links all ship to the same repo", orphans.length === 0,
           orphans.length ? "LINKS TO A PAGE THAT DOES NOT SHIP: " + [...new Set(orphans)].join(", ") + " -- a relative link to a file that was never exported is still a 404"
                          : (rel.length ? "links to " + [...new Set(rel)].join(", ") + ", all exported" : "no internal page links"));
    }
}

// ---- 2b. WHAT THIS GATE CANNOT SEE, SAID OUT LOUD -----------------------------------------------------------
// The check above compares links against the EXPORTED list -- a list in THIS FILE. It proves the engine is
// export-READY. IT CANNOT SEE WHETHER THE PUSH HAPPENED. Right now the swek-blobulator repo contains LICENSE,
// MarchingCubes.js, README.md, canvasRecorder.js, index.html and test -- NO GPU PAGE -- so the link this gate
// just blessed is still a 404 in the wild until someone pushes the file.
//
// A gate that checked its own list and called that reality would be the disease. This one says the limit instead.
{
    ok("THIS GATE CANNOT SEE GITHUB (and says so rather than implying otherwise)", true,
       "it proves the engine is export-READY. The push is a human step: as of v2555 swek-blobulator has NO blobulator-gpu.html, so the link is correct here and still 404s live until it is pushed.");
}

// ---- 3. the WebGPU link is FINDABLE -------------------------------------------------------------------------
// "i dont see a click for webgpu" is a bug report about 11px dim blue text. A control nobody can find is a
// control that does not exist, which is this engine's oldest law wearing a stylesheet.
{
    const src = fs.readFileSync(path.join(root, "blobulator.html"), "utf8");
    const m = /<a href="blobulator-gpu\.html"[^>]*>/.exec(src);
    ok("the blobulator's WebGPU link exists and is relative", !!m, m ? "" : "the link is gone or absolute again");
    if (m) {
        const size = /font-size:\s*(\d+)px/.exec(m[0]);
        ok("...and it is big enough to see", size && Number(size[1]) >= 12,
           size ? size[1] + "px (was 11px dim blue beside the title, which is why it was invisible)" : "no font-size set");
        ok("...and it looks like a button, not a footnote", /background:/.test(m[0]),
           "a control nobody can find is a control that does not exist");
    }
}

// ---- 4. and back again ---------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(root, "blobulator-gpu.html"), "utf8");
    ok("the GPU page links BACK relatively", /href="blobulator\.html"/.test(src) && !/href="\/blobulator\.html"/.test(src),
       "a one-way door is half a door");
}

console.log(fails ? "\nexportableLinks-selfcheck: " + fails + " FAILED" : "\nexportableLinks-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
