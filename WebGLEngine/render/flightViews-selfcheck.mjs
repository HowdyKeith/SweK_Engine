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
//                   are THE SAME PIXEL when the gun is on the solution and a known number of pixels apart when it is 0.01 rad off; the range and the time of flight are the solution's; a target that cannot be reached has no pip and no tof;
//                   in VACUUM (gravity 0, the space battle's sights) the round flies straight: the pipper, the lead pip and the bore are one pixel for a gun on the solution, the time of flight is the straight-line intercept's closed form, and gravity is a parameter (left out it is the Earth's)
//   6  THE SEAT     a gun seat's eye is 0.4 m behind the muzzle along the gun, looking along it, up perpendicular to the gun; a gun pointing straight up falls back to the nose for up
//   7  THE BRAIN    pilotActivations() runs the layers (the fruit fly's 34 hidden and the GPU Brain's 32) and its outputs are the controls the policy gives (throttle mapped to [-1, 1]); the output stage applied to the hidden state IS the output; the 6DOF SPACE PILOT's forward() is an array of five
//                   in [-1, 1] and is the output as it stands (12 features, 34 hidden after the recurrent steps);
//                   pilotRows() has features, hidden and outputs (a pilot with no network has two rows) with the names the policy gives
//   8  THE MAIN WINDOW  overviewCamera() has every craft in the picture by geometry (210 random placements, three window shapes), at exactly max(150, 1.35 r / sin(the narrower half-angle)), looking at the centroid; hudText() is speed, altitude, heading, hit points and rounds
//   9  THE BARS         drawRows() paints one bar per value, signed about the row's centre line, a hidden value at half scale, clamped to the row, the labels and the title cut to 40 characters
//  10  A CRAFT WITH GUN SEATS   nextWindow(): plane, pilot, one gunner's view per seat, brain (a fixed gun has one gunner's view, no gun none, seats win over hasGunner, the seat index resets); seatRows(): a row of six per seat (what the gunner wants, what the seat does, the trigger, a target) as fractions of the arc; the labels name the seat
//  11  THE FRONT DOOR   the labels name the craft and the view, VIEW_DRAW is frozen, the export list is pinned, the report line says real numbers
//
// SABOTAGE LOG -- FORTY (the cameras and the brain window), and below them fifteen more (the overview and the HUD line) and eleven (the bars), each applied to render/flightViews.mjs in a scratch worktree, the gate run, the worktree restored; every one red by name (the number is how many rows went red):
//   V1 a click on the last view does not wrap 2 | V2 the gunner's view is not skipped for a craft with no gun 1 | V3 plane and pilot swapped in the list 2 | V4 the chase 25 m back 7
//   V5 the chase looks behind the craft 4 | V6 the chase eye in front (x) 4 | V7 the chase eye on the wrong side (y) 2 | V8 the chase eye at the craft's height 6 | V9 the chase rolls with the craft 1
//   V10 the chase follows the pitch (the nose not flattened) 3 | V11 no fallback for a nose straight up 1 | V12 the pilot's seat offset not rotated with the craft 1 | V13 the pilot's view does not roll 2
//   V14 the pilot looks 0.1 up from the nose 2 | V15 the sight looks along the nose, not the gun 1 | V16 the seat's eye in front of the muzzle 1 | V17 the seat's up not made perpendicular to the gun 2
//   V18 no nose fallback for a gun straight up 1 | V19 cameraFor ignores a seat's muzzle 1 | V20 cameraFor gives the brain a camera 1 | V21 the camera's right is up x forward 6 | V22 the aspect ratio ignored 2
//   V23 rows upside down 4 | V24 a point behind the eye is accepted 1 | V25 the full field of view used as the half 3 | V26 depth is the distance, not the distance along the view 1
//   V27 the lead pip is where the target IS 2 | V28 the pipper ignores the round's fall 2 | V29 the pipper ignores the shooter's own velocity 2 | V30 the time of flight doubled 1 | V31 the range from the eye 1
//   V32 onScreen always true 1 | V33 the throttle not mapped to [-1, 1] 4 | V34 the hidden state taken after the first layer only 2 | V35 the hidden row never shown 2 | V36 the label does not say how to switch 1
//   V37 VIEW_DRAW not frozen 1 | V38 the report line says NaN 1 | V39 the seat 5 cm higher 4 | V40 the gunner's field of view widened 1
// FIFTEEN MORE once the main window's camera and the HUD line existed (every one red by name): O1 the overview distance without the margin 2 | O2 the sphere's radius from the first craft, not the centroid 2 | O3 the centroid not divided by the count 2 | O4 only the vertical half-angle 1 | O5 no minimum distance 1 | O6 the overview's height uses cos 1 | O7 the overview bearing mirrored 1 | O8 the overview's up is +Y 1 | O9 the speed is the ground speed 1 (after the HUD row used a climb: with a level flight it was an equivalent mutant) | O10 the heading counts the wrong way round 1 | O11 the heading not wrapped into 0..359 1 | O12 hit points can go negative 1 | O13 the heading not padded 2 | O14 the altitude to a tenth 2 | O15 the rounds left not printed 1
// AND ELEVEN MORE ON drawRows (the bars, written out here so the page does not load the race cars' scene for them), every one red by name: D1 bar colours swapped 1 | D2 a hidden value not halved 1 | D3 values not clamped 1 | D4 positive bars hang below the line 2 | D5 the title not cut 1 | D6 the bars start at x = 40 1 | D7 the bar count doubled 1 | D8 the row label is the whole 'who' 1 | D9 the background not painted 3 | D10 the row height from the whole height 3 | D11 a bar fills the whole half-row 1
// THREE REWRITES THE SABOTAGES FORCED: V34 (the hidden state after the first layer only) went 0 red because the hand weights' later layers are the IDENTITY -- the brain rows now run on the hand weights with noise 0.1 and assert the later layers matter; V33 (the throttle not mapped) went 0 red on the first noise level
// because the throttle saturated at 1, where 2t - 1 = t -- the seed is pinned where it is interior; the straight-up fallbacks (V11, V18) would have been equivalent mutants against the first draft of their rows, where the craft's velocity and nose were both +X (REASONED, NOT RUN: the rows were rewritten before the sabotages) -- they now use a craft that moves along +Y and one that heads 90 degrees. NOT SABOTAGED: sightAhead (it only sets how far along an unchanged direction the target is).
// AND TWENTY-FOUR MORE ONCE A CRAFT COULD HAVE GUN SEATS (section 10: nextWindow, seatRows, the seat labels), each red by name, none 0 red the first time:
//   N1 the pilot's view goes to the brain, past the seats 3 | N2 the seat index never advances 2 | N3 one view too many (an off-by-one up) 3 | N4 one view too few (an off-by-one down) 2
//   N5 the seats are ignored 2 | N6 hasGunner is ignored 1 | N7 the brain goes nowhere (an unknown view and the brain go to the brain) 3 | N8 the seat is carried out of the plane's view 1
//   N9 the seat is carried into the gunner's first view 1 | N10 the arc fraction is not centred 2 | N11 the arc fraction is of the whole arc, not half 2 | N12 the arc fraction is not clamped 1
//   N13 the trigger sign inverted 2 | N14 the target sign inverted 2 | N15 wanted and actual swapped 1 | N16 a seat with no command yet is firing at a target 1 | N17 the seat labels count from 0 2
//   N18 the seat rows carry no label 2 | N19 an arc of no width is NaN 1 | N20 drawRows ignores a row's label 1 | N21 the gunner's label does not name the seat 1 | N22 the seat count in the label is wrong 1
//   N23 the brain label ignores the gunners 1 | N24 the seat rows have five values (no target) 3
// AND ELEVEN MORE ONCE THE SPACE BATTLE NEEDED A SIGHT IN VACUUM AND THE 6DOF PILOT'S NETWORK IN THE BRAIN WINDOW (the gunsight's `gravity` and pilotActivations' array branch; section 5's last two rows and section 7's 6DOF block), each red by name, none 0 red:
//   W1 the sight's solution ignores gravity, the Earth's always 2 | W2 the pipper's fall is always the Earth's 2 | W3 the default gravity is none 4 | W4 the default gravity is 9.8 4
//   W5 a gravity of 0 means the Earth's, in the solution 2 | W6 ...and in the pipper 2 | W7 an array output is cut to its first four 3 | W8 an array output is never recognised 3
//   W9 an array output is clamped to 0..1 2 | W10 the 6DOF pilot's hidden state is taken after the first layer only 3 | W11 an object output loses its throttle mapping 4
"use strict";
import * as V from "./flightViews.mjs";
import * as G from "../physics/mechanics/flightGuns.mjs";
import * as F from "../physics/mechanics/flightModel6dof.mjs";
import * as PF from "../brain/pilotFlightPolicy.mjs";
import * as MF from "../brain/pilotFlightMlp.mjs";
import * as AF from "../brain/autopilotFlight.mjs";
import * as GS from "../physics/mechanics/gunSeats.mjs";
import * as P6 from "../brain/pilot6dofPolicy.mjs";
import * as RB from "../physics/mechanics/rigidBody6dof.mjs";
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
    // IN VACUUM (gravity 0): the round flies straight, so the pipper is on the gun's line; the 6DOF space battle's sights (battleship.html)
    const vac = { pos: [0, 0, 300], vel: [0, 0, 0], dir: [1, 0, 0] }, rel = sub(target.pos, vac.pos), vv = dot(target.vel, target.vel) - 300 * 300, rv = dot(rel, target.vel), rr = dot(rel, rel);
    const tStraight = (-rv - Math.sqrt(rv * rv - vv * rr)) / vv;   // |rel + v t| = 300 t: the smaller root of (v.v - 300^2) t^2 + 2 rel.v t + rel.rel = 0 (the leading coefficient is negative, so this is the positive one)
    const solV = G.aimSolution(vac, target.pos, target.vel, G.GUN, 0), mV = { ...vac, dir: solV.dir }, gV = V.gunsight(look(mV), mV, target, W, H, G.GUN, 0);
    ok("!! with gravity 0 the round flies STRAIGHT: a gun on the vacuum solution (muzzle at rest) has the pipper, the lead pip and the bore on the SAME pixel (the centre of the picture) to 1e-6, and the time of flight is the straight-line intercept's closed form (the smaller root of |rel + v t| = 300 t)",
        gV.pipper && gV.lead && near(gV.pipper, gV.lead, 1e-6) && near(gV.pipper, gV.bore, 1e-6) && near(gV.bore, [W / 2, H / 2], 1e-9) && Math.abs(gV.tof - tStraight) < 1e-9 && Math.abs(solV.t - tStraight) < 1e-9, `pipper ${gV.pipper}, lead ${gV.lead}, tof ${gV.tof} vs ${tStraight}`);
    const gE = V.gunsight(camSol, mSol, target, W, H, G.GUN, G.GRAVITY), gA = V.gunsight(camSol, mSol, target, W, H, G.GUN, 0);
    ok("!! gravity is a parameter and not a constant: leaving it out IS the Earth's 9.80665 (the same pixels, time and range as passing flightGuns.GRAVITY, to 1e-12), and 0 gives another answer for the same gun -- a gun aimed ABOVE the line to a target (for the fall) has its vacuum pipper ABOVE the lead pip on the picture, by more than a pixel, and a different time of flight",
        near(g0.pipper, gE.pipper, 1e-12) && near(g0.lead, gE.lead, 1e-12) && g0.tof === gE.tof && g0.range === gE.range && gA.pipper && gA.lead && gA.pipper[1] < gA.lead[1] - 1 && Math.abs(gA.tof - gE.tof) > 1e-4, `${gA.pipper} vs lead ${gA.lead}, tof ${gA.tof} vs ${gE.tof}`);
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
    {   // THE 6DOF SPACE PILOT (brain/pilot6dofPolicy.mjs): twelve features, 34 hidden after the three recurrent steps, five outputs that forward() already gives in [-1, 1] as an ARRAY (torque x, y, z, thrust, fire)
        const body = RB.createBody({ mass: 8, I: RB.boxInertia({ m: 8, hx: 1.6, hy: 0.7, hz: 0.7 }), pos: [0, 0, 0], vel: [3, 1, -2], q: [0.9, 0.1, 0.3, 0.3], w: [0.2, -0.1, 0.3] }), tgt = { pos: [180, 40, -25], vel: [-4, 2, 1] };
        const xs = P6.features(body, tgt, { weaponSpeed: 900, thrustForce: 16, standoff: 50 }), w6 = P6.perturb(P6.handWeights(), 0.1, mulberry(3)), act = V.pilotActivations(P6, w6, xs), c6 = P6.forward(w6, xs);
        const layers = P6.layersOf(w6), last = layers[layers.length - 1], again = mlpLayerCpu(last, act.hidden, 1), firstOnly = mlpLayerCpu(layers[0], Float32Array.from(xs), 1);
        ok("!! the 6DOF space pilot: 12 features in, 34 hidden, five outputs -- the torque about x, y and z, the thrust and the trigger -- and they are the ARRAY the policy gives, as it stands (to the f32 rounding of the features the window shows), every one in [-1, 1]",
            act.input.length === 12 && act.hidden.length === 34 && act.output.length === 5 && c6.length === 5 && c6.every((v, i) => Math.abs(act.output[i] - v) < 1e-5) && act.output.every((v) => v >= -1 && v <= 1) && act.output.some((v) => Math.abs(v) > 0.05), `${Array.from(act.output).map((v) => v.toFixed(3))}`);
        ok("!! ...and the output stage applied to the hidden state IS the output (the tanh of it, to 1e-5) on weights whose recurrent steps MATTER (noise 0.1 on the hand weights, whose recurrent edges are zero: the hidden state differs from the first layer's alone), so the hidden state shown is the one after ALL the layers before the output",
            Math.max(...Array.from(act.hidden, (v, i) => Math.abs(v - firstOnly[i]))) > 1e-3 && [0, 1, 2, 3, 4].every((i) => Math.abs(Math.tanh(again[i]) - act.output[i]) < 1e-5));
        const rows6 = V.pilotRows({ act, featureNames: P6.FEATURE_NAMES, outputNames: P6.OUTPUT_NAMES });
        ok("the rows: features (12, named), hidden (34, h0..), outputs (torqueX, torqueY, torqueZ, thrust, firing); and a flight pilot's outputs are still the four controls (the array branch is not taken for an object)", rows6.length === 3 && rows6[0].values.length === 12 && rows6[0].names[1] === "errX" && rows6[1].values.length === 34 && rows6[2].names.join() === "torqueX,torqueY,torqueZ,thrust,firing" && rows6[2].values.length === 5
            && V.pilotActivations(PF, PF.perturb(PF.handWeights(), 0.1, mulberry(1)), PF.features(st, target)).output.length === 4);
    }
    const gd = AF.guidance(st, target), x = PF.featuresFrom(gd), noNet = V.pilotRows({ act: { input: Float32Array.from(x), output: Float32Array.of(0.1, -0.2, 0, 0.3) }, featureNames: PF.FEATURE_NAMES, outputNames: PF.OUTPUT_NAMES });
    ok("!! a pilot with no network (the PD autopilot) has two rows: its 18 features and its four outputs", noNet.length === 2 && noNet[0].layer === "features" && noNet[1].layer === "outputs" && noNet[1].values.length === 4);
}

