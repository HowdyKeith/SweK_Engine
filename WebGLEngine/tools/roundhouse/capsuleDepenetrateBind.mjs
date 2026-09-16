// WebGLEngine/tools/roundhouse/capsuleDepenetrateBind.mjs
//
// CAPSULE DEPENETRATION AS A LAB DEVICE. Task board #88, built on task #86's own gate
// (tools/ship/capsuleCollideTsl-selfcheck.mjs), which is what already proved physics/character/
// capsuleCollideTsl.mjs's batched GPU kernel agrees with the CPU to 1e-6 or better. This device does NOT
// dispatch that WGSL kernel -- build() below runs physics/character/capsuleCollide.mjs's own
// depenetrateCapsuleFixedTris, the same CPU reference that gate is held to, against five named collision
// shapes (floor, wall, corner, a sweepable ramp, and empty space).
//
// *** WHAT THIS DOES NOT CLAIM, MULTIGRID-GPU-BIND'S OWN LINE FOR IT: THE WGSL IS UNGRADED HERE. *** No device
// in this registry dispatches a real WebGPU compute pipeline inside build() -- every real dispatch in this
// tree happens through tools/ship/webgpuHarness.mjs's runInEngineOrigin(), which launches headless Chromium,
// and paying that cost on every proposer round (up to 6 browser launches) or every /roundhouse/export sweep
// row would make this device unusable for its actual job. So build() grades the SAME algorithm the GPU kernel
// runs -- depenetrateCapsuleFixedTris is capsuleCollide.mjs's own depenetrateCapsule, held to the identical
// fixed-candidate-list constraint capsuleCollideTsl.mjs's own header explains -- and leaves proving the WGSL
// text itself dispatches correctly to capsuleCollideTsl-selfcheck.mjs, which already does that and is named
// as this device's own instrument gate for exactly that reason. If the WGSL and this CPU function ever
// diverge, every number below stays green and says nothing about the shader that actually runs on a GPU.
//
// ================================================================================================================
// THE PLANT IS `knob` AND IT IS THE EXACT SABOTAGE capsuleCollideTsl-selfcheck.mjs'S OWN HEADER ALREADY NAMES
// ================================================================================================================
//
// `planted` flips the grounded comparison from `normal.y > groundNormalY` to `normal.y < groundNormalY` --
// depenetrateCapsuleFixedTris's own `plantGroundedFlip` option, threaded straight through. This is not a
// hypothetical: it is the identical inversion capsuleCollideTsl-selfcheck.mjs's header records being run by
// hand against the real GPU kernel (5 checks red by name, restored). `posX/posY/posZ/contacts` are BLIND to
// it -- the push itself never reads the grounded comparison, only whether the flag gets SET -- so a device
// graded on position or contact count alone would rate the plant identical to the true physics. `grounded`
// catches it on EVERY mode that finds a contact at all: not just the modes whose TRUE answer is grounded
// (floor, ramp), but wall and corner too -- a wall's normal.y is 0, comfortably below groundNormalY=0.5 either
// way, so the flip makes it read grounded=true where the true physics reads false. Only `empty` is unaffected,
// and for a purely structural reason: zero contacts means the comparison never runs at all.
"use strict";
import { depenetrateCapsuleFixedTris } from "../../physics/character/capsuleCollide.mjs";

export const CD_MODES = ["floor", "wall", "corner", "ramp", "empty"];

const DEF = { radius: 0.4, height: 1.8, embedDepth: 0.1, slopeDeg: 30, iterations: 4, maxStepFrac: 0.8 };

export const CD_OBSERVABLES = ["posX", "posY", "posZ", "grounded", "contacts", "pushDist"];

const quad = (p0, p1, p2, p3) => [[p0, p1, p2], [p0, p2, p3]];

