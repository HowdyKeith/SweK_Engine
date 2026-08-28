// ui/localModelProbe.js -- CAN THIS BOX RUN A GENERATIVE MODEL IN THE PAGE, ANSWERED BEFORE ANYTHING DOWNLOADS.
//
// v4007 -- Keith, on kessler/gemma-gem: "a page that reports whether this box can actually run it (WebGPU
// adapter, reported VRAM, model cache present) before anything downloads a gigabyte."
//
// *** THE ONE THING HE ASKED FOR THAT A BROWSER WILL NOT TELL YOU IS THE VRAM. *** There is no API for it.
// WebGPU deliberately does not expose device memory -- it is a fingerprinting surface -- and no amount of
// wanting it produces a number. What EXISTS is `adapter.limits.maxBufferSize` (the largest single allocation
// the driver will hand out) and, on newer Chrome, `adapter.info` naming the vendor and device. Those are
// PROXIES and they are labelled as proxies. A page that printed a confident "6 GB VRAM" from a guess would be
// worse than one that says the browser will not say, because somebody would plan against it.
//
// WHAT THIS FILE REFUSES TO DO:
//   - fetch a single byte of model weight. The whole point is answering before the gigabyte.
//   - report `navigator.gpu` as "WebGPU works". MEASURED: on this tree's headless Chromium `navigator.gpu` is
//     TRUE and `requestAdapter()` returns NULL. The namespace existing and an adapter existing are different
//     claims -- the same distinction the Bun.WebView probe makes one round earlier, met again in a day.
//   - answer "yes" from an absence. A limit it could not read is UNKNOWN, and unknown is not yes (v3103).
"use strict";

/**
 * The two Gemma builds gemma-gem ships, with the costs ITS README states. Kept as data with the source named,
 * because these are somebody else's numbers and a reader should be able to check them.
 */
export const MODELS = [
    { id: "E2B", label: "Gemma 4 E2B", bytes: 500e6, vramBytes: 4e9,
      note: "gemma-gem's README: ~500MB disk, 4GB VRAM" },
    { id: "E4B", label: "Gemma 4 E4B", bytes: 1.5e9, vramBytes: 6e9,
      note: "gemma-gem's README: ~1.5GB disk, 6GB VRAM" },
];

/** transformers.js caches weights through the Cache API under this name; finding it means a download happened. */
export const TRANSFORMERS_CACHE = "transformers-cache";

/**
 * *** AN ADAPTER THAT IS A SOFTWARE RENDERER IS NOT A GPU, AND requestAdapter() HANDS ONE BACK ANYWAY. ***
 *
 * Measured on this tree's headless Chromium: with WebGPU flags on, `requestAdapter()` returns an adapter whose
 * `info` reads `vendor: google, architecture: swiftshader`. SwiftShader is CPU emulation. A 4 GB model
 * "running" on it would be a machine doing matrix multiplies on the processor while reporting a GPU, which is
 * the most misleading possible green light -- the page would look capable and be unusable.
 *
 * The spec's `adapter.isFallbackAdapter` is the right way to ask, and IT IS ABSENT in this Chromium ("in"
 * returns false), so it is read WHEN PRESENT and these names are the fallback for when it is not. Pattern
 * matching on a vendor string is a weaker instrument than a flag and is labelled as one.
 */
export const SOFTWARE_HINTS = /swiftshader|llvmpipe|softwarerasterizer|microsoft basic render|lavapipe|warp/i;

const gb = (n) => (n / 1e9).toFixed(2) + " GB";

