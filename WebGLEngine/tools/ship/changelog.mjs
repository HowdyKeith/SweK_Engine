#!/usr/bin/env node
// tools/ship/changelog.mjs — atomically prepend an ASCII-ONLY entry to BACKLOG.md + TODO.md.
//
// WHY THIS EXISTS: a non-ASCII char (an emoji) once slipped into a changelog write, crashed the write
// mid-stream, and BLANKED BACKLOG.md to 0 bytes (recovered by hand from an older copy). This script makes
// that class of failure impossible: it (1) rejects any non-ASCII BEFORE writing, (2) backs up each file
// first, (3) writes, (4) verifies the file GREW (never shrank/truncated), and (5) restores from the backup
// on ANY error. A failed changelog can no longer destroy the file it was appending to.
//
// USAGE (entries passed as file paths so multi-line text with any punctuation is safe):
//   node tools/ship/changelog.mjs --backlog /tmp/backlog-entry.md --todo /tmp/todo-line.md
//   node tools/ship/changelog.mjs --backlog /tmp/b.md            # TODO optional
// Run from the WebGLEngine root (where BACKLOG.md / TODO.md live). Exits non-zero on failure.
import fs from "node:fs";
import path from "node:path";

// BACKLOG.md / TODO.md live at the PROJECT ROOT (EngineProject_vNNNN/), which is the parent of WebGLEngine.
// Resolve them by walking up from cwd until we find one (works whether invoked from WebGLEngine or root).
function findAtRoot(name) {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return name; // fall back to cwd-relative (will error clearly if missing)
}

function arg(name) { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : null; }

// Find the first non-ASCII char and report it clearly (helps fix the source, not just fail).
function firstNonAscii(s) {
  for (let i = 0; i < s.length; i++) {
    const code = s.codePointAt(i);
    if (code > 0x7f) {
      const around = s.slice(Math.max(0, i - 25), i + 25).replace(/\n/g, " ");
      return { code, char: String.fromCodePoint(code), index: i, context: around };
    }
    if (code > 0xffff) i++; // surrogate pair
  }
  return null;
}

function prependAtomic(file, entry) {
  if (!fs.existsSync(file)) { console.error(`[changelog] ${file} not found — refusing to create it blank`); process.exit(3); }
  const bad = firstNonAscii(entry);
  if (bad) {
    console.error(`[changelog] ABORT: non-ASCII char U+${bad.code.toString(16).toUpperCase()} ("${bad.char}") at index ${bad.index} in the entry for ${path.basename(file)}.`);
    console.error(`[changelog]   ...${bad.context}...`);
    console.error(`[changelog]   ASCII-only rule: replace emoji/smart-quotes/dashes with plain ASCII and retry. Nothing was written.`);
    process.exit(4);
  }
  const old = fs.readFileSync(file, "utf8");
  const bak = file + ".bak";
  fs.writeFileSync(bak, old);                       // backup BEFORE touching the original
  const next = entry.endsWith("\n") ? entry : entry + "\n";
  try {
    fs.writeFileSync(file, next + old);
    const after = fs.readFileSync(file, "utf8");
    if (after.length < old.length) throw new Error(`file shrank (${after.length} < ${old.length}) — truncation guard tripped`);
    console.log(`[changelog] ${path.basename(file)} prepended: +${next.length} chars, now ${after.length} (backup at ${path.basename(bak)})`);
  } catch (e) {
    fs.writeFileSync(file, old);                    // restore from the in-memory original
    console.error(`[changelog] write failed for ${file}: ${e.message} — RESTORED original (${old.length} chars)`);
    process.exit(5);
  }
}

const backlogFile = arg("--backlog");
const todoFile = arg("--todo");
if (!backlogFile && !todoFile) { console.error("usage: changelog.mjs --backlog <file> [--todo <file>]"); process.exit(2); }

// v2528 -- VALIDATE BOTH BEFORE WRITING EITHER. prependAtomic is atomic per FILE; across the PAIR it was not.
// BACKLOG validated and was written, then TODO hit a non-ASCII character and aborted -- leaving the tree
// half-updated, and a retry would prepend BACKLOG twice. This happened for real (a U+2197 arrow in a TODO entry),
// and it was only survivable because someone knew to restore the .bak by hand.
//
// The header of this file has always claimed "atomically prepend ... to BACKLOG.md + TODO.md". Now it is true.
const _pending = [];
if (backlogFile) _pending.push([findAtRoot("BACKLOG.md"), fs.readFileSync(backlogFile, "utf8")]);
if (todoFile) _pending.push([findAtRoot("TODO.md"), fs.readFileSync(todoFile, "utf8")]);
for (const [file, entry] of _pending) {
  if (!fs.existsSync(file)) { console.error(`[changelog] ${file} not found -- refusing to create it blank. Nothing was written.`); process.exit(3); }
  const bad = firstNonAscii(entry);
  if (bad) {
    console.error(`[changelog] ABORT: non-ASCII char U+${bad.code.toString(16).toUpperCase()} ("${bad.char}") at index ${bad.index} in the entry for ${path.basename(file)}.`);
    console.error(`[changelog]   ...${bad.context}...`);
    console.error(`[changelog]   ASCII-only rule: replace emoji/smart-quotes/dashes with plain ASCII and retry. NOTHING was written -- not this file, and not the other one.`);
    process.exit(4);
  }
}
for (const [file, entry] of _pending) prependAtomic(file, entry);
console.log("[changelog] done.");
