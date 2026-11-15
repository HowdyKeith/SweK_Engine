// WebGLEngine/brain/rl/reflexStart.mjs -- UNNUMBERED (the version is chosen at ship time)
//
// A FLY THAT STARTS AT THE REFLEX (the escape round 2, registered in brain/FLY_ESCAPE_REFLEX_WIP.md) -- brain/rl/leanStart.mjs's idea for a policy with ONE output. The wrapper's action is
//   GAIN x the rule's answer (+1 or -1)  +  the network's output,
// and the network's output layer starts at zero (the last `tail` weights of its flat list), so at the start the fly IS the rule. GAIN is a half so that the network can overrule the rule: its output
// lies in (-1, 1), so it turns a +1 into "not above 0" when it says less than -0.5, and a -1 into "above 0" above 0.5. With the rule at full weight no output could ever change the answer.
// The wrapper has the trainer's interface (paramCount / getParams / setParams / act) and its weights are the network's own, in the network's order.
// Pure: no I/O, no clock, no Math.random.
"use strict";

export const GAIN = 0.5;

export class ReflexStart {
    constructor(inner, { rule, tail } = {}) {
        if (!inner || typeof inner.act !== "function" || typeof inner.getParams !== "function" || typeof inner.setParams !== "function") throw new Error("reflexStart.ReflexStart: the inner policy has act, getParams and setParams");
        if (typeof rule !== "function") throw new Error("reflexStart.ReflexStart: the rule is a function of the observation");
        const p = inner.getParams();
        if (!Number.isInteger(tail) || tail < 1 || tail > p.length) throw new Error(`reflexStart.ReflexStart: the output layer is 1 to ${p.length} weights (got ${tail})`);
        this.inner = inner; this.rule = rule; this.tail = tail;
        p.fill(0, p.length - tail); inner.setParams(p);
    }
    paramCount() { return this.inner.getParams().length; }
    getParams() { return this.inner.getParams(); }
    setParams(flat) { this.inner.setParams(flat); return this; }
    act(obs) {
        const net = this.inner.act(obs), r = this.rule(obs);
        if (net.length !== 1) throw new Error(`reflexStart.ReflexStart: the network answers ${net.length} numbers, and the rule answers one`);
        return [GAIN * (r[0] > 0 ? 1 : -1) + net[0]];
    }
}
export default ReflexStart;
