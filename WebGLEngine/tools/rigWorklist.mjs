// WebGLEngine/tools/rigWorklist.mjs — v2638
//
// The open claims are not stalled -- they are FALSIFIABLE ONLY ON HARDWARE the sandbox does not have: Galaxina's
// GPU, the arm64 Mac, three machines for the math probe, or a browser. Left as a flat list of 27 they look stuck.
// This turns them into a per-machine checklist: for each open claim, WHICH machine settles it and WHAT to run, so a
// batch can be knocked down in one sitting. It reads predictions.html live, so the worklist never drifts from the
// claims. It NEVER marks anything settled -- only the rig does that; this just says where to point the rig.
//
// Usage:  node tools/rigWorklist.mjs            (prints the worklist)
//         node tools/rigWorklist.mjs --md OUT   (also writes a markdown checklist)
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractClaims } from "./ship/claimsGate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Buckets in priority order: the FIRST whose pattern matches the claim's kill/where/measured text wins, so every
// open claim lands in exactly one. The last bucket matches anything, so nothing is ever unclassified.
export const BUCKETS = [
    { id: "galaxina-gpu", machine: "Galaxina (GTX 1070/1080)", pat: /gpu|brain-?bench|flow field|1070|1080|on the card|policy mlp|dijkstra|marked against a wall/i,
      how: "open /brain-bench.html (or the brain panel on /server.html) and read the GPU-vs-CPU verdict" },
    { id: "arm64-mac", machine: "the arm64 Mac (mother's M-series)", pat: /arm64|cross-?arch|fingerprint|across architectures|bit-for-bit across|m-series|apple silicon/i,
      how: "run the box3d fingerprint / SPH cross-arch check on the Mac and diff its hash against Galaxina" },
    { id: "three-machine", machine: "all three machines", pat: /three machines|3 machines|which function|per-platform|math probe|mathprobe|it is not the platform/i,
      how: "run node tools/mathProbe.mjs on Galaxina, Stellar Atlas and the Mac, then diff the outputs" },
    { id: "box3d-threads", machine: "Galaxina (box3d, real WASM)", pat: /thread count|thread-count|substep|determinism is thread|box3d is deterministic|lockstep.*diverge/i,
      how: "run the box3d cross-thread determinism harness in the browser (box3d.wasm does not load headless)" },
    { id: "browser-load", machine: "any browser (Galaxina)", pat: /keith loads|\.html|renders|canvas|front door|draw|the page|open .*and/i,
      how: "load the named page in the browser and confirm it draws and matches the gate's numbers" },
    { id: "rig-other", machine: "the rig", pat: /.*/,
      how: "reproduce the kill condition on the rig" },
];

export function buildWorklist(html) {
    const claims = extractClaims(html);
    const open = claims.filter((c) => c.state === "open");
    const byBucket = new Map(BUCKETS.map((b) => [b.id, []]));
    const unclassified = [];
    for (const c of open) {
        const hay = ((c.kill || "") + " " + (c.where || "") + " " + (c.measured || "") + " " + (c.name || "")).toLowerCase();
        const b = BUCKETS.find((bk) => bk.pat.test(hay));   // last bucket matches all -> normally always found
        if (b) byBucket.get(b.id).push(c);
        else unclassified.push(c);                          // never in production; caught by the gate if it happens
    }
    return { total: claims.length, open: open.length, byBucket, unclassified };
}

function render(html) {
    const { open, byBucket } = buildWorklist(html);
    const lines = ["# Rig worklist -- " + open + " open claims, by the machine that settles them", ""];
    lines.push("These are not stalled; each is falsifiable only on hardware the sandbox lacks. Run these and report back.", "");
    for (const b of BUCKETS) {
        const list = byBucket.get(b.id);
        if (!list.length) continue;
        lines.push("## " + b.machine + " (" + list.length + ")", "", "_How: " + b.how + "._", "");
        for (const c of list) lines.push("- [ ] **" + (c.name || "?") + "** [" + (c.since || "") + "]  -- settles when: " + (c.kill || "").replace(/\s+/g, " ").slice(0, 160));
        lines.push("");
    }
    return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const html = fs.readFileSync(path.join(ROOT, "predictions.html"), "utf8");
    const md = render(html);
    const mdArg = process.argv.indexOf("--md");
    if (mdArg >= 0 && process.argv[mdArg + 1]) { fs.writeFileSync(process.argv[mdArg + 1], md); console.log("wrote " + process.argv[mdArg + 1]); }
    const { open, byBucket } = buildWorklist(html);
    console.log(open + " open claims across " + [...byBucket.values()].filter((l) => l.length).length + " machines:");
    for (const b of BUCKETS) { const n = byBucket.get(b.id).length; if (n) console.log("  " + n + "  " + b.machine); }
}
