// WebGLEngine/ui/stageInfo-selfcheck.mjs -- v3812
//
// Run: node ui/stageInfo-selfcheck.mjs
//
// *** THE ASK, AND WHY IT IS THREE CHANGES RATHER THAN ONE. *** Keith, looking at a clicked drawer on the rig:
// "the gauges and avatar should not be shown on a clicked server.html open panel. in this case the Voxel &
// Render should fill the panel. the link hover which shows in the hover link info panel, this view should have
// an info panel to the right of Voxel & Render or whichever link panel is placed there, and the Voxel & Render
// panel box left justified and SET TO THAT WIDTH so the info panel doesn't ever restructure the view each new
// link panel placed there."
//
//   (1) THE GAUGES AND THE AVATAR GO. Not by hiding them from the stage -- by RAISING THE INFO TAB, which is
//       already the one thing on this page that hides #dials and everything in hideWith. The stage asks for a
//       tab; ui/gaugeInfoPanel.js decides what that hides. A display:none typed into server.html would be a
//       second declaration of "the gauges" and would rot the first time that list changed (v3671 added the
//       avatar to it for exactly this reason).
//   (2) THE INFO PANEL MOVES TO THE RIGHT of the presented panel. panelStage gains `railHost`, DEFAULTED to
//       stageHost so every pre-v3812 caller is untouched -- the module still does not know left from right.
//   (3) THE PANEL IS A FIXED WIDTH. This is the part that is easy to get wrong by doing nothing: a panel
//       sized to its own content moves the info column every time a different drawer is opened, which is the
//       "restructure the view" Keith names. 460px is #rightStack's OWN flex-basis, so it is the width these
//       panels were authored at rather than a number picked to look right.
//
// *** WHAT THIS GATE CAN AND CANNOT SEE, SAID FIRST. *** It drives the two modules against a DOM stub and a
// stepped clock, so the MOVES and the TAB LOGIC are real tests. It reads server.html's source for the wiring.
// It loads the page in a headless Chromium when one is present. IT CANNOT SEE A PIXEL: whether 460px is a
// comfortable width, whether the info column looks right beside a tall panel, and whether the whole thing
// reads as one view are Keith's first hard-reload and nothing here substitutes for that.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeStage } from "./panelStage.mjs";
import { makeAutoTab } from "./gaugeInfoPanel.js";
import { HEADLESS_SHELL, resolvePlaywright } from "../tools/ship/playwrightResolve.mjs";

let fails = 0;
const ok = (n, c, d) => { console.log((c ? "  PASS  " : "  FAIL  ") + n + (d ? "   " + d : "")); if (!c) fails++; };
const say = (m) => console.log("  ----  " + m);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRV = readFileSync(path.join(ROOT, "server.html"), "utf8");
const GIP = readFileSync(path.join(ROOT, "ui/gaugeInfoPanel.js"), "utf8");
const PST = readFileSync(path.join(ROOT, "ui/panelStage.mjs"), "utf8");

// ---- the smallest DOM that can hold the question, same shape as ui/panelStage-selfcheck's ------------------
let uid = 0;
function node(tag, id) {
    return {
        tagName: tag, id: id || ("n" + (++uid)), nodeType: tag === "#comment" ? 8 : 1,
        childNodes: [], parentNode: null, style: {},
        appendChild(c) { if (c.parentNode) c.parentNode.removeChild(c); c.parentNode = this; this.childNodes.push(c); return c; },
        removeChild(c) { const i = this.childNodes.indexOf(c); if (i >= 0) this.childNodes.splice(i, 1); c.parentNode = null; return c; },
        insertBefore(c, ref) {
            if (c.parentNode) c.parentNode.removeChild(c);
            const i = ref ? this.childNodes.indexOf(ref) : -1;
            if (i < 0) this.childNodes.push(c); else this.childNodes.splice(i, 0, c);
            c.parentNode = this; return c;
        },
    };
}
const doc = { createComment: () => node("#comment") };
const idsOf = (p) => p.childNodes.map((c) => (c.nodeType === 8 ? "#" : c.id)).join(",");

