// ui/codecProbe.mjs -- v3735
//
// WHY THERE IS NO WebCodecs HERE -- and it is the SAME QUESTION ui/webgpuProbe.mjs answered at v3666, arriving
// at a second API. Keith is planning more video transcoding, and the seam has to be right before anything is
// built on it.
//
// *** THE FACT THAT DECIDES EVERYTHING, AND IT IS ABOUT SweK'S OWN DEPLOYMENT: WebCodecs IS GATED ON A SECURE
// CONTEXT. MDN, for VideoEncoder.isConfigSupported and VideoDecoder alike: "This feature is available only in
// secure contexts (HTTPS)". SweK IS A LAN SERVER AND ITS PRIMARY ORIGIN IS http://<lan-ip>:8787 -- WHICH IS
// NEITHER https NOR localhost. So on the address the engine actually ships as, VideoEncoder is UNDEFINED. ***
//
// *** AND THE ASYMMETRY IS THE TRAP, BECAUSE IT MAKES THE FAILURE SILENT: ui/canvasRecorder.js RECORDS FINE
// OVER http. canvas.captureStream + MediaRecorder are NOT secure-context gated, so capture keeps working on
// the LAN exactly as it does today -- while any browser-side TRANSCODE built beside it is unavailable on the
// same page. "Recording works" and "the browser can encode" are TWO THINGS WEARING ONE LABEL, and the recorder
// currently asks neither question about codecs. A transcode path that no-ops on the engine's own origin, next
// to a recorder that plainly works, is the worst kind of bug: nobody would look at the URL. ***
//
// THE OTHER HALF -- PRESENCE IS NOT CAPABILITY, ONE LEVEL DEEPER THAN WebGPU. navigator.gpu existing and
// handing back no adapter was v3666's third case. Here it is PER CODEC STRING: VideoEncoder can exist and
// avc1 / vp09 / av01 each be supported or not, and the only way to ask is
// VideoEncoder.isConfigSupported(config), which is async.
//
// *** AND THE ANSWER TO THAT CALL IS AMBIGUOUS BY CONSTRUCTION, WHICH IS THE FINDING OF THIS FILE. The spec
// says a config that is not VALID rejects with TypeError, while a config that is valid but UNSUPPORTED
// resolves with { supported: false }. THAT WOULD SEPARATE "OUR CONFIG IS MALFORMED" FROM "THIS BROWSER CANNOT
// DO H.264" -- our bug from theirs -- EXCEPT THAT IMPLEMENTATIONS DISAGREE ABOUT WHAT "INVALID" MEANS.
// w3c/webcodecs issue #744, verbatim in its title: "isConfigSupported: definition of 'invalid'". It records
// that for an unsupported scalabilityMode Chromium RESOLVES with supported:false while Safari REJECTS; and
// web-platform-tests/interop #382 records that unrecognized codec STRINGS used to reject and were changed to
// resolve false, because "not every UA is going to support every codec string".
//
// SO A REJECTION CANNOT BE READ AS "OUR CONFIG IS WRONG". On one browser it means that; on another it means
// the codec is unsupported. THIS FILE THEREFORE REFUSES TO DECIDE, AND SAYS SO IN THE RESULT: `rejected` is
// its own reason with BOTH causes named, rather than being folded into either. Collapsing it would be the
// v3707 shape -- an unexamined subject and an examined one that said no, indistinguishable from outside.
// WHEN THE BROWSERS CONVERGE, this line goes stale and the right response is to SPLIT `rejected`, naming which
// browsers were re-checked and when -- never to guess a cause from a rejection.
//
// PURE: every global arrives as an argument, exactly as webgpuProbe does, so the gate states each environment
// as a literal instead of needing four browsers.

/** @returns {{ available: boolean, reason: string, message: string, actionable: boolean }} */
export function describeWebCodecs(env = {}) {
    const g = env.globals || {};
    const secure = env.isSecureContext, loc = env.location || {};
    const host = String(loc.hostname || "");
    // The browser's own rule, not ours -- and deliberately the SAME list webgpuProbe uses. Two spellings of
    // "which origins are secure" would be two declarations about one thing nobody ever compared.
    const localish = host === "localhost" || host === "127.0.0.1" || host === "::1" || /\.localhost$/.test(host);

    if (typeof g.VideoEncoder === "function") {
        return { available: true, reason: "present", message: "", actionable: false };
    }

    if (secure === false && !localish) {
        const https = (loc.host ? "https://" + loc.host : "https") + (loc.pathname || "");
        return {
            available: false, reason: "insecure-origin", actionable: true,
            message: "WebCodecs needs a secure origin \u2014 this page is " + (loc.protocol || "http:") + "//" + host +
                     ", so the browser does not expose VideoEncoder here. Recording still works; TRANSCODING " +
                     "does not. Open it over https or via localhost. (" + https + ")",
        };
    }
    return {
        available: false, reason: "no-webcodecs", actionable: false,
        message: "this browser has no WebCodecs \u2014 clips can be recorded but not re-encoded in the page",
    };
}

/**
 * The per-codec question, which presence cannot answer. Returns one of four reasons, and `rejected` IS NOT
 * FOLDED INTO `unsupported` -- see the header: browsers disagree about which one a rejection means.
 * @returns {{ supported: boolean, reason: string, message: string, ambiguous: boolean }}
 */
export async function probeEncoderConfig(env = {}, config = null) {
    const first = describeWebCodecs(env);
    if (!first.available) {
        return { supported: false, reason: first.reason, message: first.message, ambiguous: false };
    }
    if (!config || typeof config.codec !== "string" || !config.codec) {
        // Refused BEFORE the call, so a caller's own omission never reaches the browser and comes back
        // wearing the browser's answer. This is the one invalid case we CAN attribute with certainty.
        return { supported: false, reason: "no-config", ambiguous: false,
                 message: "probeEncoderConfig needs a config with a codec string \u2014 nothing was asked" };
    }
    try {
        const r = await env.globals.VideoEncoder.isConfigSupported(config);
        if (r && r.supported) {
            return { supported: true, reason: "supported", message: "", ambiguous: false };
        }
        return { supported: false, reason: "unsupported", ambiguous: false,
                 message: "this browser reported " + config.codec + " as unsupported" };
    } catch (e) {
        // *** THE HONEST STATE. Do not attribute this. ***
        return { supported: false, reason: "rejected", ambiguous: true,
                 message: "isConfigSupported rejected for " + config.codec + " \u2014 THIS IS AMBIGUOUS: the spec " +
                          "says a rejection means the config is INVALID (our bug), but implementations differ " +
                          "(w3c/webcodecs#744 records Chromium resolving false where Safari rejects), so it may " +
                          "equally mean the codec is unsupported (their limit). Treat the codec as unavailable " +
                          "and do NOT report a cause." };
    }
}

/**
 * The two questions a recorder page actually has, answered together, because they have different answers on
 * the same origin and that is the whole point of this module.
 */
export function describeCapture(env = {}) {
    const g = env.globals || {};
    const canRecord = typeof g.MediaRecorder === "function";
    const codecs = describeWebCodecs(env);
    return {
        canRecord,
        canTranscode: codecs.available,
        // *** THE LINE WORTH PRINTING: on a LAN IP over http this reads true/false, and nothing about the
        // machine, the browser or the driver has anything to do with it. ***
        split: canRecord && !codecs.available,
        reason: codecs.reason,
        message: canRecord && !codecs.available
            ? "recording works here, re-encoding does not \u2014 " + codecs.message
            : codecs.message,
    };
}