console.log("\n8. THE MAIN WINDOW'S CAMERA AND THE HUD LINE");
{
    const rng = mulberry(77), WW = 1280, HH = 720;
    let worst = 0, centre = 0, short = 0, n = 0, outside = 0;
    for (const aspect of [16 / 9, 4 / 3, 0.6]) for (let k = 0; k < 70; k++) {
        const m = 2 + Math.floor(rng() * 4), sts = Array.from({ length: m }, () => ({ pos: [(rng() - 0.5) * 3000, (rng() - 0.5) * 3000, 100 + rng() * 400] }));
        const cam = V.overviewCamera(sts, { aspect }), W2 = Math.round(HH * aspect), cen = [0, 1, 2].map((i) => sts.reduce((a, b) => a + b.pos[i], 0) / m), r = Math.max(...sts.map((q) => norm(sub(q.pos, cen))));
        const half = Math.min(0.45, Math.atan(Math.tan(0.45) * aspect)), want = Math.max(150, 1.35 * r / Math.sin(half));
        n++; if (Math.abs(cam.distance - want) > 1e-6) short++;
        const c0 = V.project(cam, cen, W2, HH); centre = Math.max(centre, Math.abs(c0[0] - W2 / 2), Math.abs(c0[1] - HH / 2));
        for (const q of sts) { const p = V.project(cam, q.pos, W2, HH); if (!p || p[0] < 0 || p[0] > W2 || p[1] < 0 || p[1] > HH) outside++; else worst = Math.max(worst, Math.abs(p[0] - W2 / 2) / (W2 / 2), Math.abs(p[1] - HH / 2) / (HH / 2)); }
    }
    ok("!! the main window's camera has EVERY craft in the picture: 210 random placements of 2-5 craft over 3 km (landscape, 4:3 and a tall narrow window), none outside the frame (the farthest is at most " + (worst * 100).toFixed(0) + "% of the way to the edge), the centroid on the centre to 1e-6, and the distance exactly max(150, 1.35 r / sin(the narrower half-angle))", outside === 0 && short === 0 && centre < 1e-6 && n === 210 && worst < 0.75, `${outside} outside, ${short} wrong distances, centre ${centre.toExponential(1)}, worst ${worst.toFixed(3)}`);
    const one = V.overviewCamera([{ pos: [10, 20, 300] }]), off = [one.eye[0] - 10, one.eye[1] - 20, one.eye[2] - 300];
    ok("!! one craft: the distance is the minimum (150 m), along the fixed bearing (-0.6 rad from +X) and elevation (0.45 rad), looking at the craft with the world's up", Math.abs(one.distance - 150) < 1e-12 && near(off, [150 * Math.cos(0.45) * Math.cos(-0.6), 150 * Math.cos(0.45) * Math.sin(-0.6), 150 * Math.sin(0.45)], 1e-9) && near(one.target, [10, 20, 300], 1e-12) && near(one.up, [0, 0, 1], 0), `${off.map((v) => v.toFixed(2))}`);
    const two = V.overviewCamera([{ pos: [0, 0, 300] }, { pos: [2000, 0, 300] }]), wide = V.overviewCamera([{ pos: [0, 0, 300] }, { pos: [2000, 0, 300] }], { fov: 1.4 });
    ok("two craft 2 km apart: r = 1000 and d = 1.35 r / sin(0.45) = 3103.7; a wider field of view needs a shorter distance", Math.abs(two.distance - 1.35 * 1000 / Math.sin(0.45)) < 1e-9 && wide.distance < two.distance, `${two.distance.toFixed(1)} vs ${wide.distance.toFixed(1)}`);
    const lvl = F.createState({ pos: [0, 0, 300], speed: 45, heading: 0 });
    ok("!! the HUD line: speed over the air, altitude, heading, hit points left and rounds left -- 45 m/s at 300 m heading 0 with 20 hit points and 300 rounds", V.hudText(lvl, { hp: 20, taken: 0, ammo: 300 }) === "IAS 45 m/s  ALT 300 m  HDG 000  HP 20/20  RDS 300", V.hudText(lvl, { hp: 20, taken: 0, ammo: 300 }));
    const east = F.createState({ pos: [0, 0, 123.4], speed: 45, heading: PI / 2 }), west = F.createState({ pos: [0, 0, 300], speed: 45, heading: -PI / 2 }), fast = { ...lvl, vel: [30, 40, 120] };
    ok("!! heading 90 degrees is 090 (a right turn raises it), -90 is 270, the speed is the length of the velocity (30, 40, 120 is 130: the climb counts), the altitude is rounded, hit points never go below 0 (25 taken of 20 is 0/20), and 359.6 wraps to 000", V.hudText(east).includes("HDG 090") && V.hudText(east).includes("ALT 123 m") && V.hudText(west).includes("HDG 270") && V.hudText(fast).includes("IAS 130 m/s") && V.hudText(lvl, { hp: 20, taken: 25 }).includes("HP 0/20") && V.hudText(F.createState({ pos: [0, 0, 300], speed: 45, heading: 359.6 * PI / 180 })).includes("HDG 000"));
}

