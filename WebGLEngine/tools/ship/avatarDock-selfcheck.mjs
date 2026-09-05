#!/usr/bin/env node
// WebGLEngine/tools/ship/avatarDock-selfcheck.mjs -- v4413, widened v4450
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
            const box = (id) => { const e = d.getElementById(id); if (!e) return null;
                const b = e.getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height) }; };
            const read = () => {
                const robot = d.getElementById("dialsRobot");
                const surf = robot ? [...robot.children].find((c) => getComputedStyle(c).position === "static") : null;
                const sb = surf ? surf.getBoundingClientRect() : null;
                return { row: box("dialsRow"), dials: box("dials"), host: box("dialsRobot"),
                         surface: sb ? { w: Math.round(sb.width), h: Math.round(sb.height) } : null };
            };
            const wide = read();
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
            // the staged-panel path: gaugeInfoPanel hides the avatar WITH the dials, and this round moved the
            // dials without moving that contract.
            // The panel exposes showInfo()/showGauges(), NOT show(): the first draft of this gate reached for
            // gi.show and reported the contract "not checked" rather than failing, which is the right shape
            // for a missing handle and the wrong answer when the handle simply had another name.
            let staged = null;
            try {
                const gi = w._gaugeInfo;
                const robot = d.getElementById("dialsRobot"), row = d.getElementById("dialsRow");
                const snap = () => ({ display: getComputedStyle(robot).display,
                    w: Math.round(robot.getBoundingClientRect().width),
                    row: Math.round(row.getBoundingClientRect().width) });
                if (gi && gi.showInfo && gi.showGauges) {
                    const before = snap();
                    gi.showInfo(); await new Promise((r) => setTimeout(r, 600));
                    const onInfo = snap();
                    gi.showGauges(); await new Promise((r) => setTimeout(r, 800));
                    staged = { before, onInfo, back: snap() };
                }
            } catch (e) { staged = { error: String(e && e.message) }; }

            // *** v4450 -- THE RAIL IS MOVED BETWEEN PARENTS OF DIFFERENT flex-direction AT RUNTIME, AND
            // flex:1 1 auto MEANS A DIFFERENT AXIS IN EACH. *** #dialsRow's home is a row-direction flex,
            // so v4413's flex:1 1 auto means grow HORIZONTALLY -- which is the whole of what that round was
            // asked for. panelStage moves the same node into #stageInfo, which is flex-direction:column, and
            // the identical declaration then means grow VERTICALLY, up to the height of the staged panel.
            // The counterfactual is driven ON THE SAME LIVE PAGE rather than compared against a number from
            // another run: present a tall panel, read the row, put the pre-v4450 value back, read it again.
            let axis = null;
            try {
                const st = w._panelStage, row = d.getElementById("dialsRow");
                if (st && st.present && row) {
                    const tall = d.createElement("div"); tall.style.height = "900px"; tall.textContent = "staged";
                    d.body.appendChild(tall);
                    const h = () => Math.round(row.getBoundingClientRect().height);
                    const home = h(), homeFlex = getComputedStyle(row).flex, homeW = Math.round(row.getBoundingClientRect().width);
                    st.present(tall); await new Promise((r) => setTimeout(r, 900));
                    const fixed = h();
                    row.style.flex = "1 1 auto";                       // exactly what the stylesheet says, pre-v4450
                    await new Promise((r) => setTimeout(r, 700));
                    const before = h();
                    row.style.flex = "0 0 auto";
                    st.restore(); await new Promise((r) => setTimeout(r, 900));
                    axis = { home, homeFlex, homeW, fixed, before, restored: h(),
                             flex: getComputedStyle(row).flex, restoredW: Math.round(row.getBoundingClientRect().width) };
                }
            } catch (e) { axis = { error: String(e && e.message) }; }

            return { wide, narrow, tiny, staged, axis, zoom: getComputedStyle(d.body).zoom,
                     dialsPresent: !!d.getElementById("dials") };
        }` });

    if (probe.skipped) {
        ok("!! *** the live dock could not be measured ***", false,
           "SKIPPED: " + probe.reason + ". This gate's whole subject is a LAYOUT, and a layout claim with no " +
           "browser behind it is a claim about source text");
    } else {
        const r = probe.result || {};
        const wide = r.wide || {}, narrow = r.narrow || {};
        say(`zoom ${r.zoom}; wide: row ${wide.row && wide.row.w}, dials ${wide.dials && wide.dials.w}, host ` +
            `${wide.host && wide.host.w}; narrow: row ${narrow.row && narrow.row.w}, host ${narrow.host && narrow.host.w}`);

        ok("!! *** THE SVG DIALS ARE OUT OF THE ROW, and still present for every path that reads them ***",
           !!wide.dials && wide.dials.w === 0 && r.dialsPresent === true,
           `#dials measures ${wide.dials ? wide.dials.w : "?"} px wide and getElementById finds it: ` +
           `${r.dialsPresent}. *** THE FIRST DRAFT SET style="display:none" ON #dials AND MEASURED IT 285 PX ` +
           "WIDE ANYWAY: *** gaugeInfoPanel's show() writes `dialsEl.style.display = infoUp ? \"none\" : \"\"`, " +
           "and the empty string CLEARS THE INLINE STYLE -- which is where the none was. A wrapper the panel " +
           "does not know about cannot be cleared by it");

        const fills = (b) => b.host && b.row && b.row.w > 0 && b.host.w / b.row.w > 0.98;
        ok("!! *** THE AVATAR SPANS ITS ROW, at BOTH widths ***",
           fills(wide) && fills(narrow),
           `host/row = ${wide.host && wide.row ? (wide.host.w / wide.row.w).toFixed(3) : "?"} wide, ` +
           `${narrow.host && narrow.row ? (narrow.host.w / narrow.row.w).toFixed(3) : "?"} narrow. BEFORE v4413 ` +
           "IT WAS 178 OF 676 -- 0.263. Two widths, because the defect was a FIXED NUMBER and a fixed number " +
           "is right at exactly one width by luck");

        // *** v4451 -- THIS CHECK CHANGED SHAPE BECAUSE THE DESIGN DID, AND THE OLD FORM WOULD NOW PASS ON A
        // DEAD OBSERVER. *** v4413 asserted `wide.surface.w > narrow.surface.w + 20` at 1400 and 900. With
        // maxSize:420 both of those rows are ABOVE the ceiling, so both surfaces read 336 and the old
        // inequality is simply false -- but the failure mode that matters is the opposite one: had the cap
        // been set just high enough, the two would have read equal for a GOOD reason and equal for a dead
        // ResizeObserver would look identical. So the property is split in two and each half is driven at a
        // width where it can actually fail.
        const tiny = r.tiny || {};
        ok("!! ...and the SURFACE follows the box BELOW the ceiling, which is what a ResizeObserver is for",
           !!tiny.surface && !!narrow.surface && narrow.surface.w > tiny.surface.w + 20,
           `surface ${narrow.surface && narrow.surface.w} px at the ${narrow.row && narrow.row.w} row, ` +
           `${tiny.surface && tiny.surface.w} at the ${tiny.row && tiny.row.w} one. ` +
           "A SCENE MEASURED ONCE AT MOUNT IS A TYPED CONSTANT THAT ARRIVES LATE: the panel " +
           "opening or the window resizing moves the box, and the scene has to move with it");
        ok("!! *** ...and it is PINNED at the ceiling above it, which is the cap Keith asked for ***",
           !!wide.surface && !!narrow.surface && wide.surface.w === narrow.surface.w &&
           !!wide.row && !!narrow.row && wide.row.w > narrow.row.w + 100,
           `row ${narrow.row && narrow.row.w} -> ${wide.row && wide.row.w} and the surface holds at ` +
           `${wide.surface && wide.surface.w} px. MEASURED BEFORE THE CAP: 341 / 621 / 749 / 1005 px at window ` +
           "widths 900 / 1400 / 1920 / 2560, WITH THE ROBOT INSIDE DRAWN 100 px WIDE AT ALL FOUR -- the viewBox " +
           "is 60x88 and letterboxes into a 147 px-tall box, so every pixel past ~100 was empty and a box that " +
           "tripled held the same figure. The row still grows; the scene no longer follows it into nothing");

        ok("...and the row keeps the height the dials used to prop it to",
           !!wide.row && wide.row.h >= 140,
           `row ${wide.row && wide.row.h} px tall. #dials carried min-height:230px, so retiring it measured the ` +
           "row at 100 where it had been 184 -- an avatar that gained the whole width and lost half its height " +
           "is not filling the space. THE SAME 230 now sits on the row it was actually sizing, not a new number");

        const st = r.staged;
        ok("!! *** THE STAGED PANEL STILL HIDES THE AVATAR, AND IT COMES BACK AT FULL WIDTH ***",
           !!st && !st.error && st.onInfo.display === "none" && st.onInfo.w === 0 &&
           st.back.w === st.back.row && st.back.w > 0,
           st && !st.error
             ? `start ${st.before.display} at ${st.before.w}/${st.before.row}; showInfo -> ${st.onInfo.display} at ` +
               `${st.onInfo.w}; showGauges -> ${st.back.display} at ${st.back.w}/${st.back.row}. v3671 put the ` +
               "avatar in gaugeInfoPanel's hideWith list because it is a SIBLING of #dials, and this round moved " +
               "#dials into a wrapper -- an avatar left standing beside a staged panel is the regression that " +
               "would cause, and a narrowed one on the way back is the other"
             : `could not drive the panel: ${st ? st.error : "no _gaugeInfo"}`);

        ok("...and the display it comes back as is BLOCK, not the inline-flex the markup asks for",
           !!st && !st.error && st.back.display === "block",
           st && !st.error ? `#dialsRobot resolves to ${st.back.display}. gaugeInfoPanel writes ` +
             "`el.style.display = \"\"` which CLEARS THE INLINE DISPLAY, so the inline-flex in the markup " +
             "survives only until the first showGauges(). THE ROW STILL FILLS BECAUSE flex:1 1 auto IS WHAT " +
             "MAKES IT FILL and that is not cleared -- said here because a reader of the markup would expect " +
             "inline-flex and measure block" : "not measured");

        {
        const a = (probe.result || {}).axis;
        if (!a || a.error) {
            ok("!! the staged growth AXIS could not be measured", false,
               "no _panelStage on the page" + (a && a.error ? ": " + a.error : "") +
               ". This is the half v4450 was reported about, and it is a layout claim -- there is no reading of " +
               "the stylesheet that answers it, because the answer depends on which parent the node is in");
        } else {
            ok("!! *** THE RAIL DOES NOT GROW ON THE AXIS IT WAS NEVER SIZED FOR ***",
               a.fixed > 0 && a.before > 0 && a.fixed < a.before * 0.6,
               `staged: ${a.fixed} px tall with v4450's pin, ${a.before} px without it -- ` +
               `${a.before - a.fixed} px of EMPTY column reclaimed, measured on one page moments apart. ` +
               "The avatar itself is hidden while a panel is staged (onPresent raises the info tab, which is " +
               "what hides it), so this box was empty at 720 px -- a gap, not a giant robot");
            ok("...and the home height is untouched, so v4413's row is not narrowed to buy it",
               a.home === a.restored && Math.abs(a.home - a.fixed) < 4,
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
        }
    }

    REPORT.table("the dock, before and after", ["what", "v4412", "v4413 wide", "v4413 narrow"], [
            ["row width", 676, wide.row ? wide.row.w : 0, narrow.row ? narrow.row.w : 0],
            ["dials width", 288, wide.dials ? wide.dials.w : 0, narrow.dials ? narrow.dials.w : 0],
            ["avatar host width", 178, wide.host ? wide.host.w : 0, narrow.host ? narrow.host.w : 0],
        ], "Read through server.html's own body zoom of 0.8, the same way in every column.");
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
