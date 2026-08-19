// WebGLEngine/ev/esParse.js — clean-room reader for the Endless Sky "DataFile" text format.
// Endless Sky (GPLv3) stores its universe as indentation-nested node trees in plain UTF-8 .txt
// files: each line is a whitespace-separated token list; a line indented deeper than the line
// above is that line's child. Tokens may be bare, "double-quoted", or `back-quoted` (backticks
// let a value contain double quotes, used for prose). A line whose first non-space char is '#'
// is a comment. This mirrors Endless Sky's own DataFile/DataNode rules closely enough for the
// universe graph; it ships NO game content — you feed it files you fetched from the ES repo.
//
//   import { parseES, parseESFiles } from "./esParse.js";
//   const root = parseES(textOfOneFile);      // { children:[node,...] }
//   const root = parseESFiles([t1, t2, ...]); // merges many files under one root
//   node.tokens   // ["system", "1 Axis"]
//   node.key      // "system"           (tokens[0])
//   node.value    // "1 Axis"           (tokens[1], if present)
//   node.children // [node, ...]
//   node.get("pos")        -> child node whose key is "pos" (first match) or null
//   node.all("link")       -> [child, ...] every child with that key
//   node.num(1)            -> +tokens[1] (NaN-safe helper on a node)

"use strict";

function tokenizeLine(line) {
    const toks = [];
    let i = 0;
    const n = line.length;
    while (i < n) {
        const c = line[i];
        if (c === " " || c === "\t") { i++; continue; }
        if (c === '"' || c === "`") {
            const close = c;
            i++;
            let start = i;
            while (i < n && line[i] !== close) i++;
            toks.push(line.slice(start, i));
            i++; // skip closing quote (if missing, we just hit EOL)
            continue;
        }
        let start = i;
        while (i < n && line[i] !== " " && line[i] !== "\t") i++;
        toks.push(line.slice(start, i));
    }
    return toks;
}

// Leading-whitespace width. Endless Sky compares raw indentation prefixes; counting leading
// space/tab characters (tab == 1) reproduces the parent/child nesting for the canonical data,
// which is tab-indented and internally consistent per file.
function indentWidth(line) {
    let w = 0;
    while (w < line.length && (line[w] === " " || line[w] === "\t")) w++;
    return w;
}

function makeNode(tokens) {
    const node = {
        tokens,
        get key() { return tokens[0]; },
        get value() { return tokens.length > 1 ? tokens[1] : undefined; },
        children: [],
    };
    node.get = function (key) { for (const c of node.children) if (c.tokens[0] === key) return c; return null; };
    node.all = function (key) { const a = []; for (const c of node.children) if (c.tokens[0] === key) a.push(c); return a; };
    node.num = function (idx) { const v = parseFloat(tokens[idx]); return Number.isFinite(v) ? v : NaN; };
    return node;
}

function parseES(text) {
    const root = makeNode(["__root__"]);
    const lines = String(text).split(/\r\n|\r|\n/);
    // stack holds { width, node }; root sits at width -1 so any real line is its descendant.
    const stack = [{ width: -1, node: root }];
    for (let li = 0; li < lines.length; li++) {
        const raw = lines[li];
        const trimmed = raw.trim();
        if (trimmed === "" || trimmed[0] === "#") continue;   // blank or comment
        const width = indentWidth(raw);
        const tokens = tokenizeLine(raw);
        if (!tokens.length) continue;
        const node = makeNode(tokens);
        // pop until the top of stack is strictly less-indented than this line
        while (stack.length && stack[stack.length - 1].width >= width) stack.pop();
        const parent = stack.length ? stack[stack.length - 1].node : root;
        parent.children.push(node);
        stack.push({ width, node });
    }
    return root;
}

// Merge several files: children of each file's root are concatenated under one root, preserving
// order. Endless Sky's own loader is order-sensitive (later definitions can extend earlier ones
// via `add`), but for a static universe snapshot straight concatenation is the right first pass.
function parseESFiles(texts) {
    const root = makeNode(["__root__"]);
    for (const t of texts) { const r = parseES(t); for (const c of r.children) root.children.push(c); }
    return root;
}

if (typeof module !== "undefined" && module.exports) module.exports = { parseES, parseESFiles };
export { parseES, parseESFiles };
