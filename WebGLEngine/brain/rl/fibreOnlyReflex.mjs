// WebGLEngine/brain/rl/fibreOnlyReflex.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY WHOSE NETWORK CANNOT OVERRULE ITS HABITUATING FIBRES (the escape round 11, registered in brain/FLY_ESCAPE_FIBRE_ONLY_WIP.md before this file existed). It is brain/rl/coactReflex.mjs's CoactReflex,
// used as it is -- the efficacies of the connections onto the Giant Fibers, the line m > THETA taken before the tick's change, the weakening g <- g - a g |h| [fired] + b (1 - g) -- with ONE change:
// the action is GAIN x (+1 if it fires, else -1) and NOTHING IS ADDED. In round 10 the network's output was added, and three flies in twelve held it under -GAIN on every tick, so no firing ever
// moved them. Here the network still runs every tick (the parent runs it, with the efficacies), and its weights still set the source cells' activity h that drives the weakening; its output layer's
// weights are in the list and do nothing. With both rates at 0 the fly is the reflex, to the bit, whatever its other weights (the gate holds it).
// Pure: no I/O, no clock, no Math.random.
"use strict";
import { CoactReflex, GAIN } from "./coactReflex.mjs";

export class FibreOnlyReflex extends CoactReflex {
    act(obs) { super.act(obs); return [this.fired ? GAIN : -GAIN]; }
}
export default FibreOnlyReflex;
