# v4669 -- THE REACTIVE MASK, MEASURED ON THE CONTENT IT EXISTS FOR

**A first measurement on new content, not a pre-registered confirmation.** The direction was
predicted — four rounds of this tree said so in writing before the content existed, and
`git log` holds those — but no statistic or threshold was fixed in advance. v4671 is the
confirming round.

## THE THING THAT WAS MISSING WAS THE CONTENT

    render/reactiveGPU-selfcheck.mjs, v4657   "whether an APPLICATION-supplied mask would beat this
                                               derived one ... needs content that knows which of its
                                               own pixels are particles"
    v4665                                     "FSR2 ships it for shader-animated and transparent
                                               content -- particles, foliage -- which this page does
                                               not have"
    v4666                                     "this page has no particles and no transparency; the
                                               measurement says what the mask is worth HERE"

The reactive mask was built at v4657, measured at v4658 (+0.400 dB), localised at v4663, and
found to be worth **+0.0059 dB** once dilation fixed the silhouettes at v4666. Every one of those
numbers was taken on a scene built to exercise **object motion**, with a fully opaque slab. The
feature was being judged on a case it was not designed for, and each round said so and could not
do anything about it.

## WHAT A TRANSLUCENT SURFACE DOES, AND WHY NO MOTION VECTOR CAN BE RIGHT ABOUT IT

Alpha-blended geometry is drawn after the depth pass and **does not write depth**. So at a
translucent slab pixel:

* the depth buffer, the id buffer and therefore the **motion vector** describe the BACKGROUND;
* the **colour** is a blend of two surfaces moving at different speeds.

Reprojecting that colour along the background's vector is wrong by construction. A reactive mask
cannot fix the reprojection — nothing can — it can only tell the accumulator to trust less of it.
That is the entire design, and it is why the feature exists in FSR2 at all.

## THE MEASUREMENT

Frames 3–53, objects camera, smooth scene, dilation at its shipped default, shading off, the
reactive mask ON against OFF:

    slab OPAQUE       (v4666)   +0.0820 dB    33 up / 18 down
    slab TRANSLUCENT  alpha 0.5 **+0.6673 dB    51 up /  0 down**    worst +0.01, best +1.21

**Eight times the effect, and it does not lose a single frame.** For scale, the two other
switchable features on this page are the shading mask at +0.117 dB (21 of 21 up) and dilation at
+1.799 dB (43 of 51 up, one frame losing 2.43). The reactive mask on transparent content is the
only feature this arc has measured that is both large and never negative.

## AND THE MECHANISM IS VISIBLE IN THE MASK'S OWN COUNTERS

    depth-gated declines, opaque slab        106 or 216 every frame
    depth-gated declines, translucent slab   ZERO, every frame

The depth gate exists so the mask declines to report a disocclusion under another name — v4657's
whole design. With no depth written for the slab there is **no silhouette in the depth buffer at
all**, so the gate never fires and every pixel is examined. The mask has nothing to hand off to
the disocclusion test, so it does the work itself. That is not a coincidence beside the result;
it is the same fact stated twice.

## WHAT THIS DOES NOT ESTABLISH

* **It is not a pre-registered result.** No statistic, threshold or direction was fixed in a
  commit before the data existed, which is the standard the rest of this arc has held itself to
  since v4660. 51 of 51 is not a number that needs a test to be believed, and that is not the
  point: the procedure is what stops a round choosing its verdict, and this round did not follow
  it. v4671 does.
* **One alpha, one scene.** 0.5 on one translucent quad. Whether the effect scales with alpha, or
  survives many overlapping translucent layers, is unmeasured.
* **Nothing about an APPLICATION-supplied mask.** FSR2's actual design has the content declare
  which pixels are reactive rather than deriving it from colour. This page can now supply that
  declaration and does not yet. v4670.
* **Nothing about transparency's effect on the rest of the chain.** Dilation, the locks and the
  clip test all read a depth buffer the slab is absent from. Whether any of them wants to know
  about transparency is a separate question this round does not ask.
