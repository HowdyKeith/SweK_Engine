// WebGLEngine/brain/trace.mjs — v2520
//
// CAN WE RECORD OUR OWN AGENT'S SESSIONS? Keith asked, and the answer is yes — better than for a chat agent,
// because this one runs on his hardware and we own the process.
//
// cosmtrek/mindwalk replays a coding-agent session by reading transcripts the CLI happened to leave behind. We have
// none of those for claude.ai. But the GPU Brain IS an agent, it makes thousands of decisions a minute, and every
// resolved one already passes through a single loop in brain.js carrying who chose, what mode produced the choice,
// and whether it worked. Nothing kept it. This keeps it.
//
// WHAT THE BRAIN ALREADY KNEW ABOUT ITSELF: selection_stats.json — an A/B between epsilon and sampled, z-tested,
// per domain, persisted across sessions. That is real self-knowledge and it is already honest about its own limit:
// "a REGRET PROXY, not true regret (which needs the counterfactual optimum nothing observes)". What it has no
// concept of is a SESSION: aggregate hit-rates cannot tell you that the brain spent ninety seconds firing into a
// wall, because a wall and a miss look identical in a ratio.
//
// OFF BY DEFAULT, ON PURPOSE. Keith said "optionally" and he is right to: this writes a line per decision, and a
// brain under load makes thousands a minute. BRAIN_TRACE=1 turns it on. A trace nobody asked for is a disk filling
// up in the background for the sake of a page nobody opened.
//
// WHAT A TRACE PROVES: what the brain chose, in what order, and what happened next.
// WHAT IT DOES NOT: WHY. There is no counterfactual here — the same limit selection_stats already names. A trace
// shows a decision and its outcome; it cannot show the better decision nobody made.
//
// WHAT THE INDEX IS, AND WHAT IT IS NOT. I wrote "tick-indexed" here first and then went looking for the tick.
// THERE WASN'T ONE -- the word appeared in brain.js only in comments, the outcomes carried id and hp, and the
// engine never told the brain what tick it was. So each record carried `seq`: a monotonic counter, the order
// THIS BRAIN decided things. Enough to replay one session. NOT enough to compare two machines: peers resolve
// outcomes as the network delivers them, so seq 400 here and seq 400 there are not the same moment, and lining
// them up produces a confident, meaningless diff.
//
// v2549 -- THE ENGINE STAMPS ONE NOW, and it had to be the engine: the page drives the loop, stepAgent moves ONE
// agent, and the bridge only relays. Nothing owned a clock because nothing owned the advance. RoomWorld.advance()
// does now, called once per frame, and the tick rides sim -> snapshotBody() -> the bridge's stored snapshot ->
// brain -> here.
//
// `tick` IS OPTIONAL AND MUST STAY OPTIONAL. A source that does not own a world does not get to invent one, and
// a record with no tick is a within-session record that SAYS SO by omitting the field. null is not tick 0. Two
// traces can only be diffed where BOTH carry a tick -- anything else is the same confident, meaningless answer
// in a new costume.
//
// Wall-clock stays out of the records for the ordinary reason: it makes a trace unreplayable at any speed but the
// one it happened at.
"use strict";

const ON = (() => {
    try { return (globalThis.Deno?.env?.get("BRAIN_TRACE") ?? "") === "1"; } catch { return false; }
})();

const MAX_BUFFER = 512;        // flush every N records — one write per decision would dominate the tick
const MAX_RECORDS = 200000;    // ~20 MB of jsonl. A trace that grows without bound is a disk-full at 3am.

let _buf = [];
let _n = 0;
let _path = null;
let _stopped = false;
let _startedAt = null;

export function traceEnabled() { return ON && !_stopped; }

export function traceOpen(path) {
    if (!ON) return null;
    _path = path;
    _buf = [];
    _n = 0;
    _stopped = false;
    _startedAt = Date.now();   // wall-clock is fine for the HEADER: it labels the session, it is not compared
    // The header records WHO produced this, so a trace found on disk in a month can still be identified. A trace
    // that cannot say which build made it is an artifact nobody can act on.
    _write({ t: "session", at: _startedAt, build: _brainBuild(), pid: _pid() });
    return _path;
}

function _brainBuild() {
    try { return globalThis.__BRAIN_BUILD ?? "unknown"; } catch { return "unknown"; }
}
function _pid() {
    try { return globalThis.Deno?.pid ?? 0; } catch { return 0; }
}

function _write(rec) {
    _buf.push(JSON.stringify(rec));
    if (_buf.length >= MAX_BUFFER) traceFlush();
}

// One decision, one line. Fields are short on purpose: this runs inside the tick loop, and a trace that costs the
// brain measurable time changes the thing it is measuring.
//
//   seq    the order THIS brain decided. Not the engine's tick -- see the note above. Comparable within a
//          session, NOT across machines.
//   id     who decided
//   dom    the domain (kaiju / dungeon / raycaster / ev / fps)
//   choice what it actually chose. A decision trace without this is a log of shrugs.
//   mode   which policy produced it: "sampled", "emphasis", or null for the epsilon/argmax path. (I wrote
//          "sampled/epsilon/null" here first -- there is a third, and it is stamped in the same map.)
//   src    "brain" / "brain-explore" / other: a rotation fallback is the tell that no policy chose this at all
//   hit    did it work
//   p      the softmax probability of the choice that fired -- ONLY for a sampled pick. The epsilon path's
//          propensity is a different formula entirely, and averaging two different things into one column produces
//          a number that means nothing. Omitted rather than faked.
export function traceDecision({ id, dom, choice, mode, hit, p, src, tick }) {
    if (!ON || _stopped) return;
    if (_n >= MAX_RECORDS) {
        // Stop, and SAY SO in the trace itself. A trace that silently truncates is worse than a short one: the
        // reader would conclude the brain stopped deciding.
        _write({ t: "truncated", after: _n, why: "MAX_RECORDS reached — the session outlived the buffer, not the brain" });
        traceFlush();
        _stopped = true;
        return;
    }
    _n++;
    _write({ t: "d", seq: _n, id, dom, choice, mode: mode ?? null, hit: hit ? 1 : 0, ...(tick != null ? { tick } : {}), ...(p != null ? { p } : {}), ...(src ? { src } : {}) });
}

// A verdict the brain reached about ITSELF, mid-session. These are the moments worth scrubbing to.
export function traceNote(note, extra) {
    if (!ON || _stopped) return;
    _write({ t: "note", seq: _n, note, ...(extra || {}) });
}

export function traceFlush() {
    if (!ON || !_path || !_buf.length) return;
    const text = _buf.join("\n") + "\n";
    _buf = [];
    try {
        globalThis.Deno?.writeTextFileSync(_path, text, { append: true, create: true });
    } catch (e) {
        // A failed write must not take the brain down with it. The brain's job is to think; the trace is a
        // bystander, and a bystander that can halt the thing it observes is a liability.
        try { console.warn("[trace] write failed, tracing off:", e?.message); } catch {}
        _stopped = true;
    }
}

export function traceStats() {
    return { on: ON, stopped: _stopped, records: _n, buffered: _buf.length, path: _path, startedAt: _startedAt };
}
