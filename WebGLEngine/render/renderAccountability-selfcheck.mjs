// WebGLEngine/render/renderAccountability-selfcheck.mjs — v3339
//
// Run: node render/renderAccountability-selfcheck.mjs   (~0.1s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// FOUR THINGS THE PERCEPTUAL PATCH MADE POSSIBLE, and one that it made possible to REFUSE honestly.
//
//   1. Perceptual signals recorded beside pixelmatch on the 54 render-QA pages -- because the pixel count is the
//      reason amplifiedDiff had to exist.
//   2. A register of pages that owe a DEVICE VERDICT, with a state that rendering cannot reach.
//   3. An image-based consistency pair -- declared INCOMPLETE, because only one side exists.
//   4. "no baseline" stops meaning "nothing can be said".

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ssim, pHash, hamming, edgeOverlap, dims } from "./perceptual.mjs";
import { iou, scaleDelta } from "./silhouette.mjs";
import { compareRenders, imagePairStatus, IMAGE_ROUTES } from "../physics/imagePair.mjs";
import { OWES_VERDICT, audit, owedLines } from "../tools/render-qa/deviceOwed.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const W = 48, H = 48;
const mk = (f, shape = "wh") => { const d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 4; const v = f(x, y); d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255; }
    return shape === "wh" ? { data: d, w: W, h: H } : { data: d, width: W, height: H }; };
const boxA = mk((x, y) => (x > 12 && x < 36 && y > 12 && y < 36) ? 200 : 0);
const boxB = mk((x, y) => (x > 12 && x < 36 && y > 12 && y < 36) ? 200 : 0, "wid");
const offset = mk((x, y) => (x > 2 && x < 26 && y > 2 && y < 26) ? 200 : 0);

// ---- 1. TWO IMAGE SHAPES, ONE NORMALISER -------------------------------------------------------------------------
// backendVisualDiff produces {data, w, h}; render-qa and the PNG decoder produce {data, width, height}. Converting
// at each call site is where a w/width slip eventually passes the wrong dimension and silently reinterprets the
// buffer as a different picture.
{
    ok("!! the same buffer described as {w,h} or {width,height} compares as IDENTICAL",
       ssim(boxA, boxB) === 1 && hamming(pHash(boxA), pHash(boxB)) === 0 && iou(boxA, boxB).iou === 1,
       "SSIM exactly 1, pHash 0 bits, IoU exactly 1 — normalised once in dims(), not at every call site");
    ok("...and dims() reports the same numbers for both spellings",
       dims(boxA).w === dims(boxB).w && dims(boxA).h === dims(boxB).h, dims(boxA).w + "x" + dims(boxA).h);
}

// ---- 2. THE 54 PAGES: PERCEPTUAL RECORDED, DELIBERATELY NOT GATING ---------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    ok("!! render-qa records SSIM, pHash, edge overlap and the silhouette gates beside pixelmatch",
       /perceptual\.mjs/.test(code) && /silhouette\.mjs/.test(code) && /phashBits/.test(code) && /silhouetteIoU/.test(code));
    ok("!! ...and they are RECORDED, NOT GATING, because no browser-screenshot floor has been measured",
       /gating:\s*false/.test(code) && /no measured floor for browser screenshots/.test(src),
       "the headless floor is exactly zero because Jolt is deterministic; a browser is not, and gating on an " +
       "unmeasured number is the failure this whole line of work exists to avoid");
    ok("!! the pixel count is preserved rather than replaced",
       /changedFrac/.test(code) && /DIFF_THRESHOLD/.test(code),
       "pixelmatch still gates; the perceptual signals sit beside it until they earn a threshold of their own");
}

