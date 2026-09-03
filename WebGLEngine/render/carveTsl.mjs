// WebGLEngine/render/carveTsl.mjs -- v4372
//
// THE SILHOUETTE CARVE AS A TSL COMPUTE PASS, against a CPU twin that is shipped code rather than a fixture.
//
// mesh/carve.mjs is n^3 voxel tests per view in JavaScript -- 262,144 voxels times sixteen views at n = 64 --
// and its own gate closed by saying so: "a compute pass wanting to happen and is not one yet." This is it.
// One invocation per voxel, looping over the views inside the kernel rather than dispatching per view, so the
// grid is read and written once instead of V times.
//
// ---- WHY THIS TRANSPLANT IS NOT THE LEAPFROG'S, AND IS THE HARDER CASE --------------------------------------
//
// v4370 put tools/roundhouse/hmcGpu.mjs's WGSL_HMC through a TSL graph and got BIT-IDENTICAL results on all 256
// endpoint values. That kernel is smooth arithmetic: an ulp of disagreement stays an ulp, and the claim survives
// it. *** THIS PASS ENDS IN A floor(), WHICH IS A DISCONTINUOUS FUNCTION OF A FLOAT. *** The CPU carve computes
// its projection in f64 and the device computes it in f32, so a voxel whose projection lands within an ulp of a
// pixel boundary can land in a DIFFERENT PIXEL on the two machines -- and then it is not off by an ulp, it is
// solid on one and empty on the other. There is no tolerance that expresses that; a voxel is or is not.
//
// So the twin this is held to is mesh/carve.mjs's own f32 mirror, projectF32 -- the same flat code with
// Math.fround after every operation, which is exactly the idiom tools/roundhouse/hmcGpu.mjs uses to earn its
// device tolerance (leapfrogF64Flat and leapfrogF32 are one implementation with one knob). Against THAT the
// claim can be set equality on all n^3 voxels, and the f32-versus-f64 gap becomes a separate measured number
// rather than something the tolerance quietly swallows.
//
// ---- SPECIFIED OPERATIONS ONLY, WHICH IS A CHOICE MADE HERE AND NOT AN ACCIDENT ------------------------------
//
// The projection needs cos(yaw), sin(yaw), cos(elev), sin(elev) and nothing else transcendental. Those four are
// computed on the CPU and arrive in a storage buffer, so the kernel is + - * / and floor. hmcGpu's header makes
// this argument for the same reason -- "no trig table to ship and no vendor transcendental rounding to argue
// about" -- and it is what makes an exact claim possible at all: three's cos() and SwiftShader's cos() agreeing
// to the last bit is not something this tree has measured, and it does not need to be.
//
// Gated in tools/ship/carveGpu-selfcheck.mjs.
"use strict";

/** The four numbers a view contributes to the kernel, computed once on the CPU so the device sees no trig. */
export function viewRow(yaw = 0, elev = 0) {
    return [Math.cos(yaw), Math.sin(yaw), Math.cos(elev), Math.sin(elev)];
}

/**
 * makeCarvePassTsl(TSL, { n, views, outside }) -> { node, grid, masks, views, uniforms, ... }
 *
 * n and the view COUNT are baked constants, not uniforms: a TSL Loop wants a JavaScript bound, which is the
 * precedent lyapunovNodes set at v4321 with samples and warmup and makeHmcLeapfrogTsl repeated at v4370 with L.
 * The view DIRECTIONS are data and live in a buffer, so one built pass carves any turntable of that length.
 */
export function makeCarvePassTsl(TSL, { n = 64, views = 8, outside = "keep" } = {}) {
    const { Fn, If, Loop, int, uint, float, vec4, uniform, instanceIndex, instancedArray, floor } = TSL;
    for (const k of ["Fn", "If", "Loop", "int", "uint", "float", "vec4", "uniform", "instancedArray", "floor"])
        if (typeof TSL[k] !== "function") throw new Error(`carveTsl: the TSL namespace has no ${k}()`);
    if (!(n > 0) || n !== Math.floor(n)) throw new Error("carveTsl: n must be a positive whole number of voxels a side");
    if (!(views > 0)) throw new Error("carveTsl: makeCarvePassTsl bakes the view count into a Loop, so it needs at least one");
    if (outside !== "keep" && outside !== "clear")
        throw new Error(`carveTsl: outside must be "keep" or "clear" -- mesh/carve.mjs's own default is "keep", and which one it is decides whether the hull still contains the object`);

    const grid = instancedArray(n * n * n, "uint").label("grid");        // 1 solid, 0 carved; seeded solid
    const masks = instancedArray(views * n * n, "uint").label("masks");  // view-major, one u32 a pixel
    const rows = instancedArray(views, "vec4").label("rows");            // cos yaw, sin yaw, cos elev, sin elev
    const uniforms = { info: uniform(vec4(outside === "clear" ? 1 : 0, n, views, 0)).label("info") };

    const node = Fn(() => {
        const idx = instanceIndex;
        const alive = grid.element(idx).toVar();
        If(alive.greaterThan(uint(0)), () => {
            const c = float(n / 2);
            // the voxel's own centre, decoded from the flat index exactly as mesh/carve.mjs lays it out:
            // o = i + n * (j + n * k), so i is the fastest axis.
            const i = idx.mod(uint(n)), j = idx.div(uint(n)).mod(uint(n)), k = idx.div(uint(n * n));
            const dx = float(i).add(0.5).sub(c).toVar();
            const dy = float(j).add(0.5).sub(c).toVar();
            const dz = float(k).add(0.5).sub(c).toVar();
            Loop({ start: 0, end: views }, ({ i: v }) => {
                If(alive.greaterThan(uint(0)), () => {
                    const r = rows.element(int(v));
                    // THE ORDER IS THE ARITHMETIC, as v4370 learned the hard way: this is mesh/carve.mjs's
                    // projectFlat term for term, in its association, so the f32 mirror rounds where this rounds.
                    const rx = dx.mul(r.x).sub(dz.mul(r.y));
                    const rz = dx.mul(r.y).add(dz.mul(r.x));
                    const ry = dy.mul(r.z).sub(rz.mul(r.w));
                    const u = floor(rx.add(c)).toVar();
                    const vv = floor(ry.add(c)).toVar();
                    const off = u.lessThan(float(0)).or(vv.lessThan(float(0)))
                        .or(u.greaterThanEqual(float(n))).or(vv.greaterThanEqual(float(n)));
                    If(off, () => {
                        // A PIXEL OFF THE EDGE IS A VIEW WITH NOTHING TO SAY, not a view saying "empty" --
                        // mesh/carve.mjs shipped the other answer and it broke containment by 7.0%.
                        If(uniforms.info.x.greaterThan(float(0.5)), () => { alive.assign(uint(0)); });
                    }).Else(() => {
                        const p = uint(int(v)).mul(uint(n * n)).add(uint(vv).mul(uint(n))).add(uint(u));
                        If(masks.element(p).equal(uint(0)), () => { alive.assign(uint(0)); });
                    });
                });
            });
            grid.element(idx).assign(alive);
        });
    })().compute(n * n * n);

    return { node, grid, masks, rows, uniforms, n, views, outside, count: n * n * n };
}
