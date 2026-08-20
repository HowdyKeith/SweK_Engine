// WebGLEngine/tools/roundhouse/labTour.mjs -- v3445
//
// LAYER 3: A SESSION AS A PORTABLE ARTEFACT THE USER OWNS.
//
// Keith settled the shape of this round by answering the question it was blocked on: "a remote guest is really
// just a remote user, same as a local user. so if they were able to export and import their own interactions,
// if that were able to be resumed or walked through later, then that would be useful."
//
// *** THAT TURNS A LOG INTO A DOCUMENT. *** The earlier framing had the hub keeping a record ABOUT somebody,
// which is why this layer was parked last and carried a privacy weight. A tour the visitor exports, keeps,
// re-imports and walks through is the opposite thing wearing the same data, and it needs no storage decision
// on the hub at all: it is a file, it works offline, and it travels with whoever made it.
//
// ================================================================================================
// THE RULE THIS FORMAT EXISTS TO HOLD: THE TIMESTAMP LIVES ON THE LOG LINE, NEVER ON THE RECORD.
// ================================================================================================
//
// labExport carries NO TIMESTAMP ON PURPOSE -- "two identical runs must not differ; THE CONFIG IS THE
// PROVENANCE" -- and putting a time inside a record would break the round-trip diff this whole project ships
// on. So an entry is { at, kind, ... } and any lab record it carries is EMBEDDED VERBATIM AND UNTOUCHED. When
// something ran is a fact about a session; what it was run WITH is a fact about the result (v3183's own split),
// and this file is where those two finally sit next to each other without merging.
//
// ================================================================================================
// AND THE FINDING THE ROUND WAS ALWAYS GOING TO HIT: A RECORDED SHORTEST PATH IS A FACT ABOUT A MOMENT.
// ================================================================================================
//
// A tour records a route through the lab galaxy. The galaxy is DERIVED -- add a device, declare a coupling,
// move a page between panels and the edges move with it. So a route exported today and replayed next month can
// be in one of three states, and *** A TWO-STATE READER WOULD PRESENT THE FIRST AS THE THIRD, WHICH IS v3070's
// REMEMBERED RESULT PRESENTED AS A CURRENT MEASUREMENT ***:
//
//   intact     every hop is still an edge, and it is still A shortest route
//   longer     every hop is still an edge, but a SHORTER route exists now -- the tour is still walkable and
//              the words "the fewest jumps" have stopped being true of it
//   broken     a hop is no longer an edge; the route cannot be walked at all
//
// `longer` is the one that matters and the one a naive replay loses: the path still validates, every check
// passes, and the claim attached to it has quietly expired. THE SAME SHAPE AS "WAS THE SHORTEST" AGAINST "IS
// THE SHORTEST", which is two things wearing one label.
//
// SO A TOUR CARRIES THE GALAXY'S FINGERPRINT. Not to refuse an old tour -- an old tour is exactly what somebody
// wants to walk -- but so the page can say WHICH MAP IT WAS RECORDED AGAINST before it draws a single line.
//
// PURE ON PURPOSE: no fs, no path, no clock. cosmic-map.html imports this module directly and so does the gate,
// so there is ONE definition of what a tour is rather than a browser copy and a node copy that drift. Every
// function that needs a time TAKES IT AS AN ARGUMENT -- a module that read the clock itself could not be
// tested, and a format whose meaning depends on when you call it is not a format.
"use strict";

export const FORMAT = "swek-lab-tour/1";
export const ENTRY_KINDS = ["visit", "route", "record", "note"];
export const REPLAY_STATES = ["intact", "longer", "broken"];

/**
 * A deterministic fingerprint of the galaxy a tour was recorded against.
 *
 * Built from the NODE NAMES and the EDGE PAIRS WITH THEIR KINDS -- never from the placements, because a layout
 * is derived from the edges and including it would make the fingerprint change for a reason that is not a
 * change to the lab. It is a fact about WHICH MAP, not about how it was drawn.
 */
