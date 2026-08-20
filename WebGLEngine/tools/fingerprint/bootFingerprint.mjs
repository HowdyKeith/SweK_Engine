// tools/fingerprint/bootFingerprint.mjs
//
// v2838 -- A RIG CHECK AT STARTUP, so the next boot and every peer can ask "is this box still the same box?"
// without recomputing anything.
//
// computeFingerprint() takes about 1.3 seconds cold. That is far too slow to sit in the boot path, so this runs
// at IDLE and never blocks a frame. The engine starts exactly as fast as it did.
//
// THE CACHE IS THE WHOLE DESIGN, AND IT IS DESIGNED NOT TO LIE.
//
// A cache that only remembered "we computed a fingerprint once" would be worse than useless -- it would go quiet
// forever and hide the exact drift it exists to catch. So the record is keyed by BUILD, and the three cases are
// deliberately different:
//
//   NEW BUILD, no record        -> record it. A new version is allowed to have a new fingerprint; that is what
//                                  shipping means. This is a baseline, not a pass.
//   SAME BUILD, SAME master     -> quiet. Nothing changed, and nothing needed saying.
//   SAME BUILD, DIFFERENT master-> ALARM. This is the case worth building the whole thing for. The same version
//                                  of the same engine computed a different answer, which means either the
//                                  source was edited without bumping the version, or THIS MACHINE disagrees
//                                  with what this machine said last time. Both are things you want to hear
//                                  about immediately, and neither shows up any other way.
//
// FOR PEERS: the cached master is a single hex string, so a peer asking "do we agree?" is one string comparison
// against a value that was already computed. No peer ever has to make another box spend 1.3 seconds to answer.
//
// Pure except for localStorage and the idle scheduler, both of which are injectable so the whole thing gates
// headlessly with no browser.

export const STORE_KEY = "swek.bootFingerprint";

// A tiny storage shim so the module works in a page, in a worker, and in a test with no browser at all.
function memoryStore() {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}
export function defaultStore() {
    try { if (typeof localStorage !== "undefined" && localStorage) return localStorage; } catch { /* blocked by privacy settings is a normal state */ }
    return memoryStore();
}

export function readRecord(store = defaultStore()) {
    try {
        const raw = store.getItem(STORE_KEY);
        if (!raw) return null;
        const rec = JSON.parse(raw);
        // A record without a build or a master cannot be compared against anything, so it is not a record.
        if (!rec || typeof rec.build !== "string" || typeof rec.master !== "string") return null;
        return rec;
    } catch { return null; }          // corrupt JSON is the same as no record: start over, do not throw at boot
}

export function writeRecord(rec, store = defaultStore()) {
    try { store.setItem(STORE_KEY, JSON.stringify(rec)); return true; } catch { return false; }
}

// The comparison, separated from everything else so it can be tested without a fingerprint or a clock.
//   -> { status: "baseline" | "match" | "DRIFT", ... }
export function compareToRecord(build, master, previous) {
    if (!previous) return { status: "baseline", build, master, message: "first fingerprint recorded for " + build };
    if (previous.build !== build) {
        return { status: "baseline", build, master, previousBuild: previous.build, previousMaster: previous.master,
                 message: "new build " + build + " (was " + previous.build + ") -- recording its fingerprint" };
    }
    if (previous.master === master) return { status: "match", build, master, message: "fingerprint unchanged for " + build };
    // THE ALARM. Same build, different answer.
    return {
        status: "DRIFT", build, master, previousMaster: previous.master,
        message: "SAME BUILD " + build + " PRODUCED A DIFFERENT FINGERPRINT. Either the source changed without a version bump, or this machine no longer agrees with itself. was " + previous.master.slice(0, 16) + "... now " + master.slice(0, 16) + "...",
    };
}

// Schedule work for when the engine is not busy. requestIdleCallback where it exists, a timeout otherwise --
// never synchronously, because a 1.3 second stall at startup is exactly what this must not cost.
function scheduleIdle(fn, delayMs) {
    if (typeof requestIdleCallback === "function") { requestIdleCallback(() => fn(), { timeout: 8000 }); return; }
    if (typeof setTimeout === "function") { setTimeout(fn, delayMs); return; }
    fn();
}

// The boot entry point. Returns immediately; the result arrives via onResult.
//
// computeFingerprint is INJECTED rather than imported here, so this module carries no dependency on the
// fingerprint implementation and a test can drive every branch with a stub.
export function runAtBoot({ build, computeFingerprint, store = defaultStore(), onResult = null, delayMs = 3000, schedule = scheduleIdle } = {}) {
    if (!build || typeof computeFingerprint !== "function") {
        const bad = { status: "skipped", message: "boot fingerprint needs a build id and a computeFingerprint function" };
        if (onResult) onResult(bad);
        return bad;
    }
    schedule(() => {
        let outcome;
        try {
            const t0 = (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
            const { master, subsystems } = computeFingerprint();
            const ms = ((typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now()) - t0;
            const previous = readRecord(store);
            outcome = { ...compareToRecord(build, master, previous), subsystems: subsystems ? subsystems.length : null, ms: Math.round(ms), when: new Date().toISOString() };
            // Record on baseline AND on drift: the drift becomes the new reference, so the alarm fires once
            // rather than on every boot forever. A warning that repeats every time is a warning nobody reads.
            if (outcome.status !== "match") writeRecord({ build, master, when: outcome.when }, store);
        } catch (e) {
            // A fingerprint failure must never break the engine's startup. Report it, keep going.
            outcome = { status: "error", build, message: "fingerprint failed: " + String((e && e.message) || e) };
        }
        if (onResult) { try { onResult(outcome); } catch { /* an observer must not break the boot either */ } }
    }, delayMs);
    return { status: "scheduled", build };
}

// What a peer asks for. No recomputation: this is the value already on disk, or null if this box has not
// computed one yet -- and null is an honest answer rather than a zero.
export function attestation(store = defaultStore()) {
    const rec = readRecord(store);
    return rec ? { build: rec.build, master: rec.master, when: rec.when || null } : null;
}

// Compare this box against a peer's attestation. Same build and same master is the only agreement that means
// anything; agreeing across DIFFERENT builds would be a coincidence, not a check.
export function agreesWith(peerAttestation, store = defaultStore()) {
    const mine = attestation(store);
    if (!mine || !peerAttestation) return { agree: false, reason: "one side has no fingerprint yet" };
    if (mine.build !== peerAttestation.build) return { agree: false, reason: "different builds (" + mine.build + " vs " + peerAttestation.build + ") -- not comparable" };
    return mine.master === peerAttestation.master
        ? { agree: true, build: mine.build, master: mine.master }
        : { agree: false, reason: "SAME BUILD, DIFFERENT FINGERPRINT -- these two machines do not compute the same physics", build: mine.build, mine: mine.master, theirs: peerAttestation.master };
}
