#!/usr/bin/env python3
"""verify_zip.py — hard-fail gate for a versioned build zip.

Run this BEFORE presenting a release zip. It catches the three failure modes that
motivated the ship-ritual skill:

  1. Mislabeled build   -> --version must appear in a marker file inside the zip
  2. Nested fork        -> exactly one top-level project root; no nested project dirs
  3. (changelog is guarded separately by safe_prepend.py)

Plus sanity: the zip isn't suspiciously tiny/huge, and any required feature markers
are present.

    python verify_zip.py --zip build_vMMMM.zip --version vMMMM \
        [--version-file path/inside/zip=main.js] \
        [--marker "some required string"] ... \
        [--min-kb 5] [--max-mb 500] \
        [--project-prefix EngineProject_v]

Exit 0 = all green (safe to present). Exit 1 = STOP and fix.
"""
import argparse, sys, zipfile, re, os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--zip", required=True)
    ap.add_argument("--version", required=True, help="version string that must appear, e.g. v2144")
    ap.add_argument("--version-file", help="path inside the zip whose text must contain --version "
                                           "(default: search all text files)")
    ap.add_argument("--marker", action="append", default=[], help="a string that must appear somewhere in the zip (repeatable)")
    ap.add_argument("--min-kb", type=float, default=1.0)
    ap.add_argument("--max-mb", type=float, default=1000.0)
    ap.add_argument("--project-prefix", help="if the tree uses versioned project folders, their name prefix "
                                             "(e.g. 'EngineProject_v') — used to detect nested forks")
    a = ap.parse_args()

    fails = []
    if not os.path.exists(a.zip):
        print(f"FAIL: zip not found: {a.zip}"); sys.exit(1)

    size_mb = os.path.getsize(a.zip) / (1024 * 1024)
    if size_mb * 1024 < a.min_kb:
        fails.append(f"zip too small ({size_mb*1024:.1f} KB < {a.min_kb} KB) — likely empty/broken")
    if size_mb > a.max_mb:
        fails.append(f"zip too big ({size_mb:.1f} MB > {a.max_mb} MB) — nested fork or stray assets?")

    try:
        zf = zipfile.ZipFile(a.zip)
        names = zf.namelist()
    except Exception as e:
        print(f"FAIL: cannot open zip: {e}"); sys.exit(1)

    if not names:
        print("FAIL: zip is empty"); sys.exit(1)

    # exactly one top-level root
    roots = set(n.split("/")[0] for n in names if n.strip("/"))
    if len(roots) > 1:
        fails.append(f"multiple top-level roots in zip: {sorted(roots)} — expected exactly one")

    # nested fork detection: a versioned project folder appearing below the top level
    if a.project_prefix:
        rx = re.compile(re.escape(a.project_prefix) + r"\d")
        nested = [n for n in names if rx.search(n.split("/", 1)[-1] if "/" in n else "")]
        # count distinct versioned folder names anywhere
        folder_hits = set()
        for n in names:
            for part in n.split("/"):
                if rx.match(part):
                    folder_hits.add(part)
        if len(folder_hits) > 1:
            fails.append(f"nested project forks detected: {sorted(folder_hits)} — only one allowed")

    # version marker
    def read_text(name):
        try:
            return zf.read(name).decode("utf-8", "ignore")
        except Exception:
            return ""

    version_found = False
    if a.version_file:
        cand = [n for n in names if n.endswith(a.version_file)]
        if not cand:
            fails.append(f"version-file {a.version_file!r} not found in zip")
        else:
            version_found = any(a.version in read_text(n) for n in cand)
            if not version_found:
                fails.append(f"version {a.version!r} not found in {a.version_file!r} "
                             f"(mislabeled build?)")
    else:
        text_ext = (".js", ".mjs", ".ts", ".json", ".html", ".md", ".txt", ".py")
        for n in names:
            if n.endswith(text_ext) and a.version in read_text(n):
                version_found = True; break
        if not version_found:
            fails.append(f"version {a.version!r} not found in any text file (mislabeled build?)")

    # feature markers
    if a.marker:
        allblob = ""
        text_ext = (".js", ".mjs", ".ts", ".json", ".html", ".md", ".txt", ".py")
        blobs = [read_text(n) for n in names if n.endswith(text_ext)]
        allblob = "\n".join(blobs)
        for mk in a.marker:
            if mk not in allblob:
                fails.append(f"required marker not present: {mk!r}")

    if fails:
        print("SHIP GATE: FAIL")
        for f in fails:
            print("  - " + f)
        sys.exit(1)
    print(f"SHIP GATE: GREEN  ({a.zip}, {size_mb:.1f} MB, {len(names)} entries, version {a.version})")
    sys.exit(0)


if __name__ == "__main__":
    main()