console.log("\n9. THE BARS");
{
    const calls = [], ctx = { set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; }, set font(v) {}, fillRect(x, y, w, h) { calls.push({ op: "rect", x, y, w, h, color: this._f }); }, fillText(t, x, y) { calls.push({ op: "text", t, x, y }); } };
    const rows = [{ who: "pilot", layer: "features", names: ["a", "b", "c"], values: [1, -0.5, 0.25] }, { who: "pilot", layer: "hidden", names: ["h0", "h1"], values: [2, -1] }, { who: "pilot", layer: "outputs", names: ["o"], values: [5] }];
    const n = V.drawRows(ctx, 200, 100, rows, { title: "A".repeat(60) }), rects = calls.filter((c) => c.op === "rect"), bars = rects.slice(1), rowH = Math.max(10, Math.floor((100 - 14) / 3)), mid = (k) => 12 + rowH * k + rowH / 2, amp = rowH / 2 - 1;
    ok("!! drawRows paints the background and one bar per value (6 here) and says so: positive bars blue and above the row's centre line, negative amber and below it", n === 6 && rects[0].w === 200 && rects[0].h === 100 && rects[0].color === "#050805" && bars.length === 6
        && bars[0].color === "#59d1ff" && Math.abs((bars[0].y + bars[0].h) - mid(0)) < 1e-9 && bars[1].color === "#f6a623" && Math.abs(bars[1].y - mid(0)) < 1e-9, `${n} bars`);
    ok("!! a bar is |v| of the half-row tall: 1 is the whole half-row, -0.5 half of it, 0.25 a quarter; a HIDDEN value is shown at half scale (2 is a full bar, -1 half of one); a value past 1 is clamped (5 is a full bar)",
        Math.abs(bars[0].h - amp) < 1e-9 && Math.abs(bars[1].h - amp * 0.5) < 1e-9 && Math.abs(bars[2].h - amp * 0.25) < 1e-9 && Math.abs(bars[3].h - amp) < 1e-9 && Math.abs(bars[4].h - amp * 0.5) < 1e-9 && Math.abs(bars[5].h - amp) < 1e-9, bars.map((b) => b.h.toFixed(2)).join(" "));
    ok("the bars of a row are side by side from x = 46 (a bar wide enough to be seen, 1 px between), each row below the one before, and the labels name 'p features', 'p hidden', 'p outputs' with the title cut to 40 characters",
        bars[0].x === 46 && bars[1].x > bars[0].x + bars[0].w && bars[3].y < mid(1) + 1 && Math.abs((bars[3].y + bars[3].h) - mid(1)) < 1e-9 && calls.filter((c) => c.op === "text").map((c) => c.t).join("|") === "A".repeat(40) + "|p features|p hidden|p outputs");
    ok("a row with no values draws no bars, no rows draws only the background", V.drawRows({ ...ctx, fillRect() {}, fillText() {}, set fillStyle(v) {}, set font(v) {} }, 100, 50, [{ who: "p", layer: "outputs", names: [], values: [] }]) === 0 && V.drawRows({ ...ctx, fillRect() {}, fillText() {}, set fillStyle(v) {}, set font(v) {} }, 100, 50, []) === 0);
}

