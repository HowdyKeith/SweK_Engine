// physics/damping.js -- the engine decides how much drag its universe has, instead of inheriting it by accident.
//
// WHY THIS FILE EXISTS. The backend adjudicator was run on real hardware on 2026-07-15 and found this:
//
//     the same dropped body, after one second      Jolt: 95.15633 m      box3d: 95.07456 m
//     measured linear damping                      Jolt: 0.05000 /s      box3d: 0.00000 /s
//     two identical worlds, one per backend        worst difference 0.973 m after 2.5 seconds
//
// Both backends were RIGHT. Neither had a bug. They were simulating different universes, because NEITHER LOADER EVER
// SET DAMPING AT ALL -- Jolt's 0.05 is Jolt's library default and box3d's 0.00 is box3d's library default, and the
// engine never made the choice. Every object in SweK has been falling through whatever drag its library happened to
// pick, for as long as there have been two backends.
//
// That is not a typo. It is an unmade decision, and it has teeth: cross-peer lockstep runs on EITHER backend, so two
// peers replaying identical inputs drift apart by a metre in under three seconds, and box3dSyncCompare would report
// the divergence with nothing to blame it on. The predicted values confirm the mechanism exactly -- damped
// semi-implicit Euler at c=0.05 gives 95.15632 (Jolt, to five decimals) and the same integrator at c=0 gives
// 95.07456 (box3d, to five decimals).
//
// WHY 0.05 AND NOT ZERO. Zero is the more honest physics -- there is no air in space, and the ES flight model owns its
// own drag. But the ES flight tuning, the ram/wreckage behaviour and every box3d/Jolt demo shipped so far were built
// and eyeballed against Jolt's 0.05, and changing it would silently retune all of them. The rule here has always been
// to never break working things, so the engine adopts the value it has actually been running on, and now says so out
// loud in one place, on purpose. Changing it is now a one-line decision instead of an archaeology expedition.
"use strict";

// Per-second linear damping applied to every dynamic body, in every backend. v <- v * (1 - LINEAR_DAMPING * dt).
const LINEAR_DAMPING = 0.05;

// Angular damping is Jolt's default too. Same reasoning: name it rather than inherit it.
const ANGULAR_DAMPING = 0.05;

export { LINEAR_DAMPING, ANGULAR_DAMPING };
