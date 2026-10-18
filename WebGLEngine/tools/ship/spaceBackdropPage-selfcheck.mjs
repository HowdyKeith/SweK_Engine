// WebGLEngine/tools/ship/spaceBackdropPage-selfcheck.mjs
//
// Run: node tools/ship/spaceBackdropPage-selfcheck.mjs
//
// THE BACKDROP BUTTON ON THE TWO 6DOF SPACE PAGES, in a real browser: es-box3d-6dof.html and space-battleship.html now
// each carry a "Backdrop" button that puts the baked nebula-and-stars sky of es-box3d-fly3d.html behind the fight (the
// pure generators are gated in render/nebulaSkybox-selfcheck.mjs and render/proceduralStar-selfcheck.mjs; the hand-off to
// Three in render/spaceBackdrop-selfcheck.mjs, against a recording stand-in). What only a browser can say is here:
//
//   * IT IS OFF, AND FREE, UNTIL PRESSED: the page boots flat, nothing is baked, the label says off -- which is what lets
//     the existing page gates (rigidBody6dofPage, battleshipPage), whose pictures were taken against the flat fill, stand;
//   * THE BUTTON WORKS AS THE LABEL SAYS: a first press shows "baking...", disables itself, and ends "on" with a bake time
//     recorded; the second press is off, the third on again WITHOUT a second bake;
//   * THE SKY IS A PICTURE OF A DIRECTION: with it off, looking one way and looking the other give the same picture (a flat
//     fill); with it on they give different ones; the same direction twice gives the same picture;
//   * THE PICTURE COMES BACK: turned on and off again, the frame is byte-for-byte the frame before it was ever on (this is the
//     "toggle-off picture identical to today's" the backlog item asked for, measured in-page with the scene frozen inside one task);
//   * THE STAR IS AT INFINITY: from three eyes thousands of units apart, looking along the light's direction puts the star's
//     disc in the middle of the picture every time and with the same pixel (parallax would move a finite star off-centre);
//     and with the backdrop off there is no star there;
//   * ON THE BATTLESHIP PAGE, EVERY WINDOW wears it (each is a separate draw of the scene with its own camera into the one canvas),
//     the page's own star shell is hidden while it is on and back when it is off, and the fight is the same fight with it on
//     (the arena is stepped with the backdrop off and again with it on: the same craft states to the bit);
//   * THE COST IS MEASURED, NOT ASSUMED: the bake time and the per-frame cost of every window with it on and off are printed.
//
// SABOTAGE LOG (each applied to a scratch copy of the page, the gate run against a scratch tree that serves that copy, the real pages untouched; P = es-box3d-6dof.html, B = space-battleship.html; the number is how many rows went red; 25 mutants, none left at 0):
//   P01 first press not deferred 1; P02 not disabled while baking 1; P03 baking label says on 3; P04 page stars not hidden 3; P05 star not at the key light 1; P06 flat fill changed 2; P07 off then on rebakes 1; P08
//   default on 4; P09 nebula baker broken 6; P10 star baker broken 4; P11 label not refreshed after bake 1; P12 never re-enabled 2; B01 first press not deferred 1; B02 not disabled while baking 1; B03 baking label says
//   on 2; B04 star shell not hidden 3; B05 star not at the sun 1; B06 flat fill changed 1; B07 off then on rebakes 1; B08 default on 3; B09 nebula baker broken 6; B10 star baker broken 2; B11 label not refreshed after
//   bake 1; B12 never re-enabled 2; B13 sim touched by the backdrop 1.
//   THREE WENT 0 RED THE FIRST TIME: B06 (the battleship's flat fill changed to black -- no row read that page's fill; both pages' describe() now report it and a row pins each), B10 (the star baker broken on the
//   battleship page CRASHED the gate on a null star instead of going red by name; the in-page script and the rows now tolerate a missing star) and B13 (the button advancing the held simulation by a tick -- the 'same
//   fight' row ran two fresh fights and never watched the button; a row now holds the fight and reads the tick across three presses). NOT CHECKED: the repaint the battleship's click handler does while the fight is
//   paused (the page's frame loop repaints every frame when it runs, and the gate's own picture reads repaint first); the look of the sky, which is Keith's; and a real GPU -- every number here is this software
//   renderer's, and the frame-cost row is a bound, not a measurement of a rig.
"use strict";
import { runInEngineOrigin, webgpuSkipReason } from "./webgpuHarness.mjs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ENG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
function report(name, detail) { console.log(`  ----  ${name}   ${detail}`); }
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sum3 = (p) => p[0] + p[1] + p[2];
const unit = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const strip = (q) => { const { ms, ...rest } = q; return rest; };   // a picture without its draw time
const f1 = (v) => (typeof v === "number" ? v.toFixed(1) : String(v));