console.log("\n11. A CRAFT WITH GUN SEATS: ONE GUNNER'S VIEW PER SEAT, AND THE GUNNERS IN THE BRAIN WINDOW");
{
    const walk = (opts, n) => { let w = { view: "plane", seat: 0 }; const seq = [`${w.view}${w.view === "gunner" ? w.seat : ""}`]; for (let i = 0; i < n; i++) { w = V.nextWindow(w, opts); seq.push(w.view === "gunner" ? `gunner${w.seat}` : w.view); } return seq.join(","); };
    ok("!! a craft with FIVE gun seats goes plane, pilot, seat 0, 1, 2, 3, 4, brain, and round to the plane: one click each, eight views", walk({ seats: 5 }, 9) === "plane,pilot,gunner0,gunner1,gunner2,gunner3,gunner4,brain,plane,pilot", walk({ seats: 5 }, 9));
    ok("!! a craft with a fixed gun (no seats) has the one gunner's view, exactly as nextView() had it (plane, pilot, gunner, brain), a craft with no gun skips it, and one seat is one view", walk({}, 5) === "plane,pilot,gunner0,brain,plane,pilot" && walk({ hasGunner: false }, 4) === "plane,pilot,brain,plane,pilot" && walk({ seats: 1 }, 4) === "plane,pilot,gunner0,brain,plane" && ["plane", "pilot", "gunner", "brain"].every((v) => V.nextWindow({ view: v, seat: 0 }).view === V.nextView(v)));
    ok("!! `seats` wins over `hasGunner` (a seated craft with hasGunner false still has its seats' views), an unknown view goes to the plane at seat 0, a missing seat is seat 0, and nothing is edited in place", walk({ seats: 2, hasGunner: false }, 5) === "plane,pilot,gunner0,gunner1,brain,plane" && V.nextWindow({ view: "nonsense", seat: 3 }, { seats: 5 }).view === "plane" && V.nextWindow({ view: "nonsense", seat: 3 }, { seats: 5 }).seat === 0 && V.nextWindow({ view: "gunner" }, { seats: 3 }).seat === 1 && (() => { const w = { view: "gunner", seat: 1 }; V.nextWindow(w, { seats: 3 }); return w.seat === 1 && w.view === "gunner"; })());
    // seat rows, on real seats
    const seatTop = GS.makeSeat({ id: "top", name: "top turret", mount: [0, 0, 1], rest: [0, 0, 1], up: [-1, 0, 0], arc: { yaw: [-PI / 2, PI / 2], pitch: [-PI / 2, PI / 2] }, slew: { yaw: 1, pitch: 1 } });
    const tail = GS.makeSeat({ id: "tail", name: "tail turret", mount: [-5, 0, 0], rest: [-1, 0, 0], up: [0, 0, 1], arc: { yaw: [-0.6, 0.6], pitch: [-0.3, 0.9] }, slew: { yaw: 1, pitch: 1 } });
    const flat = GS.makeSeat({ id: "fixed", mount: [0, 0, 0], rest: [1, 0, 0], arc: { yaw: [0, 0], pitch: [0, 0] }, slew: { yaw: 1, pitch: 1 } });
    const rows = V.seatRows([{ seat: seatTop, state: { yaw: PI / 4, pitch: -PI / 4 }, cmd: { yaw: PI / 2, pitch: 0, fire: true, target: 7 } }, { seat: tail, state: { yaw: 0.3, pitch: 0.3 }, cmd: { yaw: -2, pitch: 0.9, fire: false, target: null } }, { seat: tail, state: { yaw: 0, pitch: 0 }, cmd: null }, { seat: flat, state: { yaw: 0.5, pitch: 0.5 }, cmd: { yaw: 0.5, pitch: 0.5, fire: false, target: null } }]);
    ok("!! a row per seat of six numbers: the wanted yaw and pitch, the seat's own, the trigger and a target -- the angles as FRACTIONS OF THE ARC about its centre (a dorsal turret's yaw of 45 degrees is 0.5 of its 90, the wanted 90 is 1; the tail's pitch arc is -0.3..0.9, centre 0.3, so 0.9 is +1 and 0.3 is 0), the wanted yaw past the arc clamped to -1, the trigger +1 or -1, the target +1 or -1",
        rows.length === 4 && rows[0].values.length === 6 && near(rows[0].values.slice(0, 4), [1, 0, 0.5, -0.5], 1e-12) && rows[0].values[4] === 1 && rows[0].values[5] === 1 && near(rows[1].values.slice(0, 4), [-1, 1, 0.5, 0], 1e-12) && rows[1].values[4] === -1 && rows[1].values[5] === -1, rows.map((r) => r.values.map((v) => v.toFixed(2)).join(" ")).join(" | "));
    ok("!! ...a seat with no command yet (before the first tick) rests: wanted 0 on both axes is the centre of a symmetric arc and 0.3/-0.3 of the tail's pitch arc, the trigger -1 and no target; the rows are named by the seat (label 's1 aim', 's2 aim'...), carry the six names, and are on the 'aim' layer", rows[2].values[4] === -1 && rows[2].values[5] === -1 && near(rows[2].values.slice(0, 2), [0, -1 / 3 * 0 + (0 - 0.3) / 0.6], 1e-12) && rows.map((r) => r.label).join() === "s1 aim,s2 aim,s3 aim,s4 aim" && rows[0].who === "top" && rows.every((r) => r.layer === "aim" && r.names.join() === "want yaw,want pitch,yaw,pitch,fire,target") && V.seatRows([]).length === 0);
    ok("!! a seat whose arc has no width (a fixed mount) is 0 on both axes and not NaN, and the seat index is reset when a window leaves the gunner's views: from the plane at seat 3 the pilot's view is seat 0, from the pilot at seat 3 the first gunner view is seat 0, and from the brain at seat 4 the plane is seat 0", near(rows[3].values.slice(0, 4), [0, 0, 0, 0], 0) && V.nextWindow({ view: "plane", seat: 3 }, { seats: 5 }).seat === 0 && V.nextWindow({ view: "pilot", seat: 3 }, { seats: 5 }).seat === 0 && V.nextWindow({ view: "brain", seat: 4 }, { seats: 5 }).seat === 0);
    const calls = []; const ctx = { set fillStyle(v) { this._f = v; }, get fillStyle() { return this._f; }, set font(v) {}, fillRect(x, y, w, h) { calls.push({ op: "rect" }); }, fillText(t) { calls.push({ op: "text", t }); } };
    const bars = V.drawRows(ctx, 240, 184, [...V.pilotRows({ act: { input: Float32Array.of(0.1, 0.2), output: Float32Array.of(0, 0, 0, 0) }, featureNames: ["a", "b"], outputNames: ["p", "r", "y", "t"] }), ...rows], { title: "x" });
    ok("!! the seat rows are drawn as bars with the labels they carry (a row with a `label` is drawn under it, not under its 'who' and 'layer'): 2 + 4 pilot bars and 6 per seat = 30, the labels 'p features', 'p outputs', 's1 aim' to 's4 aim'", bars === 30 && calls.filter((c) => c.op === "text").map((c) => c.t).join("|") === "x|p features|p outputs|s1 aim|s2 aim|s3 aim|s4 aim", calls.filter((c) => c.op === "text").map((c) => c.t).join("|"));
    ok("!! the window label names the seat in the gunner's view ('gun seat 2 of 5: forward lower turret') and says the brain window shows the gunners' too for a seated craft, and a craft with a fixed gun has its old labels", /gunner \(gun seat 2 of 5: forward lower turret\)/.test(V.windowLabel(0, "bomber", "gunner", V.VIEW_DRAW, { index: 1, count: 5, name: "forward lower turret" })) && /the network, live, and the gunners'/.test(V.windowLabel(0, "bomber", "brain", V.VIEW_DRAW, { index: 0, count: 5, name: "x" })) && V.windowLabel(1, "Hawk", "gunner") === "2. Hawk -- gunner (the gun's sight, the lead pip) -- click to switch" && V.windowLabel(1, "Hawk", "brain") === "2. Hawk -- brain (the network, live) -- click to switch");
}

