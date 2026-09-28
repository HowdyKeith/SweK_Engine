# v4679 -- PRE-REGISTERED: REPLACING THE SIDE HEURISTIC WITH THE DISOCCLUSION TEST THIS TREE ALREADY HAS

Committed BEFORE the code is written and before any number is collected. v4678's gate closes by naming
this round in as many words:

> WHAT WOULD MAKE THE RULE UNNECESSARY IS ALREADY IN THIS TREE: `render/motionVectors.mjs`'s fourth
> channel is zPrev, the depth a surface WOULD have had last frame, and `render/temporalReject.mjs`
> already compares it against the depth recorded to decide disocclusion per pixel. The dot product here
> is an approximation of that signal computed without it, and wiring the real one is the next round
> rather than a claim in this one.

## WHAT IS BEING REPLACED

`render/holeFill.mjs`'s `side: "derived"` decides which source frame a disoccluded pixel reads by a
**heuristic on the occluder's geometry**: the occluder is the nearest filled pixel in the search radius,
and the sign of its own vector dotted with the direction to the hole says whether it is leaving the hole
(content is in `cur`) or arriving at it (content is in `prev`). Where that projection is zero the rule
**abstains** and the symmetric blend is used.

v4678 measured it, on a slab at half a wall's distance sliding across it, against the frame really
rendered at t = 0.5, scored on the hole pixels only:

| slab travel | hole width | radius | `derived` | abstained | unfilled |
|---|---|---|---|---|---|
| 8.786 px | 4.39 px | 4 | **EXACT** (zero error) | 0 | 0 |
| 17.573 px | 8.79 px | 4 | 24.7571 dB | 256 of 512 | 64 |
| 17.573 px | 8.79 px | 8 | 32.1432 dB | 64 | 0 |
| 17.573 px | 8.79 px | 12 | **EXACT** | 0 | 0 |

The heuristic's weakness is that deciding the side requires the search to **reach the occluder**, so the
radius has to grow with the displacement for a reason that has nothing to do with finding the background
vector.

## THE REPLACEMENT -- DECLARED HERE, NOT AFTER THE FACT

`side: "depth"`, taking two new inputs the caller already holds: the depth buffers of `prev` and `cur`.
For a hole pixel `p` that has been given the background's vector `v` and the background's depth `z`:

* its position in `prev` is `q = p - t*v`, and in `cur` is `r = p + (1-t)*v`;
* sample `depthPrev` at `q` and `depthCur` at `r`;
* a sample **nearer than `z`** means something was in front of the background there -- that frame does
  not show this content;
* choose the side that is **not** occluded. Both clear or both occluded, blend.

This is `render/temporalReject.mjs`'s disocclusion comparison, applied to a hole instead of to a history
sample. It consults **no occluder geometry at all**.

## THE HYPOTHESES

* **H1.** On the 8.786 px scene at radius 4, `side: "depth"` reaches **zero error** on the hole pixels,
  matching `derived` and `cur`. (A replacement that lost the case the heuristic already gets right would
  not be a replacement.)
* **H2 -- the primary.** On the 17.573 px scene **at radius 4**, `side: "depth"` reads **more than 1 dB
  above** `derived`'s 24.7571 dB on the hole pixels. The 1 dB threshold is declared here because the
  pipeline is deterministic and *any* difference is real; a gain smaller than that would not justify two
  additional depth buffers as inputs, and this round would then report a replacement not worth making.
* **H3.** The number of pixels the side rule cannot decide at radius 4 on that scene falls **below 256**.
* **H4 -- a predicted NON-effect, declared so it cannot be presented as a surprise.** The count of pixels
  left **unfilled** is **identical** between `derived` and `depth` at every radius, because the radius
  governs finding the background *vector* and that mechanism is untouched. If the unfilled counts move,
  something other than the side decision changed and H2 is not interpretable.

## WHAT WOULD FALSIFY THE ROUND

H2 failing to clear 1 dB. The honest outcome then is to ship `side: "depth"` as an option, record that it
did not beat the heuristic by enough to become the default, and leave `derived` the default -- the same
shape as v4668's gate-only runner, where the reason was recorded rather than the ratchet satisfied with a
decorative call.

## WHAT IS NOT BEING TESTED

* Rotation, scale, and an occluder that is not a flat plane. Every number here and in v4678 comes from
  one flat slab on one flat wall.
* An **estimated** motion field. v4678's rig supplies the field from the scene's own knowledge on purpose,
  so the filler is measured with the flow's error removed. That stays true here.
* `fsr.html`, which still calls none of this.
