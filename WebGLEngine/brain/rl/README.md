# brain/rl -- Rocket League RL spike (v2216)

A **feasibility spike**, not a bot. It answers one question: can the GPU-brain project grow a
continuous-control agent that a *real physics* reward can train? The answer is yes, and this
proves the loop end to end without a GPU or the game.

## What's here

| file | role | runs where |
|---|---|---|
| `rocketPolicy.js` | continuous-control head: 20-float obs -> 8 controller axes (tanh), flat params for ES, JSON save/load | anywhere (pure CPU JS) |
| `rocketEnv.js` | env interface + **KinematicStub** (a point-mass physics *stand-in*) + shaped reward + `makeEnv()` | anywhere |
| `rocketLoop.mjs` | **Evolution-Strategies** training/eval loop (no backprop, fleet-parallelisable); CLI + exported `trainES`/`evaluate` | node or Deno |
| `rocketsimBackend.js` | REAL-physics backend: strict JSON-line pipe to a Python subprocess; injectable transport for tests | Deno (rig) / node |
| `rocketsim_bridge.py` | the Python side: **RocketSim** ground-truth physics, emits the *same* 20-float obs | **rig only** |
| `tools/rocket-selfcheck.mjs` | proves head, stub physics, protocol, and that ES **improves** a policy | node or Deno |

The stub and RocketSim are interchangeable to the policy and loop -- the same drop-in
discipline as the CPU/GPU field solvers and the BZFlag TCP/WebSocket transport swap. Develop
against the stub; flip one word to run on real physics.

## Run it (headless, no GPU)

```
node brain/rl/tools/rocket-selfcheck.mjs      # 22 checks, incl. measured ES improvement
node brain/rl/rocketLoop.mjs --backend stub --iters 30 --pairs 16 --episodes 5
```

Measured on the sandbox (deterministic, seed 12345): objective return **-2.32 -> +0.02** over
25 iterations; even the never-optimised held-out seeds improved (-2.51 -> -0.59). That is the
loop working, on a stand-in world.

## Run it on REAL physics (rig only)

RocketSim needs the arena **collision meshes**, which are *not* redistributable -- dump them
once from an installed Rocket League, then:

```
pip install RocketSim
export ROCKETSIM_MESHES=/path/to/collision_meshes      # (set ...=C:\... on Windows)
deno run -A brain/rl/rocketLoop.mjs --backend rocketsim --iters 200 --save brain/rl/rocket_policy.json
```

Nothing else changes -- same head, same loop, same obs. That is the seam.

## Honest limits

- **The stub is not Rocket League.** It is a ground driver with a crude car-ball push; no car
  body, no aerials, no ball spin. It exists to exercise the loop, not to grade a policy.
- **ES is a starter, not the finish.** It is chosen for the spike because it needs no
  gradients (so the physics can be a black box) and fans out over the LAN fleet trivially.
  PPO/SAC is the obvious upgrade once real physics is in the loop; the head/env interface do
  not change.
- **This is not a competitive bot.** A real one is millions of RocketSim steps of training,
  a richer obs/reward, and self-play -- a project, not a spike.

## Why not just use MIRA?

MIRA (`mira-wm/mira`) is a 5B-parameter world model that *generates* Rocket League frames
from four players' actions -- no physics engine inside, the game lives in the weights. It's a
research artifact that wants a datacenter-class GPU for real time, and its own authors keep
the true physics (BakkesMod) *out* of the model, using it only to *evaluate*. A policy that
"wins" inside MIRA has learned to exploit MIRA's generative dynamics, not to play Rocket
League -- it has fooled the model. So the ground truth here is **RocketSim**, not a world
model. MIRA could later serve as an *imagination* supplement (cheap rollouts to augment
training), but always validated against this real-physics loop -- never as the arbiter.