function world() {
    const right = node("div", "right"), body = node("div", "BODY"), info = node("div", "INFO");
    const home = node("div", "HOME"), rail = node("div", "RAIL");
    const a = node("div", "A"), b = node("div", "B");
    right.appendChild(a); right.appendChild(b); home.appendChild(rail);
    return { right, body, info, home, rail, a, b };
}

// ================================================================================================================
say("1. THE RAIL LANDS IN A DIFFERENT CONTAINER FROM THE PANEL, AND STILL GOES HOME");
// ================================================================================================================
{
    const w = world();
    const st = makeStage({ doc, stageHost: w.body, railHost: w.info, rail: w.rail, railHome: w.home });
    st.present(w.b);
    ok("!! *** THE PANEL IS ALONE IN THE STAGE BODY ***", idsOf(w.body) === "B",
        "stage body holds [" + idsOf(w.body) + "]. THE FIXED 460px BELONGS TO THE PANEL AND NOTHING ELSE -- a " +
        "rail sharing that box would eat the width the panel was authored for");
    ok("!! *** AND THE GAUGE ROW IS IN THE INFO COLUMN BESIDE IT ***", idsOf(w.info) === "RAIL",
        "info column holds [" + idsOf(w.info) + "]");
    ok("the panel is the SAME OBJECT, not a copy", w.body.childNodes[0] === w.b,
        "v3667's rule, unchanged: these panels carry live pollers and half-typed form state, and a clone is " +
        "a dead twin that looks right");
    st.restore();
    ok("!! the panel returns between its old neighbours", idsOf(w.right) === "A,B",
        "and the stage body is empty: [" + idsOf(w.body) + "]");
    ok("!! the rail returns home and the info column is left empty",
        idsOf(w.home) === "RAIL" && w.info.childNodes.length === 0,
        "home [" + idsOf(w.home) + "], info column " + w.info.childNodes.length + " children -- A ROW LEFT " +
        "STRANDED IN A HIDDEN COLUMN IS A SET OF LIVE POLLERS NOBODY CAN SEE");
}
{
    // *** THE DEFAULT IS THE COMPATIBILITY GUARANTEE AND IT IS DRIVEN, NOT ASSERTED. *** Every caller written
    // before v3812 passes no railHost at all, and v3667's own gate asserts the rail sits BEFORE the panel
    // inside the stage. If the default were anything but stageHost that check would have gone red.
    const w = world();
    const st = makeStage({ doc, stageHost: w.body, rail: w.rail, railHome: w.home });
    st.present(w.b);
    ok("!! *** WITH NO railHost THE RAIL STILL GOES INTO THE STAGE, BEFORE THE PANEL ***", idsOf(w.body) === "RAIL,B",
        "[" + idsOf(w.body) + "] -- v3667's arrangement exactly, which is why ui/panelStage-selfcheck still passes");
    st.restore();
}

