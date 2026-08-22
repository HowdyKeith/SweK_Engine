// WebGLEngine/render/blobRecorder.js — v2588
//
// CAN THE BLOBULATOR RECORD ITSELF? YES. CAN IT MAKE SOMETHING A TV WILL PLAY? NO -- AND THE API SAYS IT CAN.
//
// ---- MEASURED IN A REAL CHROMIUM, NOT ASSERTED ------------------------------------------------------------------
//
// This was going to be labelled rig-only, because "the sandbox has no browser". IT HAS TWO:
// /opt/pw-browsers/chromium_headless_shell-1194/ and a full Puppeteer Chrome at ~/.cache/puppeteer/. FIFTH
// EXPIRED BLOCKER THIS SESSION -- v2560 (emsdk), v2570 (box3d.wasm), v2576 (real terrain), v2582 (brain.js is
// "Deno-only"), now this. A REASON THAT EXPIRED IS A HABIT.
//
// What a real headless Chromium says:
//
//     canvas.captureStream          true
//     MediaRecorder                 true
//     video/webm                    YES
//     video/webm;codecs=vp8         YES
//     video/webm;codecs=vp9         YES
//     video/webm;codecs=h264        no
//     video/mp4                     YES      <-- and this is the trap
//     video/mp4;codecs=avc1.42E01E  no
//
// And recording for real, 30 frames of a moving canvas:
//
//     video/webm;codecs=vp8    5308 bytes   1a 45 df a3   EBML -- a genuine WebM
//     video/webm;codecs=vp9   16820 bytes   1a 45 df a3   a genuine WebM
//     video/mp4               18183 bytes   ftypisom      A GENUINE MP4 CONTAINER
//
// SO IT REALLY DOES MAKE AN MP4. Correct ISO brand ("ftypisom" ... "isomiso6"), correct box structure. THEN
// LOOK INSIDE IT:
//
//     avc1  ABSENT
//     vp09  FOUND AT BYTE 28
//
// THE MP4 CONTAINS VP9. NOT H.264.
//
// ---- WHAT THAT MEANS FOR THE TV ----------------------------------------------------------------------------------
//
// A Roku expects H.264 in MP4. It will fetch a file called .mp4, open a container it understands, find a codec
// it does not, and refuse -- WHILE isTypeSupported("video/mp4") SAID YES THE ENTIRE TIME. The extension will
// have lied, the container will have been right, and the picture will be black.
//
// A FLAG THAT LIES IS WORSE THAN NO FLAG. So this module NEVER reports "mp4" without reporting what is inside
// it, and playsOnTv is a SEPARATE, HONEST field that is false for every option this browser offers.
//
// ---- THE ROAD THAT ACTUALLY WORKS ---------------------------------------------------------------------------------
//
// Record WebM/VP9 (best quality of the three, and honest about what it is), then TRANSCODE TO H.264 -- ffmpeg on
// Galaxina, one line. THE BROWSER CANNOT DO THIS PART and pretending otherwise is how you end up debugging a
// Roku at midnight. Home Assistant's media_player.play_media then points the TV at SweK's LAN URL: no cloud, no
// cast protocol, peer-to-peer by construction. (Shield speaks Google Cast natively; ROKU DOES NOT -- that
// asymmetry will bite anyone who assumes.)

/** Preference order. WebM first because it is HONEST about what it holds. */
const CANDIDATES = [
    { mime: "video/webm;codecs=vp9", container: "webm", codec: "vp9" },
    { mime: "video/webm;codecs=vp8", container: "webm", codec: "vp8" },
    { mime: "video/webm", container: "webm", codec: "vp8-or-vp9" },
    { mime: "video/mp4;codecs=avc1.42E01E", container: "mp4", codec: "h264" },
    { mime: "video/mp4", container: "mp4", codec: "UNKNOWN-PROBABLY-NOT-H264" },
];

/** Only H.264 in MP4 is safe to hand a TV. NOTHING ELSE, however confidently the API says "supported". */
const playsOnTv = (c) => c.container === "mp4" && c.codec === "h264";

/**
 * What can this browser actually record, and is any of it TV-safe?
 * @param {(m: string) => boolean} [isSupported] injectable for testing
 */
export function probeRecording(isSupported) {
    const test = isSupported || ((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
    const available = CANDIDATES.filter((c) => test(c.mime));
    const tvSafe = available.filter(playsOnTv);
    return {
        available,
        best: available[0] || null,
        tvSafe: tvSafe[0] || null,
        // THE HONEST HEADLINE. Measured in Chromium 1194: false.
        canMakeSomethingATvWillPlay: tvSafe.length > 0,
        // The trap, named so nobody has to rediscover it at midnight.
        mp4IsALie: test("video/mp4") && !test("video/mp4;codecs=avc1.42E01E"),
    };
}

/**
 * Record a canvas. Returns a Blob and, crucially, WHAT IS ACTUALLY IN IT.
 *
 * NOTE: a canvas that does not change emits NO FRAMES -- captureStream is driven by paints, not by the clock.
 * A recorder that returns 0 bytes on a still blob is not broken; it is being told nothing happened.
 */
export async function recordCanvas(canvas, ms = 4000, fps = 30) {
    const probe = probeRecording();
    if (!probe.best) throw new Error("recordCanvas: MediaRecorder supports nothing here");
    const stream = canvas.captureStream(fps);
    const chunks = [];
    const rec = new MediaRecorder(stream, { mimeType: probe.best.mime });
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.start();
    await new Promise((r) => setTimeout(r, ms));
    rec.stop();
    await stopped;
    return {
        blob: new Blob(chunks, { type: probe.best.mime }),
        container: probe.best.container,
        codec: probe.best.codec,
        playsOnTv: playsOnTv(probe.best),
        // What to actually do with it, said plainly rather than discovered.
        note: playsOnTv(probe.best)
            ? "H.264/MP4 -- hand it straight to media_player.play_media"
            : "This is " + probe.best.codec + " in " + probe.best.container +
              ". A TV will not play it. Transcode to H.264 on Galaxina (ffmpeg -i in.webm -c:v libx264 out.mp4), THEN serve it.",
    };
}

/** The four bytes that say what a file really is. Extensions do not. */
export function sniffContainer(bytes) {
    if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "webm";
    if (bytes.length >= 8 && String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]) === "ftyp") return "mp4";
    return "unknown";
}

/**
 * Find the codec fourcc inside an MP4's boxes. THIS IS THE ONLY HONEST WAY TO KNOW WHAT YOU RECORDED --
 * isTypeSupported("video/mp4") returns true and hands you VP9. MEASURED: vp09 at byte 28, avc1 absent.
 */
export function sniffMp4Codec(bytes) {
    const head = String.fromCharCode(...bytes.slice(0, Math.min(512, bytes.length)));
    for (const cc of ["avc1", "hvc1", "hev1", "vp09", "vp08", "av01"]) if (head.includes(cc)) return cc;
    return "unknown";
}
