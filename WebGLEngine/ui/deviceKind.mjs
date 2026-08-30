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

export const KINDS = ["android", "ios", "mac-or-ipad", "steamdeck", "desktop", "unknown"];

// *** v4147 -- THE STEAM DECK IS DETECTED BY ITS PANEL, NOT BY ITS USER AGENT, BECAUSE IT HAS NO USER AGENT. ***
//
// Keith asked whether the resolution could be read when the page loads. It can, and it is the only usable
// signal: a Deck in Desktop Mode runs ordinary Chromium on ordinary Linux and its UA is INDISTINGUISHABLE from
// any other Linux desktop. There is no "SteamOS" token to test.
//
// The panel is distinctive: 1280x800, a 16:10 ratio, IDENTICAL ON THE LCD AND THE OLED (7" vs 7.4", 225 vs 255
// PPI, same pixels). Verified against Valve's published specs rather than remembered.
//
// *** BUT A RESOLUTION IS A HINT AND NOT AN IDENTITY, SO IT IS NEVER ALLOWED TO BE THE WHOLE TEST. *** Three
// signals must agree -- a Linux desktop token, the exact panel, and a touchscreen -- because 1280x800 alone is
// a resolution other hardware has had for twenty years, and this file's whole discipline is that a wrong answer
// must cost a highlight nobody wanted rather than a claim.
//
// *** AND THE MISS IS DELIBERATE: A DOCKED DECK IS NOT DETECTED. *** Docked, it drives an external display at
// up to 4K, so the panel test fails and the answer falls through to plain `desktop` -- which is CORRECT, both
// because that is genuinely what it looks like and because a docked Deck is being used as a desktop. A missed
// Deck loses a highlight; a Deck-shaped guess applied to every 1280x800 Linux box would put the wrong button
// in front of people who are not holding one.
//
// NOT VERIFIED ON HARDWARE -- no physical Deck has run this, exactly as steamdeck-peer.html says of everything
// else. The numbers come from Valve's specs; whether SteamOS's Chromium reports them through devicePixelRatio
// the way this assumes is the one thing a real Deck will settle.
export const STEAMDECK_PANEL = Object.freeze({ w: 1280, h: 800 });

/** Physical pixels, so a scaled desktop still reports the panel it actually has. Null when unknowable. */
function physicalScreen(nav) {
    const s = nav && nav.screen;
    if (!s || !Number.isFinite(s.width) || !Number.isFinite(s.height)) return null;
    const dpr = Number.isFinite(nav.devicePixelRatio) && nav.devicePixelRatio > 0 ? nav.devicePixelRatio : 1;
    return { w: Math.round(s.width * dpr), h: Math.round(s.height * dpr) };
}

/** The Deck's panel, in either orientation. */
function isDeckPanel(px) {
    if (!px) return false;
    const { w, h } = STEAMDECK_PANEL;
    return (px.w === w && px.h === h) || (px.w === h && px.h === w);
}

// *** AND THERE IS A SECOND, BETTER SIGNAL, WHICH KEITH ASKED FOR BY NAME: "does it report its info elsewhere".
// IT DOES. *** render/glBootstrap.js already has probeGpuString(), which reads UNMASKED_RENDERER_WEBGL -- and a
// Deck's APU is a specific part, "Van Gogh" (AMD Custom GPU 0405), which Mesa's RADV names in that string.
//
// THIS ROUTE SURVIVES DOCKING AND THE PANEL ROUTE DOES NOT. Docked to a 4K display the resolution test fails,
// but the GPU is still the same GPU -- so the two routes cover each other's blind spot, which is why both are
// here rather than the "better" one replacing the other.
//
// *** THE TOKENS ARE UNVERIFIED AND THAT IS WHY THIS IS ONE OF TWO ROUTES AND NOT THE ONLY ONE. *** No Deck has
// reported its renderer string here; these come from the part name, and driver strings vary by Mesa version.
// If they are wrong the panel route still works handheld, and the answer degrades to `desktop` rather than to
// something false -- a wrong token list costs a highlight, never a wrong claim.
const DECK_GPU = /van\s*gogh|amd custom gpu 0405/i;

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

    // *** THE STEAM DECK, CHECKED BEFORE THE GENERIC DESKTOP LINE BECAUSE IT WOULD OTHERWISE BE SWALLOWED BY IT
    // -- the same ordering reason Android is tested before Linux at the top of this function. ***
    if (/X11|Linux/i.test(s) && !/Windows NT|CrOS/i.test(s)) {
        const px = physicalScreen(nav);
        const gpu = typeof nav.gpu === "string" ? nav.gpu : "";
        // ROUTE 1 -- the GPU part names itself. Survives docking, since the GPU does not change with the display.
        if (DECK_GPU.test(gpu)) {
            return { kind: "steamdeck", confident: true, why: "Linux, and the GPU reports as the Deck's own part: " + gpu.slice(0, 40) };
        }
        // ROUTE 2 -- the handheld panel, and ONLY with touch alongside it. 1280x800 is a resolution plenty of
        // hardware has had; 1280x800 AND a touchscreen AND Linux is a much narrower room to be standing in.
        if (isDeckPanel(px) && Number.isFinite(touch) && touch > 0) {
            return { kind: "steamdeck", confident: true, why: "Linux, a " + px.w + "x" + px.h + " panel and " + touch + " touch point(s) -- the Deck's handheld display" };
        }
        // NOT A DECK, OR A DOCKED ONE. Falling through is the right answer for both: a docked Deck IS being
        // used as a desktop, and saying "desktop" about it is true rather than a failure to notice.
        return { kind: "desktop", confident: true, why: px ? "Linux at " + px.w + "x" + px.h + (Number.isFinite(touch) ? ", touch " + touch : "") : "a desktop platform token" };
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
    if (kind === "steamdeck") return "/steamdeck-peer.html";   // v4147
    return null;
}

/** Convenience for a page: classify from the live browser. Returns the same shape. */
export function detect(win = (typeof window !== "undefined" ? window : null)) {
    if (!win || !win.navigator) return { kind: "unknown", confident: false, why: "no navigator -- not a browser" };
    // v4147 -- screen + devicePixelRatio for the Deck's panel route. `gpu` is NOT read here: probing it costs a
    // WebGL context, and a detector that allocates one on every page load would be paying for a highlight. The
    // CALLER passes it when it already has the string -- server.html does, from glBootstrap's cached probe.
    return classify(win.navigator.userAgent, {
        maxTouchPoints: win.navigator.maxTouchPoints,
        platform: win.navigator.platform,
        screen: win.screen ? { width: win.screen.width, height: win.screen.height } : null,
        devicePixelRatio: win.devicePixelRatio,
        gpu: typeof win.__swekGpuString === "string" ? win.__swekGpuString : "",
    });
}
