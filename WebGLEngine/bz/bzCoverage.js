// WebGLEngine/bz/bzCoverage.js — what the .bzw adapter consumes, and what it does not.
//
// The Endless Sky adapter learned this the expensive way: a coverage report that is wrong in your favour
// is worse than no coverage report. Its table drifted in BOTH directions at once -- it claimed keys the
// code never read, and reported as ignored three condition gates that were fully implemented -- and its
// selfcheck could not see either, because it only checked the ROOT types.
//
// So this file starts where that one ended. The guard in bz/tools/bzw-coverage.mjs --selfcheck checks the
// tables against the adapter source in both directions:
//   * a keyword declared here that the source never quotes is OVER-CLAIMING.
//   * a keyword reported as ignored that the source plainly reads is UNDER-CLAIMING.
// It scans the raw source, comments included, which means a coincidence of vocabulary will fire it. That
// is a feature. Move the word, not the guard.

"use strict";

// Object keywords the adapter turns into something. Value is where, for a human reading the report.
const HANDLED = new Map([
    ["world", "bzwWorld.js — size (doubled), name, flagHeight, noWalls"],
    ["box", "bzwWorld.js — position, size, rotation, obstacle flags"],
    ["pyramid", "bzwWorld.js — ...and flipz"],
    ["base", "bzwWorld.js — team colour, oncap"],
    ["teleporter", "bzwWorld.js — border, horizontal"],
    ["link", "bzwWorld.js — from, to"],
    ["zone", "bzwWorld.js — flag, team, safety, zoneflag"],
    ["waterlevel", "bzwWorld.js — height"],
    ["options", "bzwWorld.js — kept raw, for the server"],
    ["group", "bzwWorld.js — instantiates a define, with its transform stack"],
    // v2183 -- the mesh family. The procedural three (arc, cone, sphere) are generators into this same
    // pipeline, and are still ignored.
    ["mesh", "bzMesh.js — vertices, faces, check points; collides by face and by midpoint"],
    ["tetra", "bzMesh.js — four vertices, four faces, a centroid check point"],
    ["meshbox", "bzMesh.js — a box built as a mesh, and it collides like one"],
    ["meshpyr", "bzMesh.js — a pyramid built as a mesh"],
    // v2187 -- the round ones. Upstream they are not obstacles either: ArcObstacle, ConeObstacle and
    // SphereObstacle each build a MeshObstacle and hand it over.
    ["arc", "bzShapes.js — a ring segment, or a pie; `ratio` is not an inner radius"],
    ["cone", "bzShapes.js — an elliptical cone, swept"],
    ["sphere", "bzShapes.js — an octahedron, subdivided; 8*divisions^2 faces"],
    ["material", "bzMaterial.js — diffuse colour, and `matref` inheritance"],
    ["transform", "bzMaterial.js / bzwWorld.js — a named transform stack, for `xform`"],
]);

// v2187 -- A THIRD CATEGORY, and the reason this file exists.
//
// `textureMatrix`, `dynamicColor`, `physics` and `weapon` are PARSED and kept, by name, so a caller can see
// what a map wanted. Nothing animates and nothing shoots. Calling them HANDLED would be the report lying in
// the direction that flatters us; calling them IGNORED would be lying in the other. They are RECORDED, and
// the word appears in the report, in the README, and here.
const RECORDED = new Map([
    ["texturematrix", "bzMaterial.js — parsed by name; nothing animates"],
    ["dynamiccolor", "bzMaterial.js — parsed by name; nothing animates"],
    ["physics", "bzMaterial.js — parsed by name; no surface imparts velocity"],
    ["weapon", "bzMaterial.js — parsed; no turret fires"],
]);

// Parameter keys, per object kind, that the adapter reads. Anything else inside a block is ignored.
const PARAM_KEYS = new Map([
    ["*", new Set(["name", "pos", "position", "size", "rot", "rotation",
        "shift", "scale", "shear", "spin", "xform", "matref",
        "drivethrough", "shootthrough", "passable", "ricochet"])],
    ["world", new Set(["name", "size", "flagheight", "nowalls", "freectfspawns"])],
    ["pyramid", new Set(["flipz"])],
    ["base", new Set(["color", "oncap"])],
    ["teleporter", new Set(["border", "horizontal"])],
    ["link", new Set(["name", "from", "to"])],
    ["zone", new Set(["flag", "team", "safety", "zoneflag"])],
    ["waterlevel", new Set(["height"])],
    // A mesh's own lines. `face`/`endface` bracket a face; the rest belong to it.
    ["mesh", new Set(["vertex", "normal", "texcoord", "inside", "outside",
        "face", "endface", "vertices", "normals", "texcoords", "matref", "xform"])],
    ["tetra", new Set(["vertex", "normals", "texcoords"])],
    ["meshpyr", new Set(["flipz"])],
    // v2187 -- the round ones. `texsize`, `phydrv`, `smoothbounce` and `flatshading` are NOT here, because
    // they are not read: no textures, no physics drivers, no smooth normals. They are reported as ignored
    // parameters of a handled type, which is the truth.
    ["arc", new Set(["divisions", "angle", "ratio", "flipz", "matref"])],
    ["cone", new Set(["divisions", "angle", "flipz", "matref"])],
    ["sphere", new Set(["divisions", "radius", "hemi", "hemisphere", "matref"])],
]);

