#!/usr/bin/env node
// WebGLEngine/tools/ship/avatarDock-selfcheck.mjs -- v4413, widened v4450
//
// ---- v4868: THE AVATAR'S HEIGHT WAS A RUNAWAY, AND THE INFO TAB'S CLIP OUTLIVED THE INFO TAB --------------
// Asked to look at a height that stayed tall after the window shrank, and it was worse than a memory: at a 1900
// window the avatar's box measured 6 px taller than its surface on every frame, so sizeFromHost rebuilt the
// surface 6 px taller, 230 -> 420 over 3.6 s of a fresh load, stopped only by v4451's ceiling. The 6 px is a
// text line's descender space: gaugeInfoPanel clears #dialsRobot's inline display, the box fell back to BLOCK,
// and the surface sat on a line. This gate's own line said "the display it comes back as is BLOCK" -- true,
// and the cause. A server.html rule makes it flex. Separately, the info pane's overflow:hidden stayed on the
// row after the gauges came back, and clipped the favourites picker's bottom 65 px on a phone-width row.
//   SABOTAGE LOG (each restored and md5-verified):
//     R1. the #dialsRobot flex rule removed            -> exit=1, 2 red BY NAME: "comes back as FLEX" and "NO RUNAWAY".
//     R2. gaugeInfoPanel's overflow hand-back skipped  -> exit=1, 1 red BY NAME: "the favourites picker is NOT CLIPPED".
//   A first draft compared the row's height at 1400 against 1900 and 2400. It read 184 / 164 / 164 -- the 230
//   min-height had been lifted between the probes -- and, worse, a runaway saturates at the ceiling at BOTH wide
//   widths and would read equal there. The check reads the runaway's own signatures instead.
//
// ---- v4863: THE DIALS COME BACK, AND THE INFO BOX AND THE RAIL'S PLACE COME BACK WITH THEM -----------------
// Keith: "when it loads, there should be gauges and avatar, but only avatar is appearing." v4413 moved #dials
// into a display:none wrapper so the avatar could take the row, and the "new gauges in that same scene" it
// was making room for were never built for the default SVG robot -- so from v4413 the page loaded with no
// gauges. Two more things rode on that wrapper and nothing said so: gaugeInfoPanel mounts its info box into
// #dials' PARENT, so the Hover/Select tab showed an empty row; and v4450's staged "empty 720 px column" was
// empty for the same reason. Separately, ui/panelStage.mjs sent the rail home with appendChild, so after
// every staged panel the dials and the avatar sat at the bottom of the column (measured on v4862 too).
// THIS GATE ASSERTED THE ABSENCE: "the SVG dials are out of the row" and "the avatar spans its row" were
// both true and both the bug. They are inverted, and the checks around them re-aimed at a shared row.
//   SABOTAGE LOG (each restored and md5-verified):
//     S1. #dials back inside a display:none wrapper            -> exit=1, 7 red: dials in the row, both ends,
//         tracking, ceiling, the visible info box and the staged rail -- everything the wrapper took away.
//     S2. #dials' flex moved inline, the sheet rule removed    -> exit=1, 1 red BY NAME: "the dials come back
//         as FLEX", read after gaugeInfoPanel cleared the inline display.
//     S3. the avatar's flex-basis back to auto                 -> exit=1, 4 red, the "row WIDENS again" line
//         among them. A first draft asserted a SHRINKING window instead; under this sabotage it stayed green
//         here (the surface fits beside the dials in this harness), so it is reported, not asserted.
//     S4. flex-wrap removed from #dialsRow                     -> exit=1, 1 red BY NAME: the phone-width wrap.
//     S5. panelStage's rail anchor skipped (appendChild)       -> exit=1, 1 red BY NAME: "to the SAME PLACE".
//
// ---- v4450: THE GROWTH AXIS, WHICH v4413 GAVE A FLOOR AND NO CEILING ON --------------------------------
// Keith: "on server.html the svg grows huge and scrolls down screen." #dialsRow carries flex:1 1 auto and is
// MOVED BETWEEN PARENTS OF DIFFERENT flex-direction at runtime -- row at home, column once panelStage puts it
// in #stageInfo -- so one declaration means "grow wide" in one place and "grow tall" in the other. MEASURED
// on one live page moments apart: staged, the row is 720 px tall before the fix and 184 after, 536 px of
// column reclaimed. THE AVATAR ITSELF IS HIDDEN WHILE A PANEL IS STAGED (onPresent raises the info tab), so
// what that 720 px held was NOTHING -- a gap, not a giant robot. Said plainly because it is not yet proof of
// what Keith saw: three sections above measure the avatar at 621x147 at home and it does not move with the
// window height, so a scene that is itself huge has NOT been reproduced here.
//   SABOTAGE LOG for the v4450 section:
//     A. removed the onPresent pin  -> exit=1, 2 red: the axis line reads 720 with and 720 without, and the
//        home-height line reads staged 720 against home 184.
//     B. onRestore clears the inline flex instead of restoring it -> exit=1, 1 red BY NAME, and this one
//        FOUND A BUG IN THE FIX RATHER THAN CONFIRMING IT. The first draft of onRestore wrote
//        rail.style.flex = "", the idiom the handler beside it uses for justifyContent -- but this flex lives
//        in the element's INLINE style attribute, so clearing it DELETES the declaration instead of falling
//        back to a sheet: computed "0 1 auto" where the markup says "1 1 auto", v4413's row silently
//        un-filling itself after the first staged panel. The home value is read off the node at stage setup
//        and put back verbatim. Note the width read 426 -> 426 in BOTH cases: in a narrow harness the row is
//        the only child and fills anyway, so the flex comparison is what caught it and the width alone would
//        have passed over it.
//
// ---- v4451: THE CEILING, AND A THIRD PROBE WIDTH ------------------------------------------------------
// Keith: "cap the avatar width." v4413 gave this mount minSize and nothing above it, so MEASURED at four
// window widths the surface ran 341 / 621 / 749 / 1005 px WHILE THE ROBOT DRAWN INSIDE IT STAYED 100 px AT
// ALL FOUR -- viewBox 60x88 letterboxed into a 147 px-tall box, so the figure is height-bound and every
// pixel of width past ~100 was empty. maxSize:420 caps it; the figure is unchanged at every width, which is
// the proof the capped room was dead.
//   *** v4413'S OWN CHECK HAD TO CHANGE SHAPE, AND THE OLD FORM WOULD NOW PASS ON A DEAD OBSERVER. *** It
//   asserted surface(1400) > surface(900) + 20. With a ceiling both of those rows sit above it, so the two
//   read equal -- and equal for a good reason is indistinguishable from equal because the ResizeObserver
//   died. Split in two: TRACKS below the ceiling, PINNED above it, each driven at a width where it can fail.
//   The narrow probe is 360 and not 500 BECAUSE 500 WAS MEASURED AND FOUND STILL ABOVE THE CEILING: the page
//   reflows to one column below a breakpoint, so the row is 474 px wide at a 500 window and 334 at a 360
//   one. The width of the window is not the width of the row, and picking the probe by eye tests nothing.
//   SABOTAGE: maxSize removed from the one caller -> exit=1 here (the pinned line) AND exit=1 in
//   ui/avatarSwitch-embed-selfcheck.mjs, which now requires the ceiling on the same argument it already
//   made for the floor -- an unstated ceiling means unbounded, which is the worse half of the same hole.
//
// *** THE AVATAR HAD TWENTY-SIX PER CENT OF ITS OWN ROW, AND WAS BUILT AT A SIZE IT WAS NEVER DISPLAYED AT. ***
//
// MEASURED at v4412 on a live server.html: #dialsRow was 676 px wide, #dials (the SVG dials) took 288 of it
// and #dialsRobot 178. The mount asked for 223x210 -- a typed constant at the call site -- and the host
// rendered at 178x184 with the SVG surface coming out 178x168. A SCENE BUILT AT ONE SIZE AND DISPLAYED AT
// ANOTHER, which is #83 ("the compact scene does not span its own canvas") at its real site.
//
// v3657's comment beside that constant says the aspect is "MEASURED from the box this switch is about to
// create, so changing width/height above cannot leave a stale constant behind". That is true of the box it
// CREATES and says nothing about the box it SITS IN. Both halves are now the host's: sizeFromHost measures
// it, and a ResizeObserver keeps measuring it, because a scene sized once at mount is a typed constant that
// arrives late.
//
// *** EVERY BOX HERE IS READ THROUGH server.html's OWN body { zoom: 0.8 }, *** which is inline on that page
// and predates this round. getBoundingClientRect returns zoomed pixels, so the absolute numbers are 0.8x the
// CSS ones -- 676 layout px reads 541 on an iframe. The checks are written as RATIOS between boxes read the
// same way, which the zoom divides out of, rather than as absolute pixel counts it would silently scale.
"use strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInEngineOrigin } from "./webgpuHarness.mjs";
import { mountAvatarSwitch } from "../../ui/avatarSwitch.js";
import { gateReport } from "./gateReport.mjs";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPORT = gateReport("tools/ship/avatarDock-selfcheck.mjs");
let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);

