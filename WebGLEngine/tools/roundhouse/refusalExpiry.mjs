// tools/roundhouse/refusalExpiry.mjs
//
// *** NOTHING WATCHED THE REFUSALS FOR THEIR OWN EXPIRY CONDITIONS COMING TRUE. ***
//
// A device may decline to declare a plant, and that is a legitimate, valuable answer: composeBind measured that
// every finite number it reports belongs to the two devices being compared, and beamBind measured that no key
// selectively separates the free-end asymmetry. Inventing a plant to satisfy the census would MANUFACTURE
// coverage, which is worse than an honest gap.
//
// But a refusal is a claim about the tree AS IT IS TODAY, and the tree moves. composeBind's own words: "EXPIRES
// IF a comparison pair with sample counts on both sides is added". That sentence was written down and nothing
// ever evaluated it, so the day somebody adds such a pair the refusal goes on standing -- A CORRECT REFUSAL
// QUIETLY BECOMING A STALE ONE, which is the same species as a suppression nobody audits and the same species as
// the v3195 hilbert.mjs entry that sat stale for seven rounds.
//
// *** THE EXPIRY IS A PREDICATE, NOT A SENTENCE, AND THAT IS THE WHOLE DESIGN DECISION. *** curriculum.mjs's own
// note explains why: "the refusal is read as A FIELD, never grepped out of prose -- a mention test is the species
// of claim this tree has got wrong three times this session alone." An expiry parsed out of the sentence stating
// it would inherit exactly that flaw. So each refusing device exports plantRefusedExpiry(), a function returning
// { expired, evidence }, and this module runs them.
//
// AND A REFUSAL WITH NO PREDICATE IS REPORTED AS ITS OWN STATE rather than folded into "not expired". Those are
// two populations: one has been asked and answered no, the other has never been asked. Folding them would make
// an unwatched refusal indistinguishable from a watched one, which is the failure this file exists to end.

export const STATE_STANDS = "stands";       // asked, and the condition has not come true
export const STATE_EXPIRED = "expired";     // asked, and it HAS -- the refusal is now stale
export const STATE_UNWATCHED = "unwatched"; // declared a refusal and no expiry predicate: permanent by default
export const STATE_BROKEN = "broken";       // the predicate threw; NOT the same as "stands"

/**
 * Every declared plant refusal, with the verdict of its own expiry condition.
 * Returns an array so the caller can see all of them; never throws.
 */
export async function refusalExpiries() {
    const out = [];
    let D;
    try { D = await import("./devices.mjs"); }
    catch { return out; }   // no registry: nothing to report, and inventing entries would be worse

    for (const name of D.DEVICE_NAMES || []) {
        let dev;
        try { dev = await D.getDevice(name); }
        catch { continue; }                       // a device that will not load is not a refusal
        const src = (dev && dev.module) || dev;
        const refusal = src && src.plantRefused;
        if (typeof refusal !== "string" || !refusal) continue;

        const fn = src.plantRefusedExpiry;
        if (typeof fn !== "function") {
            out.push({ name, refusal, state: STATE_UNWATCHED, expired: null,
                       evidence: "no plantRefusedExpiry predicate: this refusal is PERMANENT BY DEFAULT. It has "
                               + "not been shown to still hold -- nobody is asking." });
            continue;
        }
        try {
            const r = await fn();
            const expired = r && r.expired === true;
            out.push({ name, refusal, state: expired ? STATE_EXPIRED : STATE_STANDS, expired,
                       // The observable the condition turned on, and its value. A TEXT TEST ON THE EVIDENCE
                       // WOULD BE A SPELLING TEST: compose's measured value is null -- a real measurement, and
                       // one with no numeral in it. The fields make the claim structural.
                       observable: r && r.observable, measured: r ? r.measured : undefined,
                       hasMeasurement: !!(r && typeof r.observable === "string" && "measured" in r),
                       evidence: (r && r.evidence) || "" });
        } catch (e) {
            // A predicate that throws has NOT shown the refusal still holds. Calling that "stands" would be the
            // worst direction: the watch goes quiet exactly when it stops working.
            out.push({ name, refusal, state: STATE_BROKEN, expired: null,
                       evidence: "the expiry predicate threw: " + String((e && e.message) || e).slice(0, 160) });
        }
    }
    return out;
}

/** One line per refusal, for an operator. Never collapses the four states into two. */
export function reportLines(rows) {
    const L = ["[refusalExpiry] every declared plant refusal, and whether its own condition has come true"];
    if (!rows.length) { L.push("  no plant refusals declared in the registry"); return L; }
    for (const r of rows) L.push("  " + r.state.toUpperCase().padEnd(10) + r.name.padEnd(18) + r.evidence.slice(0, 150));
    const bad = rows.filter((r) => r.state !== STATE_STANDS);
    L.push(bad.length
        ? "  *** " + bad.length + " of " + rows.length + " need attention: " + bad.map((r) => r.name + " (" + r.state + ")").join(", ")
        : "  all " + rows.length + " refusals asked and still standing");
    return L;
}