// ================================================================================================================
say("\n2. A PINNED INFO TAB CANNOT BE LOWERED BY A PASSING POINTER");
// ================================================================================================================
//
// *** THIS IS THE CHECK THE FEATURE ACTUALLY RESTS ON. *** pinInfo raises the tab through userTook() and
// nothing else; if the automation could still lower it, the gauges and the avatar would REAPPEAR beside the
// presented panel a second and a half after the pointer left a link -- the exact thing Keith asked to remove,
// arriving on a timer instead of on a click. Driven on a stepped clock rather than waited out.
{
    let now = 0;
    const timers = new Map(); let th = 0;
    const setTimer = (f, ms) => { const h = ++th; timers.set(h, { f, at: now + ms }); return h; };
    const clearTimer = (h) => timers.delete(h);
    const step = (ms) => {
        now += ms;
        for (const [h, t] of [...timers]) if (t.at <= now) { timers.delete(h); t.f(); }
    };
    const auto = makeAutoTab({ raiseMs: 140, returnMs: 1400, setTimer, clearTimer });

    let tab = "gauges";
    const showInfo = () => { tab = "info"; };
    const lower = () => { tab = "gauges"; };

    // what pinInfo(true) does, spelled with the same two calls
    auto.userTook(); tab = "info";
    ok("!! the pin raises the info tab", tab === "info");

    auto.hover(tab, showInfo);
    ok("!! a hover over a link schedules NOTHING while the tab is already up", auto.pendingKind() === null,
        "hover() returns early when the current tab is info, so autoRaised can never be set while a panel is " +
        "on stage -- which is what makes the pin hold without a second flag");
    auto.leave(tab, lower);
    step(5000);
    ok("!! *** AND LEAVING DOES NOT LOWER IT, EVEN FIVE SECONDS LATER ***", tab === "info",
        "the automation may only undo what the automation did (v3622), and userTook() cleared autoRaised. " +
        "IF THIS WERE FALSE THE GAUGES WOULD SLIDE BACK OVER THE PANEL 1.4 SECONDS AFTER THE POINTER MOVED");

    // and the release hands the row back
    auto.userTook(); tab = "gauges";
    ok("the release returns the row to the GAUGES, its resting state", tab === "gauges",
        "not to whatever tab happened to be up before -- lockHeight() measures the gauges pane precisely " +
        "because that is the state the layout below was sized for");

    // A CONTROL: without the pin, the same sequence DOES lower the tab. Otherwise the check above could be
    // passing because this stub cannot lower a tab at all.
    let tab2 = "gauges";
    const auto2 = makeAutoTab({ raiseMs: 140, returnMs: 1400, setTimer, clearTimer });
    auto2.hover(tab2, () => { tab2 = "info"; });
    step(200);
    auto2.leave(tab2, () => { tab2 = "gauges"; });
    step(2000);
    ok("!! CONTROL: an UNPINNED hover-raised tab IS lowered by the same sequence", tab2 === "gauges",
        "so the pin is doing the work, rather than the fixture being unable to lower anything");
}

// ================================================================================================================
say("\n3. server.html IS WIRED THE WAY THE TWO MODULES EXPECT");
// ================================================================================================================
{
    ok("!! the stage has an info column and no rail", /id="stageInfo"/.test(SRV) && !/id="stageRail"/.test(SRV),
        "the 232px scaled rail is gone: with the dials hidden there is nothing narrow to make room for");
    // *** v3925 -- THIS ASSERTION WAS TESTING A DECISION THAT WAS DELIBERATELY REVERSED AT v3823, AND IT HAS
    // BEEN RED EVER SINCE WITHOUT ANYBODY SEEING IT. *** It required #stageBody to be flex:0 0 460px. server.html
    // quotes the reason it is not, in Keith's words on the rig: "the text info panel needs to be hard set to 4
    // times wider and always set to that, and the links panel on the left needs to fill that space ... so all
    // link panels are set to that width too." v3823 flipped the roles -- THE INFO COLUMN BECAME THE HARD-SET ONE
    // and #stageBody grows into what is left.
    //
    // THE CONCERN DID NOT CHANGE, ONLY WHICH BOX CARRIES IT: the view must not move between drawers. A basis
    // alone still GROWS under flex-grow and a max-width alone still SHRINKS, so the hard-set column needs both,
    // and #stageInfo pins all three (basis, max, min). Because that column is fixed inside a fixed-width parent,
    // every links panel still resolves to ONE width -- which is the property the old 460 was buying.
    //
    // A gate edited to agree with whatever shipped is this tree's named failure, so the evidence for moving it
    // is stated rather than assumed: the page carries the request verbatim, the change is dated and reasoned in
    // place, and the invariant asserted below is the SAME invariant, pinned to the box that now owns it.
    ok("!! *** THE INFO COLUMN IS THE HARD-SET BOX, AND IT NEITHER GROWS NOR SHRINKS ***",
        /id="stageInfo" style="flex:0 0 360px;max-width:360px;min-width:360px/.test(SRV),
        "flex:0 0 360px with a matching max-width AND min-width. A basis alone still GROWS under flex-grow and " +
        "a max-width alone still SHRINKS; Keith's complaint is that the view moves, so it must do neither -- " +
        "and since v3823 the box that must not move is the INFO column, not the panel");
    ok("...and the panel box fills whatever the fixed column leaves, rather than being pinned itself",
        /id="stageBody" style="flex:1 1 auto;min-width:0;/.test(SRV),
        "min-width:0 is not decoration: without it a flex child refuses to shrink below its content and the " +
        "row silently stops responding -- the same rule canvasFill enforces on the lab pages");
    ok("...and 460 is still #rightStack's own basis, which is where the panels were authored",
        /id="rightStack"[^>]*flex:1 1 460px/.test(SRV),
        "the panels were authored inside that column; on stage they now land near that width because a fixed " +
        "360 info column leaves about that much, rather than because a second copy of 460 was typed here");
    ok("!! the stage is told to put the rail in the info column", /railHost:info/.test(SRV));
    ok("!! *** THE GAUGES ARE HIDDEN BY RAISING THE TAB, NOT BY REACHING FOR THEM ***",
        /gi\.pinInfo\(true\)/.test(SRV) && !/dialsRobot"\)\.style\.display/.test(SRV),
        "show(\"info\") hides #dials and everything in hideWith, so the panel's OWN list decides what goes. A " +
        "display:none typed into the page would be a second declaration of that list");
    ok("!! and the pin is RELEASED on the way back", /gi\.pinInfo\(false\)/.test(SRV),
        "leaving the info tab up over the returned dials is how a stage bug becomes a \"the gauges are gone\" " +
        "bug with no obvious cause -- v3667 learned the same thing about a leftover transform");
    ok("!! no scale transform is left on the row in either direction",
        !/rail\.style\.transform/.test(SRV),
        "v3667 scaled the dials to 0.62 to fit a 232px rail and had to remember to remove it. The rail is " +
        "gone, so the transform is gone, and so is the thing it could leave behind");
    ok("the module still owns the module's job", /pinInfo\(on\)/.test(GIP) && /opts\.railHost/.test(PST),
        "pinInfo lives in gaugeInfoPanel and railHost in panelStage: server.html carries the ARRANGEMENT and " +
        "neither module carries this page's markup");
}

