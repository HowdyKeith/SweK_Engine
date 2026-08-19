// physics/sph/kernels.js -- the three kernels of Smoothed Particle Hydrodynamics, and why the blobulator was
// already one of them.
//
// v2483 found the identity by accident: the tomography round chose Wyvill's metaball kernel because it was the only
// one that could be X-rayed (compact support, smooth, closed-form shadow), and Wyvill's kernel IS SPH's poly6.
// Metaballs picked it in 1986 for looking like wax; fluid dynamics picked it in 2003 for being smooth, compact and
// cheap. Same function: (h^2 - r^2)^3 = h^6 (1 - r^2/h^2)^3.
//
// The blobulator has therefore been computing an SPH density field for years without knowing, and the only thing
// missing was the normalisation -- because a blob field never had to MEAN anything, it only had to look like wax.
// The instant it must mean something, a kernel has one non-negotiable duty:
//
//     the integral of W over all space is EXACTLY 1
//
// or mass is not conserved and every number downstream is decoration. That is a real gate, it is analytic, and each
// of the three constants below is FORCED by it -- they are not tuning, they are the answer to an integral.
//
// SPH needs three kernels and cannot use one for everything, which is the part that looks arbitrary and is not:
//
//   poly6      -- for DENSITY. Smooth and cheap. Its gradient vanishes at the centre, which makes it useless for
//                 pressure: particles on top of each other would feel no push apart, and the fluid would clump.
//   spiky      -- for the PRESSURE gradient, precisely because it does NOT vanish at the centre. It has a cusp
//                 there, and that cusp is the whole point: it is what keeps particles from collapsing.
//   viscosity  -- for the viscous term. Its Laplacian is positive everywhere, so it cannot inject energy.
//
// Muller, Charypar & Gross 2003, "Particle-Based Fluid Simulation for Interactive Applications".
"use strict";

// v2546 -- Math.pow IS IMPLEMENTATION-APPROXIMATED, AND THIS IS THE HOT PATH.
//
// IEEE 754 pins +, -, *, / and sqrt EXACTLY: correctly rounded, bit-identical on any conforming hardware. It
// pins NOTHING about pow, sin, cos, cbrt, exp or log, and ECMAScript follows suit -- Math.pow is
// "implementation-approximated". V8 on arm64 is free to differ from V8 on x86_64 in the last ulp, and nothing
// says otherwise.
//
// These kernels take h to the 9th and the 6th. h*h*h*... is plain multiplication: exact, everywhere, forever.
// It is not an optimisation, it is the difference between a simulation that agrees across two machines and one
// that quietly does not -- and the flesh selfcheck asserts "same ticks -> bit-identical body", which it has only
// ever verified on ONE machine.
//
// Not hypothetical: an arm64 Mac joins this fleet tomorrow, and every other box is x86_64.
// W(r,h) = 315/(64 pi h^9) (h^2 - r^2)^3.   The constant is forced: int_0^1 u^2 (1-u^2)^3 du = 16/315.
const _p9 = (h) => { const h2 = h * h, h4 = h2 * h2, h8 = h4 * h4; return h8 * h; };   // h^9, exact
const _p6 = (h) => { const h2 = h * h, h3 = h2 * h; return h3 * h3; };                  // h^6, exact
const POLY6 = (h) => 315 / (64 * Math.PI * _p9(h));
function poly6(r2, h) {
    const d = h * h - r2;
    return d <= 0 ? 0 : POLY6(h) * d * d * d;
}

// The spiky kernel: W = 15/(pi h^6) (h - r)^3.  Constant forced by int_0^h r^2 (h-r)^3 dr = h^6/60.
const SPIKY = (h) => 15 / (Math.PI * _p6(h));
function spiky(r, h) {
    const d = h - r;
    return d <= 0 ? 0 : SPIKY(h) * d * d * d;
}
// and its GRADIENT magnitude: dW/dr = -45/(pi h^6) (h - r)^2. Non-zero as r -> 0: that cusp is what stops collapse.
function spikyGrad(r, h) {
    const d = h - r;
    return d <= 0 ? 0 : -45 / (Math.PI * _p6(h)) * d * d;
}

// The viscosity kernel's Laplacian: 45/(pi h^6) (h - r). Positive on (0,h), so viscosity can only remove energy.
function viscLaplacian(r, h) {
    const d = h - r;
    return d <= 0 ? 0 : 45 / (Math.PI * _p6(h)) * d;
}
export { poly6, spiky, spikyGrad, viscLaplacian, POLY6, SPIKY };
