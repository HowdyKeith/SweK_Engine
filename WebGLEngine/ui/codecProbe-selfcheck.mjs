// ui/codecProbe-selfcheck.mjs -- v3735
//
// The gate for ui/codecProbe.mjs. Same shape as ui/webgpuProbe-selfcheck.mjs (v3666), because the origin half
// of the question is the same question -- and DELIBERATELY so: two spellings of "which origins are secure"
// would be two declarations about one thing nobody ever compared.
//
// *** THE BOUNDARY, STATED FIRST BECAUSE IT LIMITS EVERYTHING BELOW. There is no browser in this sandbox. The
// fakes here implement THE SPEC AND THE ISSUE TRACKER AS I READ THEM, so what is graded is THE PROBE'S LOGIC --
// that it maps each environment to its own reason and refuses to attribute a rejection. IT IS NOT EVIDENCE
// ABOUT ANY REAL BROWSER, and grading my own fake against my own probe would be a mirror if it were claimed as
// such. THE ONE THING ONLY THE RIG CAN ANSWER: what Chrome, Safari and Firefox on Keith's LAN actually return
// for avc1 / vp09 / av01 at http://<lan-ip>:8787 and at https. That run is the corroboration and it does not
// exist yet. ***
//
// SOURCES FOR THE BEHAVIOUR THE FAKES IMITATE, so the next reader can re-check them rather than trust this:
//   - MDN VideoEncoder.isConfigSupported / VideoDecoder.isConfigSupported: "available only in secure contexts
//     (HTTPS)", and TypeError "if the provided config is invalid".
//   - w3c/webcodecs issue #744 "isConfigSupported: definition of 'invalid'": Chromium resolves supported:false
//     for an unsupported scalabilityMode where Safari rejects.
//   - web-platform-tests/interop issue #382: unrecognized codec STRINGS used to reject and were changed to
//     resolve false, "since not every UA is going to support every codec string".

import { describeWebCodecs, probeEncoderConfig, describeCapture } from "./codecProbe.mjs";
import { describeWebGPU } from "./webgpuProbe.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const env = (globals, secure, host, proto = "http:") => ({
    globals: globals || {}, isSecureContext: secure,
    location: { protocol: proto, hostname: host, host: host + ":8787", pathname: "/server.html" },
});
const ENC = () => function VideoEncoder() {};

// --- 1. SweK'S OWN DEPLOYMENT ------------------------------------------------------------------------------
{
    say("1. THE ORIGIN THE ENGINE ACTUALLY SHIPS AS: http://192.168.10.53:8787/server.html");
    const r = describeWebCodecs(env({ MediaRecorder: function () {} }, false, "192.168.10.53"));
    say("     reason: " + r.reason);
    ok("!! it names the ORIGIN, not the browser or the machine",
        r.reason === "insecure-origin" && !/this browser has no/.test(r.message),
        "the same mistake webgpuProbe was built to stop, one API along");
    ok("and it says what to do about it", r.actionable === true && /https|localhost/.test(r.message));

    // *** THE ASYMMETRY THAT MAKES THIS WORTH A MODULE RATHER THAN A LINE. ***
    const cap = describeCapture(env({ MediaRecorder: function () {} }, false, "192.168.10.53"));
    ok("!! *** ON THAT ORIGIN THE PAGE CAN RECORD AND CANNOT RE-ENCODE, AND IT SAYS BOTH ***",
        cap.canRecord === true && cap.canTranscode === false && cap.split === true,
        "canvas.captureStream + MediaRecorder are NOT secure-context gated and keep working over http, while " +
        "VideoEncoder is simply absent. A transcode step built beside the recorder would no-op on the engine's " +
        "own LAN address WITH THE RECORDER PLAINLY WORKING NEXT TO IT -- nobody would think to look at the URL");
}

// --- 2. THE FOUR ORIGINS, EACH LANDING ON ITS OWN REASON ---------------------------------------------------
{
    say("2. THE SAME ABSENCE FROM DIFFERENT CAUSES.");
    const rows = [
        ["LAN IP, http", env(null, false, "192.168.10.53"), "insecure-origin"],
        ["localhost, http", env(null, false, "localhost"), "no-webcodecs"],
        ["127.0.0.1, http", env(null, false, "127.0.0.1"), "no-webcodecs"],
        ["https, truly absent", env(null, true, "example.com", "https:"), "no-webcodecs"],
        ["https, present", env({ VideoEncoder: ENC() }, true, "example.com", "https:"), "present"],
    ];
    for (const [name, e, want] of rows) {
        const r = describeWebCodecs(e);
        say("     " + name.padEnd(20) + " -> " + r.reason + (r.reason === want ? "" : "   *** expected " + want + " ***"));
    }
    ok("!! every case lands on its own reason", rows.every(([, e, want]) => describeWebCodecs(e).reason === want));
    ok("!! localhost over http is NOT reported as an insecure origin",
        describeWebCodecs(env(null, false, "localhost")).reason === "no-webcodecs",
        "the browser's own rule, and the same one webgpuProbe applies");

    // The two probes must agree about ORIGINS even though they disagree about APIs.
    const both = [["192.168.10.53", false], ["localhost", false], ["example.com", true]];
    ok("!! *** THE TWO PROBES AGREE ABOUT WHICH ORIGINS ARE SECURE, ASSERTED RATHER THAN ASSUMED ***",
        both.every(([h, s]) => {
            const gpu = describeWebGPU({ navigator: {}, isSecureContext: s, location: { hostname: h, host: h, protocol: s ? "https:" : "http:" } });
            const wc = describeWebCodecs({ globals: {}, isSecureContext: s, location: { hostname: h, host: h, protocol: s ? "https:" : "http:" } });
            return (gpu.reason === "insecure-origin") === (wc.reason === "insecure-origin");
        }),
        "TWO SPELLINGS OF THE SAME RULE IS THE SHAPE THIS TREE KEEPS FINDING. When one of them learns about a " +
        "new secure-origin case, THIS LINE GOES RED AND BOTH SHOULD MOVE -- do not fix it by copying the list");
}