// ================================================================================================================
say("\n4. THE SABOTAGES");
// ================================================================================================================
{
    // Each corrupts the thing this round exists to fix, and re-runs the check that should catch it.
    const grown = SRV.replace('id="stageBody" style="flex:0 0 460px;max-width:460px', 'id="stageBody" style="flex:1 1 auto');
    ok("!! SABOTAGE: a panel that sizes to its content IS caught",
        !/id="stageBody" style="flex:0 0 460px;max-width:460px/.test(grown),
        "which is the defect by omission -- nothing looks broken, the info column simply lands somewhere new " +
        "every time a different drawer is opened");

    const unpinned = SRV.replace("gi.pinInfo(true)", "gi.pinInfo(false)");
    ok("!! SABOTAGE: a stage that never raises the tab IS caught", !/gi\.pinInfo\(true\)/.test(unpinned),
        "the gauges and the avatar would still be sitting beside the panel, which is where this round started");

    const stuck = SRV.replace("gi.pinInfo(false)", "/* released nowhere */");
    ok("!! SABOTAGE: a pin that is never released IS caught", !/gi\.pinInfo\(false\)/.test(stuck),
        "the row goes home with the info tab up, so the dials come back invisible");

    // And the one that matters most, because it is a silent behaviour change rather than a missing line:
    // if pinInfo stopped going through userTook, every check in section 2 would still read the same on the
    // first frame and the tab would drop 1.4s later.
    let tab = "info", now2 = 0; const tm = new Map(); let h2 = 0;
    const a3 = makeAutoTab({
        raiseMs: 140, returnMs: 1400,
        setTimer: (f, ms) => { const h = ++h2; tm.set(h, { f, at: now2 + ms }); return h; },
        clearTimer: (h) => tm.delete(h),
    });
    // a "pin" that raises WITHOUT taking ownership -- the plausible wrong spelling
    a3.hover("gauges", () => { tab = "info"; });
    now2 += 200; for (const [h, t] of [...tm]) if (t.at <= now2) { tm.delete(h); t.f(); }
    a3.leave(tab, () => { tab = "gauges"; });
    now2 += 2000; for (const [h, t] of [...tm]) if (t.at <= now2) { tm.delete(h); t.f(); }
    ok("!! SABOTAGE: a pin that raises WITHOUT userTook() drops the tab on a timer", tab === "gauges",
        "*** THIS IS THE ONE A SOURCE CHECK COULD NEVER SEE. *** The line is present, the tab goes up, the " +
        "screenshot looks right -- and 1.4 seconds after the pointer leaves a link the gauges slide back. " +
        "userTook() is not a courtesy call, it IS the pin");
}

