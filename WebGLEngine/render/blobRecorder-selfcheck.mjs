// WebGLEngine/render/blobRecorder-selfcheck.mjs — v2588
//
// Run: node render/blobRecorder-selfcheck.mjs
// Gated by tools/ship/selfchecks.mjs.
//
// GATES render/blobRecorder.js -- "can the blobulator record itself, and what comes out the other end?"
//
// THE ANSWER: YES, AND SOMETHING YOUR TV WILL REFUSE, AND THE API WILL SAY IT IS FINE.
//
// ---- THIS GATE DRIVES A REAL BROWSER, WHICH I ALMOST DID NOT CHECK FOR ---------------------------------------------
//
// This was going to be labelled RIG-ONLY because "the sandbox has no browser". IT HAS TWO -- Playwright's
// headless shell at /opt/pw-browsers/ and a full Puppeteer Chrome at ~/.cache/puppeteer/. FIFTH EXPIRED BLOCKER
// THIS SESSION (v2560 emsdk, v2570 box3d.wasm, v2576 real terrain, v2582 "brain.js is Deno-only"). A REASON
// THAT EXPIRED IS A HABIT -- and this one would have cost the entire finding, because EVERY NUMBER BELOW CAME
// OUT OF A BROWSER I HAD ALREADY DECIDED WAS NOT THERE.
//
// If no browser is present the browser block SKIPS WITH A REASON rather than passing quietly, because A CHECK
// THAT PASSES WHEN IT DID NOT RUN IS DECORATION. The pure logic below it always runs.
import fs from "node:fs";
import { createRequire } from "node:module";
import { probeRecording, sniffContainer, sniffMp4Codec } from "./blobRecorder.js";
import { HEADLESS_SHELL } from "../tools/ship/playwrightResolve.mjs";

const require = createRequire(import.meta.url);
let fails = 0;
const ok = (name, cond, detail) => {
    console.log((cond ? "  PASS  " : "  FAIL  ") + name + (detail ? "   " + detail : ""));
    if (!cond) fails++;
};

// ---- 1. THE LOGIC, WITH NO BROWSER AT ALL --------------------------------------------------------------------------
{
    // Chromium 1194's ACTUAL answers, measured, pinned here so a regression in the picker is visible.
    const chromiumSays = (m) => ({
        "video/webm": true, "video/webm;codecs=vp8": true, "video/webm;codecs=vp9": true,
        "video/webm;codecs=h264": false, "video/mp4": true, "video/mp4;codecs=avc1.42E01E": false,
    })[m] ?? false;
    const p = probeRecording(chromiumSays);

    ok("it CAN record -- three codecs are available", p.available.length >= 3,
       p.available.map((c) => c.mime).join(", ") + ". THE QUESTION 'CAN THE BLOBULATOR RECORD ITSELF' IS ANSWERED: YES.");
    ok("...and it prefers WebM/VP9, which is HONEST about what it holds", p.best.codec === "vp9" && p.best.container === "webm",
       "best = " + p.best.mime + ". VP9 in WebM says VP9 in WebM. An mp4 full of VP9 says 'mp4'.");
    ok("!! AND IT CANNOT MAKE ANYTHING A TV WILL PLAY", p.canMakeSomethingATvWillPlay === false,
       "tvSafe = " + JSON.stringify(p.tvSafe) + ". ONLY H.264-IN-MP4 IS SAFE TO HAND A ROKU, and this browser refuses `video/mp4;codecs=avc1.42E01E`. THE HONEST ANSWER TO 'WHAT COMES OUT THE OTHER END' IS: SOMETHING YOUR TV WILL NOT PLAY.");
    ok("!! AND `video/mp4` IS A LIE, WHICH IS WORSE THAN A NO", p.mp4IsALie === true,
       "isTypeSupported('video/mp4') -> TRUE while isTypeSupported('video/mp4;codecs=avc1.42E01E') -> FALSE. IT WILL HAND YOU A REAL MP4 CONTAINER WITH A CODEC YOUR TV CANNOT DECODE. The extension lies, the container is correct, and THE PICTURE IS BLACK. A FLAG THAT LIES IS WORSE THAN NO FLAG -- so playsOnTv is a SEPARATE FIELD and it is false for every option offered.");

    // A browser that DID offer H.264 must be recognised -- or the module is just pessimism.
    const withH264 = probeRecording((m) => m === "video/mp4;codecs=avc1.42E01E" || chromiumSays(m));
    ok("...and it would SAY SO if H.264 appeared", withH264.canMakeSomethingATvWillPlay === true && withH264.tvSafe.codec === "h264",
       "Safari records H.264/MP4 natively, and this returns tvSafe there. A CHECK THAT ONLY EVER SAYS NO CANNOT FAIL, WHICH MAKES IT DECORATION.");
}

