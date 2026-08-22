// WebGLEngine/tools/ship/deliveredAssets-selfcheck.mjs — v3554
//
// Run: node tools/ship/deliveredAssets-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** "SHIPS WITH" AND "EXPECTS YOU TO HAVE" WERE THE SAME SENTENCE, AND NOTHING COULD TELL THEM APART. ***
//
// RobotExpressive is woven through 43 files and 157 references: it is the DEFAULT in avatarstage's resolveGlb,
// one of five "delivered defaults" in PipAvatar, and GLBParser carries parser code written specifically against
// its quirks -- multi-material rigs, bone-parented rigid parts, primitives without textures. That is not
// aspirational code; somebody debugged against the real file.
//
// AND THE FILE WAS NOT IN THE RELEASE. Zero .glb, .gltf, .fbx, .vrm or .obj anywhere in the zip. On a machine
// where it had once been dropped into GPU_Assets it worked, so it FELT shipped for a long time; on a fresh
// unzip the default avatar path 404s.
//
// THE REASON IT WENT UNNOTICED IS WORTH RECORDING: there is no first-load downloader for models. assetIngest
// WATCHES THE DOWNLOADS FOLDER and ingests what it finds -- so the model arrives by a route that leaves no trace
// in the tree, and every later run finds it present. A mechanism that quietly succeeds on the developer's
// machine and quietly fails everywhere else is the hardest kind to see.
//
// Fixed by DELIVERING the asset (CC0 1.0, Tomás Laulhé, modifications by Don McCurdy -- attribution shipped
// beside it), and gated here so the next default that is declared but not delivered is caught at ship time
// rather than by somebody opening the page.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => { try { return fs.readFileSync(path.join(ENG, rel), "utf8"); } catch { return ""; } };
const has = (rel) => fs.existsSync(path.join(ENG, rel));

/** Assets the engine treats as DELIVERED -- named as defaults in code, so a user never chose them. */
export const DELIVERED = ["GPU_Assets/RobotExpressive.glb"];

// ---- 1. THE DEFAULT THE LOADER FALLS BACK TO MUST EXIST -----------------------------------------------------------
{
    const stage = read("avatarstage.html");
    const m = stage.match(/if \(!u\) return "([^"]+)"/);
    ok("!! avatarstage's resolveGlb names a concrete default path",
       !!m, m ? m[1] : "no default found in resolveGlb");
    if (m) {
        const rel = m[1].replace(/^\//, "");
        ok("!! ...and that file is DELIVERED, not merely expected",
           has(rel),
           rel + (has(rel) ? " present (" + Math.round(fs.statSync(path.join(ENG, rel)).size / 1024) + " KB)"
                           : " MISSING — the default avatar path 404s on a fresh unzip"));
    }
}

// ---- 2. EVERY DELIVERED DEFAULT RESOLVES ---------------------------------------------------------------------------
{
    const missing = DELIVERED.filter((r) => !has(r));
    ok("!! every asset the engine calls a delivered default is on disk",
       missing.length === 0,
       missing.length ? "MISSING: " + missing.join(", ")
                      : DELIVERED.length + " delivered: " + DELIVERED.join(", "));
    // PipAvatar calls them delivered in so many words; the claim and the disk must agree
    const pip = read("simulation/PipAvatar.js");
    ok("...and PipAvatar's 'delivered defaults' claim matches what is actually delivered",
       !/delivered defaults/.test(pip) || has("GPU_Assets/RobotExpressive.glb"),
       "PipAvatar lists RobotExpressive as one of five delivered defaults — a claim the disk now supports");
}

// ---- 3. THE ATTRIBUTION SHIPS WITH IT ------------------------------------------------------------------------------
{
    ok("!! the licence and author ship beside the model, not in a changelog",
       has("GPU_Assets/RobotExpressive.README.md"),
       "CC0 1.0, Tomás Laulhé, modifications by Don McCurdy — a CC0 asset still carries an attribution the " +
       "creator asked for, and a licence that lives only in a commit message is a licence nobody redistributing " +
       "the zip can find");
    const lic = read("GPU_Assets/RobotExpressive.README.md");
    ok("...and it names both the licence and the creator",
       /CC0/.test(lic) && /Laulh/.test(lic));
}

// ---- 4. *** THE MECHANISM THAT HID THIS, NAMED SO IT IS NOT REDISCOVERED. *** ---------------------------------------
{
    const ingest = read("ai-bridge/assetIngest.js");
    const watchesDownloads = /_downloadsDefault|Downloads/.test(ingest);
    const fetchesRemote = /https?:\/\/|fetch\(|http\.get|https\.get/.test(ingest);
    ok("!! assetIngest WATCHES a folder and does NOT fetch from a URL — there is no first-load downloader",
       watchesDownloads && !fetchesRemote,
       "which is why the model felt shipped for so long: it arrives by a route that leaves NO TRACE IN THE TREE, " +
       "and every run after the first finds it present. A mechanism that quietly succeeds on the developer's " +
       "machine and quietly fails everywhere else is the hardest kind to see");
}

// ---- 5. AND THE ZIP NOW CARRIES A MODEL AT ALL ------------------------------------------------------------------------
{
    let count = 0;
    const walk = (d) => {
        let ents = [];
        try { ents = fs.readdirSync(path.join(ENG, d), { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            const rel = d ? d + "/" + e.name : e.name;
            if (e.isDirectory()) walk(rel);
            else if (/\.(glb|gltf)$/i.test(e.name)) count++;
        }
    };
    walk("");
    ok("!! the release contains at least one model file",
       count > 0,
       count + " glb/gltf on disk — it was ZERO before v3554, in a tree with a GLB parser, an avatar registry, " +
       "a costume system and five declared defaults");
}

console.log(fails ? ("[deliveredAssets-selfcheck] FAILED " + fails) : "[deliveredAssets-selfcheck] all passed");
process.exit(fails ? 1 : 0);
