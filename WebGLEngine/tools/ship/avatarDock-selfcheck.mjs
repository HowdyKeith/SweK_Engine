#!/usr/bin/env node
// WebGLEngine/tools/ship/avatarDock-selfcheck.mjs -- v4413
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
            return { wide, narrow, staged, zoom: getComputedStyle(d.body).zoom,
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

        ok("!! ...and the SURFACE follows the box when the box moves, which is what a ResizeObserver is for",
           !!wide.surface && !!narrow.surface && wide.surface.w > narrow.surface.w + 20,
           `surface ${wide.surface && wide.surface.w} px at the wide row, ${narrow.surface && narrow.surface.w} ` +
           "at the narrow one. A SCENE MEASURED ONCE AT MOUNT IS A TYPED CONSTANT THAT ARRIVES LATE: the panel " +
           "opening or the window resizing moves the box, and the scene has to move with it");

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