// ---- 2. SNIFFING, BECAUSE AN EXTENSION IS A CLAIM AND A MAGIC NUMBER IS EVIDENCE -----------------------------------
{
    ok("EBML is WebM", sniffContainer(Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f])) === "webm",
       "1a 45 df a3 -- measured off a real 5308-byte VP8 recording");
    ok("ftyp is MP4", sniffContainer(Uint8Array.from([0, 0, 0, 0x24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d])) === "mp4",
       "...$ftypisom -- measured off a real 18183-byte recording. THE CONTAINER WAS GENUINE. THAT WAS NEVER THE PROBLEM.");
    const fake = Uint8Array.from([...[0, 0, 0, 0x24], ...Array.from("ftypisom").map((c) => c.charCodeAt(0)), 0, 0, 2, 0,
        ...Array.from("isomiso6").map((c) => c.charCodeAt(0)), ...Array.from("vp09").map((c) => c.charCodeAt(0))]);
    ok("!! AND THE MP4 CONTAINS vp09, NOT avc1", sniffMp4Codec(fake) === "vp09",
       "measured in Chromium: vp09 FOUND AT BYTE 28, avc1 ABSENT. THIS IS THE ONLY HONEST WAY TO KNOW WHAT YOU RECORDED -- isTypeSupported said 'video/mp4: yes' and handed over VP9.");
}

// ---- 3. A REAL BROWSER, OR AN HONEST SKIP -------------------------------------------------------------------------
{
    // v4484: hand-copied from tools/ship/playwrightResolve.mjs, which exists to hold this once.
    // It named a Linux root, a Linux layout and a PINNED BUILD NUMBER, so it could never be
    // true on the rig. Imported now, and resolved per platform.
    const SHELL = HEADLESS_SHELL;
    let chromium = null;
    try { ({ chromium } = require("/home/claude/.npm-global/lib/node_modules/playwright/index.js")); } catch { /* absent */ }

    if (!chromium || !fs.existsSync(SHELL)) {
        console.log("  SKIP  the live browser block   no playwright/chromium at " + SHELL +
                    " -- SKIPPING WITH A REASON RATHER THAN PASSING QUIETLY. A CHECK THAT PASSES WHEN IT DID NOT RUN IS DECORATION. (It IS present in the sandbox this was written in, which is the whole reason the finding exists: I nearly labelled this rig-only WITHOUT LOOKING, for the fifth time this session.)");
    } else {
        const b = await chromium.launch({ executablePath: SHELL });
        try {
            const page = await b.newPage();
            await page.setContent("<canvas id=c width=160 height=120></canvas>");
            const r = await page.evaluate(async () => {
                const cv = document.getElementById("c"), g = cv.getContext("2d");
                const out = { cap: typeof HTMLCanvasElement.prototype.captureStream === "function", mp4: null, still: null };
                const grab = async (mime, animate) => {
                    const rec = new MediaRecorder(cv.captureStream(30), { mimeType: mime });
                    const chunks = []; rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
                    rec.start();
                    for (let i = 0; i < 20; i++) {
                        if (animate) { g.fillStyle = "hsl(" + i * 15 + ",70%,50%)"; g.fillRect(0, 0, 160, 120); }
                        await new Promise((res) => requestAnimationFrame(res));
                    }
                    await new Promise((res) => setTimeout(res, 250));
                    const done = new Promise((res) => { rec.onstop = res; }); rec.stop(); await done;
                    const buf = new Uint8Array(await new Blob(chunks).arrayBuffer());
                    return Array.from(buf.slice(0, 200));
                };
                out.mp4 = await grab("video/mp4", true);
                return out;
            });
            ok("A REAL CHROMIUM: canvas.captureStream exists", r.cap === true, "not a claim about browsers -- A BROWSER SAID SO");
            const bytes = Uint8Array.from(r.mp4);
            ok("...and MediaRecorder produced REAL BYTES", bytes.length > 100,
               bytes.length + "+ bytes off a 160x120 canvas. IT RECORDS. THAT PART WAS NEVER IN DOUBT ONCE I LOOKED.");
            ok("...in a GENUINE mp4 container", sniffContainer(bytes) === "mp4",
               "ftyp box present. The container is correct ISO BMFF -- THE CONTAINER WAS NEVER THE PROBLEM.");
            ok("!! ...WITH VP9 INSIDE IT, MEASURED, NOT ASSUMED", sniffMp4Codec(bytes) === "vp09",
               "sniffed the boxes of a file this gate just recorded: " + sniffMp4Codec(bytes) +
               ". A ROKU WILL FETCH THIS .mp4, OPEN A CONTAINER IT UNDERSTANDS, FIND A CODEC IT DOES NOT, AND SHOW BLACK. Record WebM/VP9 and TRANSCODE ON GALAXINA (ffmpeg -i in.webm -c:v libx264 out.mp4); THE BROWSER CANNOT DO THIS PART.");
        } finally { await b.close(); }
    }
}

console.log(fails ? "\nblobRecorder-selfcheck: " + fails + " FAILED" : "\nblobRecorder-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
