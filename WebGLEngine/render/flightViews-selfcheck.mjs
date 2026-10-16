// WebGLEngine/render/flightViews-selfcheck.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// Run: node render/flightViews-selfcheck.mjs      (~1 s)
//
// THE VIEW WINDOWS' GEOMETRY, HELD TO CLOSED FORMS. render/flightViews.mjs is cameras and a projection as pure functions of a craft's state; the page hands the same cameras to Three.js. Each is checked against something written here:
//
//   1  THE LIST     plane, pilot, gunner, brain in that order; a click goes to the next and wraps; a craft with no gun skips the gunner's; an unknown view goes to the first
//   2  THE CHASE    the eye is 24 m behind the craft along its HEADING (a right turn of 90 degrees puts it on the +Y side, behind a nose that points to -Y) and 7 m above, looking 6 m ahead, with the world's up -- and it does NOT roll or pitch
//                   with the craft (a banked, pitched craft at the same heading has the same eye); a nose straight up falls back to the velocity's heading, and to +X when there is none; the craft is on the picture's vertical centre line
//   3  THE PILOT    the eye is the seat offset in the body frame, the view the nose's, up the craft's up (to 1e-12): in a right bank a world point to the LEFT at the eye's height is BELOW the picture's centre (the left wing is up, the
//                   horizon tilts), and the same point in level flight is exactly on the centre line
//   4  THE PROJECTION   a point straight ahead is the centre, one at the edge of the field of view is the edge (right: x = W, up: y = 0), one behind the eye is null, depth is the distance along the view; the aspect ratio is W / H
//   5  THE SIGHT    the gun's sight looks along flightGuns.muzzleOf's axis (0.05 rad below the nose) and `bore` is the centre; the lead pip is where aimSolution's point lands and the pipper is where the round fired now would be, and the two
//                   are THE SAME PIXEL when the gun is on the solution and a known number of pixels apart when it is 0.01 rad off; the range and the time of flight are the solution's; a target that cannot be reached has no pip and no tof
//   6  THE SEAT     a gun seat's eye is 0.4 m behind the muzzle along the gun, looking along it, up perpendicular to the gun; a gun pointing straight up falls back to the nose for up
//   7  THE BRAIN    pilotActivations() runs the layers (the fruit fly's 34 hidden and the GPU Brain's 32) and its outputs are the controls the policy gives (throttle mapped to [-1, 1]); the output stage applied to the hidden state IS the output;
//                   pilotRows() has features, hidden and outputs (a pilot with no network has two rows) with the names the policy gives
//   8  THE FRONT DOOR   the labels name the craft and the view, VIEW_DRAW is frozen, the export list is pinned, the report line says real numbers
//
// SABOTAGE LOG -- FORTY, each applied to render/flightViews.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   V1 a click on the last view does not wrap 2 | V2 the gunner's view is not skipped for a craft with no gun 1 | V3 plane and pilot swapped in the list 2 | V4 the chase 25 m back 7
//   V5 the chase looks behind the craft 4 | V6 the chase eye in front (x) 4 | V7 the chase eye on the wrong side (y) 2 | V8 the chase eye at the craft's height 6 | V9 the chase rolls with the craft 1
//   V10 the chase follows the pitch (the nose not flattened) 3 | V11 no fallback for a nose straight up 1 | V12 the pilot's seat offset not rotated with the craft 1 | V13 the pilot's view does not roll 2
//   V14 the pilot looks 0.1 up from the nose 2 | V15 the sight looks along the nose, not the gun 1 | V16 the seat's eye in front of the muzzle 1 | V17 the seat's up not made perpendicular to the gun 2
//   V18 no nose fallback for a gun straight up 1 | V19 cameraFor ignores a seat's muzzle 1 | V20 cameraFor gives the brain a camera 1 | V21 the camera's right is up x forward 6 | V22 the aspect ratio ignored 2
//   V23 rows upside down 4 | V24 a point behind the eye is accepted 1 | V25 the full field of view used as the half 3 | V26 depth is the distance, not the distance along the view 1
//   V27 the lead pip is where the target IS 2 | V28 the pipper ignores the round's fall 2 | V29 the pipper ignores the shooter's own velocity 2 | V30 the time of flight doubled 1 | V31 the range from the eye 1
//   V32 onScreen always true 1 | V33 the throttle not mapped to [-1, 1] 4 | V34 the hidden state taken after the first layer only 2 | V35 the hidden row never shown 2 | V36 the label does not say how to switch 1
//   V37 VIEW_DRAW not frozen 1 | V38 the report line says NaN 1 | V39 the seat 5 cm higher 4 | V40 the gunner's field of view widened 1
// THREE REWRITES THE SABOTAGES FORCED: V34 (the hidden state after the first layer only) went 0 red because the hand weights' later layers are the IDENTITY -- the brain rows now run on the hand weights with noise 0.1 and assert the later layers matter; V33 (the throttle not mapped) went 0 red on the first noise level
// because the throttle saturated at 1, where 2t - 1 = t -- the seed is pinned where it is interior; the straight-up fallbacks (V11, V18) would have been equivalent mutants against the first draft of their rows, where the craft's velocity and nose were both +X (REASONED, NOT RUN: the rows were rewritten before the sabotages) -- they now use a craft that moves along +Y and one that heads 90 degrees. NOT SABOTAGED: sightAhead (it only sets how far along an unchanged direction the target is).
"use strict";
import * as V from "./flightViews.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as PF from "../brain/pilotFlightPolicy.mjs";
import * as MF from "../brain/pilotFlightMlp.mjs";
import * as AF from "../brain/autopilotFlight.mjs";
import { mlpLayerCpu } from "./brainTsl.mjs";

