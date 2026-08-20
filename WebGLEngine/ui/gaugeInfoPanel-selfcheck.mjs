// WebGLEngine/ui/gaugeInfoPanel-selfcheck.mjs — v3553
//
// Run: node ui/gaugeInfoPanel-selfcheck.mjs   (~3s — MEASURED individually)
// Gated by tools/ship/selfchecks.mjs (tree walk).
//
// *** HOVER AND SELECT MUST NOT MEAN THE SAME THING, AND THAT IS THE WHOLE CHECK. ***
//
// If both repaint the panel, dragging the pointer across a list STROBES it -- and worse, you cannot read the
// thing you just selected, because the pointer is still travelling over other links on its way somewhere. The
// panel becomes unreadable precisely when it is most useful, which is while comparing two entries by pointing at
// them in turn. So hover fills only an EMPTY panel and reverts on leave; select PINS and hover stops overwriting.
//
// The selection model is a plain object with no DOM in it, so all of that is assertable here rather than only
// visible in a browser. The mounting code is separate and is checked structurally.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSelection, miniLine, MINI_ORDER, MINI_LABEL, makeAutoTab, describe } from "./gaugeInfoPanel.js";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const A = { id: "a", title: "Alpha" }, B = { id: "b", title: "Beta" };

// ---- 1. THE EMPTY STATE TEACHES THE INTERACTION ------------------------------------------------------------------
{
    const s = makeSelection();
    ok("!! with nothing hovered or pinned the tab reads 'Hover/Select a Panel:'",
       s.title() === "Hover/Select a Panel:" && s.state() === "empty" && s.current() === null,
       "Keith's wording, kept because the label is where the interaction is explained");
}

// ---- 2. HOVER IS AMBIENT: IT FILLS, AND IT REVERTS ----------------------------------------------------------------
{
    const s = makeSelection();
    s.hover(A);
    ok("!! hovering fills the panel while nothing is pinned",
       s.current() === A && s.state() === "preview");
    s.leave();
    ok("...and leaving reverts it, rather than leaving a stale entry up",
       s.current() === null && s.state() === "empty",
       "a preview that outlives the pointer is indistinguishable from a selection, which is the confusion this model exists to prevent");
}

// ---- 3. *** SELECT PINS, AND HOVER STOPS OVERWRITING IT. THE POINT OF THE ROUND. *** ------------------------------
{
    const s = makeSelection();
    s.select(A);
    ok("!! selecting pins",
       s.current() === A && s.isPinned() && s.state() === "pinned");
    s.hover(B);
    ok("!! ...and hovering something else DOES NOT replace it",
       s.current() === A,
       "this is the case that makes the panel usable: you can point at Beta while still reading Alpha. If hover " +
       "won here, the panel would be unreadable exactly when you are comparing two things");
    s.leave();
    ok("...nor does leaving clear it",
       s.current() === A && s.isPinned());
    s.select(B);
    ok("!! a second select REPLACES the pin, so pinning is not a trap",
       s.current() === B && s.isPinned());
    s.release();
    ok("!! and release returns to the empty state, not to whatever was hovered",
       s.current() === null && s.state() === "empty" && s.title() === "Hover/Select a Panel:",
       "releasing a pin while the pointer sits over a link would otherwise resurrect a preview nobody asked for");
}

// ---- 4. THE TAB TITLE REPORTS THE STATE, INCLUDING THAT IT CAN BE RELEASED ----------------------------------------
{
    const s = makeSelection();
    s.hover(A);
    ok("a previewed entry shows its own name, with no pin marker",
       s.title() === "Alpha", s.title());
    s.select(A);
    ok("!! a pinned entry shows a pin AND a release affordance",
       /\ud83d\udccc/.test(s.title()) && /\u2715/.test(s.title()),
       s.title() + " — a pin you cannot see how to drop is a mode you are stuck in");
}

