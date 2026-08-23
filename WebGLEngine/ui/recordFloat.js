// WebGLEngine/ui/recordFloat.js -- v3950
//
// THE FLOATING RECORD BUTTON. Twenty-five pages have asked for this file on every load since before this
// repository had a git history, and it has never existed.
//
// *** IT IS IN NO COMMIT OF THIS REPOSITORY, AND NOTHING IN THE TREE DESCRIBES IT. *** `git log --all` over the
// path is empty (history begins v3842), no changelog names it, no .md mentions it, and no module imports it --
// the same LOST SOURCE shape as simulation/lbm/dfgBenchmark.mjs, found in the same week. Keith's render-qa run
// is what surfaced it: 51 of 377 pages failed, and 25 of those 51 -- half the report -- were this one 404.
//
// WHAT IT WAS FOR IS NOT A GUESS, BECAUSE THE CALL SITES SAY SO. Every one of the twenty-five loads it the same
// way -- `<script type="module" src="/ui/recordFloat.js"></script>`, last tag before </body>, no named imports --
// so it self-installs and takes no arguments. None of those pages loads ui/canvasRecorder.js or mentions
// swekRecord, while canvasRecorder.js exports exactly the API such a button needs (start/stop/recording, and it
// already picks the largest canvas by itself). A floating button that installs the recorder and drives it is the
// only shape that fits all three facts. THIS IS A RECONSTRUCTION FROM THE CALL SITES, NOT A RECOVERY -- the
// original is gone, and if it did something else, nothing left in the tree can say what.
//
// *** IT DOES NOT APPEAR ON A PAGE IT CANNOT RECORD, WHICH IS THE ONE REAL DESIGN DECISION HERE. ***
// Nine of the twenty-five have no <canvas> at all. A record button on those would be decoration that fails on
// click -- and this tree already has a claim about that shape, quoted in render-qa's own output on a different
// page: "v2579 A flag that lies is worse than no flag." So the button is added only when there is something to
// record, and the recorder's own capabilities() is consulted rather than assumed.
//
// AND THE CANVAS OFTEN ARRIVES LATE. These are WebGL/WebGPU pages that build their canvas in JS, sometimes after
// an await -- so a single check at load would find nothing on exactly the pages most worth recording. It watches
// briefly instead, then gives up quietly rather than observing forever.
import { installRecorder } from "./canvasRecorder.js";

installRecorder();

(function floatingRecordButton() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    if (document.getElementById("swekRecFloat")) return;          // never two

    const rec = () => window.swekRecord;
    const hasCanvas = () => !!document.querySelector("canvas");

    function build() {
        if (document.getElementById("swekRecFloat")) return;
        if (!rec()) return;

        // *** ASK THE RECORDER WHETHER IT CAN ACTUALLY CAPTURE HERE, rather than showing a button and finding out
        // on click. capabilities() is the v3735 answer to exactly this: captureStream + MediaRecorder are not
        // secure-context gated, so this usually works on a plain LAN origin -- but "usually" is not "here". ***
        // The field is canRecord, READ FROM describeCapture() rather than guessed: the first draft of this file
        // tested `cap.canCapture`, which does not exist -- and an undefined field is never === false, so the
        // check would have passed silently on every page and proven nothing. A guarded read of a wrong name is
        // indistinguishable from a working check until the day it needs to fire.
        try {
            const cap = rec().capabilities && rec().capabilities();
            if (cap && cap.canRecord === false) {
                console.log("[recordFloat] no button: " + (cap.message || "MediaRecorder is not available on this origin"));
                return;
            }
        } catch { /* an older recorder without capabilities() is not a reason to withhold the button */ }

        const btn = document.createElement("button");
        btn.id = "swekRecFloat";
        btn.type = "button";
        btn.title = "Record the largest canvas on this page to a .webm clip. Click again to stop and save.";
        btn.style.cssText =
            "position:fixed;right:14px;bottom:14px;z-index:99997;display:inline-flex;align-items:center;gap:7px;" +
            "background:rgba(10,16,22,.86);color:#e6eef7;border:1px solid #2c4257;border-radius:9px;" +
            "padding:7px 12px;font:12px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;cursor:pointer;" +
            "backdrop-filter:blur(3px);box-shadow:0 4px 14px rgba(0,0,0,.45);";
        const dot = document.createElement("span");
        dot.style.cssText = "width:9px;height:9px;border-radius:50%;background:#e0524a;flex:none;";
        const label = document.createElement("span");
        label.textContent = "Record";
        btn.appendChild(dot); btn.appendChild(label);

        let tick = null, t0 = 0;
        const paint = () => {
            const on = !!(rec() && rec().recording && rec().recording());
            // ONE function writes both halves of the control, so the dot and the word cannot disagree -- the
            // shape tunnelDrawer-selfcheck exists to enforce one drawer over.
            dot.style.background = on ? "#ff5f56" : "#e0524a";
            dot.style.boxShadow = on ? "0 0 0 3px rgba(255,95,86,.25)" : "none";
            label.textContent = on ? "Stop " + Math.max(0, Math.round((Date.now() - t0) / 1000)) + "s" : "Record";
            btn.style.borderColor = on ? "#7a2f2a" : "#2c4257";
        };

        btn.addEventListener("click", () => {
            const r = rec();
            if (!r) return;
            if (r.recording && r.recording()) { r.stop(); }
            else {
                // seconds<=0 means "until stop()", which is what a toggle wants -- a fixed length here would
                // stop a take mid-sentence and the button would still read "Stop".
                if (r.start(0) === false) { label.textContent = "can't record"; setTimeout(paint, 1800); return; }
                t0 = Date.now();
            }
            paint();
        });

        // The recorder can stop on its own (MediaRecorder ends, a page swaps its canvas), so the label is driven
        // by POLLING THE RECORDER rather than by what the last click intended. A button that says "Stop" over a
        // finished recording is the lying flag again, one layer in.
        tick = setInterval(paint, 500);
        window.addEventListener("pagehide", () => clearInterval(tick), { once: true });

        document.body.appendChild(btn);
        paint();
    }

    function start() {
        if (!document.body) return;
        if (hasCanvas()) return build();

        // *** THE LATE CANVAS. *** A WebGL page may not have one for a second or two. Watching forever would leave
        // an observer on every page for the life of the tab, so this watches for a bounded window and then stops:
        // if nothing has drawn a canvas in eight seconds, this is one of the nine pages that has none.
        const obs = new MutationObserver(() => { if (hasCanvas()) { obs.disconnect(); clearTimeout(giveUp); build(); } });
        obs.observe(document.body, { childList: true, subtree: true });
        const giveUp = setTimeout(() => obs.disconnect(), 8000);
    }

    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
    else start();
})();