/* ---------------------------------------------------------------------------------------------------------
 * 1. THE MOUNT TAKES ITS SIZE FROM THE HOST -- checked without a browser, on a fake host, so the rule is
 *    exercised by arithmetic rather than only by a page that might be laid out differently tomorrow.
 * ------------------------------------------------------------------------------------------------------ */
{
    const fakeHost = (w, h) => ({
        style: {}, children: [], firstElementChild: null,
        getBoundingClientRect: () => ({ width: w, height: h }),
        appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
    });
    // The switch reaches for document/localStorage; give it neither and pass a store so it cannot try.
    const noStore = { getItem: () => "svg", setItem: () => {} };
    let built = null;
    const makeSvg = ({ width, height }) => { built = { width, height }; return { el: { remove() {}, tagName: "SPAN" } }; };

    // A DOM stub, not a DOM: the switch creates a button and a note div and wires a click. It is deliberately
    // the SMALLEST surface that lets the sizing path run -- a fuller fake would be a second browser to keep
    // true, and the live section below is what actually exercises a page.
    const fakeEl = (tag) => ({ tagName: tag.toUpperCase(), style: {}, dataset: {}, children: [],
        setAttribute() {}, getAttribute: () => null, appendChild() {}, remove() {},
        addEventListener() {}, removeEventListener() {}, set textContent(v) {}, get textContent() { return ""; } });
    global.document = global.document || { createElement: (t) => fakeEl(t) };
    // v3999's move-relay listens on window; in Node there is none. The stub carries only what the mount path
    // touches, and a location.origin because the relay's postMessage targets the page's own origin by name.
    global.window = global.window || { addEventListener() {}, removeEventListener() {},
                                       location: { origin: "http://localhost:8787" } };
    const sw = mountAvatarSwitch({ host: fakeHost(640, 200), makeSvg, sizeFromHost: true, store: noStore });
    ok("!! *** sizeFromHost MEASURES THE HOST rather than taking a typed width and height ***",
       !!sw && built && built.width === 640 && built.height === 200,
       built ? `host 640x200 -> surface built at ${built.width}x${built.height}. THE CALL SITE USED TO PASS ` +
       "223x210 and the host rendered 178x184: a number typed in one file deciding the size of a box laid " +
       "out in another" : "the switch built nothing");

    built = null;
    const sw2 = mountAvatarSwitch({ host: fakeHost(0, 0), makeSvg, sizeFromHost: true, minSize: 120, store: noStore });
    ok("...and a host measured at ZERO is floored rather than believed",
       !!sw2 && built && built.width === 120 && built.height === 120,
       built ? `host 0x0 -> ${built.width}x${built.height} against minSize 120. A BOX THAT MEASURES ZERO HAS ` +
       "NOT BEEN LAID OUT YET, and building a 0x0 surface would be taking that for an answer" : "built nothing");

    built = null;
    mountAvatarSwitch({ host: fakeHost(640, 200), makeSvg, width: 223, height: 210, store: noStore });
    ok("...and WITHOUT sizeFromHost the old behaviour is unchanged, so nothing else that mounts is disturbed",
       built && built.width === 223 && built.height === 210,
       built ? `no sizeFromHost -> ${built.width}x${built.height}, the numbers as passed` : "built nothing");
}

