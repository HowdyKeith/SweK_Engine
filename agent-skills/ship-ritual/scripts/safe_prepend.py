#!/usr/bin/env python3
"""safe_prepend.py — atomically add a changelog entry, ASCII-guarded.

Prepends (or appends) an entry to a changelog/notes file safely, so a bad
character or a mid-write crash can never blank the file. This exists because an
emoji once crashed a naive writer mid-write and left the changelog empty.

    python safe_prepend.py --file NOTES.md --entry-file entry.txt [--append]
                           [--anchor "## unreleased"] [--allow-unicode]

Behavior:
  - Rejects non-ASCII by default (names the offending char + shows context), since
    changelogs shipped into ASCII-strict tooling break on emoji / smart quotes /
    en-em dashes. Pass --allow-unicode to permit them.
  - Backs the file up first, writes to a temp file, then atomically replaces the
    original. On ANY error the original is left untouched.
  - Verifies the file grew (guards against a silent truncation).
  - --anchor inserts the entry immediately AFTER the first line containing the
    anchor text (e.g. keep a "## unreleased" header on top); without --anchor the
    entry goes at the very top (prepend) or very bottom (--append).
"""
import argparse, os, sys, tempfile, shutil


def find_non_ascii(text):
    for i, ch in enumerate(text):
        if ord(ch) > 127:
            ctx = text[max(0, i - 20):i + 20].replace("\n", " ")
            return (ch, hex(ord(ch)), ctx)
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", required=True, help="changelog/notes file to modify")
    ap.add_argument("--entry-file", required=True, help="file holding the entry text")
    ap.add_argument("--append", action="store_true", help="add at end instead of top")
    ap.add_argument("--anchor", help="insert right after the first line containing this text")
    ap.add_argument("--allow-unicode", action="store_true", help="permit non-ASCII characters")
    a = ap.parse_args()

    if not os.path.exists(a.file):
        print(f"error: {a.file} does not exist", file=sys.stderr); sys.exit(1)
    with open(a.entry_file, "r", encoding="utf-8") as fh:
        entry = fh.read()
    if not entry.strip():
        print("error: entry is empty", file=sys.stderr); sys.exit(1)

    if not a.allow_unicode:
        bad = find_non_ascii(entry)
        if bad:
            ch, code, ctx = bad
            print(f"error: non-ASCII character {ch!r} ({code}) near: ...{ctx}...", file=sys.stderr)
            print("       use plain ASCII (- for dashes, -> for arrows, plain quotes), "
                  "or pass --allow-unicode", file=sys.stderr)
            sys.exit(1)

    with open(a.file, "r", encoding="utf-8") as fh:
        original = fh.read()
    orig_len = len(original)

    if not entry.endswith("\n"):
        entry += "\n"

    if a.anchor:
        lines = original.splitlines(keepends=True)
        out, inserted = [], False
        for ln in lines:
            out.append(ln)
            if not inserted and a.anchor in ln:
                out.append("\n" + entry)
                inserted = True
        if not inserted:
            print(f"error: anchor {a.anchor!r} not found in {a.file}", file=sys.stderr); sys.exit(1)
        new_text = "".join(out)
    elif a.append:
        sep = "" if original.endswith("\n") else "\n"
        new_text = original + sep + "\n" + entry
    else:
        new_text = entry + "\n" + original

    if len(new_text) <= orig_len:
        print("error: result is not larger than the original — aborting", file=sys.stderr); sys.exit(1)

    # backup, then atomic replace
    backup = a.file + ".bak"
    shutil.copy2(a.file, backup)
    try:
        d = os.path.dirname(os.path.abspath(a.file))
        fd, tmp = tempfile.mkstemp(dir=d, suffix=".tmp")
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            fh.write(new_text)
        os.replace(tmp, a.file)
    except Exception as e:
        shutil.copy2(backup, a.file)   # restore
        print(f"error: write failed, original restored: {e}", file=sys.stderr); sys.exit(1)

    print(f"ok: added {len(entry)} chars to {a.file} (backup at {backup})")


if __name__ == "__main__":
    main()
