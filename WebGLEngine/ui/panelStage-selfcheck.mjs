// WebGLEngine/ui/panelStage-selfcheck.mjs -- v3667
//
// Run: node ui/panelStage-selfcheck.mjs
//
// *** THE FAILURE THIS EXISTS TO PREVENT IS A PANEL THAT NEVER FINDS ITS WAY HOME. *** Moving a live node out
// of a column and back is easy to get 95% right and the last 5% is where the user's day goes: a panel that
// comes back in the wrong place, comes back DEAD because something cloned it, or does not come back at all
// because its neighbours moved while it was away.
//
// Driven against a DOM stub with an injected document, so every case is a literal instead of a browser.

import { readFileSync } from "node:fs";
import { makeStage } from "./panelStage.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

// ---- the smallest DOM that can hold the question -----------------------------------------------------------
let uid = 0;
function node(tag, id) {
    const n = {
        tagName: tag, id: id || ("n" + (++uid)), nodeType: tag === "#comment" ? 8 : 1,
        childNodes: [], parentNode: null, style: {}, _live: null,
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
        removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
        insertBefore(c, ref) {
            if (c.parentNode) c.parentNode.removeChild(c);
            const i = ref ? this.childNodes.indexOf(ref) : -1;
            if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
            c.parentNode = this; return c;
        },
    };
    return n;
}
const doc = { createComment: () => node("#comment") };
const idsOf = (p) => p.childNodes.map((c) => (c.nodeType === 8 ? "#" : c.id)).join(",");

function world() {
    const right = node("div", "right"), stage = node("div", "stage"), railHome = node("div", "railHome");
    const a = node("div", "A"), b = node("div", "B"), c = node("div", "C");
    const rail = node("div", "RAIL");
    right.appendChild(a); right.appendChild(b); right.appendChild(c);
    railHome.appendChild(rail);
    return { right, stage, railHome, a, b, c, rail };
}

// --- 1. MOVED, NOT CLONED -------------------------------------------------------------------------------------
{
    say("1. THE PANEL ON STAGE MUST BE THE SAME OBJECT -- a clone looks identical and is dead.");
    const w = world();
    const st = makeStage({ doc, stageHost: w.stage, rail: w.rail, railHome: w.railHome });
    w.b._live = "a poll timer, a half-typed form, an open <details>";
    st.present(w.b);
    const onStage = w.stage.childNodes.find((n) => n.id === "B");
    ok("!! it is the SAME node, identity-equal, carrying its live state", onStage === w.b && onStage._live === w.b._live,
        "cloneNode copies MARKUP AND NOTHING ELSE -- listeners, timers, scroll position, in-flight fetches and " +
        "form state all stay with the original, which would keep polling invisibly behind a dead copy");
    ok("and it is no longer in the right column", !w.right.childNodes.includes(w.b));
    ok("!! the rail moved to the stage and sits BEFORE the panel", idsOf(w.stage) === "RAIL,B",
        "source order is the layout: the gauges land to the LEFT of what is being shown");
}

// --- 2. IT GOES BACK EXACTLY WHERE IT WAS --------------------------------------------------------------------------
{
    say("2. RESTORED BETWEEN THE SAME TWO NEIGHBOURS -- not appended, not by index.");
    const w = world();
    const st = makeStage({ doc, stageHost: w.stage, rail: w.rail, railHome: w.railHome });
    say("     before: " + idsOf(w.right));
    st.present(w.b);
    say("     during: " + idsOf(w.right) + "   (the anchor holds the gap)");
    st.restore();
    say("     after:  " + idsOf(w.right));
    ok("!! B returns between A and C", idsOf(w.right) === "A,B,C");
    ok("the anchor is removed, leaving no residue", !w.right.childNodes.some((n) => n.nodeType === 8));
    ok("the rail goes home too", idsOf(w.railHome) === "RAIL" && w.stage.childNodes.length === 0);
}