/* ---------------------------------------------------------------------------------------------------------
 * 2. THE LIVE PAGE. The defect was a fixed number, so ONE WIDTH CANNOT SEE IT -- the page is measured at two.
 * ------------------------------------------------------------------------------------------------------ */
{
    const probe = await runInEngineOrigin({ engineRoot: ENG, timeoutMs: 150000, script: `
        async () => {
            const f = document.createElement("iframe");
            f.style.width = "1400px"; f.style.height = "1000px"; f.src = "/server.html";
            document.body.appendChild(f);
            await new Promise((r) => { f.onload = r; setTimeout(r, 25000); });
            await new Promise((r) => setTimeout(r, 3500));
            const d = f.contentDocument, w = f.contentWindow;
            // v4863 -- the box carries its EDGES as well as its size: the dials and the avatar now SHARE the row,
            // and "do they sit side by side, and do the two of them reach both ends" is a question about edges.
            const box = (id) => { const e = d.getElementById(id); if (!e) return null;
                const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height),
                    l: Math.round(b.left), r: Math.round(b.right), t: Math.round(b.top), b: Math.round(b.bottom) }; };
            const read = () => {
                const robot = d.getElementById("dialsRobot");
                const surf = robot ? [...robot.children].find((c) => getComputedStyle(c).position === "static") : null;
                const sb = surf ? surf.getBoundingClientRect() : null;
                return { row: box("dialsRow"), dials: box("dials"), host: box("dialsRobot"),
                         surface: sb ? { w: Math.round(sb.width), h: Math.round(sb.height) } : null };
            };
            const at = async (px) => { f.style.width = px + "px"; await new Promise((r) => setTimeout(r, 1800)); return read(); };
            const wide = read();
            const dialsParent = (d.getElementById("dials") || {}).parentElement;
            // v4451 -- A THIRD, GENUINELY NARROW WIDTH. With a ceiling in place, 1400 and 900 both sit ABOVE
            // it, so the pair that proved "the surface follows its box" in v4413 now proves only that the cap
            // holds -- the ResizeObserver could be dead and both would still read the same. 500 puts the row
            // below the ceiling so the tracking half is actually exercised. TWO WIDTHS WERE ENOUGH FOR A FIXED
            // NUMBER AND ARE NOT ENOUGH FOR A CLAMPED ONE. 360 rather than 500 BECAUSE 500 WAS MEASURED AND
            // FOUND STILL ABOVE THE CEILING: the page reflows to one column below a breakpoint, so the row is
            // 474 px wide at a 500 window and 334 at a 360 one -- the width of the WINDOW is not the width of
            // the row, and picking the probe by eye would have tested nothing.
            f.style.width = "360px";
            await new Promise((r) => setTimeout(r, 1800));
            const tiny = read();
            f.style.width = "900px";
            await new Promise((r) => setTimeout(r, 1800));
            const narrow = read();
            // v4863 -- WITH THE DIALS BACK, THE CEILING NEEDS WIDER PROBES. At 1400 the avatar now has the row
            // less the dials, 334 px -- BELOW the 420 cap -- so 1400 and 900 now sit on the TRACKING side of it,
            // and "pinned above the ceiling" needs two rows where the avatar's share is still over 420: 1900
            // (543) and 2400 (793), measured. Then back to 1400, because a surface already at the cap is what a
            // SHRINKING window starts from, and that is where a basis of auto dropped the avatar under the dials.
            const big = await at(1900), huge = await at(2400), shrunk = await at(1400);
            // the staged-panel path: gaugeInfoPanel hides the avatar WITH the dials, and this round moved the
            // dials without moving that contract.
            // The panel exposes showInfo()/showGauges(), NOT show(): the first draft of this gate reached for
            // gi.show and reported the contract "not checked" rather than failing, which is the right shape
            // for a missing handle and the wrong answer when the handle simply had another name.
            let staged = null;
            try {
                const gi = w._gaugeInfo;
                const robot = d.getElementById("dialsRobot"), row = d.getElementById("dialsRow");
                const dials = d.getElementById("dials");
                // v4863 -- the info box is gaugeInfoPanel's row, which it inserts into #dials' PARENT. Until
                // v4863 that parent was the display:none wrapper, so the box was mounted and never seen.
                const infoBox = () => [...row.children].find((c) => c !== dials && c !== robot && getComputedStyle(c).display !== "none");
                const snap = () => { const ib = infoBox(); return { display: getComputedStyle(robot).display,
                    w: Math.round(robot.getBoundingClientRect().width),
                    row: Math.round(row.getBoundingClientRect().width),
                    dials: getComputedStyle(dials).display, dialsW: Math.round(dials.getBoundingClientRect().width),
                    info: ib ? { w: Math.round(ib.getBoundingClientRect().width), h: Math.round(ib.getBoundingClientRect().height),
                                 text: (ib.textContent || "").trim().length } : null }; };
                if (gi && gi.showInfo && gi.showGauges) {
                    const before = snap();
                    gi.showInfo(); await new Promise((r) => setTimeout(r, 600));
                    const onInfo = snap();
                    gi.showGauges(); await new Promise((r) => setTimeout(r, 800));
                    staged = { before, onInfo, back: snap() };
                }
            } catch (e) { staged = { error: String(e && e.message) }; }

            // v4868 -- THE FAVOURITES PICKER, AFTER ONE VISIT TO THE INFO TAB, ON A PHONE-WIDTH ROW. gaugeInfoPanel
            // set overflow:hidden on the row for the info pane and never handed it back, and the picker hangs
            // 202 px below the avatar's box -- which on a phone is a line of its own about 100 px tall. Its list
            // is padded to the 150 px max-height a full list reaches, because this harness has no assets to list.
            let picker = null;
            try {
                const gi = w._gaugeInfo, row = d.getElementById("dialsRow"), star = d.getElementById("avatarFavBtn");
                if (gi && star) {
                    f.style.width = "360px"; await new Promise((r) => setTimeout(r, 1800));
                    gi.showInfo(); await new Promise((r) => setTimeout(r, 500));
                    gi.showGauges(); await new Promise((r) => setTimeout(r, 700));
                    star.click(); await new Promise((r) => setTimeout(r, 1500));
                    const p = star.nextElementSibling; p.style.minHeight = "150px";
                    await new Promise((r) => setTimeout(r, 200));
                    const pr = p.getBoundingClientRect(), rr = row.getBoundingClientRect();
                    const hit = d.elementFromPoint(pr.left + pr.width / 2, pr.bottom - 4);
                    picker = { overflow: getComputedStyle(row).overflow, bottom: Math.round(pr.bottom), rowBottom: Math.round(rr.bottom),
                               visible: !!hit && p.contains(hit) };
                    star.click();                                         // close it again
                    f.style.width = "1400px"; await new Promise((r) => setTimeout(r, 1800));
                }
            } catch (e) { picker = { error: String(e && e.message) }; }

            // *** v4450 -- THE RAIL IS MOVED BETWEEN PARENTS OF DIFFERENT flex-direction AT RUNTIME, AND
            // flex:1 1 auto MEANS A DIFFERENT AXIS IN EACH. *** #dialsRow's home is a row-direction flex,
            // so v4413's flex:1 1 auto means grow HORIZONTALLY -- which is the whole of what that round was
            // asked for. panelStage moves the same node into #stageInfo, which is flex-direction:column, and
            // the identical declaration then means grow VERTICALLY, up to the height of the staged panel.
            // *** v4863 -- AND WHAT FILLS THAT HEIGHT IS NOW THE INFO BOX, WHICH v4450 NEVER SAW. *** v4450 measured
            // the staged rail at 720 px with NOTHING in it, pinned it to 0 0 auto, and said so: the avatar is
            // hidden while staged, and the info box was mounted inside #dials' display:none wrapper. With the
            // wrapper gone the box is visible, and gaugeInfoPanel's stretchToRow (v3912: "top-align with the
            // links drawer and reach its bottom") sets the rail back to 1 1 auto when the info tab is raised --
            // which onPresent does right after the pin. So the rail reaches the staged panel's height again,
            // holding the info text, and the avatar it once could have stretched is hidden. Read here: the
            // rail's height against the panel's, what is visible inside it, and where it lands on the way home.
            let axis = null;
            try {
                const st = w._panelStage, row = d.getElementById("dialsRow");
                const robot = d.getElementById("dialsRobot"), dials = d.getElementById("dials");
                if (st && st.present && row) {
                    const tall = d.createElement("div"); tall.style.height = "900px"; tall.textContent = "staged";
                    d.body.appendChild(tall);
                    const h = () => Math.round(row.getBoundingClientRect().height);
                    const sib = () => [row.previousElementSibling && row.previousElementSibling.id,
                                       row.nextElementSibling && row.nextElementSibling.id].join(" | ");
                    const home = h(), homeFlex = getComputedStyle(row).flex, homeW = Math.round(row.getBoundingClientRect().width);
                    const homeSib = sib();
                    st.present(tall); await new Promise((r) => setTimeout(r, 900));
                    const fixed = h(), panelH = Math.round(tall.getBoundingClientRect().height);
                    const shown = [...row.children].filter((c) => getComputedStyle(c).display !== "none");
                    const inside = shown.map((c) => c.id || "(info box)").join(", ");
                    const infoText = shown.filter((c) => c !== dials && c !== robot).map((c) => (c.textContent || "").trim()).join("").length;
                    st.restore(); await new Promise((r) => setTimeout(r, 900));
                    axis = { home, homeFlex, homeW, homeSib, fixed, panelH, inside, infoText, restored: h(), restoredSib: sib(),
                             flex: getComputedStyle(row).flex, restoredW: Math.round(row.getBoundingClientRect().width) };
                }
            } catch (e) { axis = { error: String(e && e.message) }; }

            return { wide, narrow, tiny, big, huge, shrunk, staged, picker, axis, zoom: getComputedStyle(d.body).zoom,
                     dialsPresent: !!d.getElementById("dials"), dialsParent: dialsParent ? dialsParent.id : null };
        }` });

    if (probe.skipped) {
        ok("!! *** the live dock could not be measured ***", false,
           "SKIPPED: " + probe.reason + ". This gate's whole subject is a LAYOUT, and a layout claim with no " +
           "browser behind it is a claim about source text");
    } else {
        const r = probe.result || {};
        const wide = r.wide || {}, narrow = r.narrow || {};
        say(`zoom ${r.zoom}; wide: row ${wide.row && wide.row.w}, dials ${wide.dials && wide.dials.w}, host ` +
            `${wide.host && wide.host.w}; narrow: row ${narrow.row && narrow.row.w}, dials ${narrow.dials && narrow.dials.w}, ` +
            `host ${narrow.host && narrow.host.w}`);

        // *** v4863 -- THE DIALS ARE BACK, AND THE TWO CHECKS THAT ASSERTED THEIR ABSENCE ARE INVERTED. *** Keith:
        // "when it loads, there should be gauges and avatar, but only avatar is appearing." v4413 hid the dials
        // so the avatar could take the row, on his ask then to "extend the avatar and the new gauges in that
        // same scene", and the gauges in the scene were never built for the default SVG robot -- so this gate
        // spent 450 versions asserting, correctly, a page with no gauges on it. The row is now SHARED, and
        // what is checked is that the two of them fill it between them, beside each other.
        const beside = (b) => !!b.dials && !!b.host && Math.abs(b.dials.t - b.host.t) <= 2 && b.dials.w > 0 && b.host.w > 0;
        const spans = (b) => beside(b) && !!b.row && Math.abs(b.dials.l - b.row.l) <= 2 && Math.abs(b.host.r - b.row.r) <= 2;
        ok("!! *** THE SVG DIALS ARE IN THE ROW, BESIDE THE AVATAR, at BOTH widths ***",
           r.dialsParent === "dialsRow" && beside(wide) && beside(narrow),
           `#dials' parent is #${r.dialsParent}; dials ${wide.dials && wide.dials.w} px and avatar ${wide.host && wide.host.w} ` +
           `side by side at the ${wide.row && wide.row.w} row, ${narrow.dials && narrow.dials.w} and ${narrow.host && narrow.host.w} ` +
           `at the ${narrow.row && narrow.row.w} one. FROM v4413 TO v4862 THE DIALS SAT IN A display:none WRAPPER, ` +
           "still built and still polling, and measured 0 px wide on every load");
        ok("!! ...and between them they reach both ends of the row, the avatar taking what the dials leave",
           spans(wide) && spans(narrow),
           `dials from ${wide.dials && wide.dials.l} (row ${wide.row && wide.row.l}), avatar to ${wide.host && wide.host.r} ` +
           `(row ${wide.row && wide.row.r}). The avatar's share is the row less the dials, NOT A TYPED WIDTH -- ` +
           "v4413's sizeFromHost still makes the box the authority, and this is the box");
        const tiny = r.tiny || {};
        ok("!! ...and on a phone-width row the avatar WRAPS UNDER the dials rather than being squeezed past its floor",
           !!tiny.dials && !!tiny.host && !!tiny.row && tiny.host.t >= tiny.dials.b - 2 && tiny.host.w / tiny.row.w > 0.98,
           `the ${tiny.row && tiny.row.w} px row: dials ${tiny.dials && tiny.dials.w} wide, avatar below them at ` +
           `${tiny.host && tiny.host.w}. Beside them it would have had ${tiny.row && tiny.dials ? tiny.row.w - tiny.dials.w : "?"} ` +
           "px less the gap, against the mount's minSize of 120");

        // *** v4451 -- THIS CHECK CHANGED SHAPE BECAUSE THE DESIGN DID, AND THE OLD FORM WOULD NOW PASS ON A
        // DEAD OBSERVER. *** v4413 asserted `wide.surface.w > narrow.surface.w + 20` at 1400 and 900. With
        // maxSize:420 both of those rows are ABOVE the ceiling, so both surfaces read 336 and the old
        // inequality is simply false -- but the failure mode that matters is the opposite one: had the cap
        // been set just high enough, the two would have read equal for a GOOD reason and equal for a dead
        // ResizeObserver would look identical. So the property is split in two and each half is driven at a
        // width where it can actually fail.
        // v4863 -- AND THE WIDTHS MOVED, BECAUSE THE AVATAR'S SHARE DID. With the dials back, 1400 gives the
        // avatar 334 px -- below the ceiling -- so 900 and 1400 are now the TRACKING pair, and the ceiling is
        // read at 1900 and 2400, where its share was measured at 543 and 793.
        const big = r.big || {}, huge = r.huge || {}, shrunk = r.shrunk || {};
        ok("!! ...and the SURFACE follows the box BELOW the ceiling, which is what a ResizeObserver is for",
           !!wide.surface && !!narrow.surface && wide.surface.w > narrow.surface.w + 20,
           `surface ${narrow.surface && narrow.surface.w} px for the ${narrow.host && narrow.host.w} px avatar box, ` +
           `${wide.surface && wide.surface.w} for the ${wide.host && wide.host.w} one. ` +
           "A SCENE MEASURED ONCE AT MOUNT IS A TYPED CONSTANT THAT ARRIVES LATE: the panel " +
           "opening or the window resizing moves the box, and the scene has to move with it");
        ok("!! *** ...and it is PINNED at the ceiling above it, which is the cap Keith asked for ***",
           !!big.surface && !!huge.surface && big.surface.w === huge.surface.w && !!wide.surface &&
           big.surface.w > wide.surface.w && !!big.host && !!huge.host && huge.host.w > big.host.w + 100,
           `avatar box ${big.host && big.host.w} -> ${huge.host && huge.host.w} and the surface holds at ` +
           `${big.surface && big.surface.w} px. MEASURED BEFORE THE CAP: 341 / 621 / 749 / 1005 px at window ` +
           "widths 900 / 1400 / 1920 / 2560, WITH THE ROBOT INSIDE DRAWN 100 px WIDE AT ALL FOUR -- the viewBox " +
           "is 60x88 and letterboxes into a 147 px-tall box, so every pixel past ~100 was empty and a box that " +
           "tripled held the same figure. The row still grows; the scene no longer follows it into nothing");
        // v4863 -- THE AVATAR'S flex-basis IS 120px, NOT auto, AND THIS IS THE LINE THAT HOLDS IT. A basis of
        // auto is the SURFACE's width, so it REMEMBERS the last size: wrapped under the dials on a phone-width
        // row (surface ~267 there), the avatar asks for 267 again when the row widens to 426, the dials plus
        // that overflow it, and it stays wrapped. SABOTAGED: basis back to auto -> 4 red, this line among them.
        ok("!! ...and when the row WIDENS again after the phone wrap, the avatar comes back BESIDE the dials",
           beside(narrow) && !!narrow.row && narrow.host.w < narrow.row.w * 0.9,
           `360 -> 900: avatar ${narrow.host && narrow.host.w} px ${beside(narrow) ? "beside" : "NOT beside"} dials ` +
           `${narrow.dials && narrow.dials.w} in the ${narrow.row && narrow.row.w} row. A basis of auto is the ` +
           "surface's last width, so an avatar that had a whole line to itself keeps asking for it");
        // REPORTED, NOT ASSERTED: the same memory from the other side, a window SHRINKING from above the
        // ceiling. In a standalone Chromium window, 1900 -> 1400 with a basis of auto WRAPPED (row 670, dials
        // 357, surface 420). In THIS harness it does not -- the surface is 336 zoomed px and the dials stay 285,
        // which fit the 676 row with room to spare -- so a check here would pass under its own sabotage, and a
        // check that cannot fail is not one. The line above is what the sabotage turns red.
        say(`shrinking 2400 -> 1400: avatar ${shrunk.host && shrunk.host.w} px, ${beside(shrunk) ? "beside" : "NOT beside"} ` +
            `dials ${shrunk.dials && shrunk.dials.w} in the ${shrunk.row && shrunk.row.w} row (reported, not asserted -- see the comment)`);

        ok("...and the row keeps the height the dials used to prop it to",
           !!wide.row && wide.row.h >= 140,
           `row ${wide.row && wide.row.h} px tall. #dials carried min-height:230px, so retiring it measured the ` +
           "row at 100 where it had been 184 -- an avatar that gained the whole width and lost half its height " +
           "is not filling the space. THE SAME 230 now sits on the row it was actually sizing, not a new number");

        const st = r.staged;
        const stOk = !!st && !st.error;
        ok("!! *** THE INFO TAB HIDES THE DIALS AND THE AVATAR, AND BOTH COME BACK AS THEY WERE ***",
           stOk && st.onInfo.display === "none" && st.onInfo.w === 0 && st.onInfo.dials === "none" &&
           st.back.w === st.before.w && st.back.row === st.before.row && st.back.dialsW === st.before.dialsW && st.back.w > 0,
           stOk
             ? `start: avatar ${st.before.w}, dials ${st.before.dialsW}, row ${st.before.row}; showInfo -> avatar ` +
               `${st.onInfo.display}, dials ${st.onInfo.dials}; showGauges -> avatar ${st.back.w}, dials ${st.back.dialsW}, ` +
               `row ${st.back.row}. v3671 put the avatar in gaugeInfoPanel's hideWith list because it is a SIBLING ` +
               "of #dials -- an avatar left standing beside the info box is one regression, and a row that comes " +
               "back narrower is the other"
             : `could not drive the panel: ${st ? st.error : "no _gaugeInfo"}`);
        ok("!! ...and the dials come back as FLEX, from the stylesheet, after the panel CLEARED their inline display",
           stOk && st.back.dials === "flex",
           stOk ? `#dials resolves to ${st.back.dials} after showGauges(). gaugeInfoPanel writes ` +
             "`dialsEl.style.display = \"\"`, which deletes an inline display: an inline flex would come back as " +
             "BLOCK. The flex is a server.html rule for that reason" : "not measured");
        ok("!! ...and the info box the tab raises is VISIBLE, with text in it -- which it was not from v4413 to v4862",
           stOk && !!st.onInfo.info && st.onInfo.info.w > 0 && st.onInfo.info.h > 0 && st.onInfo.info.text > 0,
           stOk && st.onInfo.info ? `info box ${st.onInfo.info.w}x${st.onInfo.info.h}, ${st.onInfo.info.text} characters. ` +
             "gaugeInfoPanel mounts it into #dials' PARENT, which was the display:none wrapper -- so the Hover/Select " +
             "tab hid the gauges and the avatar and showed an empty row" : "no visible info box in the row");

        // *** v4868 -- THIS LINE ASSERTED "BLOCK", AND BLOCK WAS A RUNAWAY. *** It recorded, accurately, that
        // gaugeInfoPanel's cleared inline display left #dialsRobot a block box -- and a block box puts the surface
        // on a text line with descender space under it, 6 px of it. sizeFromHost builds the surface to the host's
        // height, so the host grew 6 px, so the surface did: 230 -> 420 over 3.6 s of a 1900 load, stopped only
        // by v4451's ceiling. The host is a flex box from a server.html rule now, and the next line holds the
        // consequence rather than the declaration.
        ok("!! ...and the avatar's box comes back as FLEX, from the stylesheet, after the panel CLEARED its inline display",
           stOk && st.back.display === "flex",
           stOk ? `#dialsRobot resolves to ${st.back.display} after showGauges(). As a block box it carried the surface ` +
             "on a text line, 6 px taller than the surface, and sizeFromHost chased that 6 px up to the ceiling" : "not measured");
        // The runaway's two signatures, read where the avatar is HEIGHT-bound (1900, 2400): the box TALLER than
        // the surface it holds (the 6 px line gap that feeds the loop), and a surface pushed to the 420 ceiling.
        // Comparing row heights across widths would not do: run away, both rows saturate at the cap and read EQUAL.
        const ceil = 420 * (parseFloat(r.zoom) || 1);
        const settled = (b) => !!b.surface && !!b.host && b.host.h - b.surface.h <= 1 && b.surface.h < ceil - 20;
        ok("!! *** ...and NO RUNAWAY: where the avatar is height-bound its box is no taller than its surface, and the surface is nowhere near the ceiling ***",
           settled(big) && settled(huge),
           `at 1900: surface ${big.surface && big.surface.h} in a ${big.host && big.host.h} px box; at 2400: ` +
           `${huge.surface && huge.surface.h} in ${huge.host && huge.host.h}; the ceiling reads ${Math.round(ceil)} here. ` +
           "BEFORE v4868 THE 1900 LOAD RAN 230 -> 420 (unzoomed) IN 6 px STEPS, the box always 6 px taller than its surface");

        const pk = r.picker;
        ok("!! ...and the favourites picker is NOT CLIPPED on a phone-width row after a visit to the info tab",
           !!pk && !pk.error && pk.visible === true && pk.overflow !== "hidden",
           pk && !pk.error ? `row overflow ${pk.overflow}; picker bottom ${pk.bottom} against the row's ${pk.rowBottom}, ` +
             `its last pixels ${pk.visible ? "visible" : "HIDDEN"}. gaugeInfoPanel's stretchToRow set overflow:hidden for ` +
             "the info pane and never handed it back, so after one hover the gauges' row clipped the picker's bottom 65 px"
             : `could not open the picker: ${pk ? pk.error : "no _gaugeInfo or no star"}`);

        {
        const a = (probe.result || {}).axis;
        if (!a || a.error) {
            ok("!! the staged growth AXIS could not be measured", false,
               "no _panelStage on the page" + (a && a.error ? ": " + a.error : "") +
               ". This is the half v4450 was reported about, and it is a layout claim -- there is no reading of " +
               "the stylesheet that answers it, because the answer depends on which parent the node is in");
        } else {
            // *** v4863 -- v4450's "THE RAIL DOES NOT GROW" IS REPLACED, AND THE REASON IS WHAT IT GREW AROUND. ***
            // v4450 measured 720 px of EMPTY column and pinned the rail to its content. The column was empty
            // because the info box was mounted inside the hidden wrapper; with the box visible, gaugeInfoPanel's
            // stretchToRow (v3912) takes the rail to the staged panel's height on purpose, so the info text
            // top-aligns with the drawer and reaches its bottom. What must not grow is the AVATAR, and it is not
            // in the column at all -- which is checked here rather than assumed.
            ok("!! *** STAGED, THE RAIL HOLDS THE INFO TEXT AT THE PANEL'S HEIGHT, AND NEITHER THE AVATAR NOR THE DIALS ***",
               !!a.inside && !a.inside.split(", ").some((id) => id === "dials" || id === "dialsRobot") && a.infoText > 0 &&
               Math.abs(a.fixed - a.panelH) <= 4,
               `staged: rail ${a.fixed} px against a ${a.panelH} px panel; visible inside it: ${a.inside || "nothing"}, ` +
               `${a.infoText} characters of info. v4450 read this box at 720 px with NOTHING in it`);
            ok("...and the home height is untouched by the visit",
               a.home === a.restored,
               `home ${a.home}, staged ${a.fixed}, restored ${a.restored}. RESTORE IS ASSERTED AND NOT ASSUMED: ` +
               "leaving a style on a node that has gone home is how a panel-stage bug becomes a 'the gauges look " +
               "wrong now' bug with no obvious cause, which is the rule onRestore already states for justifyContent");
            // *** THIS LINE WENT RED ON THE FIRST RUN AND THE FIX WAS WRONG, NOT THE CHECK. *** onRestore
            // first wrote `rail.style.flex = ""`, the idiom the handler beside it uses for justifyContent --
            // but #dialsRow's flex is in the element's INLINE style attribute, so clearing it DELETES the
            // declaration rather than falling back to a sheet. Measured: "0 1 auto" where the markup says
            // "1 1 auto", which is v4413's row silently un-filling itself after the first staged panel. The
            // home value is captured off the node at stage setup and put back verbatim; the width is checked
            // too, because a flex-grow that never came back is invisible in the height.
            ok("!! ...and the row comes home to the value the MARKUP gave it, in both flex and width",
               a.flex === a.homeFlex && a.restoredW === a.homeW && a.homeW > 0,
               `flex ${a.homeFlex} -> ${a.flex}, width ${a.homeW} -> ${a.restoredW}. COMPARED AGAINST THE NODE'S ` +
               "OWN STARTING VALUE, not a literal: a gate that typed \"1 1 auto\" would be a second declaration " +
               "of the thing the markup already says, and would go stale the day the markup changed");
            // v4863 -- MEASURED ON v4862 IN CHROMIUM: after "back to the right" the avatar sat at the BOTTOM of
            // the column, under the chat, the peer bar and every drawer. ui/panelStage.mjs sent the rail home
            // with appendChild; it now goes back to an anchor, as the panel always did.
            ok("!! *** ...and to the SAME PLACE in its column, not the bottom of it ***",
               !!a.homeSib && a.restoredSib === a.homeSib,
               `neighbours before: ${a.homeSib}; after: ${a.restoredSib}. Appended, the row comes back after the ` +
               "last drawer and the gauges and the avatar are off the bottom of the screen");
        }
    }

    REPORT.table("the dock, before and after", ["what", "v4412", "v4413-v4862", "v4863 wide", "v4863 narrow"], [
            ["row width", 676, 676, wide.row ? wide.row.w : 0, narrow.row ? narrow.row.w : 0],
            ["dials width", 288, 0, wide.dials ? wide.dials.w : 0, narrow.dials ? narrow.dials.w : 0],
            ["avatar host width", 178, 676, wide.host ? wide.host.w : 0, narrow.host ? narrow.host.w : 0],
        ], "Read through server.html's own body zoom of 0.8, the same way in every column. v4412 and v4413-v4862 are the figures recorded at v4413, at the wide width.");
    }
}

REPORT.write();
console.log();
console.log("  ----  WHAT THIS DOES NOT CLAIM. That the scene looks better: it is bigger and it tracks its box,");
console.log("  ----  and whether the avatar and its gauges USE the room is a design question a gate cannot ask.");
console.log("  ----  That the SVG robot fills the width -- it keeps its own aspect and letterboxes, which is");
console.log("  ----  correct for a figure and is why the surface reads narrower than the host. And that every");
console.log("  ----  avatar mode was measured: the live section drives whichever mode the page starts in, and");
console.log("  ----  the framed modes take width and height directly, which is checked in section 1 and not here.");
if (fails) { console.log("avatarDock-selfcheck: " + fails + " FAILURES"); process.exit(1); }
console.log("avatarDock-selfcheck: all checks pass");