// A flat floor quad rotated by `slopeDeg` about the X axis, so the slope runs along Z. The rotation carries
// the flat quad's normal (0,1,0) to (0, cos(slopeDeg), sin(slopeDeg)) with it -- normal.y = cos(slopeDeg),
// which is what makes GROUND_SUPPORT_NORMAL_Y = 0.5's arccos(0.5) = 60 degrees the exact slope this mode
// crosses from walkable to too-steep, not an approximation swept toward empirically.
function rampTriangles(slopeDeg) {
    const theta = slopeDeg * Math.PI / 180;
    const s = Math.sin(theta), c = Math.cos(theta);
    const corners = [[-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]].map(([x, y, z]) => [x, -z * s, z * c]);
    return quad(...corners);
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

export function defaults({ mode = "floor", config = {} } = {}) {
    if (!CD_MODES.includes(mode)) return null;    // a refusal, not a silent substitution
    const c = { ...DEF, ...config };
    const radius = clamp(c.radius, 0.05, 2);
    return {
        mode,
        config: {
            radius,
            height: clamp(c.height, radius * 2, 6),
            embedDepth: clamp(c.embedDepth, 0, radius * 3),
            slopeDeg: clamp(c.slopeDeg, 0, 89),
            iterations: clamp(Math.round(c.iterations), 1, 8),
            maxStepFrac: clamp(c.maxStepFrac, 0.01, 1),
        },
    };
}

export function build({ mode = "floor", config = {}, planted = false } = {}) {
    if (!CD_MODES.includes(mode)) throw new Error("capsuleDepenetrate: undeclared mode " + mode);
    const c = { ...DEF, ...config };
    const { radius, height, embedDepth, slopeDeg, iterations, maxStepFrac } = c;

    let feet, tris;
    if (mode === "floor") {
        feet = [0, -embedDepth, 0];
        tris = quad([-5, 0, -5], [5, 0, -5], [5, 0, 5], [-5, 0, 5]);
    } else if (mode === "wall") {
        feet = [-embedDepth, 1, 0];
        tris = quad([0, 0, -5], [0, 0, 5], [0, 5, 5], [0, 5, -5]);
    } else if (mode === "corner") {
        feet = [-embedDepth, 1, -embedDepth];
        tris = [...quad([0, 0, -5], [0, 0, 5], [0, 5, 5], [0, 5, -5]), ...quad([-5, 0, 0], [5, 0, 0], [5, 5, 0], [-5, 5, 0])];
    } else if (mode === "ramp") {
        feet = [0, -embedDepth, 0];
        tris = rampTriangles(slopeDeg);
    } else {
        feet = [50, 50, 50];   // empty: nothing in range, the no-op baseline
        tris = [];
    }

    const r = depenetrateCapsuleFixedTris(feet, radius, height, tris, { iterations, maxStepFrac, plantGroundedFlip: !!planted });
    const pushDist = Math.hypot(r.pos[0] - feet[0], r.pos[1] - feet[1], r.pos[2] - feet[2]);
    return { posX: r.pos[0], posY: r.pos[1], posZ: r.pos[2], grounded: r.grounded ? 1 : 0, contacts: r.contacts, pushDist };
}

export const capsuleDepenetrateDevice = {
    plantKind: "knob",
    planted: { knob: "planted", observable: "grounded",
               note: "the grounded comparison normal.y > groundNormalY is inverted to normal.y < groundNormalY -- the exact sabotage tools/ship/capsuleCollideTsl-selfcheck.mjs's own header records running by hand against the real GPU kernel. posX/posY/posZ and contacts are BLIND to it: the push itself never reads the comparison, only whether the grounded flag gets set, so a device graded on position or contact count alone would rate the plant identical to the true physics. grounded itself catches it on every mode that finds any contact -- floor and ramp flip true to false, wall and corner (never grounded under the true physics) flip false to true -- and only empty (zero contacts, nothing to compare) is unaffected." },
    modes: CD_MODES, name: "capsule-depenetration-fixed-list",
    observables: CD_OBSERVABLES, build, defaults,
};
export default capsuleDepenetrateDevice;