console.log("spaceBackdropPage-selfcheck -- the Backdrop button on es-box3d-6dof.html and space-battleship.html\n");

const skip = webgpuSkipReason(createRequire(import.meta.url));
if (skip) { console.log(`  SKIP  ${skip}`); report("*** NOT A PASS. ***", ""); fails++; }
else {
    // ---------------------------------------------------------------------------------------------------------------------
    // A. es-box3d-6dof.html
    // ---------------------------------------------------------------------------------------------------------------------
    const A = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 180000,
        script: `async () => {
            globalThis.__swekStep = "booting es-box3d-6dof.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "900px"; f.style.height = "600px"; f.src = "/es-box3d-6dof.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 30000 && (!win.__sixdof || win.__sixdof.state().tick < 2)) await wait(200);
            if (!win.__sixdof) return { booted: false, reason: "window.__sixdof never appeared" };
            const S = win.__sixdof, BD = S.backdrop, doc = win.document, out = { booted: true };
            out.hasButton = !!doc.getElementById("backdropBtn");
            out.start = { d: BD.describe(), label: BD.label(), disabled: BD.disabled(), tick: S.state().tick };
            out.light = BD.light();

            // ---- the button: first press bakes, second turns off, third turns on again without a second bake ----
            globalThis.__swekStep = "pressing the button";
            const tp = performance.now(); BD.click();
            out.afterClick = { label: BD.label(), disabled: BD.disabled(), d: BD.describe() };
            while (performance.now() - tp < 20000 && BD.label() !== "Backdrop: on") await wait(20);
            out.pressMs = performance.now() - tp;
            out.pressed = { label: BD.label(), disabled: BD.disabled(), d: BD.describe() };
            BD.click(); out.second = { label: BD.label(), d: BD.describe() };
            BD.click(); out.third = { label: BD.label(), d: BD.describe() };
            BD.set(false);

            // ---- the pictures, all inside ONE task: the simulation cannot advance between them ----
            globalThis.__swekStep = "the pictures";
            const lA = { eye: [0, 0, 4000], target: [1, 0, 4000] }, lB = { eye: [0, 0, 4000], target: [-1, 0, 4000] };
            const px = (l) => BD.pixels(l);
            const off = { cam: px(), a1: px(lA), b1: px(lB) };
            BD.set(true);
            const dir = (BD.describe().star || { dir: [0, 1, 0] }).dir;
            const along = (eye) => ({ eye, target: [eye[0] + dir[0] * 1000, eye[1] + dir[1] * 1000, eye[2] + dir[2] * 1000] });
            const away = (eye) => ({ eye, target: [eye[0] - dir[0] * 1000, eye[1] - dir[1] * 1000, eye[2] - dir[2] * 1000] });
            const E = [[0, 0, 4000], [2500, -1800, -2000], [-6000, 4000, 900]];
            const on = { d: BD.describe(), cam: px(), a1: px(lA), b1: px(lB), a2: px(lA), star: E.map((e) => px(along(e))), away: px(away(E[0])) };
            BD.set(false);
            const off2 = { d: BD.describe(), cam: px(), a1: px(lA), b1: px(lB), star: px(along(E[0])) };
            out.pics = { off, on, off2 };
            out.dir = dir;

            // ---- the page kept running ----
            const tk = S.state().tick; await wait(600); out.tickAfter = [tk, S.state().tick];
            return out;
        }`,
    });
    ok("the harness booted es-box3d-6dof.html and found window.__sixdof.backdrop", A.ok && A.result && A.result.booted, A.ok ? "" : String(A.reason || JSON.stringify(A)).slice(0, 300));
    ok("!! no page errors were logged during the whole run of the 6DOF page", !A.pageErrors || A.pageErrors.length === 0, (A.pageErrors || []).join(" | ").slice(0, 300));
    if (A.ok && A.result && A.result.booted) {
        const r = A.result, p = r.pics;
        ok("!! THE PAGE HAS THE BUTTON, AND IT BOOTS OFF AND UNBAKED: label 'Backdrop: off', not baked, the background the page's flat fill, no star, the page's own 600 points showing", r.hasButton && r.start.label === "Backdrop: off" && r.start.d.on === false && r.start.d.baked === false && r.start.d.background === "flat" && r.start.d.star === null && same(r.start.d.hidden, [false]) && r.start.d.bakeMs === null && r.start.disabled === false, JSON.stringify(r.start));
        ok("!! A FIRST PRESS SHOWS 'baking...' AT ONCE, DISABLES THE BUTTON, AND DOES NOT BAKE IN THE CLICK (a frame is painted first)", r.afterClick.label === "Backdrop: baking..." && r.afterClick.disabled === true && r.afterClick.d.baked === false && r.afterClick.d.on === false, JSON.stringify(r.afterClick));
        ok("!! ...AND ENDS 'Backdrop: on': enabled, the nebula the background, six faces of 256, the star visible, the page's own stars hidden, both bake times recorded", r.pressed.label === "Backdrop: on" && r.pressed.disabled === false && r.pressed.d.on === true && r.pressed.d.background === "nebula" && r.pressed.d.faces === 6 && r.pressed.d.faceSize === 256 && r.pressed.d.star && r.pressed.d.star.visible === true && same(r.pressed.d.hidden, [true]) && r.pressed.d.bakeMs && r.pressed.d.bakeMs.nebula > 0 && r.pressed.d.bakeMs.star > 0, JSON.stringify(r.pressed.d));
        ok("!! THE SECOND PRESS TURNS IT OFF (flat again, star hidden, the page's stars back) AND THE THIRD TURNS IT ON AGAIN WITHOUT A SECOND BAKE (the same bake times)", r.second.label === "Backdrop: off" && r.second.d.background === "flat" && !!r.second.d.star && r.second.d.star.visible === false && same(r.second.d.hidden, [false]) && r.third.label === "Backdrop: on" && r.third.d.background === "nebula" && same(r.third.d.bakeMs, r.pressed.d.bakeMs), `${r.second.label} / ${r.third.label}; bake ${JSON.stringify(r.third.d.bakeMs)}`);
        report("6DOF page: first press to 'on' (a frame, then the bake, then a frame)", `${r.pressMs.toFixed(0)} ms; bake nebula ${r.pressed.d.bakeMs.nebula.toFixed(0)} ms, star ${r.pressed.d.bakeMs.star.toFixed(0)} ms (this headless software renderer)`);
        ok("!! THE BAKE IS A HITCH, NOT A STALL: under 8 s for both bakes even in a software renderer on a loaded box", r.pressed.d.bakeMs.nebula + r.pressed.d.bakeMs.star < 8000, `${(r.pressed.d.bakeMs.nebula + r.pressed.d.bakeMs.star).toFixed(0)} ms`);

        const off = p.off, on = p.on, off2 = p.off2;
        ok("!! THE FLAT FILL IT FALLS BACK TO IS THE PAGE'S OWN, 0x03060d (the colour the page has always had)", r.start.d.flat === 0x03060d, String(r.start.d.flat));
        ok("!! THE STAR SITS WHERE THE PAGE'S KEY LIGHT SHINES FROM: the star's direction is the key light's position, normalised (the page's light is at (30, 60, 40))", same(r.light, [30, 60, 40]) && unit(r.light).every((v, i) => Math.abs(v - r.dir[i]) < 1e-12), `light ${r.light} -> star ${r.dir.map((v) => v.toFixed(4))}`);
        ok("!! TURNED ON AND OFF AGAIN, THE FRAME IS THE FRAME BEFORE (the toggle-off picture is today's): the page's camera view and the two looking-away views read the same distinct colours, mean, corner and centre pixel", same(strip(off.cam), strip(off2.cam)) && same(strip(off.a1), strip(off2.a1)) && same(strip(off.b1), strip(off2.b1)), `${off.cam.distinct} / ${off2.cam.distinct} colours; mean ${off.cam.mean.map(f1)} / ${off2.cam.mean.map(f1)}`);
        ok("!! WITH IT OFF THE FILL HAS NO DIRECTION: looking along +x and along -x from 4000 units out give the same picture, and it is the flat fill (every pixel (3,6,13) -- one colour)", same(off.a1.mean, off.b1.mean) && off.a1.distinct === 1 && off.b1.distinct === 1 && same(off.a1.corner, [3, 6, 13]), `${off.a1.distinct} colour, ${off.a1.mean.map(f1)}`);
        ok("!! WITH IT ON THE SKY IS A PICTURE OF A DIRECTION: looking along +x and along -x give different pictures (different colours counted, different means), each of many colours, and the same direction twice is the same picture", on.a1.distinct > 1 && on.b1.distinct > 1 && (on.a1.distinct !== on.b1.distinct || !same(on.a1.mean, on.b1.mean)) && same(on.a1.mean, on.a2.mean) && on.a1.distinct === on.a2.distinct, `+x ${on.a1.distinct} colours mean ${on.a1.mean.map(f1)};  -x ${on.b1.distinct} colours mean ${on.b1.mean.map(f1)}`);
        ok("!! AND IT IS A DIFFERENT PICTURE FROM THE FLAT ONE: the page's own camera view has more colours on than off (the nebula and the stars, over the craft)", on.cam.distinct > off.cam.distinct, `${off.cam.distinct} -> ${on.cam.distinct} colours`);
        ok("!! THE STAR IS IN THE MIDDLE OF THE PICTURE LOOKING ALONG THE LIGHT, FROM THREE EYES THOUSANDS OF UNITS APART, AND IS THE SAME PIXEL FROM ALL THREE (a star on a sphere a fixed distance from the origin would walk off-centre: this one is at infinity), bright (the three channels sum over 300)", on.star.every((q) => sum3(q.center) > 300) && same(on.star[0].center, on.star[1].center) && same(on.star[0].center, on.star[2].center), on.star.map((q) => "(" + q.center.join(",") + ")").join(" "));
        ok("!! THE STAR IS NOT THERE WITH THE BACKDROP OFF (the same view, the centre pixel is the flat fill), AND NOT THERE LOOKING THE OTHER WAY WITH IT ON (dim: the three channels sum under 300)", sum3(off2.star.center) < 40 && sum3(on.away.center) < 300, `off ${off2.star.center.join(",")}; on, looking away ${on.away.center.join(",")}`);
        ok("!! THE PAGE KEPT RUNNING: the tick counter advanced after all of it (the backdrop does not stall the loop)", r.tickAfter[1] > r.tickAfter[0], `${r.tickAfter[0]} -> ${r.tickAfter[1]}`);
        report("6DOF page: one redraw of the scene, off / on", `${off.cam.ms.toFixed(1)} ms / ${on.cam.ms.toFixed(1)} ms (a single readback-synchronised frame in this software renderer)`);
    }

    // ---------------------------------------------------------------------------------------------------------------------
    // B. space-battleship.html
    // ---------------------------------------------------------------------------------------------------------------------
    const Bk = await runInEngineOrigin({
        engineRoot: ENG, timeoutMs: 300000,
        script: `async () => {
            globalThis.__swekStep = "booting space-battleship.html in an iframe";
            const f = document.createElement("iframe");
            f.style.width = "1100px"; f.style.height = "1250px"; f.src = "/space-battleship.html";
            document.body.appendChild(f);
            await new Promise((res) => { f.onload = res; });
            const win = f.contentWindow, wait = (ms) => new Promise((res) => setTimeout(res, ms));
            const t0 = performance.now();
            while (performance.now() - t0 < 40000 && !win.__battleship) await wait(200);
            if (!win.__battleship) return { booted: false, reason: "window.__battleship never appeared" };
            const B = win.__battleship, BD = B.backdrop, doc = win.document; await B.ready; B.hold(true);
            const out = { booted: true };
            out.hasButton = !!doc.getElementById("backdropBtn");
            out.start = { d: BD.describe(), label: BD.label(), disabled: BD.disabled() };
            out.light = BD.light();
            out.windows = B.windows().length;

            // ---- the button ----
            globalThis.__swekStep = "pressing the button";
            out.tick0 = B.state().tick;
            const tp = performance.now(); BD.click();
            out.afterClick = { label: BD.label(), disabled: BD.disabled(), d: BD.describe() };
            while (performance.now() - tp < 30000 && BD.label() !== "Backdrop: on") await wait(20);
            out.pressMs = performance.now() - tp;
            out.pressed = { label: BD.label(), disabled: BD.disabled(), d: BD.describe() };
            BD.click(); out.second = { label: BD.label(), d: BD.describe() };
            BD.click(); out.third = { label: BD.label(), d: BD.describe() };
            out.tick1 = B.state().tick;
            BD.set(false);

            // ---- every window's picture, off / on / off again, the fight paused at tick 40 ----
            globalThis.__swekStep = "window pictures";
            B.step(40);
            const idx = [0, 1, Math.min(4, out.windows - 1), out.windows - 1].filter((v, i, a) => a.indexOf(v) === i);
            const pics = {};
            for (const i of idx) pics[i] = { off: B.pixels(i) };
            BD.set(true);
            for (const i of idx) pics[i].on = B.pixels(i);
            BD.set(false);
            for (const i of idx) pics[i].off2 = B.pixels(i);
            out.pics = pics; out.idx = idx;

            // ---- the cost of every window, per full redraw ----
            globalThis.__swekStep = "frame cost";
            out.costOff = BD.frameMs(10); BD.set(true); out.costOn = BD.frameMs(10); BD.set(false);

            // ---- the fight is the same fight with the backdrop on ----
            globalThis.__swekStep = "the same fight with it on and off";
            const craftsOf = () => JSON.stringify(B.state().crafts.map((c) => [c.pos, c.vel, c.q, c.hp]));
            B.newFight({ kind: "beam", seed: 3, fighters: 6, gunners: "regular", f: "pd", behaviour: "face", cruise: 0.3, friendlyFire: false, holdFire: true, wrecks: false, impact: 0, crew: false, ships: 1, escorts: 0 });
            B.step(300, false); out.fightOff = craftsOf();
            BD.set(true);
            B.newFight({ kind: "beam", seed: 3, fighters: 6, gunners: "regular", f: "pd", behaviour: "face", cruise: 0.3, friendlyFire: false, holdFire: true, wrecks: false, impact: 0, crew: false, ships: 1, escorts: 0 });
            B.step(300, true); out.fightOn = craftsOf();
            BD.set(false);
            return out;
        }`,
    });
    ok("the harness booted space-battleship.html and found window.__battleship.backdrop", Bk.ok && Bk.result && Bk.result.booted, Bk.ok ? "" : String(Bk.reason || JSON.stringify(Bk)).slice(0, 300));
    ok("!! no page errors were logged during the whole run of the battleship page", !Bk.pageErrors || Bk.pageErrors.length === 0, (Bk.pageErrors || []).join(" | ").slice(0, 300));
    if (Bk.ok && Bk.result && Bk.result.booted) {
        const r = Bk.result;
        ok("!! THE BATTLESHIP PAGE HAS THE BUTTON AND BOOTS OFF AND UNBAKED: 'Backdrop: off', flat, no star, its own 2600-point star shell showing", r.hasButton && r.start.label === "Backdrop: off" && r.start.d.on === false && r.start.d.baked === false && r.start.d.background === "flat" && r.start.d.star === null && same(r.start.d.hidden, [false]) && r.start.disabled === false, JSON.stringify(r.start));
        ok("!! A FIRST PRESS SHOWS 'baking...' AT ONCE, DISABLES THE BUTTON AND DOES NOT BAKE IN THE CLICK; it ends 'Backdrop: on' with the nebula, six faces of 256, the star visible and the page's star shell hidden", r.afterClick.label === "Backdrop: baking..." && r.afterClick.disabled === true && r.afterClick.d.baked === false && r.pressed.label === "Backdrop: on" && r.pressed.disabled === false && r.pressed.d.background === "nebula" && r.pressed.d.faces === 6 && r.pressed.d.faceSize === 256 && !!r.pressed.d.star && r.pressed.d.star.visible === true && same(r.pressed.d.hidden, [true]), JSON.stringify(r.pressed.d));
        ok("!! THE SECOND PRESS IS OFF (flat, the star shell back), THE THIRD IS ON WITHOUT A SECOND BAKE", r.second.label === "Backdrop: off" && r.second.d.background === "flat" && same(r.second.d.hidden, [false]) && r.third.label === "Backdrop: on" && same(r.third.d.bakeMs, r.pressed.d.bakeMs), `${r.second.label} / ${r.third.label}`);
        report("battleship page: first press to 'on'", `${r.pressMs.toFixed(0)} ms; bake nebula ${r.pressed.d.bakeMs.nebula.toFixed(0)} ms, star ${r.pressed.d.bakeMs.star.toFixed(0)} ms; ${r.windows} windows`);
        ok("!! THE FLAT FILL IT FALLS BACK TO IS THE PAGE'S OWN, 0x02040a (the colour the page has always had)", r.start.d.flat === 0x02040a, String(r.start.d.flat));
        ok("!! THE BUTTON DOES NOT TOUCH THE SIMULATION: the fight is held, and three presses of the button leave its tick where it was", r.tick0 === r.tick1, `${r.tick0} -> ${r.tick1}`);
        ok("!! THE STAR SITS WHERE THE BATTLESHIP'S SUN SHINES FROM: the star's direction is the sun's position, normalised (the page's sun is at (500, -300, 400))", same(r.light, [500, -300, 400]) && !!r.third.d.star && Math.abs(Math.hypot(...r.third.d.star.dir) - 1) < 1e-12 && unit(r.light).every((v, i) => Math.abs(v - r.third.d.star.dir[i]) < 1e-12), `sun ${r.light} -> star ${r.third.d.star ? r.third.d.star.dir.map((v) => v.toFixed(4)) : "none"}`);
        for (const i of r.idx) {
            const q = r.pics[i];
            ok(`!! WINDOW ${i}: ON IS A DIFFERENT PICTURE (the sky is behind every window, drawn with that window's own camera), AND OFF AGAIN IS THE PICTURE IT WAS (colours, mean and the 8x8 brightness map the same)`,
                (q.on.distinct !== q.off.distinct || !same(q.on.grid, q.off.grid)) && q.off2.distinct === q.off.distinct && same(q.off2.mean, q.off.mean) && same(q.off2.grid, q.off.grid), `${q.off.distinct} -> ${q.on.distinct} -> ${q.off2.distinct} colours`);
        }
        ok("!! THE PICTURES BEHIND TWO WINDOWS DIFFER FROM EACH OTHER WITH IT ON (each window's camera looks its own way: the sky is world-fixed, not a stamp), at least one pair of the windows read differently on", (() => { const k = r.idx.map((i) => JSON.stringify(r.pics[i].on.grid)); return new Set(k).size > 1; })(), r.idx.map((i) => `${i}: ${r.pics[i].on.distinct}`).join("  "));
        ok("!! THE FIGHT IS THE SAME FIGHT WITH THE BACKDROP ON (a 300-tick beam attack, seed 3: every craft's position, velocity, orientation and hit points identical to the bit)", r.fightOff === r.fightOn && r.fightOff.length > 100, `${r.fightOff.length} chars compared`);
        report("battleship page: one full redraw of the big picture and every window, off / on", `${r.costOff.toFixed(1)} ms / ${r.costOn.toFixed(1)} ms (${(r.costOn / r.costOff).toFixed(2)}x) in this software renderer`);
        ok("!! THE COST OF A BACKDROP IN EVERY WINDOW IS BOUNDED: a full redraw with it on takes under 2x the one with it off plus 100 ms (a cube-sampled quad per window, drawn once per window camera)", r.costOn < 2 * r.costOff + 100, `${r.costOff.toFixed(1)} -> ${r.costOn.toFixed(1)} ms`);
    }
}

console.log(fails ? `\nspaceBackdropPage-selfcheck: ${fails} FAILED` : "\nspaceBackdropPage-selfcheck: all checks pass");
process.exit(fails ? 1 : 0);
