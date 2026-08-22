// WebGLEngine/ui/deviceKind.mjs -- v3704
// ---------------------------------------------------------------------------------------------------------------
// WHAT KIND OF DEVICE IS LOOKING AT THIS PAGE? -- AND THE HONEST ANSWER IS SOMETIMES "I DO NOT KNOW".
//
// Nothing in this tree has ever branched on the device. The only matchMedia call anywhere is stateOrb.js asking
// about prefers-reduced-motion. android-peer.html and ios-peer.html both exist and are both linked from the top
// of server.html, so a phone gets the same wall of desktop panels as a workstation and has to find its own page.
//
// *** THIS RETURNS A KIND AND A CONFIDENCE, AND IT NEVER NAVIGATES. *** A detector that redirects is hostile the
// moment it is wrong, and user-agent sniffing is wrong regularly: it is a string the browser volunteers, any
// browser may lie in it, and desktop-mode toggles exist precisely so a phone can claim not to be one. So this
// OFFERS -- the caller shows a link the person may ignore -- and the shipped behaviour of a wrong answer is a
// link nobody clicks rather than a page nobody asked for.
//
// *** UNKNOWN IS NOT DESKTOP. *** The tempting shape is `isPhone ? phone : desktop`, which turns every failure
// of the test into a confident claim about a workstation. A user agent this cannot read returns "unknown" and
// the caller decides what to do with that -- the same distinction plantedCoverage draws between an undeclared
// plant and a dead one, and activity.mjs between an idle box and a peer that reported nothing.
//
// *** THE iPad IS THE TRAP AND IT IS WHY maxTouchPoints IS AN ARGUMENT. *** Since iPadOS 13 an iPad's user agent
// says "Macintosh; Intel Mac OS X" with no "iPad" anywhere in it, so a string test alone calls the most common
// tablet in the world a desktop. The discriminator is that a real Mac reports maxTouchPoints 0 while an iPad
// reports 5. A caller that cannot supply it gets "mac-or-ipad" -- A NAMED AMBIGUITY, NOT A GUESS.
"use strict";

export const KINDS = ["android", "ios", "mac-or-ipad", "desktop", "unknown"];

/**
 * @param {string} ua                navigator.userAgent
 * @param {object} nav               { maxTouchPoints, platform } -- optional; absence WIDENS the answer rather
 *                                   than narrowing it, which is the whole point of mac-or-ipad existing.
 * @returns {{kind:string, confident:boolean, why:string}}
 */
export function classify(ua, nav = {}) {
    const s = String(ua == null ? "" : ua);
    const touch = Number.isFinite(nav.maxTouchPoints) ? nav.maxTouchPoints : null;

    if (!s.trim()) return { kind: "unknown", confident: false, why: "no user agent string at all -- a headless or locked-down client, NOT a desktop" };

    // Android first: its UA also contains "Linux", so testing for Linux earlier would swallow every phone.
    if (/Android/i.test(s)) {
        // An Android TABLET omits "Mobile". Both are Android and both want the Android peer page, so the kind
        // is the same and the distinction is reported rather than acted on.
        return { kind: "android", confident: true, why: /Mobile/i.test(s) ? "Android, Mobile" : "Android, no Mobile token (a tablet)" };
    }

    if (/iPhone|iPod/i.test(s)) return { kind: "ios", confident: true, why: "iPhone/iPod in the user agent" };
    if (/iPad/i.test(s)) return { kind: "ios", confident: true, why: "iPad names itself (iPadOS 12 or earlier, or a browser that still says so)" };

    // *** THE iPadOS 13+ CASE. *** The UA is indistinguishable from a Mac; only the touch count separates them.
    if (/Macintosh/i.test(s)) {
        if (touch === null) return { kind: "mac-or-ipad", confident: false, why: "a Macintosh user agent with no touch count supplied -- SINCE iPadOS 13 AN iPad SAYS EXACTLY THIS, and without maxTouchPoints the two cannot be told apart" };
        if (touch > 1) return { kind: "ios", confident: true, why: "Macintosh user agent but maxTouchPoints " + touch + " -- an iPad; a real Mac reports 0" };
        return { kind: "desktop", confident: true, why: "Macintosh with maxTouchPoints " + touch };
    }

    if (/Windows NT|X11|Linux|CrOS/i.test(s)) return { kind: "desktop", confident: true, why: "a desktop platform token" };

    // NOT "probably desktop". A user agent nobody here recognises is a user agent nobody here recognises.
    return { kind: "unknown", confident: false, why: "no token this file recognises: " + s.slice(0, 60) };
}

/**
 * The peer page that belongs to a kind, or null.
 * *** null IS RETURNED FOR EVERY UNCERTAIN CASE, INCLUDING mac-or-ipad. *** Offering the iOS peer page to
 * something that is probably a Mac is worse than offering nothing: the link is wrong exactly when the person is
 * least able to tell, and a desktop user who follows it lands on a page built for a phone.
 */
export function peerPageFor(kind) {
    if (kind === "android") return "/android-peer.html";
    if (kind === "ios") return "/ios-peer.html";
    return null;
}

/** Convenience for a page: classify from the live browser. Returns the same shape. */
export function detect(win = (typeof window !== "undefined" ? window : null)) {
    if (!win || !win.navigator) return { kind: "unknown", confident: false, why: "no navigator -- not a browser" };
    return classify(win.navigator.userAgent, {
        maxTouchPoints: win.navigator.maxTouchPoints,
        platform: win.navigator.platform,
    });
}