const BLOCK_READ_WHOLE = new Set(["material", "transform", "texturematrix", "dynamiccolor", "physics", "weapon"]);

function knownParam(kind, key) {
    // `options` is kept verbatim for the server. Every line of it is consumed, by definition -- reporting
    // `-srvmsg` as an ignored parameter would be the report lying in the unhelpful direction.
    if (kind === "options") return true;
    // The named blocks are read whole -- a material's every line becomes a field, and a physics driver's
    // every line is kept raw -- so there is no such thing as an ignored parameter inside one.
    if (BLOCK_READ_WHOLE.has(kind)) return true;
    if (kind === "link" || kind === "world" || kind === "waterlevel") {
        const own = PARAM_KEYS.get(kind);
        return !!(own && own.has(key));
    }
    const shared = PARAM_KEYS.get("*");
    const own = PARAM_KEYS.get(kind);
    return !!((shared && shared.has(key)) || (own && own.has(key)));
}

// `parsed` is the output of bzwParse.parseBZW.
function coverageReport(parsed) {
    const handled = [], recorded = [], unknown = [], paramUnknown = [];
    const walk = (blocks) => {
        for (const b of blocks) {
            const known = HANDLED.has(b.kind) || RECORDED.has(b.kind);
            if (known) {
                (RECORDED.has(b.kind) ? recorded : handled).push(b.kind);
                for (const l of b.lines) if (!knownParam(b.kind, l.key)) paramUnknown.push(b.kind + " / " + l.key);
            } else unknown.push(b.kind);
        }
    };
    walk(parsed.blocks);
    for (const name in parsed.defines) walk(parsed.defines[name].blocks);

    const total = handled.length + recorded.length + unknown.length;
    return {
        total, handledTotal: handled.length, recordedTotal: recorded.length, unknownTotal: unknown.length,
        // The percentage counts what is READ, and `recorded` is read. What it does NOT do is claim that a
        // physics driver moves anything, which is why the report prints the two numbers apart.
        pctHandled: total ? (100 * (handled.length + recorded.length)) / total : 100,
        pctSimulated: total ? (100 * handled.length) / total : 100,
        handled: tally(handled), recorded: tally(recorded), unknown: tally(unknown), paramUnknown: tally(paramUnknown),
        errors: parsed.errors.length, includes: parsed.includes.length,
    };
}

function tally(list) {
    const m = new Map();
    for (const k of list) m.set(k, (m.get(k) || 0) + 1);
    return [...m.entries()].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

function formatCoverage(rep) {
    const L = [];
    L.push(`objects: ${rep.handledTotal + rep.recordedTotal}/${rep.total} read (${rep.pctHandled.toFixed(1)}%)`
        + (rep.recordedTotal ? `, of which ${rep.recordedTotal} recorded and not simulated` : ""));
    if (rep.recorded.length) { L.push("recorded, not simulated:"); for (const u of rep.recorded) L.push(`  ${u.type.padEnd(16)}${u.count}`); }
    if (rep.unknown.length) { L.push("ignored object types:"); for (const u of rep.unknown) L.push(`  ${u.type.padEnd(16)}${u.count}`); }
    if (rep.paramUnknown.length) { L.push("ignored parameters:"); for (const u of rep.paramUnknown) L.push(`  ${u.type.padEnd(26)}${u.count}`); }
    if (rep.errors) L.push(`parse warnings: ${rep.errors}`);
    if (rep.includes) L.push(`include directives, recorded and not followed: ${rep.includes}`);
    return L.join("\n");
}

export { HANDLED, RECORDED, PARAM_KEYS, knownParam, coverageReport, formatCoverage };
if (typeof module !== "undefined" && module.exports)
    module.exports = { HANDLED, RECORDED, PARAM_KEYS, knownParam, coverageReport, formatCoverage };