export function galaxyFingerprint(galaxy) {
    if (!galaxy || !Array.isArray(galaxy.nodes) || !Array.isArray(galaxy.edges)) return null;
    const parts = [
        galaxy.nodes.map((n) => n.id).sort().join(","),
        galaxy.edges.map((e) => [e.a, e.b].sort().join(">") + ":" + (e.kinds || []).slice().sort().join("+")).sort().join(","),
    ].join("|");
    let h = 2166136261 >>> 0;
    for (let i = 0; i < parts.length; i++) { h ^= parts.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return "g" + h.toString(16).padStart(8, "0");
}

/** An empty tour bound to the galaxy it is about. */
export function newTour(galaxy, engineVersion) {
    return {
        format: FORMAT,
        engineVersion: engineVersion || null,
        galaxy: {
            fingerprint: galaxyFingerprint(galaxy),
            devices: galaxy && galaxy.nodes ? galaxy.nodes.length : null,
            edges: galaxy && galaxy.edges ? galaxy.edges.length : null,
            components: galaxy && galaxy.counts ? galaxy.counts.components : null,
        },
        entries: [],
    };
}

/**
 * Append an entry. `at` is ALWAYS the caller's -- see the header. The entry is the log line; anything it
 * carries from the lab is embedded verbatim.
 */
export function addEntry(tour, at, kind, body) {
    if (!ENTRY_KINDS.includes(kind)) throw new Error(`labTour: unknown entry kind "${kind}"; expected one of ${ENTRY_KINDS.join(", ")}`);
    if (typeof at !== "string" || !at) throw new Error("labTour: an entry needs its own `at` -- this module never reads a clock");
    if (kind === "record") {
        const r = body && body.record;
        if (!r || typeof r !== "object") throw new Error("labTour: a record entry must carry a lab record");
        // *** THE ONE STRUCTURAL REFUSAL IN THE FORMAT. *** A timestamp inside a record would make two identical
        // runs differ and break the round-trip diff the project ships on; the log line above it already says
        // when. Refused rather than stripped, because silently removing a caller's field is how a format starts
        // meaning something different from what a caller thinks it wrote.
        for (const bad of ["at", "time", "timestamp", "when", "ranAt"]) {
            if (Object.prototype.hasOwnProperty.call(r, bad)) {
                throw new Error(`labTour: a lab record must not carry \`${bad}\` -- THE TIMESTAMP LIVES ON THE LOG LINE, NEVER ON THE RECORD (labExport has no timestamp on purpose)`);
            }
        }
    }
    tour.entries.push(Object.assign({ at, kind }, body || {}));
    return tour;
}

export const addVisit = (tour, at, device) => addEntry(tour, at, "visit", { device });
export const addRoute = (tour, at, from, to, path, kinds) => addEntry(tour, at, "route", { from, to, path: path.slice(), hopKinds: (kinds || []).slice() });
export const addRecord = (tour, at, record) => addEntry(tour, at, "record", { record });
export const addNote = (tour, at, text) => addEntry(tour, at, "note", { text });

/** Structural validation of an imported file. Returns { ok, problems }. A stranger's file is untrusted input. */
export function validate(tour) {
    const p = [];
    if (!tour || typeof tour !== "object") return { ok: false, problems: ["not an object"] };
    if (tour.format !== FORMAT) p.push(`format is ${JSON.stringify(tour.format)}, expected ${JSON.stringify(FORMAT)}`);
    if (!Array.isArray(tour.entries)) p.push("entries is not an array");
    else tour.entries.forEach((e, i) => {
        if (!e || typeof e !== "object") { p.push(`entry ${i} is not an object`); return; }
        if (!ENTRY_KINDS.includes(e.kind)) p.push(`entry ${i} has kind ${JSON.stringify(e.kind)}`);
        if (typeof e.at !== "string" || !e.at) p.push(`entry ${i} has no \`at\``);
        if (e.kind === "route" && !Array.isArray(e.path)) p.push(`entry ${i} is a route with no path`);
        if (e.kind === "record" && e.record && typeof e.record === "object") {
            for (const bad of ["at", "time", "timestamp", "when", "ranAt"]) {
                if (Object.prototype.hasOwnProperty.call(e.record, bad)) p.push(`entry ${i}'s record carries \`${bad}\` -- a record must stay timeless`);
            }
        }
    });
    if (!tour.galaxy || !tour.galaxy.fingerprint) p.push("no galaxy fingerprint -- there is no way to say which map this was recorded against");
    return { ok: p.length === 0, problems: p };
}

/**
 * Replay a tour against a CURRENT galaxy and say, per route, whether it still means what it said.
 *
 * `neighbours` is a name -> Set(name) map for the galaxy as it is NOW, and `shortest(a, b)` returns the current
 * fewest-jump count or null. Both are INJECTED rather than computed here: the page has cosmicMap's proven BFS
 * and the gate has the same one, and a third implementation living in this file would be the second declaration
 * this project names more often than any other defect.
 */
export function replay(tour, neighbours, shortest) {
    const out = [];
    for (const [i, e] of (tour.entries || []).entries()) {
        if (e.kind !== "route") { out.push({ i, kind: e.kind, state: null }); continue; }
        const path = e.path || [];
        let broken = null;
        for (let h = 0; h + 1 < path.length; h++) {
            const a = path[h], b = path[h + 1];
            const n = neighbours.get ? neighbours.get(a) : neighbours[a];
            if (!n || !(n.has ? n.has(b) : n.includes(b))) { broken = [a, b]; break; }
        }
        if (broken) { out.push({ i, kind: "route", state: "broken", from: e.from, to: e.to, wasJumps: path.length - 1, brokenAt: broken }); continue; }
        const now = shortest(e.from, e.to);
        const was = path.length - 1;
        // INTACT means the recorded route is STILL a shortest one. LONGER means it still walks and the claim
        // attached to it has expired -- the state a two-way valid/invalid reader would report as intact.
        out.push({ i, kind: "route", state: (now !== null && now < was) ? "longer" : "intact", from: e.from, to: e.to, wasJumps: was, nowJumps: now });
    }
    return out;
}

/** A one-line summary a page can print without recomputing anything. */
export function summarise(tour, replayed, currentFingerprint) {
    const byState = {};
    for (const s of REPLAY_STATES) byState[s] = replayed.filter((r) => r.state === s).length;
    const byKind = {};
    for (const k of ENTRY_KINDS) byKind[k] = (tour.entries || []).filter((e) => e.kind === k).length;
    return {
        entries: (tour.entries || []).length,
        byKind,
        byState,
        recordedAgainst: tour.galaxy ? tour.galaxy.fingerprint : null,
        currentFingerprint: currentFingerprint || null,
        sameGalaxy: !!(tour.galaxy && currentFingerprint && tour.galaxy.fingerprint === currentFingerprint),
        span: (tour.entries || []).length ? { first: tour.entries[0].at, last: tour.entries[tour.entries.length - 1].at } : null,
    };
}
