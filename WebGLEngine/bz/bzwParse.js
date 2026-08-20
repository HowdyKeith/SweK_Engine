// WebGLEngine/bz/bzwParse.js — BZFlag's world file (.bzw) grammar.
//
// From endless-sky's data format I expected another indentation tree. It is not. A .bzw is strictly
// LINE-ORIENTED, and the rules are small and sharp (src/bzfs/BZWReader.cxx, 2.4 branch):
//
//   * The FIRST TOKEN of a line is the keyword. Everything after it on that line is its parameters, and
//     everything the keyword did not consume is DISCARDED -- readWorldStream ends every iteration with
//     "discard remainder of line".
//   * Keywords are CASE-INSENSITIVE (`strcasecmp` throughout). `Box`, `box` and `BOX` are one keyword.
//   * A `#` starts a comment ONLY when it is the first character of the first token on a line. Trailing
//     junk after a keyword's parameters is not a comment -- it is simply thrown away, which happens to
//     look the same. Nothing else in the file treats `#` specially.
//   * An object keyword opens a block; `end` closes it. Blocks do not nest.
//   * `define <name>` ... `enddef` names a group definition. Definitions cannot nest.
//   * `group <name>` instantiates one, and takes a block of its own (position, rotation, transforms).
//   * `world` may appear once. `options` collects raw lines for the server, not the world.
//   * `include <file>` exists and is undocumented upstream. We record it and do not follow it: a parser
//     that reads the filesystem is a parser that cannot be tested.
//
// The result is a flat list of blocks, each `{ kind, arg, lines, line }`, plus the group definitions. It
// is deliberately dumb: no defaults, no geometry, no meaning. bz/bzwWorld.js does that, and bz/bzCoverage.js
// checks that it says so honestly.

"use strict";

// Keywords that open an object block. From BZWReader::parseNormalObject, plus the ones the reader
// handles itself (`world`, `options`, `teleporter`, `group`).
const OBJECT_KEYWORDS = new Set([
    "box", "pyramid", "base", "link", "mesh", "arc", "meshbox", "cone", "meshpyr",
    "sphere", "tetra", "weapon", "zone", "waterlevel", "dynamiccolor", "texturematrix",
    "material", "physics", "transform",
    "teleporter", "group", "world", "options",
]);
// The ones that carry a name or reference on the opening line.
const TAKES_ARG = new Set(["teleporter", "group"]);

function stripLine(raw) {
    // Tabs and spaces only; a .bzw has no continuations.
    return raw.replace(/\r$/, "");
}

function firstToken(line) {
    const t = line.trim();
    if (!t) return "";
    const sp = t.search(/\s/);
    return sp < 0 ? t : t.slice(0, sp);
}

function restOfLine(line) {
    const t = line.trim();
    const sp = t.search(/\s/);
    return sp < 0 ? "" : t.slice(sp + 1).trim();
}

// Split parameters the way `istream >>` does: on any whitespace.
function words(s) { return s ? s.trim().split(/\s+/).filter(Boolean) : []; }

// Parse a .bzw source into blocks. Errors are collected, never thrown: BZFlag warns and skips, and a
// half-broken map should still show you the half that works.
function parseBZW(src) {
    const blocks = [], defines = {}, errors = [], includes = [];
    let current = null;          // the open object block
    let define = null;           // the open `define` group, if any
    let sawWorld = false;

    const lines = String(src).split("\n");
    for (let n = 0; n < lines.length; n++) {
        const raw = stripLine(lines[n]);
        const key = firstToken(raw);
        const lineNo = n + 1;

        if (!key) continue;                                   // blank
        if (key[0] === "#") continue;                         // a comment is the FIRST token, and only there

        const lower = key.toLowerCase();

        if (lower === "end") {
            if (!current) { errors.push({ line: lineNo, msg: 'unexpected "end"' }); continue; }
            (define ? define.blocks : blocks).push(current);
            current = null;
            continue;
        }

        if (lower === "enddef") {
            if (!define) { errors.push({ line: lineNo, msg: "enddef without define" }); continue; }
            if (current) { errors.push({ line: lineNo, msg: "enddef inside an unclosed object" }); current = null; }
            defines[define.name] = define;
            define = null;
            continue;
        }

        if (lower === "define") {
            const name = words(restOfLine(raw))[0];
            if (define) { errors.push({ line: lineNo, msg: "group definitions cannot nest" }); continue; }
            if (!name) { errors.push({ line: lineNo, msg: "missing group definition name" }); continue; }
            if (current) { errors.push({ line: lineNo, msg: "discarding incomplete object" }); current = null; }
            if (defines[name]) errors.push({ line: lineNo, msg: `duplicate group definition "${name}" - using newest` });
            define = { name, blocks: [], line: lineNo };
            continue;
        }

        if (lower === "include") {
            const file = words(restOfLine(raw))[0] || "";
            includes.push({ file, line: lineNo });
            continue;                                          // recorded, not followed
        }

        if (OBJECT_KEYWORDS.has(lower)) {
            // Starting an object while one is open discards the unfinished one, with a warning.
            if (current) { errors.push({ line: lineNo, msg: "discarding incomplete object" }); }
            if (lower === "world") {
                if (sawWorld) { errors.push({ line: lineNo, msg: 'multiple "world" sections found' }); }
                sawWorld = true;
            }
            const rest = restOfLine(raw);
            current = { kind: lower, arg: TAKES_ARG.has(lower) ? (words(rest)[0] || "") : null, lines: [], line: lineNo };
            continue;
        }

        if (!current) { errors.push({ line: lineNo, msg: `invalid object type "${key}" - skipping` }); continue; }

        // A parameter line inside the open object. The keyword is lowercased; the parameters are not,
        // because a name, a texture or a group reference is case-sensitive.
        current.lines.push({ key: lower, raw: key, params: words(restOfLine(raw)), line: lineNo });
    }

    if (current) errors.push({ line: lines.length, msg: 'missing "end" parameter' });
    if (define) errors.push({ line: lines.length, msg: 'missing "enddef" parameter' });

    return { blocks, defines, includes, errors };
}

// A block's parameter lines, by key. BZFlag lets a key repeat (a box may name several faces); callers
// that want one take the last, which is what `input >> x` does when the line is read again.
function paramsOf(block, key) { return block.lines.filter((l) => l.key === key); }
function lastParams(block, key) { const l = paramsOf(block, key); return l.length ? l[l.length - 1].params : null; }
function hasFlag(block, key) { return block.lines.some((l) => l.key === key); }

// Numbers, the way `istream >> float` reads them: anything unparseable ends the read.
function nums(params, count) {
    if (!params) return null;
    const out = [];
    for (let i = 0; i < count; i++) {
        const v = parseFloat(params[i]);
        if (!Number.isFinite(v)) return null;                  // ES-style: a short or bad line reads nothing
        out.push(v);
    }
    return out;
}

export { parseBZW, OBJECT_KEYWORDS, TAKES_ARG, paramsOf, lastParams, hasFlag, nums, words, firstToken, restOfLine };
if (typeof module !== "undefined" && module.exports)
    module.exports = { parseBZW, OBJECT_KEYWORDS, TAKES_ARG, paramsOf, lastParams, hasFlag, nums, words, firstToken, restOfLine };