// ================================================================================================================
say("\n5. A REAL BROWSER OPENS A DRAWER AND CHECKS ALL THREE ASKS AT ONCE");
// ================================================================================================================
//
// *** EVERY CHECK ABOVE THIS ONE PASSED ON A PAGE NOBODY HAD OPENED. *** The stub proves the moves and the
// stepped clock proves the tab logic, and neither can tell you that a real click reaches them: server.html
// carries 37 inline scripts, and a dead getElementById or a markup slip would leave all of the above green
// while the drawer did nothing. So this clicks a real drawer chip in a real Chromium and reads the result.
{
    const fs = await import("node:fs");
    // v4484: hand-copied from tools/ship/playwrightResolve.mjs, which exists to hold this once.
    // It named a Linux root, a Linux layout and a PINNED BUILD NUMBER, so it could never be
    // true on the rig. Imported now, and resolved per platform.
    const SHELL = HEADLESS_SHELL;
    // v4484: this was a hand-copy of ONE of PLAYWRIGHT_PATHS, which is the list resolvePlaywright tries in
    // order. Both halves of "where is chromium" were spelled here; both are imported now.
    const PW = resolvePlaywright().from;
    if (!fs.existsSync(SHELL) || !fs.existsSync(PW)) {
        console.log("  SKIP  the live drawer click   no chromium at " + SHELL + " -- SKIPPING WITH A REASON " +
            "RATHER THAN PASSING QUIETLY. A gate that reports green when it did not run is worse than one " +
            "that reports nothing.");
    } else {
        const { execFileSync } = await import("node:child_process");
        const script = `
import { createRequire } from "node:module";
import http from "node:http"; import fs from "node:fs"; import path from "node:path";
const { chromium } = createRequire(${JSON.stringify(PW)})(${JSON.stringify(PW)});
const ROOT = ${JSON.stringify(ROOT)};
const MIME = { ".html":"text/html", ".mjs":"text/javascript", ".js":"text/javascript", ".json":"application/json" };
const srv = http.createServer((req,res)=>{
  const f = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, {"Content-Type": MIME[path.extname(f)] || "application/octet-stream"});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>srv.listen(8751, r));
const b = await chromium.launch({ executablePath: ${JSON.stringify(SHELL)} });
const out = { errs: [], widths: {} };
for (const vw of [1280, 1920]) {
  const p = await b.newPage({ viewport: { width: vw, height: 900 } });
  p.on("pageerror", e => out.errs.push(String(e).split("\\n")[0]));
  await p.goto("http://127.0.0.1:8751/server.html", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1600);
  await p.evaluate(() => document.querySelector('#gaugeTabBar .gtab[data-tab="render"]')?.click());
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const g = id => document.getElementById(id), cs = e => e ? getComputedStyle(e) : null;
    const body = g("stageBody"), info = g("stageInfo"), rail = g("dialsRow");
    const panel = document.querySelector('.gpanel[data-panel="render"]');
    const bb = body.getBoundingClientRect(), ib = info.getBoundingClientRect();
    return { panelInBody: panel && panel.parentElement === body,
             railInInfo: rail && rail.parentElement === info,
             dials: cs(g("dials")).display, robot: cs(g("dialsRobot")).display,
             layoutW: body.offsetWidth, gap: Math.round(ib.left - bb.right),
             stage: cs(g("panelStage")).display };
  });
  out.widths[vw] = r;
  if (vw === 1280) {
    await p.evaluate(() => document.getElementById("stageBack")?.click());
    await p.waitForTimeout(700);
    out.back = await p.evaluate(() => {
      const g = id => document.getElementById(id), cs = e => e ? getComputedStyle(e) : null;
      const panel = document.querySelector('.gpanel[data-panel="render"]');
      return { stage: cs(g("panelStage")).display, railHome: g("dialsRow").parentElement.id,
               dials: cs(g("dials")).display, robot: cs(g("dialsRobot")).display,
               panelHome: panel.parentElement.id };
    });
  }
  await p.close();
}
await b.close(); srv.close();
console.log("__J__" + JSON.stringify(out));`;
        try {
            const raw = execFileSync(process.execPath, ["--input-type=module", "-e", script],
                { encoding: "utf8", timeout: 180000 });
            const r = JSON.parse(raw.split("__J__")[1]);
            const a = r.widths[1280], c = r.widths[1920];

            ok("!! the page loads and a drawer chip click reaches the stage", r.errs.length === 0 && a.stage === "flex",
                r.errs.length ? r.errs.join(" | ") : "no page error, #panelStage display flex after the click");
            ok("!! *** THE PANEL FILLS THE STAGE BODY AND THE GAUGE ROW IS BESIDE IT ***",
                a.panelInBody === true && a.railInInfo === true,
                "the .gpanel is a child of #stageBody and #dialsRow a child of #stageInfo -- the two-container " +
                "move, done by a real click rather than by calling present() directly");
            ok("!! *** KEITH'S FIRST ASK: THE GAUGES AND THE AVATAR ARE NOT SHOWN ***",
                a.dials === "none" && a.robot === "none",
                "#dials display " + a.dials + ", #dialsRobot display " + a.robot + " -- and NOTHING IN " +
                "server.html SET EITHER: raising the info tab hid them, from the panel's own hideWith list");
            ok("!! *** KEITH'S SECOND ASK: THE INFO PANEL IS TO THE RIGHT OF IT ***", a.gap >= 0,
                "#stageInfo's left edge is " + a.gap + "px past #stageBody's right edge (the row's 12px gap, " +
                "scaled) -- measured on screen, not inferred from source order");
            ok("!! *** KEITH'S THIRD ASK: THE PANEL BOX IS THE SAME WIDTH WHATEVER THE VIEWPORT ***",
                a.layoutW === 460 && c.layoutW === 460,
                "offsetWidth 460 at both 1280 and 1920. *** MEASURED AS LAYOUT WIDTH ON PURPOSE: server.html " +
                "puts a responsive `zoom` on BODY (0.8 at 1280, 0.9 at 1920), so the BOUNDING RECT reads 368 " +
                "and 414 and a future reader measuring THAT would think the fix had failed. The zoom scales " +
                "the whole page equally; the box is 460 in both. ***");
            ok("!! and 'back to the right' puts everything back, gauges included",
                r.back && r.back.stage === "none" && r.back.railHome === "gaugeAvatarCol" &&
                r.back.dials === "block" && r.back.robot === "block" && r.back.panelHome === "gaugeSections",
                "stage hidden, row home in #gaugeAvatarCol, dials and avatar visible again, panel back in " +
                "#gaugeSections -- THE PIN IS RELEASED RATHER THAN LEFT UP OVER THE RETURNED DIALS");
        } catch (e) {
            ok("the live drawer click completed", false, String(e.message).slice(0, 200));
        }
    }
}

say("\nWHAT THIS GATE DOES NOT DO: it cannot judge the LOOK. It clicks a drawer and reads the DOM, so the " +
    "arrangement is measured rather than assumed -- but a headless shell has no eyes. *** WHETHER 460px IS A " +
    "COMFORTABLE WIDTH FOR THESE PANELS, WHETHER THE INFO COLUMN READS WELL BESIDE A TALL ONE, AND WHETHER " +
    "THE WHOLE THING FEELS LIKE ONE VIEW ARE KEITH'S FIRST HARD-RELOAD AND NOTHING HERE SUBSTITUTES FOR IT. " +
    "*** If 460 is wrong the knob is one number in #stageBody, and #rightStack's own basis is the thing it " +
    "should keep agreeing with -- section 3 asserts they still match, so changing one and not the other goes " +
    "red rather than drifting. AND ONE PANEL WAS CLICKED, NOT THIRTY-THREE: this proves the mechanism, not " +
    "that every drawer's contents sit well at this width, which is the judgement v3667 left to the back button.");

console.log("\nstageInfo-selfcheck: " + (fails ? fails + " FAILED" : "all checks pass"));
process.exit(fails ? 1 : 0);
