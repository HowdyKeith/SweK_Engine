#!/usr/bin/env python3
"""diff_fields.py — diff several resource samples to locate fields by offset.

Give it 2+ binary samples of the same resource type. For each offset it prints the
value in every sample and flags whether they DIFFER (a per-record field) or are
CONSTANT (template / tag / sentinel). This is how you find which offset holds which
field without guessing.

    python diff_fields.py a.bin b.bin c.bin [--width 2] [--to 0x60]
                          [--little] [--find 45000] [--strings]

Options:
  --width N   field width in bytes to scan as integers (2 = int16 default, 4 = int32)
  --to OFF    scan offsets 0..OFF (default 0x60); accepts hex (0x..) or decimal
  --little    little-endian (default is big-endian, correct for classic Mac)
  --find V    report every offset whose value equals V in ANY sample (pin a field
              against a known in-game value)
  --strings   also list ASCII strings (offset + text) found in each sample
"""
import argparse, struct, sys, re


def load(path):
    with open(path, "rb") as fh:
        return fh.read()


def rd(b, off, width, little):
    if off + width > len(b):
        return None
    fmt = ("<" if little else ">") + {2: "h", 4: "i"}[width]
    return struct.unpack(fmt, b[off:off + width])[0]


def strings(b, minlen=3):
    out, cur, start = [], "", 0
    for i, ch in enumerate(b):
        if 32 <= ch < 127:
            if not cur:
                start = i
            cur += chr(ch)
        else:
            if len(cur) >= minlen:
                out.append((start, cur))
            cur = ""
    if len(cur) >= minlen:
        out.append((start, cur))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("samples", nargs="+", help="2+ .bin samples of the same resource type")
    ap.add_argument("--width", type=int, default=2, choices=[2, 4])
    ap.add_argument("--to", default="0x60")
    ap.add_argument("--little", action="store_true")
    ap.add_argument("--find", type=int)
    ap.add_argument("--strings", action="store_true")
    a = ap.parse_args()

    to = int(a.to, 16) if a.to.startswith("0x") else int(a.to)
    data = [load(p) for p in a.samples]
    names = [p.split("/")[-1] for p in a.samples]

    if a.find is not None:
        print(f"=== offsets whose {a.width*8}-bit value == {a.find} ===")
        for off in range(0, min(len(min(data, key=len)), to), 1):
            hits = [rd(b, off, a.width, a.little) == a.find for b in data]
            if any(hits):
                vals = [rd(b, off, a.width, a.little) for b in data]
                print(f"  @{off:4d} (0x{off:03x}): {vals}   <-- in {sum(hits)}/{len(data)} samples")
        return

    print(f"=== field diff (0..0x{to:x}, {a.width*8}-bit, {'LE' if a.little else 'BE'}) ===")
    print("off      " + "  ".join(f"{n[:10]:>10}" for n in names))
    for off in range(0, to, a.width):
        vals = [rd(b, off, a.width, a.little) for b in data]
        if any(v is None for v in vals):
            break
        tag = ""
        if len(set(vals)) > 1:
            tag = "  <-- DIFFERS"
        elif vals[0] in (-1, 0):
            tag = "  (sentinel/zero)" if vals[0] == -1 else ""
        elif vals[0] not in (0,):
            tag = f"  (const {vals[0]})"
        line = f"@{off:3d} 0x{off:03x}  " + "  ".join(f"{v:>10}" for v in vals) + tag
        print(line)

    if a.strings:
        print()
        for n, b in zip(names, data):
            print(f"=== strings in {n} ===")
            for off, s in strings(b)[:20]:
                print(f"  @0x{off:03x}: {s!r}")


if __name__ == "__main__":
    main()
