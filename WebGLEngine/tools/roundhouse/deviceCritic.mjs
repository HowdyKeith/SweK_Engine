// tools/roundhouse/deviceCritic.mjs -- v2850
//
// A DETERMINISTIC CRITIC for device claims, wired into the roleDecompose roundtrip.
//
// v2789 built roleDecompose -- proposer drafts, critic critiques, proposer revises, and only THEN does the gate
// verify. It was gated and then used by nothing for sixty-one versions, which is how the v2847 graveyard census
// found it. This is what makes it worth wiring now: v2827's bench separates outcomes into CRYSTALLISED,
// REFUSED and MALFORMED, so for the first time there is an instrument that can say whether a critic helps.
//
// THE CRITIC IS CODE, NOT A MODEL, AND THAT IS THE POINT. Every malformed outcome the bench counts has a
// mechanical cause -- no claim, no observable named, an observable this device does not have, no comparator --
// and every one of those is answerable by LOOKING AT THE DEVICE. Asking a second model whether the first model
// named a real observable would be slower, cost a call, and could itself be wrong. A deterministic critic
// cannot hallucinate, cannot rate-limit, and costs nothing.
//
// SO THE PREDICTION IS SHARP, AND THAT IS WHY IT IS WORTH RUNNING RATHER THAN ASSUMING:
//     MALFORMED should FALL      -- the critic hands back the exact observable menu and the proposer retries
//     REFUSED should NOT fall    -- a critic cannot make a wrong claim true; only the physics decides that
// If both fall, the critic is doing more than it should and that wants explaining. If neither falls, the module
// has earned deletion rather than a wiring.
//
// THE LIMIT, FOUND BY THE GATE RATHER THAN ASSUMED: a device DECLARES its full observable list, but each MODE
// produces only a subset -- the chaos device declares seventeen observables and mode "lyapunov" yields six. This
// critic reads the DECLARED list, so it catches "that observable does not exist on this device" and cannot catch
// "that observable exists but this mode does not produce it". Malformed therefore falls a long way and not to
// zero, and pretending otherwise would be the more comfortable claim rather than the true one.
//
// v2853 -- THE ROUNDTRIP ITSELF COMES FROM roleDecompose.mjs RATHER THAN BEING REIMPLEMENTED HERE. v2850 built
// this critic and left roleDecompose still unused, which was a miss: the propose/critique/revise loop is exactly
// what roleRoundtrip already is, and writing a second copy is the drift the Gemini caller was careful to avoid in
// v2824. One definition of what a roundtrip is; this file supplies only the CRITIC.
import { roleRoundtrip } from "./roleDecompose.mjs";
import { hintsFor } from "./skillbook.mjs";

// The failure classes numericVerdict reports, restated as questions a critic can ask BEFORE a device runs.
export function critiqueClaim(claim, observables) {
    const issues = [];
    if (!claim || typeof claim !== "object") {
        return { ok: false, issues: ["No claim at all. Respond with JSON containing a claim object."] };
    }
    const obs = claim.observable;
    if (!obs) {
        issues.push(`The claim names no observable. Choose exactly one from: ${observables.join(", ")}`);
    } else if (!observables.includes(obs)) {
        // The single most useful thing a critic can say: not "wrong" but "here is the menu, and here is the
        // nearest thing to what you asked for".
        const near = nearest(obs, observables);
        issues.push(`"${obs}" is not an observable of this device. Valid: ${observables.join(", ")}.${near ? ` Did you mean "${near}"?` : ""}`);
    }
    const hasComparator = ["max", "min", "target", "equals", "withinBracket"].some((k) => claim[k] !== undefined);
    if (!hasComparator) {
        issues.push('The claim has no comparator. Add one of: max, min, target (with tol), equals, or withinBracket.');
    }
    if (claim.target !== undefined && claim.tol === undefined) {
        issues.push('A "target" needs a "tol" beside it, or the claim can never be satisfied.');
    }
    return { ok: issues.length === 0, issues };
}

// Cheap edit distance, so the critic can suggest rather than only reject. A proposer that mistyped
// "airyRingErrFrac" as "airyRingErr" gets told the name, not just that it was wrong.
export function nearest(word, list) {
    let best = null, bestD = Infinity;
    for (const cand of list) {
        const d = distance(String(word).toLowerCase(), cand.toLowerCase());
        if (d < bestD) { bestD = d; best = cand; }
    }
    // only suggest when it is genuinely close -- a wild guess suggestion is worse than none
    return bestD <= Math.max(3, Math.ceil(String(word).length * 0.4)) ? best : null;
}
function distance(a, b) {
    const m = a.length, n = b.length;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}

// Wrap a model caller so the proposer role goes through a propose/critique roundtrip before the device sees it.
// The device loop cannot tell the difference -- it still receives one claim from one call.
// v3397 -- *** THE SKILLBOOK GETS ITS CALLER. *** It shipped at v3395 with hintsFor() reachable from nothing --
// the shipping-with-no-caller pattern this tree keeps finding, and the patch's own author named it first.
//
// THE HINTS ARE KEPT OUT OF `issues` ON PURPOSE, AND THAT IS THE WHOLE DESIGN. An issue is a MECHANICAL FACT the
// critic derived by looking at the device -- "that observable does not exist, here is the menu". A hint is
// ADVICE FROM A STATISTICAL BOOK, believed because a two-arm trial cleared a noise bar. Those are different
// kinds of thing and a proposer should be able to tell them apart; appending a hint to `issues` would make a
// strategy that survived a z-test indistinguishable from a name read straight off the device.
//
// THE BOOK IS READ ONCE PER withCritic, not once per critique -- a disk read inside the loop would put file I/O
// on every turn of an agent roundtrip.
//
// *** AND THE CLAIM THIS MAKES IS "REACHABLE", NOT "BETTER". THE SHIPPED BOOK IS EMPTY, so this round changes
// NO BEHAVIOUR AT ALL, and its gate proves exactly that: with an empty book every payload is BIT-IDENTICAL to
// the version before the wiring. *** Measuring whether a hint helps needs a real caller and a real trial, which
// is a rig job -- and saying "wired" while meaning "improved" is the overclaim this tree exists to refuse.
export function withCritic(callModel, device, { maxRounds = 2, onTurn = null, skillbook = null } = {}) {
    const observables = (device && device.observables) || [];
    let book = null;
    try { book = hintsFor.length >= 0 ? (skillbook || null) : null; } catch { book = null; }
    return async (role, payload) => {
        if (role !== "proposer") return callModel(role, payload);

        let round = 0;
        const { candidate } = await roleRoundtrip({
            task: payload,
            maxRounds,
            // The critique is handed back as part of the payload, so the proposer sees WHY it was rejected --
            // a critic that only says "no" is not a critic.
            propose: (task, critiques) => callModel("proposer", critiques && critiques.length ? { ...task, critiques } : task),
            critique: (task, cand) => {
                const verdict = critiqueClaim(cand && cand.claim, observables);
                // Only PROVEN strategies come back, and only for triggers THIS verdict actually raised. An empty
                // book yields an empty array, which is dropped below rather than attached as `hints: []` -- an
                // empty field is still a field, and it would move every payload this round claims not to touch.
                let hints = [];
                if (!verdict.ok) {
                    try { hints = hintsFor(verdict.issues, book ? { book } : {}).hints || []; } catch { hints = []; }
                }
                if (hints.length) verdict.hints = hints;
                if (onTurn) { try { onTurn({ round: round++, candidate: cand, verdict }); } catch { /* an observer must not break the loop */ } }
                return verdict;
            },
        });
        return candidate;
    };
}