/**
 * *** WHICH ENGINE, BECAUSE persist() MEANS THREE DIFFERENT THINGS AND THE CALL WILL NOT SAY WHICH. ***
 *
 * `navigator.userAgentData.brands` is the structured answer and is preferred -- it is a list of brands, not a
 * string to pattern-match. IT IS SECURE-CONTEXT ONLY, WHICH IS EXACTLY WHERE THIS TREE KEEPS LANDING.
 *
 * MEASURED v4029, one browser, one session, two origins:
 *     http://localhost:34719/    isSecureContext true   userAgentData PRESENT  brands ["Chromium","Not?A_Brand"]
 *     http://192.0.2.2:34719/    isSecureContext false  userAgentData ABSENT   brands null
 *
 * So on the LAN-IP origin Keith opens by default, the good instrument is simply gone and the UA string is all
 * there is. That is why the fallback exists and why it is not dead code.
 *
 * ORDER MATTERS IN THE FALLBACK AND THE MEASURED UA IS WHY. Chromium's own UA reads:
 *     Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/141.0.0.0 Safari/537.36
 * It contains BOTH "AppleWebKit" AND "Safari". Testing for Safari first would call Chromium "webkit" and hand
 * back the wrong story with total confidence. Chromium is therefore ruled in before WebKit is considered.
 *
 * Returns null -- never a guess -- when nothing matches. An engine this cannot name is an engine whose persist()
 * behaviour it must not narrate (v3103: unknown is not yes, and here unknown is not "probably Chrome").
 */
