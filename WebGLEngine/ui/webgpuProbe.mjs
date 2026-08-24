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
// http://192.168.10.53:8787 -- A LAN IP, WHICH IS NEITHER -- THE BROWSER DOES NOT EXPOSE IT AT ALL. So the same
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
        // *** v3981 -- THE ROUTE-(1) URL IS NOW THIS PAGE, NOT A GUESS AT WHICH PAGE. *** It said
        // "open http://localhost:8787" with the port HARDCODED and the path DROPPED, so a reader on any other
        // port was told a wrong address, and every reader was landed on the site root and left to navigate back
        // to whatever they had been looking at. Keith: "if we have to switch to localhost, then can a link say
        // click this localhost link to run?" -- the answer needs the port and the path it is standing on, both
        // of which are right here in `loc`. Same origin, same page, same query.
        const port = loc.port ? ":" + loc.port : "";
        const localUrl = "http://localhost" + port + (loc.pathname || "/") + (loc.search || "");
        return {
            localUrl, httpsUrl: https,
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
                     "(1) ON THE MACHINE SERVING THIS PAGE, open " + localUrl + " \u2014 that is THIS SAME PAGE " +
                     "over localhost, which counts as secure with no certificate involved. It will NOT work " +
                     "from a different device, because localhost there is that device. " +
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

const _esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * The same explanation with route (1) as a REAL CLICKABLE LINK to this same page over localhost.
 *
 * *** WHY THIS IS A SEPARATE FUNCTION AND NOT AN `html` FIELD ON THE RESULT. *** Pages consume `message` two
 * different ways -- some do `el.textContent = p.message`, some do `throw new Error(p.message)` and land it in
 * an `innerHTML` at the catch site. Putting markup in `message` would render as a link in half of them and as
 * literal `<a href=...>` in the other half, and the half that broke would be the half that never touches this
 * code again. `message` stays plain text and is always right; a page that wants the link asks for it.
 *
 * THE LINK IS HONEST ABOUT WHO IT HELPS: localhost resolves on the CLICKER'S machine, so this only works for a
 * reader sitting at the box that serves the page. That is stated next to the link rather than discovered.
 * @param {{reason?:string, localUrl?:string, message?:string}} probe a describeWebGPU() result
 * @returns {string} HTML, or "" when there is no origin problem to explain
 */
/**
 * Put the clickable route-(1) link ON THE PAGE, once, at the top.
 *
 * *** WHY A BANNER RATHER THAN ONE MORE FIELD FOR EACH PAGE TO RENDER. *** The thirteen pages that consult this
 * probe dispose of the answer six different ways -- `throw new Error(p.message)` caught somewhere else and put
 * through innerHTML, a `fallback()` helper, a `row()` in a table, a string returned as `why`, and two that run
 * it through an HTML escaper. Threading a link through all six paths means six chances to render `<a href=...>`
 * as literal text, and the page that breaks is the one nobody opens again. This touches none of them: it adds
 * its own element and leaves each page's existing message exactly as it was.
 *
 * Idempotent -- a page that probes twice gets one banner. Returns false when there is nothing to say.
 * @param {object} probe a describeWebGPU() result
 * @param {Document} [doc] injected rather than reached for, so the module stays testable without a browser
 */
export function showOriginBanner(probe, doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    const html = originHelpHtml(probe);
    if (!d || !html || !d.body) return false;
    if (d.getElementById("swek-origin-banner")) return true;
    const el = d.createElement("div");
    el.id = "swek-origin-banner";
    el.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:2147483000;background:#1a1206;" +
        "border-bottom:1px solid #6a4d12;color:#f0dfb0;font:12px/1.55 ui-monospace,Menlo,monospace;" +
        "padding:9px 14px;box-shadow:0 2px 14px rgba(0,0,0,.5)";
    el.innerHTML = html;
    d.body.appendChild(el);
    return true;
}

export function originHelpHtml(probe) {
    if (!probe || probe.reason !== "insecure-origin" || !probe.localUrl) return "";
    const u = _esc(probe.localUrl);
    return '<b>WebGPU needs a secure origin</b>, and this page is not one \u2014 so the browser does not expose it here.' +
        '<br><a href="' + u + '" style="color:#8fd1ff;font-weight:700">\u25b6 Click here to run it on localhost</a> ' +
        '<span style="opacity:.72">\u2014 same page, same server, but over <code>localhost</code>, which counts as secure. ' +
        'Only works if you are AT the machine serving this page; from another device use the Public tunnel instead.</span>';
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
