// ui/gaugeAttention.mjs -- v3661
//
// THE ATTENTION SLOT: which gauge row occupies position 2, and when it is allowed to change.
//
// Keith's spec, in his words: "when the old/dormant gauge row detects change, then swap switch to gauge row
// position 2. once in position, wait a sec for focus, then do morphicon number change, and at least wait a few
// seconds so gauge row 2 can be seen."
//
// *** THIS FILE IS THE POLICY AND NOTHING ELSE -- NO DOM, NO TIMERS, NO GAUGES. It is a pure function of
// (state, now, events) -> (state, actions), so the part that can actually be wrong can be graded headlessly.
// The wiring in server.html owns the DOM and owns nothing else. THE DECIDABLE PART IS THE PART THAT GETS A
// GATE; a state machine buried in a click handler is a state machine nobody can test. ***
//
// THE SEQUENCE, AND EVERY DELAY IN IT IS A NAMED CONSTANT RATHER THAN A NUMBER IN A setTimeout:
//
//   dormant row changes -> SETTLE (settleMs: it is in position but not yet读, so do not morph into a moving
//                          layout) -> MORPH (the digits roll) -> HOLD (holdMs: the minimum time it is allowed
//                          to stay, so a burst cannot flick three rows past faster than anyone can read)
//                       -> FREE (the next claimant may take the slot; if none, it stays put)
//
// *** THE MORPH RULE IS NOT MINE AND IS NOT NEGOTIABLE HERE. v3531 established it: a morph makes intermediate
// frames show shapes that are NOT VALID DIGITS, so it is only ever allowed on a number that rarely changes --
// on a fast one the reader is looking at a non-value most of the time, and a rendering artefact
// indistinguishable from a reading is this tree's most-repeated defect. Rows carry `morphable` and CPU-like
// rows must not set it. The policy REFUSES to emit a morph for a row that has not declared it. ***

export const PHASE = { IDLE: "idle", SETTLE: "settle", MORPH: "morph", HOLD: "hold" };

export const DEFAULTS = { settleMs: 1000, morphMs: 700, holdMs: 4000 };

/** A fresh policy state. `home` is the row that owns the slot when nobody is claiming it. */
export function initState(home, opts = {}) {
    return {
        cfg: { ...DEFAULTS, ...opts },
        current: home, home,
        phase: PHASE.IDLE, since: 0,
        queue: [],            // row ids waiting for the slot, oldest claim first
        seen: Object.create(null),   // rowId -> last value signature we have already reacted to
    };
}

/**
 * A row reports its current values. Returns TRUE if this is a change worth claiming the slot for.
 *
 * *** THE FIRST READING IS NEVER A CHANGE. A gauge set that has just mounted reports every value for the first
 * time, and treating that as "something happened" would fire the whole rotation on page load -- every row
 * claiming the slot at once, which is exactly the churn the hold exists to prevent. The first signature is
 * RECORDED SILENTLY. That is the same rule svgGaugeSet already applies to its own peer-count event (v1838). ***
 */
export function observe(state, rowId, signature, now) {
    const prev = state.seen[rowId];
    state.seen[rowId] = signature;
    if (prev === undefined) return false;          // first reading: learn it, do not react
    if (prev === signature) return false;
    if (rowId === state.current) return false;     // already on screen: no claim, nothing to swap to
    if (state.queue.indexOf(rowId) >= 0) return false;   // already waiting: one claim per row, not one per tick
    state.queue.push(rowId);
    void now;
    return true;
}

/**
 * Advance the machine. Returns { state, actions } where actions is a list of things the caller should DO:
 *   { type: "swap", row }    put this row in the slot
 *   { type: "morph", row }   roll the digits (only ever emitted for a row that declared morphable)
 *   { type: "release" }      the slot is free again
 * Pure: same inputs, same outputs, no clock of its own.
 */
export function step(state, now, rows) {
    const actions = [];
    const cfg = state.cfg;
    const rowOf = (id) => rows.find((r) => r.id === id) || null;

    if (state.phase === PHASE.SETTLE && now - state.since >= cfg.settleMs) {
        const r = rowOf(state.current);
        // THE REFUSAL: a row that has not declared morphable gets the slot and NO morph. It is not an error and
        // it is not skipped -- it simply holds, which is what a fast-moving row should do.
        if (r && r.morphable) actions.push({ type: "morph", row: state.current });
        state.phase = PHASE.MORPH; state.since = now;
    }
    if (state.phase === PHASE.MORPH && now - state.since >= cfg.morphMs) {
        state.phase = PHASE.HOLD; state.since = now;
    }
    if (state.phase === PHASE.HOLD && now - state.since >= cfg.holdMs) {
        state.phase = PHASE.IDLE; state.since = now;
        actions.push({ type: "release" });
    }
    // only an IDLE slot may be claimed -- this single line is the whole "at least wait a few seconds so gauge
    // row 2 can be seen" guarantee, and it is why holdMs cannot be defeated by a burst of changes.
    if (state.phase === PHASE.IDLE && state.queue.length) {
        const next = state.queue.shift();
        if (next !== state.current) {
            state.current = next;
            state.phase = PHASE.SETTLE; state.since = now;
            actions.push({ type: "swap", row: next });
        }
    }
    return { state, actions };
}

/** Total time a claim occupies the slot before anything else can take it. */
export const dwellMs = (cfg = DEFAULTS) => cfg.settleMs + cfg.morphMs + cfg.holdMs;