console.log("\n12. THE FRONT DOOR");
{
    ok("the window label names the craft number, the craft and the view and says how to switch", /^2\. Hawk -- gunner/.test(V.windowLabel(1, "Hawk", "gunner")) && /click to switch/.test(V.windowLabel(0, "x", "brain")) && /network, live/.test(V.windowLabel(0, "x", "brain")) && /outside/.test(V.windowLabel(0, "x", "plane")) && /seat/.test(V.windowLabel(0, "x", "pilot")));
    const D = V.VIEW_DRAW;
    ok("!! the draw numbers are pinned: a 240 x 160 window, fields of view 0.95 (plane), 1.25 (pilot) and 0.55 (gunner), the chase 24 m back, 7 m up and 6 m ahead, the seat at (0.9, 0, 0.55), the sight 60 m out", D.width === 240 && D.height === 160 && D.fovPlane === 0.95 && D.fovPilot === 1.25 && D.fovGunner === 0.55 && D.chaseBack === 24 && D.chaseUp === 7 && D.chaseAhead === 6 && D.seat.join() === "0.9,0,0.55" && D.sightAhead === 60 && D.refreshEvery === 1);
    ok("VIEW_DRAW and VIEWS are frozen", Object.isFrozen(V.VIEW_DRAW) && Object.isFrozen(V.VIEWS) && Object.isFrozen(V.VIEW_DRAW.seat) && Object.isFrozen(V.VIEW_DRAW.clear));
    ok("!! the export list is pinned: VIEWS, VIEW_DRAW, basisOf, cameraFor, drawRows, gunSightCamera, gunsight, hudText, nextView, overviewCamera, pilotActivations, pilotCamera, pilotRows, planeCamera, project, reportLines, seatCamera, seatRows, windowLabel", Object.keys(V).sort().join(",") === "VIEWS,VIEW_DRAW,basisOf,cameraFor,drawRows,gunSightCamera,gunsight,hudText,nextView,nextWindow,overviewCamera,pilotActivations,pilotCamera,pilotRows,planeCamera,project,reportLines,seatCamera,seatRows,windowLabel", Object.keys(V).sort().join(","));
    const lines = V.reportLines();
    ok("the report lines say real numbers (no NaN, no undefined) and name the module", lines.length === 2 && lines.every((l) => !/NaN|undefined/.test(l)) && /view window per craft/.test(lines[0]), lines[1]);
}

console.log(fails ? `\n${fails} FAIL` : "\nall checks pass");
process.exit(fails ? 1 : 0);
