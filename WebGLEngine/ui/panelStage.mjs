// ui/panelStage.mjs -- v3667
//
// THE LEFT-HAND STAGE: a right-column panel is MOVED into the space the gauges and avatar occupy, and moved
// back exactly where it came from.
//
// Keith: "when a panel is to be shown on server.html, it goes from the right side, to replacing the
// gauges/info/avatar and be presented there instead... and we should have the vertical docked small svg to
// move to the left side of that presented panel."
//
// *** THE PANEL IS MOVED, NEVER CLONED, AND THAT IS THE WHOLE DESIGN. *** These panels are LIVE: they carry
// event listeners, poll timers, half-typed form state, open <details>, scroll positions and in-flight fetches.
// cloneNode copies markup and NOTHING ELSE -- the copy would look identical and be dead, and the original
// would keep polling invisibly behind it. A clone is two declarations of one panel, which is this tree's most
// repeated defect wearing a UI costume.
//
// *** AND IT MUST GO BACK TO THE EXACT PLACE IT LEFT, WHICH IS WHY THERE IS AN ANCHOR. *** Remembering the
// parent is not enough and remembering an INDEX is worse: the right column gains and loses nodes while a panel
// is on stage (a status chip appears, a drawer builds itself), so an index recorded on the way out points
// somewhere else on the way back. A zero-width anchor node left in the gap MOVES WITH ITS SIBLINGS, so the
// panel returns between the same two neighbours however the column has changed underneath it.
//
// PURE DOM, INJECTABLE doc: no timers, no fetches, no knowledge of what any panel contains. The gate drives it
// against a stub.

/**
 * @param opts.doc          document (injectable for the gate)
 * @param opts.stageHost    where a presented panel is put
 * @param opts.rail         optional element moved out of its home while anything is presented
 * @param opts.railHost     where the rail goes while presenting. DEFAULTS TO stageHost, which is where it went
 *                          before v3812 and is what keeps ui/panelStage-selfcheck's original ordering true. A
 *                          caller passing a DIFFERENT container gets the rail beside the stage rather than
 *                          inside it -- server.html uses that to put the info panel to the RIGHT of a panel of
 *                          fixed width, so a wide panel and a narrow one leave the layout in the same place.
 *                          THE MODULE DOES NOT DECIDE LEFT OR RIGHT: it puts the rail where it is told, and
 *                          which side that is on screen is the caller's stylesheet's business.
 * @param opts.railHome     where the rail lives when nothing is presented (required if rail is given)
 * @param opts.onPresent/onRestore  called after the move, for chrome the caller owns
 */
export function makeStage(opts = {}) {
    const doc = opts.doc || (typeof document !== "undefined" ? document : null);
    const stageHost = opts.stageHost, rail = opts.rail || null, railHome = opts.railHome || null;
    // Defaulting to stageHost rather than requiring it: every caller before v3812 passed no railHost and must
    // keep behaving exactly as it did, which the original gate's ordering check asserts.
    const railHost = opts.railHost || opts.stageHost;
    let live = null;                      // { el, anchor }

    const anchorFor = () => {
        // A COMMENT NODE, not an empty <span>: it cannot be styled, selected, matched by a CSS rule, counted by
        // a querySelectorAll the page already runs, or picked up by a layout. An invisible <span> would be a
        // real element sitting in somebody else's list.
        return doc.createComment("swek-stage-anchor");
    };

    function restore() {
        if (!live) return false;                                  // idempotent by design: callers fire it freely
        const { el, anchor } = live;
        live = null;
        try {
            if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(el, anchor);
            else if (el.parentNode === stageHost) stageHost.removeChild(el);   // its home vanished: do not strand it on stage
            if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
        } catch (e) {}
        if (rail && railHome) { try { railHome.appendChild(rail); } catch (e) {} }
        if (opts.onRestore) { try { opts.onRestore(el); } catch (e) {} }
        return true;
    }

    function present(el) {
        if (!el || !stageHost) return false;
        if (live && live.el === el) return true;                  // ALREADY ON STAGE: a no-op, not a restore-and-re-present
        restore();                                                // one at a time, always
        const anchor = anchorFor();
        try {
            if (el.parentNode) el.parentNode.insertBefore(anchor, el);
            // When railHost IS stageHost the rail goes in FIRST, so it sits to the LEFT of the panel in source
            // order -- v3667's arrangement, unchanged. When it is a different container the order inside the
            // stage does not arise at all.
            if (rail) railHost.appendChild(rail);
            stageHost.appendChild(el);                            // appendChild MOVES a node that already has a parent
        } catch (e) { return false; }
        live = { el, anchor };
        if (opts.onPresent) { try { opts.onPresent(el); } catch (e) {} }
        return true;
    }

    return { present, restore, current: () => (live ? live.el : null), isPresenting: () => !!live };
}