// ---- 3. THE MIDDLE STATE: RENDERED IS NOT VERIFIED ---------------------------------------------------------------------
// v3339 called audit({}) here with no dir override, which walked the REAL ai-bridge/fleet directory -- a directory
// nothing has ever written to (deviceOwed's default was pointed there by mistake; the real writer is
// ai-bridge/androidPeerBridge.js's /android/submit, which drops reports in tools/roundhouse). That made "received
// kinds: NONE" true by ACCIDENT, not by the mechanism working, and it would have silently started asserting a
// false negative the moment any real tools/roundhouse submission landed. Sandboxed dirs below test the mechanism
// on purpose, the same discipline androidPeerBridge-selfcheck.mjs already uses via configure().
{
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "deviceOwed-empty-"));
    const a = audit({ dir: emptyDir });
    ok("!! the pages that owe a DEVICE VERDICT are named, and rendering cannot settle them",
       a.owed.length === 4 && a.owed.every((r) => r.kind && r.state === "VERDICT-OWED"),
       a.owed.map((r) => r.page).join(", ") + " — each names the submission kind that settles it, so 'has this been done' is answered by looking rather than remembering");
    ok("!! ...and floor-atlas is listed as a READER that owes nothing, rather than omitted",
       a.rows.find((r) => r.page === "floor-atlas.html").state === "READER",
       "a register that silently omitted the exception would be indistinguishable from one that forgot it");
    ok("!! every named page actually exists on disk",
       a.rows.every((r) => r.exists), a.rows.filter((r) => !r.exists).map((r) => r.page).join(", ") || "5 of 5");
    ok("no verdict of any kind has been received yet, and the register says so plainly",
       a.receivedKinds.length === 0 && owedLines(a).some((l) => /NONE/.test(l)),
       "received kinds: NONE — which is the true state of an empty directory, and reads differently from an empty list with no comment");
    // and the trap that makes this necessary
    ok("!! none of these pages is in the render-qa manifest, which is WHY the middle state was needed",
       (() => { const m = JSON.parse(fs.readFileSync(path.join(ENG, "tools", "render-qa", "manifest.json"), "utf8"));
                const s = JSON.stringify(m); return Object.keys(OWES_VERDICT).every((p) => !s.includes(p.replace(".html", ""))); })(),
       "adding them to the manifest would show 'never run' then 'pass' after a rig run -- but render-QA proves the " +
       "page RENDERED, not that the kernel was VERIFIED, and a green pass meaning the wrong thing is worse than silence");
    fs.rmSync(emptyDir, { recursive: true, force: true });

    // *** THE MECHANISM ITSELF: a report actually lands where the bridge writes it, and the register notices. ***
    const filledDir = fs.mkdtempSync(path.join(os.tmpdir(), "deviceOwed-filled-"));
    fs.writeFileSync(path.join(filledDir, "magmap-bench.json"), JSON.stringify({ kind: "swek-magmap-bench" }));
    const b = audit({ dir: filledDir });
    ok("!! a report dropped in the SAME shape androidPeerBridge writes it flips the page's state to VERDICT-IN",
       b.rows.find((r) => r.page === "magmap-bench.html").state === "VERDICT-IN" &&
       b.owed.length === 3 && !b.owed.some((r) => r.page === "magmap-bench.html"),
       "the other three pages still owe their own kinds; only the one with a matching report on disk clears — " +
       "proving receivedKinds() actually reads the directory the bridge writes to, not a directory nothing does");
    fs.rmSync(filledDir, { recursive: true, force: true });

    // *** THE DEFAULT ITSELF, NOT JUST AN OVERRIDE. *** Every check above passes an explicit dir, which proves the
    // reading logic works but says nothing about where receivedKinds() looks when nobody overrides it -- and that
    // default is exactly where the v3339 bug lived (pointed at ai-bridge/fleet, which nothing has ever written to).
    // This drops a marker directly where audit({}) with NO dir looks by default, so a regression of the default
    // itself -- not just the mechanism -- fails here. Cleaned up in finally so a crash mid-test cannot leave a
    // stray file for the next run of this gate, or for floorAtlas/deviceOwed, to trip over.
    const REAL_ROUNDHOUSE = path.join(ENG, "tools", "roundhouse");
    const marker = path.join(REAL_ROUNDHOUSE, ".renderAccountability-selfcheck-marker.json");
    try {
        fs.writeFileSync(marker, JSON.stringify({ kind: "swek-ising-bench" }));
        const c = audit({});
        ok("!! audit({}) with NO dir override reads the REAL default directory the bridge actually writes to",
           c.rows.find((r) => r.page === "ising-bench.html").state === "VERDICT-IN",
           "a marker dropped in tools/roundhouse (the real CFG.roundhouseDir) was picked up with no dir argument at all -- " +
           "the v3339 default (ai-bridge/fleet) would have missed this and reported VERDICT-OWED regardless");
    } finally {
        try { fs.rmSync(marker, { force: true }); } catch {}
    }
}

// ---- 4. THE IMAGE PAIR, DECLARED INCOMPLETE ----------------------------------------------------------------------------
{
    const st = imagePairStatus();
    ok("!! the image-based pair is declared INCOMPLETE, because only one side exists",
       !st.complete && st.sides === 1,
       st.why + " — the board's admission rule does not bend for a pair that would be convenient");
    // the comparison itself works and refuses to conclude without limits
    const ungated = compareRenders(boxA, boxB);
    ok("!! comparing two renders with NO hard limits returns UNGATED and concludes nothing",
       ungated.verdict === "UNGATED" && ungated.soft.ssim === 1,
       "soft signals reported (SSIM " + ungated.soft.ssim + ", structure " + ungated.soft.structure + ") and no verdict drawn — " +
       "an ensemble without a veto always has an answer, which is the failure the hard/soft split prevents");
    // I CLAIMED THIS SHOWED THE OVERRIDE AND IT DOES NOT. A displaced box collapses the SOFT signals too --
    // softScore 0.201 -- so both halves agree it is wrong and there is no tension to demonstrate. The override
    // only matters when the soft signals stay HIGH while the shape fails, and that case is exercised with
    // explicit soft values in render/perceptual-selfcheck.mjs (0.960 average, REJECT). Asserting it here would
    // have been a check that passes for a reason other than the one it names.
    const gated = compareRenders(boxA, offset, { hard: { iou: 0.9, scaleDelta: 0.05 } });
    ok("!! with limits supplied a displaced render is REJECTED — and the soft signals happen to agree here",
       gated.verdict === "REJECT" && gated.softScore < 0.5,
       "softScore " + gated.softScore.toFixed(3) + " with IoU " + gated.shape.silhouetteIoU.toFixed(4) +
       " — NOT a demonstration of the hard-gate override, because nothing is being overridden. The case where a " +
       "0.960 soft average is vetoed lives in perceptual-selfcheck, where the soft values are supplied directly");
}

// ---- 5. "NO BASELINE" STOPS MEANING "NOTHING CAN BE SAID" ------------------------------------------------------------------
{
    const src = fs.readFileSync(path.join(ENG, "tools", "render-qa", "render-qa.mjs"), "utf8");
    ok("!! a page with no baseline now records its structural fingerprint",
       /state: "no-baseline", phash:/.test(src),
       "two runs that disagree on the fingerprint are non-deterministic BEFORE anyone freezes a baseline from one " +
       "of them — and writing a baseline is the one operation in that harness that cannot be undone by running it again");
    // the fingerprint is stable for identical content and different for different content
    ok("...and the fingerprint is stable for the same picture and different for a different one",
       pHash(boxA) === pHash(boxB) && pHash(boxA) !== pHash(offset));
}

console.log(fails ? ("[renderAccountability-selfcheck] FAILED " + fails) : "[renderAccountability-selfcheck] all passed");
process.exit(fails ? 1 : 0);