let fails = 0;
function ok(name, cond, detail) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? "   " + detail : ""}`); if (!cond) fails++; }
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const near = (a, b, tol) => a.length === b.length && a.every((v, i) => Math.abs(v - b[i]) <= tol);
const W = 240, H = 160, PI = Math.PI;
const mulberry = (a) => () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const level = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 });

console.log("flightViews-selfcheck -- a view window per craft\n");

console.log("1. THE LIST");
{
    ok("!! the views are plane, pilot, gunner, brain, in that order, and a click goes to the next and wraps from the brain to the plane", V.VIEWS.join(",") === "plane,pilot,gunner,brain" && V.nextView("plane") === "pilot" && V.nextView("pilot") === "gunner" && V.nextView("gunner") === "brain" && V.nextView("brain") === "plane");
    ok("a craft with no gun skips the gunner's view (plane, pilot, brain), and an unknown view goes to the first", V.nextView("pilot", false) === "brain" && V.nextView("brain", false) === "plane" && V.nextView("plane", false) === "pilot" && V.nextView("nonsense") === "plane");
}

console.log("\n2. THE CHASE CAMERA");
{
    const c = V.planeCamera(level), D = V.VIEW_DRAW;
    ok("!! a level craft at (0, 0, 300) heading 0: the eye is 24 m behind it and 7 m above (-24, 0, 307), it looks at a point 6 m ahead of the craft (6, 0, 300), up is the world's", near(c.eye, [-24, 0, 307], 1e-12) && near(c.target, [6, 0, 300], 1e-12) && near(c.up, [0, 0, 1], 0) && c.fov === D.fovPlane, `${c.eye}`);
    const east = F.createState({ pos: [10, 20, 300], speed: 45, heading: PI / 2 }), ce = V.planeCamera(east);
    ok("!! heading 90 degrees to the right (the nose to world -Y): the eye is behind it on the +Y side, (10, 44, 307)", near(ce.eye, [10, 44, 307], 1e-9) && near(ce.target, [10, 14, 300], 1e-9), `${ce.eye.map((v) => v.toFixed(3))}`);
    const wild = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, pitch: 0.5, bank: 1.0 }), cw = V.planeCamera(wild);
    ok("!! the chase camera follows the HEADING and not the attitude: the same craft pitched 0.5 rad and banked 1 rad has the same eye height above it and the same horizontal bearing (the eye is 24 m back along the nose's ground track)", Math.abs(cw.eye[2] - 307) < 1e-12 && Math.abs(cw.eye[1]) < 1e-12 && cw.eye[0] < -23 && cw.eye[0] > -24.01 && near(cw.up, [0, 0, 1], 0), `${cw.eye.map((v) => v.toFixed(3))}`);
    const vertical = { ...F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, pitch: PI / 2 - 1e-4 }), vel: [0, 30, 0] }, cv = V.planeCamera(vertical);
    ok("!! a nose straight up has no heading, so the camera takes the VELOCITY's: a craft pointing up and moving along +Y has the eye 24 m back along -Y, (0, -24, 307)", near(cv.eye, [0, -24, 307], 1e-9) && near(cv.target, [0, 6, 300], 1e-9), `${cv.eye.map((v) => v.toFixed(3))}`);
    const still = { pos: [5, 5, 100], vel: [0, 0, 0], q: [Math.SQRT1_2, 0, -Math.SQRT1_2, 0], w: [0, 0, 0] }, cs = V.planeCamera(still);
    ok("!! ...and with no velocity at all the heading is +X: a craft pointing straight up and standing still has the eye 24 m back along -X", near(cs.eye, [5 - 24, 5, 107], 1e-9), `${cs.eye}`);
    const at = V.project(c, level.pos, W, H);
    ok("!! the craft is on the picture's vertical centre line (x = W / 2) and BELOW the centre (the eye is above it), at a depth of 24.96 m (the eye-to-craft distance 25.0 resolved along the view)", Math.abs(at[0] - W / 2) < 1e-9 && at[1] > H / 2 && Math.abs(at[2] - 24.96) < 0.1, `(${at[0].toFixed(2)}, ${at[1].toFixed(1)}), depth ${at[2].toFixed(1)}`);
}

console.log("\n3. THE PILOT'S SEAT");
{
    const c = V.pilotCamera(level);
    ok("!! level, heading 0: the eye is the seat offset from the centre of mass (0.9, 0, 0.55), it looks along +X and up is +Z, to 1e-12", near(c.eye, [0.9, 0, 300.55], 1e-12) && near(V.basisOf(c).f, [1, 0, 0], 1e-12) && near(c.up, [0, 0, 1], 1e-12) && c.fov === V.VIEW_DRAW.fovPilot);
    const b = 0.5, banked = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0, bank: b }), cb = V.pilotCamera(banked);
    ok("!! in a RIGHT bank the pilot's up leans to the right of the craft ((0, -sin b, cos b) at heading 0)", near(cb.up, [0, -Math.sin(b), Math.cos(b)], 1e-12), `${cb.up.map((v) => v.toFixed(4))}`);
    const far = [cb.eye[0] + 1000, cb.eye[1] + 100, cb.eye[2]], pLevel = V.project(c, [c.eye[0] + 1000, c.eye[1] + 100, c.eye[2]], W, H), pBank = V.project(cb, far, W, H);
    ok("!! the horizon tilts: a world point 100 m to the LEFT at the eye's height is exactly on the centre line in level flight (y = H / 2) and BELOW it in a right bank (the left wing is up), and left of centre in both",
        Math.abs(pLevel[1] - H / 2) < 1e-9 && pLevel[0] < W / 2 && pBank[1] > H / 2 + 1 && pBank[0] < W / 2, `level ${pLevel[1].toFixed(2)}, banked ${pBank[1].toFixed(2)}`);
    const turned = F.createState({ pos: [0, 0, 300], speed: 45, heading: PI / 2 }), ct = V.pilotCamera(turned);
    ok("the seat offset turns with the craft: heading 90 degrees puts the eye 0.9 m along world -Y", near(ct.eye, [0, -0.9, 300.55], 1e-9), `${ct.eye.map((v) => v.toFixed(3))}`);
}

console.log("\n4. THE PROJECTION");
{
    const cam = { eye: [0, 0, 0], target: [1, 0, 0], up: [0, 0, 1], fov: 1.0 }, t = Math.tan(0.5), asp = W / H;
    const centre = V.project(cam, [100, 0, 0], W, H), right = V.project(cam, [100, -100 * t * asp, 0], W, H), top = V.project(cam, [100, 0, 100 * t], W, H), left = V.project(cam, [100, 100 * t * asp, 0], W, H);
    ok("!! straight ahead is the centre, one at the field of view's edge is the edge: right (the craft's -Y) at x = W, left at x = 0, up at y = 0 (row 0 is the top); the horizontal extent is the vertical one times W / H",
        near([centre[0], centre[1]], [W / 2, H / 2], 1e-9) && Math.abs(right[0] - W) < 1e-9 && Math.abs(left[0]) < 1e-9 && Math.abs(top[1]) < 1e-9 && Math.abs(right[1] - H / 2) < 1e-9, `${right[0]} ${left[0]} ${top[1]}`);
    ok("depth is the distance along the view direction (100 for all of them), and a point behind the eye, or on its plane, is null", Math.abs(centre[2] - 100) < 1e-9 && Math.abs(right[2] - 100) < 1e-9 && V.project(cam, [-1, 0, 0], W, H) === null && V.project(cam, [0, 5, 5], W, H) === null);
    const tilted = { eye: [0, 0, 0], target: [1, 0, 0], up: [0, 1, 0], fov: 1.0 };   // rolled 90 degrees: the camera's right is world +Z? (f x up = X x Y = +Z)
    const p = V.project(tilted, [100, 0, 100 * t * asp], W, H);
    ok("!! the camera's right is forward x up: with up = +Y the right is +Z, so a point above the axis is on the right edge", Math.abs(p[0] - W) < 1e-9 && Math.abs(p[1] - H / 2) < 1e-9, `${p}`);
}

console.log("\n5. THE GUN'S SIGHT");
{
    const s = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 }), m = G.muzzleOf(s), cam = V.gunSightCamera(s);
    ok("!! the sight looks along the gun's axis, 0.05 rad below the nose (flightGuns.muzzleOf's), from the pilot's eye, up the craft's up", near(V.basisOf(cam).f, m.dir, 1e-12) && near(cam.eye, [0.9, 0, 300.55], 1e-12) && near(cam.up, [0, 0, 1], 1e-12) && cam.fov === V.VIEW_DRAW.fovGunner);
    const target = { pos: [400, 30, 305], vel: [-10, 20, 0] };
    const sol = G.aimSolution(m, target.pos, target.vel), mSol = { ...m, dir: sol.dir }, up = [0, 0, 1], look = (mu) => ({ eye: mu.pos, target: [mu.pos[0] + mu.dir[0], mu.pos[1] + mu.dir[1], mu.pos[2] + mu.dir[2]], up, fov: 0.55 });
    const camSol = look(mSol), g0 = V.gunsight(camSol, mSol, target, W, H);
    // the round fired along sol.dir, flown by flightGuns.stepRound's closed form for the time of flight, is where the target will be
    const flown = G.stepRound({ pos: m.pos, vel: [m.vel[0] + 300 * sol.dir[0], m.vel[1] + 300 * sol.dir[1], m.vel[2] + 300 * sol.dir[2]], age: 0, owner: 1 }, sol.t), flownPx = V.project(camSol, flown.pos, W, H), leadPx = V.project(camSol, sol.point, W, H);
    ok("!! with the gun ON the solution: the pipper (where the round fired now lands, flown here by flightGuns.stepRound) and the lead pip (where the target will be) are THE SAME PIXEL to 1e-6, both are what project() makes of those world points, and the bore is the centre", g0.pipper && g0.lead
        && near(g0.pipper, [flownPx[0], flownPx[1]], 1e-6) && near(g0.lead, [leadPx[0], leadPx[1]], 1e-6) && near(g0.pipper, g0.lead, 1e-6) && near(g0.bore, [W / 2, H / 2], 1e-9), `pipper ${g0.pipper}, lead ${g0.lead}`);
    ok("...and the target is BELOW the bore (the round falls, so the gun is pointed above the line to it) and the whole thing is on the picture", g0.lead[1] > g0.bore[1] + 1 && g0.onScreen, `bore ${g0.bore.map((v) => v.toFixed(1))}, lead ${g0.lead.map((v) => v.toFixed(1))}`);
    ok("the range is the muzzle-to-target distance and the time of flight is the solution's", Math.abs(g0.range - norm(sub(target.pos, m.pos))) < 1e-9 && Math.abs(g0.tof - sol.t) < 1e-12, `${g0.range.toFixed(2)} m, ${g0.tof.toFixed(4)} s`);
    // the gun 0.01 rad off to the left of the solution: the round lands 300 t (d_off - d_sol) from the target's point (the round's position is linear in the muzzle direction)
    const off = 0.01, c1 = Math.cos(off), s1 = Math.sin(off), d = sol.dir, gunDir = [d[0] * c1 - d[1] * s1, d[0] * s1 + d[1] * c1, d[2]];   // rotated about +Z by +off: to the left
    const mOff = { ...m, dir: gunDir }, camOff = look(mOff), g1 = V.gunsight(camOff, mOff, target, W, H);
    const landing = [sol.point[0] + 300 * sol.t * (gunDir[0] - d[0]), sol.point[1] + 300 * sol.t * (gunDir[1] - d[1]), sol.point[2] + 300 * sol.t * (gunDir[2] - d[2])];
    const wantPip = V.project(camOff, landing, W, H), wantLead = V.project(camOff, sol.point, W, H);
    ok("!! 0.01 rad off: the pipper is where the round LANDS -- the target's point moved by 300 t (d_off - d_sol), which the round's position being linear in its direction makes closed -- and the lead pip stays on the target; they are 2 to 4 pixels apart and the pipper is to the LEFT",
        near(g1.pipper, [wantPip[0], wantPip[1]], 1e-6) && near(g1.lead, [wantLead[0], wantLead[1]], 1e-6) && Math.hypot(g1.pipper[0] - g1.lead[0], g1.pipper[1] - g1.lead[1]) > 2 && Math.hypot(g1.pipper[0] - g1.lead[0], g1.pipper[1] - g1.lead[1]) < 4 && g1.pipper[0] < g1.lead[0], `pipper ${g1.pipper.map((v) => v.toFixed(2))}, lead ${g1.lead.map((v) => v.toFixed(2))}`);
    const real = V.gunsight(cam, m, target, W, H), away = V.gunsight({ ...camSol, target: [m.pos[0] + 0, m.pos[1] + 1, m.pos[2]] }, mSol, target, W, H);
    ok("!! the range is from the MUZZLE and not from the eye (the real sight's eye is 1.6 m from the muzzle): 398.76 m either way for the muzzle, not the eye's", Math.abs(real.range - norm(sub(target.pos, m.pos))) < 1e-9 && Math.abs(real.range - norm(sub(target.pos, cam.eye))) > 0.5, `${real.range.toFixed(3)} vs eye ${norm(sub(target.pos, cam.eye)).toFixed(3)}`);
    ok("!! `onScreen` is false when the lead pip is off the picture (a sight turned 90 degrees away has no pip on it, though the solution exists), and true on the solution", away.onScreen === false && g0.onScreen === true, `${away.lead}`);
    const gone = V.gunsight(camSol, m, { pos: [400, 0, 300], vel: [400, 0, 0] }, W, H);
    ok("!! a target that cannot be reached (receding faster than the round) has no pip, no pipper and no time of flight, and still a range; no target at all gives the bore only", gone.lead === null && gone.pipper === null && gone.tof === null && Math.abs(gone.range - 400) < 3 && (() => { const n = V.gunsight(camSol, m, null, W, H); return n.lead === null && n.pipper === null && n.range === null && !!n.bore; })());
}

console.log("\n6. A GUN SEAT'S VIEW");
{
    const s = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 }), mz = { pos: [10, 0, 301], vel: [45, 0, 0], dir: [0, 1, 0] }, c = V.seatCamera(s, mz);
    ok("!! the eye is 0.4 m behind the muzzle along the gun, it looks along the gun, and up is the craft's up made perpendicular to the gun", near(c.eye, [10, -0.4, 301], 1e-12) && near(V.basisOf(c).f, [0, 1, 0], 1e-12) && near(c.up, [0, 0, 1], 1e-12) && c.fov === V.VIEW_DRAW.fovGunner);
    const slant = V.seatCamera(s, { pos: [0, 0, 300], vel: [45, 0, 0], dir: [0.6, 0, 0.8] });
    ok("!! with the gun pitched up, `up` stays perpendicular to it (dot < 1e-12) and on the craft's up side", Math.abs(dot(slant.up, [0.6, 0, 0.8])) < 1e-12 && slant.up[2] > 0 && Math.abs(norm(slant.up) - 1) < 1e-12, `${slant.up.map((v) => v.toFixed(3))}`);
    const turned = F.createState({ pos: [0, 0, 300], speed: 45, heading: PI / 2 }), straightUp = V.seatCamera(turned, { pos: [0, 0, 300], vel: [0, -45, 0], dir: [0, 0, 1] });
    ok("!! a gun pointing straight up has no 'up' from the craft's up: it takes the NOSE -- on a craft heading 90 degrees that is world -Y, not +X", near(straightUp.up, [0, -1, 0], 1e-9), `${straightUp.up.map((v) => v.toFixed(3))}`);
    ok("cameraFor() names the camera: plane, pilot, the fixed gun's sight, a seat's view when given a muzzle, and null for the brain", V.cameraFor("plane", level).fov === V.VIEW_DRAW.fovPlane && V.cameraFor("pilot", level).fov === V.VIEW_DRAW.fovPilot && V.cameraFor("gunner", level).fov === V.VIEW_DRAW.fovGunner
        && near(V.cameraFor("gunner", level, { muzzle: mz }).eye, V.seatCamera(level, mz).eye, 0) && V.cameraFor("brain", level) === null);
}

console.log("\n7. THE BRAIN WINDOW");
{
    const target = { altitude: 330, heading: 0.4, airspeed: 45 }, st = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 });
    for (const [name, P, hiddenN] of [["the fruit fly", PF, 34], ["the GPU Brain", MF, 32]]) {
        const w = P.perturb(P.handWeights(), 0.1, mulberry(1)), x = P.features(st, target), act = V.pilotActivations(P, w, x), c = P.forward(w, x);
        const layers = P.layersOf(w), last = layers[layers.length - 1], again = mlpLayerCpu(last, act.hidden, 1), firstOnly = mlpLayerCpu(layers[0], Float32Array.from(x), 1);
        ok(`!! ${name}: 18 features in, ${hiddenN} hidden, four outputs -- pitch, roll, yaw and the throttle mapped to [-1, 1] -- and they are the controls the policy gives (to the f32 rounding of the features the window shows)`, act.input.length === 18 && act.hidden.length === hiddenN && act.output.length === 4
            && Math.abs(act.output[0] - c.pitch) < 1e-5 && Math.abs(act.output[1] - c.roll) < 1e-5 && Math.abs(act.output[2] - c.yaw) < 1e-5 && Math.abs(act.output[3] - (c.throttle * 2 - 1)) < 1e-5 && act.output.every((v) => v >= -1 && v <= 1), `${Array.from(act.output).map((v) => v.toFixed(3))}`);
        ok(`!! ...and the output stage applied to the hidden state IS the output (to 1e-5, before the clamp) -- on weights whose later layers MATTER (the hand weights' are the identity; these are the hand weights with noise 0.1, whose throttle is interior to 0..1 so that mapping it to [-1, 1] changes it), so the hidden state shown is the one after ALL the layers before the output: the window shows the state that makes the decision`, Math.max(...Array.from(act.hidden, (v, i) => Math.abs(v - firstOnly[i]))) > 1e-3 && c.throttle > 0.05 && c.throttle < 0.95 && [0, 1, 2].every((i) => Math.abs(Math.max(-1, Math.min(1, again[i])) - act.output[i]) < 1e-5) && Math.abs(Math.max(0, Math.min(1, again[3])) * 2 - 1 - act.output[3]) < 1e-5);
        const rows = V.pilotRows({ act, featureNames: P.FEATURE_NAMES, outputNames: P.OUTPUT_NAMES });
        ok(`the rows: features (18, named), hidden (${hiddenN}, h0..), outputs (pitch, roll, yaw, throttle)`, rows.length === 3 && rows[0].layer === "features" && rows[0].values.length === 18 && rows[0].names.length === 18 && rows[1].layer === "hidden" && rows[1].values.length === hiddenN && rows[1].names[0] === "h0" && rows[2].layer === "outputs" && rows[2].names.join() === "pitch,roll,yaw,throttle");
    }
    const gd = AF.guidance(st, target), x = PF.featuresFrom(gd), noNet = V.pilotRows({ act: { input: Float32Array.from(x), output: Float32Array.of(0.1, -0.2, 0, 0.3) }, featureNames: PF.FEATURE_NAMES, outputNames: PF.OUTPUT_NAMES });
    ok("!! a pilot with no network (the PD autopilot) has two rows: its 18 features and its four outputs", noNet.length === 2 && noNet[0].layer === "features" && noNet[1].layer === "outputs" && noNet[1].values.length === 4);
}

