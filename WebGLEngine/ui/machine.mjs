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

// ---- v4601 -- THE PIECE A TICK-DRIVEN CALLER NEEDS THAT AN EVENT-DRIVEN ONE DOES NOT --------------------------
//
// Every existing caller of this file (RIG_JOB and its kin) is fired BY an explicit user or network action: a
// click, a response arriving. `next(from, event)` is exactly right for that -- something else already knows
// which event just happened.
//
// A per-tick creature/bot/boss controller does not get told "the hp-threshold event just fired" -- it has to
// LOOK, every frame, at whether the boss's hp fraction just crossed 0.5, or whether the minion count just hit
// zero, and decide for itself which named event (if any) that condition amounts to. That condition-to-event
// translation is domain logic and stays the CALLER's job, on purpose -- this file has no opinion on what a
// boss or a minion is. What IS generic, and worth factoring out exactly once, is what happens once the event
// IS known: look up the transition, and if it actually moves the machine, run that target state's entry
// side-effect exactly once. Every hand-rolled FSM this tree's own audit found (tools/ship/nextRounds.mjs's
// "npc-decision-framework" entry) reimplements this same three-line dispatch privately -- a `_phase = X;
// counters.x++; doSideEffects()` block guarded by an `if (this._phase === Y)` -- because nothing offered it
// as a function. This is oguzeroglu/Ego's actual contribution translated into this file's own plain-data,
// no-class idiom (see that backlog entry for the full read of Ego's source): a decision-tree/HFSM library's
// only genuinely hard-won idea is "the same knowledge object drives the transition test AND the code that
// runs once you arrive", and a shared knowledge object plus a `{state: onEnter}` map says the same thing in
// four lines instead of a class hierarchy.
/**
 * Fire one event against a tick-driven machine. Returns the state to hold onto next tick (unchanged if the
 * event did not apply here). `onEnter[state]` runs AT MOST ONCE per actual transition -- never on a no-op
 * event, and never again just because tick() keeps calling with the same already-current state -- which is
 * the exact bug a hand-rolled `if (this._phase !== "x") { this._phase = "x"; doStuff(); }` guard exists to
 * avoid, reproduced here once instead of once per caller.
 *
 * @param {ReturnType<typeof defineMachine>} machine
 * @param {string} from        the state as of last tick
 * @param {string|null} event  the event THIS tick's world-state translates to, or null for "nothing happened"
 * @param {Object<string,Function>} [onEnter]  state name -> side effect, called with `...args`
 */
export function applyEvent(machine, from, event, onEnter, ...args) {
    if (event == null) return from;
    const to = machine.next(from, event);
    if (to === null || to === from) return from;
    if (onEnter && typeof onEnter[to] === "function") onEnter[to](...args);
    return to;
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