// ---- 5. THE SIX GAUGES FIT ON ONE LINE, AND ABSENT IS NOT ZERO ---------------------------------------------------
{
    ok("!! the mini-line carries exactly the six gauges server.html declares",
       MINI_ORDER.length === 6 && MINI_ORDER.join(",") === "cpu,ram,gpu,swekpeers,swekremotepeers,battery",
       MINI_ORDER.map((k) => MINI_LABEL[k]).join(", "));
    const line = miniLine({ cpu: 12, ram: 61, gpu: 4, swekpeers: 3, swekremotepeers: 0, battery: 88 });
    ok("...and it is short enough to sit where the dials were",
       line.length < 90, '"' + line + '" — ' + line.length + " chars");
    const sparse = miniLine({ cpu: 12 });
    ok("!! a missing reading shows as an em dash, NEVER as 0%",
       sparse.includes("\u2014") && !/RAM 0%/.test(sparse),
       '"' + sparse + '" — a gauge with no reading and a gauge reading zero are different facts, and printing ' +
       "the first as the second is the absent-is-not-empty mistake this lab keeps naming");
    ok("...and nothing is hidden when the info tab is up: the numbers are REDUCED, not removed",
       MINI_ORDER.every((k) => miniLine({ [k]: 50 }).includes(MINI_LABEL[k])),
       "every one of the six appears on the line, so switching tabs costs detail and not information");
}

