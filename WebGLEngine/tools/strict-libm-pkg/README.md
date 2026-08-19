# strict-libm

A host-`Math`-free, byte-deterministic drop-in for the transcendental functions a render or physics engine drifts on across platforms: **sin, cos, hypot, log2, atan2**.

## The problem it solves

A JavaScript engine borrows `Math.sin`, `Math.log2`, `Math.hypot`, and friends from the operating system's math library. Those libraries agree to within a few ULPs but are **not bit-identical** across platforms. So a render or a lockstep physics step that hashes its output gets one hash on Linux and a slightly different one on macOS — same code, same input, same seed. That few-ULP disagreement is enough to break a cross-platform byte-exact check.

## The fix

Each function here computes its result **by construction** — argument reduction plus a polynomial or series — and calls no host transcendental. The only `Math` it touches is `sqrt`, `round`, and `abs`, which ECMA-262 specifies *exactly* and every conforming engine computes identically. So the output depends on **this code**, not on the OS `libm` underneath the VM. Swap these in and a per-platform byte-exact computation becomes cross-platform byte-exact.

The guarantee is **structural, not empirical**. It is not "it matched on the three machines I had"; it is "there is no host transcendental in the source to drift" — and you can check that yourself:

```
node test.mjs
```

`test.mjs` strips the comments, greps the source, and fails if any `Math.sin/cos/hypot/log2/atan2/...` remains. It also verifies each function against the host `Math` to machine epsilon.

## Accuracy (vs host `Math`, over ~200k samples each)

| function | error | range |
|---|---|---|
| `strictSin`, `strictCos` | 1.1e-16 abs | \|x\| ≤ 2²⁰ |
| `strictHypot` | 0 (exact) | — |
| `strictLog2` | 7e-15 abs | x ∈ [e⁻⁴⁰, e⁴⁰], exact on powers of two |
| `strictAtan`, `strictAtan2` | 4.4e-16 abs | all quadrants |

Nothing is traded for the guarantee: the strict values match the host to the last bit or two.

## Usage

```js
import { strictSin, strictCos, strictHypot, strictLog2, strictAtan2 } from "./index.mjs";

// drop-in for Math.sin / Math.cos / Math.hypot / Math.log2 / Math.atan2
const r = strictHypot(dx, dy);
const a = strictAtan2(dy, dx);
```

`strictSin`/`strictCos` are verified for `|x| ≤ 2²⁰` (`STRICT_TRIG_MAX`) and throw beyond it, where two-constant Cody-Waite reduction would lose correctness. Reduce your angle into range first.

## See it

```
node demo.mjs
```

Runs a transcendental-heavy render fingerprint over 100k points with host `Math` and with `strict-libm`, prints both hashes and their largest disagreement. On one machine both hashes are stable; the difference is that the strict hash stays the same on the *next* machine.

## How it works

- **sin / cos** — Cody-Waite range reduction to [-π/4, π/4], then minimax polynomials.
- **hypot** — `sqrt(a²+b²)` with overflow-safe scaling in a fixed operation order; `sqrt` is a correctly-rounded IEEE-754 instruction, identical everywhere.
- **log2** — IEEE-754 exponent bits (a fixed layout) for the integer part, atanh series for the mantissa.
- **atan2** — fold |t|>1 through π/2, subtract the nearest `atan(k/8)` (compile-time literals), then a short odd series on a residual ≤ 1/16.

## License

MIT.

*Generated from the SweK Engine's gated `tools/strictTrig.mjs` and `tools/strictMath.mjs`, where these are run under a hard-fail verify gate every build.*
