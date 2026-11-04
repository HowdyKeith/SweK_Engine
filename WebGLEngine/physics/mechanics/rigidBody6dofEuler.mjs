// WebGLEngine/physics/mechanics/rigidBody6dofEuler.mjs -- UNNUMBERED (2026-11-04)
//
// IMPORT THIS FIRST TO FLY rigidBody6dof's FIRST-ORDER ORIENTATION STEP. Importing it sets rigidBody6dof.step()'s default orientation
// to "euler" for this module instance (and, through SWEK_6DOF_ORIENTATION, for node processes started afterwards). Nothing else.
//
// WHY IT EXISTS. On 2026-11-04 Keith made RK4 the default orientation step ("make the fourth-order step the default"), after the round
// in physics/mechanics/ORIENTATION_STEP_WIP.md measured it: a free body's momentum drift from first order to fourth, a jousting ship's
// orientation from up to 2.45 degrees off to 3.3e-8 rad, and no pilot's fights moved by a sign test. Every 6-DOF record made before that
// day was measured under the first-order step: the trained pilots and the rounds that made them, the tasks' pinned baselines those pilots
// were measured against, the fights pinned hit for hit, the page fight's battles. They quote one another, so they stand or move together.
// The round measured the cost of moving them: with RK4 the default, 35 green gates turned red, every one on a pinned 6-DOF number.
//
// So those gates keep holding what was measured, under the step it was measured with, said out loud -- as the spinning body's C2 and C3
// still fly the Jolt settings they were registered with (physics/mechanics/SPINNING_BODY_WIP.md). Each of them imports this module FIRST
// (an ES module's imports evaluate in order, so the default is set before any module that steps a body is evaluated) and says why on the
// same line. The engine itself, its pages and everything not holding such a record fly RK4; tools/roundhouse/orientationStep-selfcheck.mjs
// holds the new default, and flies each 6-DOF craft family under both steps.
"use strict";
import { setOrientationDefault } from "./rigidBody6dof.mjs";

setOrientationDefault("euler");
export const FLOWN_WITH = "euler";
