// WebGLEngine/tools/ship/fsrPageDevice-selfcheck.mjs -- v4641
//
// Run: node tools/ship/fsrPageDevice-selfcheck.mjs
//
// *** fsr.html LOADED AS A PAGE, IN A BROWSER, ON A REAL ADAPTER -- THE ONLY ROW IN THE TREE THAT DOES. ***
//
// tools/ship/fsrPage-selfcheck.mjs drives the page's own script under a DOM stub with navigator.gpu absent,
// so every row it has is the CPU branch, and its closing note listed the adapter path as unchecked. That was
// tolerable while the page's GPU branch was somebody else's kernel and stopped being tolerable at v4641, when
// the DOLLY got one: render/temporalRejectGPU-selfcheck.mjs grades the CLASS and nothing graded the page's
// USE of it -- whether it constructs the runner, whether it passes counted: true, whether the picture it
// shows came from the chain or from the CPU standing in silently.
//
// THIS IS ITS OWN FILE FOR A MEASURED REASON. The rows below were section 5 of fsrPage-selfcheck and put it at
// 4,744 / 4,735 / 4,795 ms against the quick sweep's 3,000 ms MEMBERSHIP THRESHOLD, so keeping them there
// would have dropped the page's only gate out of every ship -- "over budget means skipped means never
// re-timed", which is the failure this tree has counted twice (v4460's 22 invisible reds, v4535's seventeen
// rounds shipped over a red gate nothing ran). Split, both files are under the threshold and both run every
// ship. That is a cheaper answer than making either claim smaller. MEASURED, three serial runs each on an
// idle box: this file 2,749 / 2,818 / 2,755 ms and fsrPage-selfcheck 2,230 / 2,201 / 2,191 ms. This one sits
// about 200 ms under the threshold, which is a STRADDLER by this tree's own standard (ROTATION_BOUNDARY's
// readings put the box's own run-to-run spread near that), so a sweep on a loaded box may well evict it --
// and the honest thing is to say so here rather than to let a future round discover the eviction and call it
// drift. Most of the cost is one Chromium launch; there is no version of this claim that avoids paying it.
//
// The page's two readouts end with "counted on the device" or "counted on the CPU" BECAUSE OF THIS GATE:
// both engines produce the same integers -- that is the whole point of the parity gates -- so the counts
// alone cannot say which one ran, and a page that silently fell back would have looked identical here. The
// CPU half of that claim is fsrPage-selfcheck's; this is the device half. Neither is worth anything alone.
//
// SABOTAGES: see the log at the foot of this file.
"use strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
const ok = (l, c, n = "") => { if (!c) fails++; console.log(`  ${c ? "PASS" : "FAIL"}  ${l}${n ? "   " + n : ""}`); };
const say = (l) => console.log(`  ----  ${l}`);

console.log("fsrPageDevice-selfcheck -- fsr.html on a real adapter, loaded as a page and asked what it is showing\n");

