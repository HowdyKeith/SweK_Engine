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
import { changelogPath, CHANGELOG_REL, ENTRY_HEAD } from "./changelogSource.mjs";

// v4003 -- THE PROJECT ROOT IS FOUND BY THE FILE THAT IS ACTUALLY THERE. The old walk looked for BACKLOG.md,
// which exists on no machine, so it fell through to its cwd-relative fallback every time -- a landmark search
// keyed on a missing landmark, which is the same defect verify.mjs had at v3964 and for the same reason.
// docs/CHANGELOG.md is TRACKED, so it is a landmark that survives a clone.
function findRoot() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, CHANGELOG_REL))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();   // errors clearly below rather than creating anything
}

// kept for the ASCII/atomic tests that still name it; no caller writes through it any more
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
  // *** v4003 -- "PREPEND" MEANT THE TOP OF THE FILE, AND docs/CHANGELOG.md HAS A HEADER. ***
  // BACKLOG.md began with its newest entry, so writing at offset 0 was right for it. This changelog opens with
  // `# SweK_Engine -- changelog` and four paragraphs explaining the split from README.md, and an entry written
  // above that would put one round's prose in front of the document's own title. The insertion point is the
  // FIRST ENTRY HEADING, so the header stays put and entries stay newest-first; a file with no heading yet
  // falls back to the top, which is the old behaviour and the right one for an empty record.
  const at = old.search(ENTRY_HEAD);
  const merged = at < 0 ? next + old : old.slice(0, at) + next + old.slice(at);
  try {
    fs.writeFileSync(file, merged);
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
// v4003 -- --backlog now means THE CHANGELOG, whose address lives in changelogSource.mjs. The flag keeps its
// name because it is what the ritual's error message tells people to type; renaming a flag to match a moved
// file would break the one instruction anybody has memorised.
if (backlogFile) _pending.push([changelogPath(findRoot()), fs.readFileSync(backlogFile, "utf8")]);
if (todoFile) { console.error("[changelog] --todo is RETIRED: TODO.md is on no machine and has no successor. Ignored."); }
// *** v4132 -- AN ENTRY WITH NO HEADING IS NOT AN ENTRY, AND FOR EIGHTEEN ROUNDS THIS DID NOT SAY SO. ***
// ENTRY_HEAD was used to find the INSERTION POINT and never to check the incoming text. So an entry that
// opened with prose was inserted happily -- above the newest heading, which meant every headless round landed
// BELOW the previous one and the run accumulated OLDEST-FIRST inside a newest-first file. The record was
// there; it was unattributable. namesVersion() answered false for v4114..v4131, newestVersion() kept saying
// v4113, and changelogCurrency-selfcheck was right every single time it went red.
//
// THE SHAPE OF THE FAILURE IS THE ARGUMENT FOR CHECKING IT HERE: the ritual is done from memory each round,
// the prose reads perfectly to a human, and nothing downstream re-reads what was written. A refusal at the
// write is the only place the mistake is cheap.
//
// --version is OPTIONAL but CROSS-CHECKED when given: a heading that names a different round is worse than
// no heading, because it files this round's work under someone else's version.
const wantVersion = arg("--version");
for (const [file, entry] of _pending) {
  if (!fs.existsSync(file)) { console.error(`[changelog] ${file} not found -- refusing to create it blank. Nothing was written.`); process.exit(3); }
  const head = /^## (?:Since )?v(\d+)\b.*$/m.exec(entry);
  if (!head) {
    console.error(`[changelog] ABORT: the entry for ${path.basename(file)} has NO heading. Nothing was written.`);
    console.error(`[changelog]   Entries must open with a line like:  ## Since v4132 -- what this round did`);
    console.error(`[changelog]   Without it the entry is inserted above the newest heading and belongs to no`);
    console.error(`[changelog]   version: namesVersion() cannot find it and newestVersion() skips past it.`);
    console.error(`[changelog]   This went unnoticed for v4114..v4131 -- eighteen rounds of unattributable prose.`);
    process.exit(6);
  }
  if (wantVersion && head[1] !== String(wantVersion).replace(/^v/, "")) {
    console.error(`[changelog] ABORT: heading names v${head[1]} but --version says ${wantVersion}. Nothing was written.`);
    console.error(`[changelog]   Filing a round under the wrong version is worse than filing it under none.`);
    process.exit(7);
  }
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