export function engineHint(nav = typeof navigator !== "undefined" ? navigator : null) {
    if (!nav) return null;
    try {
        const brands = nav.userAgentData && nav.userAgentData.brands;
        if (Array.isArray(brands) && brands.length) {
            const names = brands.map((b) => String(b && b.brand || "")).join(" ");
            if (/chromium|google chrome|microsoft edge/i.test(names)) return "chromium";
        }
    } catch { /* userAgentData is not universal; the UA below is the fallback */ }
    const ua = String(nav.userAgent || "");
    if (!ua) return null;
    if (/firefox\/|\bfxios\b/i.test(ua)) return "firefox";
    if (/edg\/|edga\/|edgios\/|chrome\/|chromium\/|crios\//i.test(ua)) return "chromium";   // BEFORE webkit
    if (/safari\//i.test(ua) && /applewebkit/i.test(ua)) return "webkit";
    return null;
}

/**
 * What persist() does on each engine, WITH EACH LINE MARKED MEASURED OR DOCUMENTED. The distinction is the
 * point: this table is the thing that decides what a button promises a user, so a reader has to be able to see
 * which rows this tree actually drove and which it is repeating from a spec it did not run.
 *
 *   prompts  -- does a permission dialog get DRAWN on a persist() call from a user gesture?
 *   basis    -- what decides the answer instead, when nothing is drawn.
 *   remedy   -- what a user can actually DO after a denial. A denial with no remedy is a dead end, and the
 *               old message ("denied or dismissed") was exactly that.
 */
export const PERSIST_BEHAVIOUR = {
    chromium: {
        prompts: false,
        measured: true,   // v4029, Chromium 141 headed under Xvfb, trusted click: false in 1 ms, no UI drawn
        basis: "decided automatically from how established this site is to the browser, with no dialog at any point",
        remedy: [
            "bookmark this page, then reload and click again",
            "grant this origin notification permission, or install it as an app, if you would use it that way",
            "revisit it a few times -- Chromium's measure of an established site is built from real use over time",
        ],
    },
    firefox: {
        prompts: true,
        measured: false,  // DOCUMENTED, NOT DRIVEN HERE. No Firefox in this container -- said plainly, not implied.
        basis: "a real permission prompt, which is why an answer can take as long as a person takes",
        remedy: ["answer Allow on the prompt", "if it never appeared, this origin may already be blocked in Firefox's site permissions"],
    },
    webkit: {
        prompts: false,
        measured: false,  // DOCUMENTED, NOT DRIVEN HERE.
        basis: "decided by Safari's own rules for the origin, with no dialog",
        remedy: ["add this page to favourites or the home screen, then reload and click again"],
    },
};

/**
 * The honest sentence for a persist() result, given the engine. NEVER says "dismissed" on an engine that draws
 * nothing to dismiss -- that word invents a user action that did not happen and cannot happen.
 *
 * Pure: takes the result and the engine, returns a string. Kept out of the page so a gate can drive every
 * branch without a browser.
 */
export function persistExplain(result, engine) {
    const r = result || {};
    const b = engine ? PERSIST_BEHAVIOUR[engine] : null;
    const before = r.quotaBeforeBytes != null ? gb(r.quotaBeforeBytes) : "unknown";
    const after = r.quotaAfterBytes != null ? gb(r.quotaAfterBytes) : "unknown";
    if (r.available === false) return "storage.persist() is not available here";
    if (r.granted) {
        const raised = r.quotaAfterBytes != null && r.quotaBeforeBytes != null && r.quotaAfterBytes > r.quotaBeforeBytes;
        return "granted -- this origin's storage is no longer evictable. Quota was " + before + ", now reads " + after +
            (raised ? " (the browser raised it)"
                    : " (UNCHANGED -- persistence and quota size are separate things, and only the first was asked for)");
    }
    // *** THE BRANCH THAT WAS LYING. ***
    if (b && b.prompts === false) {
        // The word "dismissed" is deliberately absent, not merely negated. Telling someone who saw no dialog
        // that they did not dismiss one raises a question they did not have; "the click did register" is the
        // reassurance that was actually wanted.
        return "declined by the browser, and NO DIALOG WAS EVER SHOWN -- on this browser persist() is " + b.basis +
            ". The click did register. Quota stays at " + before +
            ". To change the answer: " + b.remedy.join("; ") + ".";
    }
    if (b && b.prompts === true) {
        return "declined -- " + b.basis + ", so this was either answered no or already blocked for this origin. " +
            "Quota stays at " + before + ". " + b.remedy.join("; ") + ".";
    }
    // Engine unknown: describe ONLY what was observed and name the absence rather than filling it in.
    return "declined by the browser. Quota stays at " + before +
        ". This browser could not be identified, so whether it shows a dialog for this is not known here.";
}

/**
 * Everything knowable without downloading. Every field is either a fact or null -- NEVER a default that reads
 * like a fact. `null` means "this browser did not tell us", which the verdict below treats as unknown.
 */
export async function probeLocalModel(nav = typeof navigator !== "undefined" ? navigator : null,
                                      win = typeof self !== "undefined" ? self : null) {
    const out = {
        secureContext: win ? !!win.isSecureContext : null,
        crossOriginIsolated: win ? !!win.crossOriginIsolated : null,
        gpuNamespace: !!(nav && nav.gpu),
        adapter: null, adapterInfo: null, features: null, limits: null, hasF16: null,
        softwareRenderer: null,   // an adapter that is CPU emulation is not a GPU -- see SOFTWARE_HINTS
        quotaBytes: null, usageBytes: null, cacheNames: null, modelCached: null,
        persistAvailable: null, persisted: null,
        vramBytes: null,          // *** ALWAYS NULL. There is no API. Kept as a field so its absence is VISIBLE. ***
        vramNote: "NOT EXPOSED BY ANY BROWSER. WebGPU withholds device memory deliberately (fingerprinting), " +
                  "so maxBufferSize below is the closest thing there is and it is a PROXY, not the VRAM.",
        // v4113 -- *** THE QUOTA IS A PROMISE, NOT A RESERVATION, AND THIS FILE WAS TREATING IT AS THE
        // AUTHORITY ON WHETHER A MODEL FITS. *** MEASURED on this tree, headless Chromium, one container:
        // a PERSISTENT profile reported a 162.33 GB quota on a filesystem with 28.73 GB actually free -- the
        // quota overstated real disk by 5.6x. So `quota >= model.bytes` can be TRUE for a download that will
        // still die partway through on a full disk, which is precisely the mid-gigabyte failure
        // localModelRun.js's preflightRepo() exists to prevent one layer up.
        //
        // FREE DISK IS NOT EXPOSED TO A PAGE EITHER -- same class of absence as VRAM, and handled the same
        // way: named rather than guessed. A page that subtracted a made-up "typical free space" would be
        // inventing the number this note exists to say nobody has.
        quotaNote: "A CEILING, NOT A RESERVATION. The browser may report a quota far larger than the disk can " +
                   "actually supply (measured on this tree: 162.33 GB reported against 28.73 GB really free, " +
                   "5.6x over), and free disk is not exposed to a page any more than VRAM is. Clearing this " +
                   "check means 'not ruled out', never 'there is room'.",
        // *** AND THE QUOTA MOVES WITH THE BROWSING CONTEXT FAR MORE THAN WITH THE DISK. *** Same container,
        // same 28.73 GB free, measured both ways: an incognito/ephemeral context reported 0.90 GB and a
        // persistent profile reported 162.33 GB -- a 180x swing from the context alone. That is why a refusal
        // here is worth checking against the window it happened in before it is read as a hardware limit.
        quotaContextNote: "Quota depends on the BROWSING CONTEXT more than on the disk: measured 0.90 GB in an " +
                          "incognito/ephemeral context and 162.33 GB in a persistent profile, on the same " +
                          "machine with the same free space. A private window can refuse a model a normal " +
                          "window would allow.",
        errors: [],
    };

    // THE ADAPTER, NOT THE NAMESPACE. requestAdapter() is the only thing that answers "is there a GPU here".
    if (out.gpuNamespace) {
        try {
            const a = await nav.gpu.requestAdapter();
            out.adapter = !!a;
            if (a) {
                try { out.features = [...a.features]; } catch (e) { out.errors.push("features: " + String(e).slice(0, 60)); }
                out.hasF16 = !!(a.features && a.features.has && a.features.has("shader-f16"));
                try {
                    out.limits = { maxBufferSize: a.limits.maxBufferSize,
                                   maxStorageBufferBindingSize: a.limits.maxStorageBufferBindingSize };
                } catch (e) { out.errors.push("limits: " + String(e).slice(0, 60)); }
                // adapter.info is newer Chrome and may be absent or empty -- absent is recorded as null.
                try { out.adapterInfo = a.info ? { vendor: a.info.vendor || null, architecture: a.info.architecture || null,
                                                  device: a.info.device || null, description: a.info.description || null } : null; }
                catch (e) { out.errors.push("info: " + String(e).slice(0, 60)); }
                // the spec's flag FIRST, the string match only when the flag is not implemented
                if ("isFallbackAdapter" in a) out.softwareRenderer = !!a.isFallbackAdapter;
                else if (out.adapterInfo) {
                    const blob = Object.values(out.adapterInfo).filter(Boolean).join(" ");
                    out.softwareRenderer = blob ? SOFTWARE_HINTS.test(blob) : null;
                }
            }
        } catch (e) { out.errors.push("requestAdapter: " + String(e).slice(0, 100)); }
    }

    // DISK, WHICH IS THE ONE THAT DECIDES MOST OFTEN. A model has to be cached to be used offline, and a quota
    // below the model size is a HARD no that costs nothing to discover.
    try {
        if (nav && nav.storage && nav.storage.estimate) {
            const e = await nav.storage.estimate();
            out.quotaBytes = typeof e.quota === "number" ? e.quota : null;
            out.usageBytes = typeof e.usage === "number" ? e.usage : null;
        }
    } catch (e) { out.errors.push("storage.estimate: " + String(e).slice(0, 60)); }
    // *** v4029 -- v4008's COMMENT HERE STATED AN INFERENCE AS A CONFIRMED FACT, AND IT REACHED A BUTTON. ***
    //
    // It said: permissions.query({name:"persistent-storage"}) reports "prompt", THEREFORE "a genuine dialog is
    // what shows". The first half is true. The second half does not follow, and it is FALSE on Chromium. The
    // word "prompt" is that permission's default state, not a promise that anything will ever be drawn.
    //
    // MEASURED v4029, real Chromium 141, over http://localhost, HEADED under Xvfb, from a REAL TRUSTED CLICK
    // (a genuine user gesture, not page load, not an untrusted dispatch):
    //
    //     permissions.query state : prompt
    //     persist() returned      : false in 1 ms      <- NOTHING WAS SHOWN. Nobody answers a dialog in 1 ms.
    //     quota before / after    : UNCHANGED
    //
    // Headless was checked first and ruled out as the cause by re-running headed with a display attached; a
    // CDP Browser.grantPermissions of "durableStorage" was also tried and the answer did not move. Keith saw
    // this from the other side: "when i click Request more storage (shows a real browser dialog) it quickly
    // says nothing downloaded". THE WORD "QUICKLY" WAS THE WHOLE REPORT and v4017 read it as a message being
    // clobbered. That was a real bug and fixing it was right, but it was not this one.
    //
    // So the button that said "shows a real browser dialog" promised UI THAT THIS ENGINE NEVER DRAWS. That is
    // this tree's "a flag that lies is worse than no flag" (v2579) wearing a label instead of a flag: a user
    // who is told to expect a dialog and sees none concludes the click did not register, and clicks again.
    //
    // Hence `engine` below. persist() is one call with THREE different user-visible stories behind it, and
    // which one is true is not knowable from the call -- only from who implemented it.
    try {
        if (nav && nav.storage) {
            out.persistAvailable = typeof nav.storage.persist === "function";
            if (typeof nav.storage.persisted === "function") out.persisted = await nav.storage.persisted();
        }
    } catch (e) { out.errors.push("storage.persist detection: " + String(e).slice(0, 60)); }
    out.engine = engineHint(nav);
    // NOT a fact about this run -- a documented-behaviour lookup keyed on the engine, and null when the engine
    // is unknown rather than a guess. See PERSIST_BEHAVIOUR for what is measured and what is merely documented.
    out.persistPromptExpected = out.engine ? PERSIST_BEHAVIOUR[out.engine].prompts : null;

    // IS ANYTHING ALREADY DOWNLOADED. Read-only: caches.keys() opens no cache and fetches nothing.
    try {
        if (typeof caches !== "undefined") {
            out.cacheNames = await caches.keys();
            out.modelCached = out.cacheNames.some((k) => /transformers|onnx|hf|huggingface/i.test(k));
        }
    } catch (e) { out.errors.push("caches.keys: " + String(e).slice(0, 60)); }

    return out;
}

/**
 * A verdict per model, and THREE outcomes rather than two.
 *
 *   "no"      -- a HARD fact rules it out. Named, and always something measured.
 *   "unknown" -- something needed could not be read. NOT a yes. The browser withholding VRAM means every
 *                verdict is at best "nothing rules it out", and saying so is the honest ceiling here.
 *   "maybe"   -- nothing measurable rules it out. THAT IS THE BEST ANSWER AVAILABLE and it is not "yes",
 *                because the one number that would decide it -- VRAM -- is the one nobody can read.
 */
export function verdictFor(facts, model) {
    const blockers = [], unknowns = [];
    if (facts.adapter === false) blockers.push("no WebGPU adapter (the namespace may exist and still hand back null)");
    else if (facts.adapter === null) unknowns.push("WebGPU adapter could not be queried");
    // v4016 -- *** THE REMEDY, NOT JUST THE REFUSAL. *** This said only "restricted", which is true and leaves a
    // reader stuck: Keith hit it twice in a row on http://<lan-ip>:8787 and then http://galaxina:8787 and read
    // the second as the page being broken. It is not a page bug and no code change can lift it -- a browser
    // grants WebGPU and persistent storage only to a POTENTIALLY TRUSTWORTHY ORIGIN, which means https, or
    // localhost / 127.0.0.1, and NOTHING else. A LAN IP and a plain hostname both fail that test even though
    // they reach the same server on the same machine. Naming the two origins that DO work turns a dead end into
    // one click. (Open-Engine.bat learned this at v3981 and switched to localhost for exactly this reason.)
    if (facts.secureContext === false) {
        blockers.push("not a secure context, so WebGPU and persistent storage are withheld by the browser -- " +
            "reach this page at http://localhost:PORT or http://127.0.0.1:PORT (or over https) instead. A LAN " +
            "IP or a bare hostname is not a trustworthy origin, even though it reaches the same server");
    }
    if (facts.quotaBytes !== null && facts.quotaBytes < model.bytes) {
        blockers.push("storage quota " + gb(facts.quotaBytes) + " is smaller than the model's " + gb(model.bytes));
    } else if (facts.quotaBytes === null) unknowns.push("storage quota unreadable");
    else {
        // v4113 -- *** PASSING THE QUOTA CHECK IS NOT THE SAME CLAIM AS "THERE IS ROOM", AND UNTIL NOW THE
        // VERDICT MADE NO DISTINCTION. *** The quota can exceed real free disk several-fold (see quotaNote),
        // so this is an UNKNOWN rather than a blocker -- v3103's rule in both directions: it cannot become a
        // "no" on a number nobody measured, and it must not be silently counted as a "yes" either.
        unknowns.push("the " + gb(facts.quotaBytes) + " quota is a browser CEILING, not a reservation -- free " +
            "disk is not exposed to a page, so a download that fits the quota can still run out of real space");
    }
    // A SOFTWARE ADAPTER IS A BLOCKER, NOT A WARNING. It is the case where the page would look capable and be
    // unusable, which is worse than reporting nothing at all.
    if (facts.softwareRenderer === true) {
        blockers.push("the WebGPU adapter is a SOFTWARE RENDERER (" +
            (facts.adapterInfo ? Object.values(facts.adapterInfo).filter(Boolean).join(" ") : "fallback adapter") +
            ") -- CPU emulation, not a GPU");
    }
    if (facts.hasF16 === false) unknowns.push("no shader-f16: the f16 builds most quantised models ship as cannot run, though an f32 build may");
    if (facts.limits && facts.limits.maxBufferSize !== undefined && facts.limits.maxBufferSize < 128e6) {
        blockers.push("maxBufferSize " + gb(facts.limits.maxBufferSize) + " is too small for a weight tensor");
    }
    // *** THE VRAM LINE IS ALWAYS AN UNKNOWN, AND THAT IS THE POINT OF THE THIRD STATE. ***
    unknowns.push("VRAM is not exposed to a page, so the model's stated " + gb(model.vramBytes) + " requirement cannot be checked here");
    // v4015 -- *** A SECOND SIGNAL THIS FILE ALREADY COLLECTED AND WAS DISCARDING. *** maxBufferSize was only
    // ever compared against a flat 128MB floor (the "too small for ANY tensor" blocker above); it was never
    // compared against THIS model's own stated requirement, even though both numbers are sitting right here.
    // A proxy reading well under the stated requirement cannot become a "no" -- it is still a proxy, not a
    // measurement of VRAM -- but staying silent about the gap discards a real hint the page already has.
    if (facts.limits && facts.limits.maxBufferSize !== undefined && facts.limits.maxBufferSize < model.vramBytes) {
        unknowns.push("the closest available proxy (" + gb(facts.limits.maxBufferSize) + ") is smaller than " +
            "this model's stated requirement (" + gb(model.vramBytes) + ") -- not conclusive, but worth knowing");
    }
    return {
        model: model.id,
        state: blockers.length ? "no" : "maybe",
        blockers, unknowns,
        cached: facts.modelCached === true,
    };
}

export function summarise(facts) {
    return MODELS.map((m) => verdictFor(facts, m));
}

/**
 * *** THE ESCALATION, AND WHAT IT DOES AND DOES NOT PROMISE. ***
 *
 * Calling navigator.storage.persist() asks the browser to stop treating this origin's storage as evictable
 * under disk pressure. THAT IS THE SPEC'S CLAIM. Whether the browser ALSO raises the numeric quota
 * estimate() reports is an OBSERVED BEHAVIOUR on some platforms, not a guarantee the spec makes -- so this
 * function reports the measured quota before and after rather than asserting a number. "2 GB" is something a
 * browser might do, not something this code claims it will do.
 *
 * REQUIRES A USER GESTURE. Called from a click handler it can show the real dialog; called from anywhere
 * else -- including this probe's own auto-run on page load -- most browsers refuse it silently, which is why
 * this is a SEPARATE function the page wires to a button rather than folded into probeLocalModel().
 */
export async function requestPersistentStorage(nav = typeof navigator !== "undefined" ? navigator : null) {
    const out = { available: false, granted: null, quotaBeforeBytes: null, quotaAfterBytes: null, error: null };
    if (!nav || !nav.storage || typeof nav.storage.persist !== "function") return out;
    out.available = true;
    try {
        const before = await nav.storage.estimate();
        out.quotaBeforeBytes = typeof before.quota === "number" ? before.quota : null;
    } catch (e) { out.error = "estimate before: " + String(e).slice(0, 60); }
    try {
        out.granted = await nav.storage.persist();
    } catch (e) { out.error = "persist(): " + String(e).slice(0, 80); return out; }
    try {
        const after = await nav.storage.estimate();
        out.quotaAfterBytes = typeof after.quota === "number" ? after.quota : null;
    } catch (e) { out.error = (out.error ? out.error + "; " : "") + "estimate after: " + String(e).slice(0, 60); }
    return out;
}
