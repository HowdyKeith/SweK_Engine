// ui/webgpuProbe.mjs -- v3666
//
// WHY THERE IS NO WebGPU HERE -- WHICH IS A DIFFERENT QUESTION FROM WHETHER THERE IS ANY.
//
// *** Keith: "this computer has webgpu and it works with our blob webgpu and all the webgpu.com demos", and
// server.html still said "this browser has no WebGPU". BOTH STATEMENTS ARE TRUE AT ONCE, and the detector was
// not wrong about the FACT -- navigator.gpu really was undefined -- IT WAS WRONG ABOUT THE CAUSE, and the cause
// is the only part a person can act on.
//
// WebGPU IS GATED ON A SECURE CONTEXT. Over https, or on localhost, navigator.gpu exists. Over
// http://192.168.50.53:8787 -- A LAN IP, WHICH IS NEITHER -- THE BROWSER DOES NOT EXPOSE IT AT ALL. So the same
// browser on the same machine has WebGPU on webgpu.com and none on a page served from the engine's own LAN
// address. "THE BROWSER HAS NO WebGPU" AND "THIS ORIGIN DOES NOT GET WebGPU" ARE TWO THINGS WEARING ONE LABEL,
// and the message named the wrong one -- so the reader goes looking at their GPU, their driver and their
// browser version, none of which is the problem. ***
//
// AND THERE IS A THIRD CASE THE OLD CHECK COULD NOT SEE: navigator.gpu can EXIST and requestAdapter() still
// return null (no adapter, blocklisted driver, headless). Presence is not capability.
//
// PURE: every global arrives as an argument, so the gate can state each environment as a literal instead of
// needing four browsers.

/** @returns {{ available: boolean, reason: string, message: string, actionable: boolean }} */
export function describeWebGPU(env = {}) {
    const nav = env.navigator, secure = env.isSecureContext, loc = env.location || {};
    const host = String(loc.hostname || "");
    // The browser's own rule, not ours: localhost and 127.0.0.1 are treated as secure even over http.
    const localish = host === "localhost" || host === "127.0.0.1" || host === "::1" || /\.localhost$/.test(host);

    if (nav && nav.gpu) return { available: true, reason: "present", message: "", actionable: false };

    if (secure === false && !localish) {
        const https = (loc.host ? "https://" + loc.host : "https") + (loc.pathname || "");
        return {
            available: false, reason: "insecure-origin", actionable: true,
            // *** v3779 -- A SHORT LINE FOR THE INLINE SPOT AND THE FULL TEXT FOR ON DEMAND. v3771 and v3772
            // grew this message to three numbered routes because each addition was individually right, AND
            // NEITHER ASKED WHERE THE TEXT LIVES: it renders in a note beside a 223px avatar in a gauge dock,
            // where a paragraph dominates the panel and reads as a NEW FAILURE rather than the same old
            // condition. Keith saw exactly that -- "this avatar worked fine before" -- and the avatar had NOT
            // changed; MY MESSAGE HAD. *** A CORRECT MESSAGE IN THE WRONG PLACE IS STILL A DEFECT, and the
            // fix is not to drop the detail but to put it where somebody can ask for it. ***
            short: "WebGPU needs a secure origin \u2014 open this page as localhost, or use the Public tunnel. (hover for how)",
            // Names the CAUSE and the FIX. The old line named neither.
            // *** v3772 -- AND THEN KEITH ASKED THE QUESTION THAT EXPOSED THE REAL GAP: "can we fix the
            // MacBook too?" ROUTE (1) IS USELESS FROM ANOTHER MACHINE -- localhost on the MacBook is the
            // MacBook, not the server -- so for the case he actually has, the message named ONE route and it
            // was the one that could not help him. THE ENGINE ALREADY SHIPS THE BEST ANSWER: the Tunnels panel
            // runs `cloudflared tunnel --url http://localhost:8787` and captures a *.trycloudflare.com URL,
            // WHICH IS A REAL https ORIGIN WITH A PUBLICLY TRUSTED CERTIFICATE. No warning, no cert files, and
            // it works from every device on or off the LAN. It is strictly better than HTTPS=1 for a remote
            // viewer, and it was already built. ***
            // *** v3771 -- THE MESSAGE NAMED A URL AND NOT THE SWITCH THAT MAKES IT EXIST, AND KEITH HIT THAT.
            // The bridge DOES serve https -- ai-bridge/server.js line ~19131 builds an https.createServer with
            // the same request handler, and getCreds() will GENERATE a self-signed cert into ai-bridge/certs/
            // if none is there -- BUT ONLY WHEN THE ENVIRONMENT VARIABLE HTTPS IS SET. Absent that, the URL
            // this message offered was a dead link, and `actionable: true` was a claim the reader could not
            // act on. NOTHING IN THE TREE SAID SO: a grep for HTTPS=1 across every .bat, .sh and .md returned
            // NOTHING. Naming a fix that does not exist is worse than naming no fix, because it sends somebody
            // to try it. ***
            message: "WebGPU needs a secure origin \u2014 this page is " + (loc.protocol || "http:") + "//" + host +
                     ", so the browser does not expose it here. THREE WAYS ROUND IT, CHEAPEST FIRST. " +
                     "(1) On the machine that is serving the page, open http://localhost:8787 \u2014 localhost " +
                     "counts as secure, no certificate involved. " +
                     "(2) FROM ANOTHER MACHINE, start the Public tunnel in the Tunnels panel: it hands back a " +
                     "https://*.trycloudflare.com address fronting this same port, with a PUBLICLY TRUSTED " +
                     "certificate \u2014 no browser warning at all. " +
                     "(3) Or restart the bridge with HTTPS=1 and use " + https + " \u2014 it generates a " +
                     "self-signed cert on first run, so the browser warns once per device.",
        };
    }
    return {
        available: false, reason: "no-webgpu", actionable: false,
        message: "this browser has no WebGPU \u2014 showing the SVG robot",
    };
}

/**
 * The fuller answer, when a caller can afford to await it. PRESENCE IS NOT CAPABILITY: navigator.gpu can exist
 * and still hand back no adapter, which renders as a blank canvas and a console line nobody reads.
 */
export async function probeAdapter(env = {}) {
    const first = describeWebGPU(env);
    if (!first.available) return first;
    try {
        const a = await env.navigator.gpu.requestAdapter();
        if (a) return { available: true, reason: "adapter", message: "", actionable: false };
        return { available: false, reason: "no-adapter", actionable: false,
                 message: "WebGPU is present but this system offered no adapter \u2014 showing the SVG robot" };
    } catch (e) {
        return { available: false, reason: "adapter-threw", actionable: false,
                 message: "WebGPU adapter request failed \u2014 showing the SVG robot" };
    }
}