// Sections 1-3 drive the page's script under a DOM stub with navigator.gpu absent, so every row above is the
// CPU branch. That was tolerable while the page's GPU branch was somebody else's kernel; it stopped being
// tolerable the moment the DOLLY got one, because render/temporalRejectGPU-selfcheck.mjs grades the CLASS and
// nothing graded the PAGE'S USE of it -- whether it constructs the runner, whether it passes counted: true,
// whether the picture it shows came from the chain or from the CPU fallback standing in silently.
//
// So the page is loaded for real, in an iframe, on a real adapter, and asked what it is showing. Same origin,
// so the whole DOM is readable; the harness serves the tree, so the page's own imports resolve as they do in a
// browser. This is the only row in the tree that runs fsr.html as a page rather than as a source file.
//
// The readouts carry "counted on the device" / "counted on the CPU" BECAUSE OF THIS ROW: both engines produce
// the same integers -- that is the whole point of the parity gates -- so the counts alone cannot say which one
// ran, and a page that silently fell back to the CPU would have looked identical here.
{
    const skip = webgpuSkipReason();
    if (skip) { console.log(`  SKIP  ${skip}`); say("*** NOT A PASS. *** The adapter path has not run."); fails++; }
    else {
        const r = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 180000, script: `async () => {
            const ifr = document.createElement("iframe");
            ifr.style.width = "1200px"; ifr.style.height = "900px"; ifr.src = "/fsr.html";
            document.body.appendChild(ifr);
            await new Promise((res) => { ifr.onload = res; });
            const d = ifr.contentDocument, w = ifr.contentWindow;
            const $ = (id) => d.getElementById(id);
            const until = async (fn, ms) => { const t0 = Date.now();
                while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch {} await new Promise((res) => setTimeout(res, 100)); }
                return false; };
            const frameNo = () => { const m = /frame (\\d+)/.exec(($("metric") || {}).textContent || ""); return m ? Number(m[1]) : -1; };
            // initGPU() then reset() run at the end of the page's module script; the metric line is written by reset()
            const ready = await until(() => frameNo() === 0 && /engine:/.test(($("engine") || {}).textContent || ""), 60000);
            const engine = ($("engine") || {}).textContent || null;
            const sel = $("camera"); sel.value = "dolly"; sel.dispatchEvent(new w.Event("change"));
            await until(() => frameNo() === 0, 30000);
            $("run").click();
            const ran = await until(() => frameNo() >= 3, 120000);
            const out = { ready, ran, engine, frames: frameNo(),
                          dis: ($("disstat") || {}).textContent || "", acc: ($("accstat") || {}).textContent || "",
                          camera: sel.value };
            try { $("run").click(); } catch {}
            return out;
        }` });

        const G = r.result;
        ok("fsr.html loaded as a page on a real adapter and reached its first frame",
           r.ok && G && G.ready && G.camera === "dolly",
           r.ok ? `engine line: ${G && G.engine}` : (r.reason || (r.pageErrors || []).join("; ")));

        if (r.ok && G) {
            ok("  ...and the engine line says the reject chain is on the device, which it prints only when the runner CONSTRUCTED",
               /reject chain/.test(G.engine || "") && /WebGPU compute/.test(G.engine || ""),
               G.engine || "(no engine line)");
            ok("  ...and the dolly actually advanced frames on it",
               G.ran && G.frames >= 3, `reached frame ${G.frames}`);
            const m = /disocclusion: (\d+) genuine, (\d+) with no history/.exec(G.dis || "");
            ok("!! *** the disocclusion counters came off THE DEVICE, and genuine is non-zero ***",
               !!m && Number(m[1]) > 0 && /counted on the device/.test(G.dis || ""),
               (G.dis || "(empty)") + (m ? "" : "  -- no counter line at all") +
               "   ||  genuine > 0 is the claim: DISOCCLUSION_WGSL/mainCounted's two atomics, split flagged " +
               "from noHistory, which the mask alone cannot do because it writes the same 1.0 for both.");
            ok("!! *** and so did the rectify counters -- not 'not counted', which is what an uncounted device pass prints ***",
               /counted on the device/.test(G.acc || "") && /reused \d+/.test(G.acc || "") &&
               !/not counted/.test(G.acc || ""),
               G.acc || "(empty)");
            // *** v4649 -- THE 106 IS PINNED NOW, AND IT WAS NOT BEFORE. *** The row above asked only for
            // genuine > 0. fsr.html's own prose quotes "106 genuine" and calls it a one-pixel sliver down the
            // slab's trailing edge; four files repeat it. A number a page states in prose and no gate holds
            // is a number free to drift, and the round that added a fourth camera is exactly the round with
            // a reason to move it by accident.
            ok("!! *** ...and the dolly's genuine count is the 106 this page's own prose quotes ***",
               !!m && Number(m[1]) === 106,
               `${m ? m[1] : "(none)"} against a documented 106. MEASURED FLAT across frames 2-6 on the ` +
               "dolly -- 106 every frame -- so this is a constant of that camera and not a sample.");

        }
    }
}

console.log(fails ? `\nfsrPageDevice-selfcheck: ${fails} FAILED` : "\nfsrPageDevice-selfcheck: all checks pass");
console.log("\nunchecked here: the two OLDER cameras' GPU branches -- this drives the DOLLY, so the pan's and the " +
    "static camera's adapter paths are still exercised only by render/temporalGPU-selfcheck.mjs and friends " +
    "against fixtures rather than through the page; WHICH ADAPTER, which in this container has been Google's " +
    "SwiftShader every time this harness has reported one, so 'on the device' means a real WebGPU " +
    "implementation and not real hardware, and no timing claim may be read off it; the PICTURE, which is " +
    "never compared here -- this gate reads the page's counters and its engine attribution, and the pictures " +
    "are held equal by render/temporalRejectGPU-selfcheck.mjs on a fixture; and everything fsrPage-selfcheck " +
    "checks about the page as a SOURCE, which is deliberately not repeated here; and the OBJECT-MOTION camera, which is " +
    "tools/ship/fsrPageObjects-selfcheck.mjs's -- split out at v4649 for the reason this file was itself " +
    "split from fsrPage-selfcheck: driving a second camera to six frames took this gate from 2,448 ms to " +
    "4,872, over the sweep's 3,000 ms membership threshold, and a gate outside the sweep is a gate nobody " +
    "runs. Third split in this tree for that reason and the third taken BEFORE the addition landed.");
//
// SABOTAGE LOG -- each applied to the live tree, run, and restored.
//   v4641  fsr.html: `if (rgpu)` forced false, so the runner is CONSTRUCTED and the page uses the CPU anyway
//          -- the silent fallback this gate exists for.                        2 RED, both device rows, by name.
//   v4641  fsr.html: the CPU branch's disStats labelled `engine: "the device"` -- caught by the OTHER half of
//          the claim, fsrPage-selfcheck's CPU-attribution row.                 1 RED there, by name.
//
// process.exit() would truncate everything above through a pipe -- see tools/ship/pipeTruncation-selfcheck.mjs.
process.exitCode = fails ? 1 : 0;