// --- 3. THE CASE AN INDEX WOULD FAIL --------------------------------------------------------------------------------
{
    say("3. THE COLUMN CHANGES WHILE THE PANEL IS AWAY -- which is why the anchor is a NODE and not a number.");
    const w = world();
    const st = makeStage({ doc, stageHost: w.stage, rail: w.rail, railHome: w.railHome });
    st.present(w.c);                                   // take the LAST one
    const late = node("div", "NEW");
    w.right.insertBefore(late, w.right.childNodes[0]);  // a status chip arrives at the TOP while C is on stage
    say("     during, with a new sibling: " + idsOf(w.right));
    st.restore();
    say("     after:  " + idsOf(w.right));
    ok("!! C still returns AFTER B, though its old index now points at B", idsOf(w.right) === "NEW,A,B,C",
        "recorded as index 2, C would have come back between A and B. THE ANCHOR MOVED WITH ITS SIBLINGS");
}

// --- 4. ONE AT A TIME, AND THE EDGES ---------------------------------------------------------------------------------
{
    say("4. EDGES.");
    const w = world();
    const st = makeStage({ doc, stageHost: w.stage, rail: w.rail, railHome: w.railHome });
    st.present(w.a); st.present(w.c);
    ok("!! presenting a second panel restores the first", idsOf(w.stage) === "RAIL,C" && w.right.childNodes.includes(w.a),
        "two panels on one stage is a layout bug and a second live poller nobody asked for");
    ok("...and A went back to the front", idsOf(w.right).startsWith("A,B"));
    const before = idsOf(w.stage);
    ok("presenting the SAME panel again is a no-op, not a restore-and-re-present", st.present(w.c) && idsOf(w.stage) === before,
        "a click on an already-open tab would otherwise tear the panel out and put it back -- losing scroll " +
        "position and restarting anything mid-flight");
    st.restore();
    ok("restore() twice is harmless and reports it did nothing the second time", st.restore() === false);
    ok("current() is null when nothing is staged", st.current() === null && st.isPresenting() === false);
    ok("presenting nothing is refused rather than throwing", st.present(null) === false);
}

// --- 5. THE HOME VANISHES WHILE THE PANEL IS ON STAGE ------------------------------------------------------------------
{
    say("5. THE RIGHT COLUMN IS REBUILT UNDER A PRESENTED PANEL -- a rebuild is a thing this page really does.");
    const w = world();
    const st = makeStage({ doc, stageHost: w.stage, rail: w.rail, railHome: w.railHome });
    st.present(w.b);
    while (w.right.childNodes.length) w.right.removeChild(w.right.childNodes[0]);   // anchor destroyed with it
    st.restore();
    ok("!! the panel is NOT left stranded on the stage", !w.stage.childNodes.includes(w.b),
        "with its anchor gone there is nowhere to put it back, so it is REMOVED rather than left sitting over " +
        "the gauges forever. A LOST PANEL IS BETTER THAN A STUCK ONE");
    ok("and the stage is clean, rail returned", w.stage.childNodes.length === 0 && idsOf(w.railHome) === "RAIL");
}

// --- 6. scope ------------------------------------------------------------------------------------------------------------
{
    say("6. SCOPE.");
    const src = readFileSync(new URL("./panelStage.mjs", import.meta.url), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
    ok("it never clones", !/cloneNode/.test(code), "asserted against CODE with comments stripped -- the header " +
        "ARGUES about cloneNode at length, so an unstripped check would find the word it forbids");
    ok("no timers, no fetch, no globals of its own", !/setTimeout|setInterval|fetch\(/.test(code) &&
        !/(^|[^.\w])document\s*\./.test(code.replace(/opts\.doc|typeof document/g, "D")));
    ok("the anchor is a COMMENT node", /createComment/.test(code),
        "an invisible <span> would be a real element in somebody else's querySelectorAll");
    say("   NOT CHECKED: that it LOOKS right. No browser and no jsdom here -- the moves, the ordering and the");
    say("   restoration are proven; the LAYOUT of a right-column panel inside a left-column box is Keith's.");
    say("   NOT DONE: which panels are 'basic enough'. Keith said some would need more work, so EVERY panel");
    say("   presents and the stage carries a way back -- rather than me guessing a list and hiding the rest.");
}

console.log("panelStage-selfcheck: " + (fails ? fails + " FAILED" : "all pass"));
process.exit(fails ? 1 : 0);
