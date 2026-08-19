// strict-libm — a host-Math-free, byte-deterministic drop-in for the transcendentals a render engine drifts on.
//
// Every function here computes its result BY CONSTRUCTION -- range reduction plus a polynomial or series -- and
// calls no host Math transcendental. The only Math it touches is sqrt/round/abs, which ECMA-262 specifies exactly
// and every conforming engine computes identically. So the output is a function of THIS CODE, not of the OS libm
// underneath the JS VM. Swap these in for Math.sin/cos/hypot/log2/atan2 and a computation that was byte-identical
// only per-platform becomes byte-identical across platforms.
//
// Accuracy (vs the host Math, measured over hundreds of thousands of samples):
//   strictSin / strictCos   1.1e-16   (|x| <= 2^20)
//   strictHypot             exact     (0 relative error)
//   strictLog2              7e-15     (x in [e^-40, e^40], exact on powers of two)
//   strictAtan / strictAtan2  4.4e-16 (all quadrants)
//
// The guarantee is structural, and you can check it: run `node test.mjs`. It strips the comments and greps the
// source, and there is no host transcendental left to drift.
export { strictSin, strictCos, STRICT_TRIG_MAX } from "./src/strictTrig.mjs";
export { strictHypot, strictLog2, STRICT_LOG2_MIN, strictAtan, strictAtan2 } from "./src/strictMath.mjs";