// ---- 6. THE MOUNTING CODE HIDES THE DIALS AND SHOWS THE LINE, RATHER THAN STACKING BOTH ----------------------------
{
    const src = fs.readFileSync(path.join(ENG, "ui/gaugeInfoPanel.js"), "utf8");
    // v3671 REWROTE THIS TO THE PROPERTY RATHER THAN WEAKENING IT, for the same reason v3622 did below. The
    // old form demanded `mini.style.display = infoUp ? "block"` -- A SPELLING OF THE ARRANGEMENT that stopped
    // being true when the mini-LINE was correctly replaced by the vertical DOCK. THE PROPERTY IS: switching to
    // info hides the dials and raises the stats surface in ONE step. Which surface it is -- the dock or the
    // text line it falls back to -- is the next check's business, not this one's.
    ok("!! switching to the info tab hides the dials and raises the panel in one step",
       /dialsEl\.style\.display = infoUp \? "none"/.test(src) && /row\.style\.display = infoUp \? "flex"/.test(src),
       "the info panel takes the SPACE the dials had, which was the point of the design");
    // *** v3671 -- THE AVATAR MUST GO WITH THE DIALS, AND THE PANEL MUST NOT KNOW WHOSE AVATAR IT IS. ***
    // #dialsRobot is a SIBLING of #dials, so hiding the dials alone left the avatar standing beside the info
    // panel and the swap replaced half a row. The elements are NAMED BY THE CALLER: a module that reached for
    // getElementById("dialsRobot") would work on server.html and silently do nothing anywhere else it mounts.
    ok("!! ...and every element the caller named is hidden and restored WITH the dials",
       /for \(const el of hideWith\)/.test(src) && /el\.style\.display = infoUp \? "none" : ""/.test(src),
       "restoring to \"\" rather than to a remembered value is deliberate: the caller's own stylesheet decides " +
       "what visible means, and a remembered inline display would freeze today's layout into the panel");
    // *** THE DOCK IS NOT A SECOND POLLER AND NOT A SECOND CLOCK. *** It shows the same cpu/ram/gpu the main
    // dials already fetched, so it is driven by setStats from the caller's own getStats and NEVER calls
    // start(). Two sets polling the same endpoints is two declarations of one set of numbers, and they would
    // drift by up to one poll interval -- so the two views could disagree ON SCREEN, which is the whole
    // defect this tree keeps finding, made visible to a user.
    ok("!! the dock owns no timer and makes no request -- it is fed, not polled",
       /dockSet\.setStats\(/.test(src) && !/dockSet\.start\(/.test(src),
       "svgGaugeSet only installs its interval in start(), which this never calls");
    ok("...and the text line survives as the FALLBACK, shown only when the dock cannot be built",
       /mini\.style\.display = "block"/.test(src) && /miniLine\(st\)/.test(src),
       "a dynamic import is unavailable under jsdom and can fail in a browser. A RAIL THAT SILENTLY RENDERS " +
       "NOTHING would be worse than the line it replaced -- and my first version left mini at display:none on " +
       "exactly that path, so the fallback existed and could never be seen.");
    // v3622 REWROTE THIS TO THE PROPERTY RATHER THAN WEAKENING IT. The old form matched onHover's ONE-LINE
    // SPELLING, and v3622 reformatted the handler onto several lines to add the auto-raise -- so a check that
    // was really about the pin guard went red over WHITESPACE. A GATE PINNED TO AN ARRANGEMENT GOES RED WHEN
    // THE ARRANGEMENT IS CORRECTLY REPLACED (twenty-three-plus instances). It now asserts the guard is the
    // FIRST thing in the handler, whatever the layout.
    const hoverBody = (src.split("onHover(el)")[1] || "").slice(0, 120);
    ok("!! ...and hover is gated on the pin in the DOM wiring too, not only in the model",
       /^\s*\{\s*if \(sel\.isPinned\(\)\) return;/.test(hoverBody),
       "a model that pins correctly and a handler that repaints anyway would be two declarations of the rule, " +
       "and the second would win. AND THE GUARD MUST COME FIRST: the auto-raise added at v3622 must not run " +
       "before the pin has been consulted, or a pinned panel would be yanked away by a passing pointer");
}

// ---- 6. v3622 -- THE TAB RAISES ITSELF ON HOVER AND RETURNS WHEN THE POINTER SETTLES ------------------------------
//
// DRIVEN ON A FAKE CLOCK rather than by waiting: a behaviour that could only be checked by watching it in a
// browser is a behaviour nobody checks. The timers are injected, so every delay below is stepped explicitly.
//
// ANTIDOTE: if the delays are ever tuned, THESE CHECKS MUST STILL PASS WITHOUT CHANGING THEIR NUMBERS -- they
// assert ORDERING and OWNERSHIP, never a particular millisecond. A check that had to be re-tuned alongside the
// constant would be pinned to the arrangement rather than the property.
{
    // A tiny scheduler: nothing fires until the test advances the clock.
    function clock() {
        let now = 0, id = 1; const q = new Map();
        return {
            setTimer: (f, ms) => { const h = id++; q.set(h, { at: now + ms, f }); return h; },
            clearTimer: (h) => q.delete(h),
            advance(ms) {
                now += ms;
                for (const [h, t] of [...q.entries()]) if (t.at <= now) { q.delete(h); t.f(); }
            },
            pending: () => q.size,
        };
    }
    const mk = (c) => makeAutoTab({ raiseMs: 100, returnMs: 1000, setTimer: c.setTimer, clearTimer: c.clearTimer });

    // (a) A BRIEF HOVER MUST NOT RAISE ANYTHING -- a pointer crossing a list passes over many links.
    {
        const c = clock(), a = mk(c); let raised = 0;
        a.hover("gauges", () => raised++);
        c.advance(60);
        ok("!! a hover shorter than the raise delay does NOT switch the tab", raised === 0,
           "a pointer travelling across a list crosses many links; raising on the first mouseover makes THE TAB " +
           "strobe, which is v3553's panel-content problem one level up");
        c.advance(60);
        ok("!! ...and a hover that PERSISTS does switch it", raised === 1, "raised after the delay elapsed");
        ok("...and the tab knows it was raised automatically rather than chosen", a.isAutoRaised() === true);
    }

    // (b) THE RETURN IS SLOWER THAN THE RAISE, AND THE GAP IS WHAT STOPS IT FLAPPING.
    {
        const c = clock(), a = mk(c); let raised = 0, lowered = 0;
        a.hover("gauges", () => raised++); c.advance(100);
        a.leave("info", () => lowered++); c.advance(300);
        ok("!! leaving does not switch back immediately", lowered === 0,
           "moving from one link to the next crosses dead space; an instant return would flap while the pointer travels");
        c.advance(700);
        ok("!! ...and it does return once the pointer has settled", lowered === 1);
        ok("...and ownership goes back to nobody", a.isAutoRaised() === false);
    }

    // (c) MOVING BETWEEN TWO LINKS MUST CANCEL THE PENDING RETURN -- otherwise the tab drops mid-comparison.
    {
        const c = clock(), a = mk(c); let raised = 0, lowered = 0;
        a.hover("gauges", () => raised++); c.advance(100);
        a.leave("info", () => lowered++); c.advance(300);
        a.hover("info", () => raised++);              // landed on the next link, info already up
        c.advance(5000);
        ok("!! hovering a second link CANCELS the pending return", lowered === 0,
           "comparing two entries by pointing at each in turn is exactly when the panel is most useful, and it " +
           "must not vanish between them");
        ok("...and no second raise is scheduled when the tab is already up", raised === 1);
    }

    // (d) THE LOAD-BEARING ONE: NOTHING AUTOMATIC MAY CLOSE A PANEL THE USER OPENED.
    {
        const c = clock(), a = mk(c); let lowered = 0;
        a.userTook();                                  // the user clicked the info tab themselves
        a.leave("info", () => lowered++); c.advance(9000);
        ok("!! a tab the USER chose is NEVER auto-lowered", lowered === 0 && a.isAutoRaised() === false,
           "AN AUTO-REVERT THAT CLOSED A PANEL SOMEBODY DELIBERATELY OPENED IS WORSE THAN NO AUTOMATION");
    }

    // (e) AND A CLICK DURING A PENDING RAISE TAKES OWNERSHIP TOO, or the automation would fire after the user
    //     had already decided.
    {
        const c = clock(), a = mk(c); let raised = 0;
        a.hover("gauges", () => raised++);
        a.userTook();
        c.advance(9000);
        ok("!! a deliberate click cancels a raise that was already pending", raised === 0 && c.pending() === 0,
           "the automation must not act on an intention the user has since overruled");
    }

    // (f) THE PIN STILL WINS, IN THE WIRING AND NOT ONLY IN THE MODEL.
    {
        const src = fs.readFileSync(path.join(ENG, "ui", "gaugeInfoPanel.js"), "utf8");
        ok("!! onSelect takes ownership away from the automation", /onSelect\(el\) \{ auto\.userTook\(\);/.test(src),
           "pinning is the most deliberate act there is; a pending auto-return outliving it would drop the pin's panel");
        ok("!! ...and both tab buttons do the same", (src.match(/auto\.userTook\(\)/g) || []).length >= 3,
           "gauges click, info click and select -- three deliberate acts, three claims of ownership");
    }
}

// ---- 7. v3623 -- THE PAGE-INDEX LOOKUP, KEPT PURE AND DRIVEN HEADLESS -------------------------------------------
//
// Keith asked for a real summary in the info panel. Almost no link on server.html carries data-info or title --
// they are generated from drawers and buckets rather than hand-written per link -- so describe() gained an
// OPTIONAL lookup function, exercised here with a fake one rather than a real fetch, so this stays a headless
// check and not a browser test.
{
    const fakeEl = (attrs) => ({ getAttribute: (k) => (k in attrs ? attrs[k] : null), textContent: attrs._text || "" });
    const lookup = (href) => (href === "/AudioLab.html" ? "Web Audio synthesis explorer." : "");

    ok("!! with no data-info and a lookup that HAS an entry, the note comes from the lookup",
        describe(fakeEl({ href: "/AudioLab.html", _text: "Audio Lab" }), lookup).note ===
        "Web Audio synthesis explorer.",
        "the majority of links carry no per-link note at all, so the page-wide description is what the panel " +
        "has to show or it shows nothing");

    ok("!! ...and an EXPLICIT data-info on the element still WINS over the lookup",
        describe(fakeEl({ href: "/AudioLab.html", "data-info": "this specific link's own reason" }), lookup).note ===
        "this specific link's own reason",
        "a link-specific note is more likely to be about why THIS link exists than a page's own summary, so " +
        "precedence runs element-first even though the lookup is checked last in the source");

    ok("!! ...and a lookup with NO entry for this href leaves the note empty, not undefined or a stale value",
        describe(fakeEl({ href: "/some-unknown-page.html" }), lookup).note === "",
        "an empty string is a fact ('nothing found'); undefined would make every later .length or template " +
        "literal a landmine for whoever reads this object next");

    ok("describe() still works with NO lookup argument at all, for every existing caller",
        describe(fakeEl({ href: "/x.html", _text: "X" })).note === "",
        "the parameter is OPTIONAL -- the gate itself calls describe() with one argument all through sections " +
        "1-6 above, and none of that behaviour may change");

    const src = fs.readFileSync(path.join(ENG, "ui", "gaugeInfoPanel.js"), "utf8");
    ok("!! mountGaugeInfo fetches page-index.json, never bakes a copy of it",
        /fetch\("\/page-index\.json"/.test(src) && !/const PAGE_DESC = \{/.test(src),
        "a baked copy is the page-index.html defect this tree already fixed once (v3228's 256-entry literal) " +
        "arriving in a second file");
    ok("!! ...and an offline or missing fetch is a MISS, not a crash",
        /catch \{ pageDesc = new Map\(\); \}/.test(src),
        "the panel must keep working with no descriptions available, the same way it worked before this round");
}

// ---- THE PANEL MUST NOT MOVE THE PAGE (v3778) --------------------------------------------------------------
// *** KEITH: the info panel "restructures the page so hard". lockHeight() SET ONLY A FLOOR -- minHeight stops
// the box SHRINKING and does nothing about it GROWING, so a long info body pushed the chat, the peer bar and
// the drawers down. A PANE THAT CAN ONLY GET TALLER IS NOT A FIXED PANE. ***
{
    const src = fs.readFileSync(new URL("./gaugeInfoPanel.js", import.meta.url), "utf8");
    ok("!! *** lockHeight SETS A HEIGHT AND A MAXIMUM, NOT JUST A MINIMUM ***",
        /host\.style\.height = _lockH/.test(src) && /host\.style\.maxHeight = _lockH/.test(src) &&
        /host\.style\.overflow = "hidden"/.test(src),
        "all three: a floor alone let a long body grow the box. The overflow rule is what makes the OVERSPILL " +
        "scroll inside the pane instead of moving everything below it");
    ok("!! and a caller can STATE the height rather than depend on what the gauges measured",
        /fixedH = 0/.test(src) && /if \(fixedH > 0\)/.test(src),
        "the measured value is still the FALLBACK, so a page passing nothing behaves as before -- except that " +
        "it also stops growing");
    ok("!! *** THE RETURN DELAY IS 4000 ms, NOT 1400 ***",
        /returnMs = 4000/.test(src),
        "Keith: \"it goes away almost immediately\". 1.4 s is enough to read a LABEL and not a SENTENCE, and " +
        "the panel's own placeholder invites reading one");
    ok("!! ...and the RAISE delay is unchanged at 140 ms, because the two delays do different jobs",
        /raiseMs = 140/.test(src),
        "the raise delay exists so a pointer TRAVELLING ACROSS links does not strobe the panel; lengthening it " +
        "would make the panel sluggish to summon while doing nothing about how long it stays");
    ok("!! the dock can be capped, and 0 still means all",
        /dockMax = 0/.test(src) && /dockMax > 0 && Array\.isArray\(dockGauges\)/.test(src),
        "trimmed at the DOCK rather than by handing it a shorter list, so the page keeps ONE declaration of " +
        "which gauges it shows");
}

// ---- THE HOVER BRIDGE (v3787) ------------------------------------------------------------------------------
// *** KEITH ASKED FOR SOMETHING A LONGER TIMEOUT CANNOT GIVE: "i can move the mouse to the info panel and
// click a link that is there." v3778 read that as a dwell problem and raised returnMs 1400 -> 4000.
// A TIMEOUT IS A RACE AGAINST THE HAND. Whatever the number, a pointer that pauses on the way -- to read the
// panel, or because the link is far -- still loses it, and the panel vanishes UNDER THE CURSOR at the moment
// of the click. 4000 ms made that rarer and could not make it stop.
// THE DWELL COVERS THE TRAVEL; THE BRIDGE COVERS THE ARRIVAL. ***
{
    const mk = () => {
        const handles = new Map(); let id = 0;
        const st = (f, ms) => { const h = ++id; handles.set(h, { f, ms }); return h; };
        const ct = (h) => handles.delete(h);
        const fire = (h) => { const t = handles.get(h); handles.delete(h); t.f(); };
        return { handles, st, ct, fire };
    };
    // raise, then leave -- the state Keith is in when he starts moving toward the panel
    const T = mk();
    const auto = makeAutoTab({ raiseMs: 140, returnMs: 4000, setTimer: T.st, clearTimer: T.ct });
    auto.hover("gauges", () => {});
    T.fire([...T.handles.keys()][0]);                  // the raise lands; the panel is up
    let lowered = false;
    auto.leave("info", () => { lowered = true; });
    ok("!! leaving the button schedules a return, as before",
        auto.pendingKind() === "return");
    ok("!! *** ARRIVING AT THE PANEL CANCELS THE RETURN OUTRIGHT, WITH NO TIMER LEFT TO FIRE ***",
        auto.keep() === true && auto.pendingKind() === null && T.handles.size === 0 && !lowered,
        "*** THE PANEL STAYS FOR AS LONG AS THE POINTER IS ON IT. Not longer -- INDEFINITELY, which is the " +
        "only thing that survives a pause mid-click. keep() reports whether it actually cancelled, so a real " +
        "rescue is distinguishable from a no-op ***");
    ok("!! and keep() on a panel nobody was leaving is a no-op, not a lock",
        (() => { const U = mk();
                 const a2 = makeAutoTab({ raiseMs: 140, returnMs: 4000, setTimer: U.st, clearTimer: U.ct });
                 return a2.keep() === false; })(),
        "IT MUST NOT PIN THE PANEL BY ACCIDENT -- with no return pending there is nothing to cancel, and " +
        "returning false says so rather than silently latching");
    ok("!! leaving the PANEL re-arms an ordinary return, so it cannot stay up for ever",
        (() => { let low = false;
                 auto.leave("info", () => { low = true; });
                 return auto.pendingKind() === "return" && !low; })(),
        "the bridge holds the panel WHILE the pointer is on it and hands control straight back on the way out");
}

// ---- THE WIDTH (v3787) -------------------------------------------------------------------------------------
{
    const src = fs.readFileSync(new URL("./gaugeInfoPanel.js", import.meta.url), "utf8");
    ok("!! *** THE PANEL IS PINNED IN BOTH AXES, NOT JUST HEIGHT ***",
        /host\.style\.width = "100%"/.test(src) && /boxSizing = "border-box"/.test(src) &&
        /host\.style\.flex = /.test(src),
        "v3778 set a HEIGHT and said nothing about the horizontal axis, so the panel still took whatever width " +
        "its content asked for and SHRANK on a short body. *** A BOX FIXED IN ONE AXIS AND FLUID IN THE OTHER " +
        "STILL MOVES THE PAGE. *** border-box because 100% plus padding overflows its parent; the flex basis " +
        "because the row is a flexbox and width alone loses to it");
    ok("!! and the bridge is wired INSIDE the module, not left for each page to remember",
        /addEventListener\("pointerenter"/.test(src) && /addEventListener\("pointerleave"/.test(src),
        "A HOOK NOBODY ATTACHES IS A CONTROL THAT DOES NOTHING -- the shape this tree shipped a gate about at " +
        "v3783");
}

console.log(fails ? ("[gaugeInfoPanel-selfcheck] FAILED " + fails) : "[gaugeInfoPanel-selfcheck] all passed");
process.exit(fails ? 1 : 0);
