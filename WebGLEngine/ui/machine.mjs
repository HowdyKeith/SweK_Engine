// WebGLEngine/ui/machine.mjs -- v2987
//
// A TINY FINITE STATE MACHINE, AND A WAY TO PROVE EVERY STATE IS REACHABLE.
//
// The idea is chakra-ui/zag's: model interaction logic as an EXPLICIT state machine rather than as ad-hoc
// booleans scattered through a render function. Their stated reason is worth repeating verbatim -- they had
// "too many hiccups and bugs related to how we coordinate events, manage state, and side effects", and most of
// them lived in the orchestration rather than in any single piece of logic.
//
// AND THEIR SECOND RULE IS THE ONE THAT MAKES IT PORTABLE HERE: "All machines should be light-weight, simple,
// and easy to understand. Avoid using complex machine concepts like spawn, nested states." So this is about
// sixty lines. A statechart library would be a bigger dependency than the problem.
//
// WHY THIS TREE NEEDS IT NOW. The panels have quietly become stateful. A rig job is idle, or running, or
// finished, or failed -- and separately EDITS SOURCE, which changes which machine you may run it on. Bench
// collect has four verdicts. CrossDesk has a TRI-STATE platform check where the third state is "cannot tell".
// Every one of those is currently a handful of booleans in server.html, and the failure mode is not a wrong
// pixel: it is a state nobody thought about, rendering as though it were another one.
//
// THE EXACT KEY, AND IT IS THE SAME SHAPE AS THE GRAVEYARD CENSUS: EVERY DECLARED STATE MUST BE REACHABLE FROM
// THE INITIAL STATE, AND EVERY REACHABLE STATE MUST BE DECLARED. A state you declared and cannot reach is a
// branch of UI nobody can ever see -- a green gate on nothing, in a render function. A state you can reach and
// did not declare is worse: it is the one that renders as something else.
"use strict";

/**
 * @param {{initial:string, states:Object<string,{on?:Object<string,string>, final?:boolean, note?:string}>}} def
 */
export function defineMachine(def) {
    if (!def || !def.initial || !def.states) throw new Error("a machine needs an initial state and a states map");
    if (!def.states[def.initial]) throw new Error("initial state '" + def.initial + "' is not declared");
    for (const [name, s] of Object.entries(def.states)) {
        for (const [evt, target] of Object.entries((s && s.on) || {})) {
            if (!def.states[target]) {
                throw new Error("state '" + name + "' on '" + evt + "' goes to '" + target + "', which is not declared -- an undeclared target is the state that renders as something else");
            }
        }
    }
    return {
        ...def,
        stateNames: Object.keys(def.states),
        /** Apply an event. Returns the new state name, or null if the event is not handled HERE. */
        next(from, event) {
            const s = def.states[from];
            if (!s) throw new Error("unknown state '" + from + "'");
            const t = (s.on || {})[event];
            return t === undefined ? null : t;
        },
    };
}

/** Every state reachable from initial, by breadth-first walk over declared transitions. */
export function reachable(machine) {
    const seen = new Set([machine.initial]);
    const stack = [machine.initial];
    while (stack.length) {
        const cur = stack.pop();
        for (const target of Object.values((machine.states[cur] || {}).on || {})) {
            if (!seen.has(target)) { seen.add(target); stack.push(target); }
        }
    }
    return seen;
}

/**
 * The audit. Returns the two failures separately, because they are different bugs:
 *   unreachable -- declared and cannot be reached. UI nobody can ever see.
 *   dead        -- reachable, not final, and has no way out. The machine can enter and never leave.
 */
export function audit(machine) {
    const reach = reachable(machine);
    const unreachable = machine.stateNames.filter((n) => !reach.has(n));
    const dead = machine.stateNames.filter((n) =>
        reach.has(n) && !machine.states[n].final && Object.keys(machine.states[n].on || {}).length === 0);
    return {
        ok: unreachable.length === 0 && dead.length === 0,
        reachable: [...reach].sort(), unreachable, dead,
        states: machine.stateNames.length,
    };
}

// ---- THE RIG JOB LIFECYCLE, as the bridge actually behaves ---------------------------------------------------
//
// Declared here rather than inferred from the UI, so the panel and the bridge can be checked against ONE
// statement instead of against each other.
export const RIG_JOB = defineMachine({
    initial: "idle",
    states: {
        idle:    { on: { start: "running" },
                   note: "no job running. ONE AT A TIME is a property of the whole panel, not of a job -- v2870 chose that deliberately, because a queue hides expected duration." },
        running: { on: { finish: "done", fail: "failed", kill: "killed" },
                   note: "exactly one job may be here at a time." },
        done:    { on: { start: "running" }, note: "finished cleanly; another job may start." },
        failed:  { on: { start: "running" }, note: "exited non-zero. Distinct from killed: the job ran and said no." },
        killed:  { on: { start: "running" },
                   note: "interrupted. For the mutation job this is the DANGEROUS exit -- a killed run can leave a mutation in the tree, which is why a stranded marker exists and why the runner checks for one afterwards." },
    },
});