console.log("\n8. THE FRONT DOOR");
{
    ok("the window label names the craft number, the craft and the view and says how to switch", /^2\. Hawk -- gunner/.test(V.windowLabel(1, "Hawk", "gunner")) && /click to switch/.test(V.windowLabel(0, "x", "brain")) && /network, live/.test(V.windowLabel(0, "x", "brain")) && /outside/.test(V.windowLabel(0, "x", "plane")) && /seat/.test(V.windowLabel(0, "x", "pilot")));
    const D = V.VIEW_DRAW;
    ok("!! the draw numbers are pinned: a 240 x 160 window, fields of view 0.95 (plane), 1.25 (pilot) and 0.55 (gunner), the chase 24 m back, 7 m up and 6 m ahead, the seat at (0.9, 0, 0.55), the sight 60 m out", D.width === 240 && D.height === 160 && D.fovPlane === 0.95 && D.fovPilot === 1.25 && D.fovGunner === 0.55 && D.chaseBack === 24 && D.chaseUp === 7 && D.chaseAhead === 6 && D.seat.join() === "0.9,0,0.55" && D.sightAhead === 60 && D.refreshEvery === 1);
    ok("VIEW_DRAW and VIEWS are frozen", Object.isFrozen(V.VIEW_DRAW) && Object.isFrozen(V.VIEWS) && Object.isFrozen(V.VIEW_DRAW.seat) && Object.isFrozen(V.VIEW_DRAW.clear));
    ok("!! the export list is pinned: VIEWS, VIEW_DRAW, basisOf, cameraFor, gunSightCamera, gunsight, nextView, pilotActivations, pilotCamera, pilotRows, planeCamera, project, reportLines, seatCamera, windowLabel", Object.keys(V).sort().join(",") === "VIEWS,VIEW_DRAW,basisOf,cameraFor,gunSightCamera,gunsight,nextView,pilotActivations,pilotCamera,pilotRows,planeCamera,project,reportLines,seatCamera,windowLabel", Object.keys(V).sort().join(","));
    const lines = V.reportLines();
    ok("the report lines say real numbers (no NaN, no undefined) and name the module", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /view window per craft/.test(lines[0]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