// --- 3. PRESENCE IS NOT CAPABILITY, PER CODEC STRING -------------------------------------------------------
{
    say("3. VideoEncoder EXISTING SAYS NOTHING ABOUT avc1, vp09 OR av01.");
    const secure = (impl) => env({ VideoEncoder: Object.assign(ENC(), { isConfigSupported: impl }) }, true, "example.com", "https:");
    const cfg = { codec: "avc1.42001E", width: 1280, height: 720, bitrate: 2e6, framerate: 30 };

    const yes = await probeEncoderConfig(secure(async () => ({ supported: true, config: cfg })), cfg);
    const no = await probeEncoderConfig(secure(async () => ({ supported: false, config: cfg })), cfg);
    ok("!! a present encoder that supports the codec reads supported", yes.supported === true && yes.reason === "supported");
    ok("!! a present encoder that does NOT reads unsupported, not absent",
        no.supported === false && no.reason === "unsupported" && no.ambiguous === false,
        "the WebGPU no-adapter case, one level deeper: here it is per codec STRING rather than per system");

    // *** THE FINDING. ***
    const boom = await probeEncoderConfig(secure(async () => { throw new TypeError("Config is invalid"); }), cfg);
    ok("!! *** A REJECTION IS REPORTED AS AMBIGUOUS AND ITS CAUSE IS NOT GUESSED ***",
        boom.reason === "rejected" && boom.ambiguous === true && boom.supported === false,
        "THE SPEC SAYS a rejection means the config is INVALID -- our bug. THE IMPLEMENTATIONS DISAGREE: " +
        "w3c/webcodecs#744 records Chromium resolving supported:false where Safari REJECTS, and interop#382 " +
        "records unrecognized codec strings moving from reject to resolve-false. So mapping rejection -> " +
        "'our config is malformed' WOULD BE WRONG ON SAFARI, and mapping it to 'unsupported' would hide a real " +
        "malformed config. IT IS ITS OWN REASON, WITH BOTH CAUSES NAMED");
    ok("...and the ambiguous message names BOTH causes, so the reader is not sent one way",
        /invalid/i.test(boom.message) && /unsupported/i.test(boom.message) && /#744/.test(boom.message));

    // A caller's own omission must never come back wearing the browser's answer.
    let called = false;
    const nothing = await probeEncoderConfig(secure(async () => { called = true; return { supported: true }; }), null);
    ok("!! a missing config is refused BEFORE the call, so our omission is never attributed to the browser",
        nothing.reason === "no-config" && called === false,
        "this is the ONE invalid case that can be attributed with certainty, and it is caught on our side of the wire");
}

// --- 4. THE ORDER OF THE TWO REFUSALS -----------------------------------------------------------------------
{
    // *** THE FIRST VERSION OF THIS CHECK WAS VACUOUS AND IS RECORDED BECAUSE IT NEARLY SHIPPED: it asserted
    // `r.reason === "present" || r.supported === true || called === true`, AN OR THAT CANNOT FAIL. A check that
    // asks a question whose answer is structurally guaranteed is not evidence, and this file is the wrong place
    // to prove that again. The real property is an ORDER: the ORIGIN verdict must come before the CONFIG
    // verdict, so a page on the LAN with no config at all is told about the ORIGIN -- the thing it can act on --
    // and not about a missing argument. ***
    const r = await probeEncoderConfig(env(null, false, "192.168.10.53"), null);
    ok("!! an unavailable ORIGIN is reported before a missing CONFIG, because only one of them is actionable",
        r.reason === "insecure-origin",
        "got '" + r.reason + "'. Reverse the two checks in probeEncoderConfig and this reads 'no-config' -- " +
        "which is TRUE and USELESS: it sends the reader to fix a call site on a page where no call could have " +
        "worked. WHEN A THING FAILS TWO WAYS AT ONCE, REPORT THE ONE THE READER CAN DO SOMETHING ABOUT");
}

// --- 5. WHAT ONLY THE RIG CAN SAY --------------------------------------------------------------------------
say("5. NOT ESTABLISHED HERE, AND IT IS THE PART THAT MATTERS BEFORE ANY TRANSCODE PATH IS BUILT:");
say("   what a REAL browser returns. The fakes above implement the spec and the two issue threads AS I READ");
say("   THEM, so this gate grades THE PROBE'S LOGIC and nothing about Chrome, Safari or Firefox. THE RUN THAT");
say("   WOULD SETTLE IT: open a page on Keith's LAN at http://<ip>:8787 and again over https/localhost, and");
say("   read describeCapture() plus probeEncoderConfig() for avc1.42001E, vp09.00.10.08 and av01.0.04M.08.");
say("   UNTIL THEN, 'WebCodecs is unavailable on the LAN origin' IS A SPEC CLAIM, NOT A MEASUREMENT.");

console.log("\ncodecProbe-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
