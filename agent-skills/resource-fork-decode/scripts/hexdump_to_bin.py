#!/usr/bin/env python3
"""hexdump_to_bin.py — reconstruct raw bytes from a hex-dump text file.

Handles the common dump layout:
    000000  01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10  |................|
The 6+ digit offset column and the |ascii| gutter are ignored; only the hex pairs
in the middle are collected.

    python hexdump_to_bin.py dump.txt out.bin
    python hexdump_to_bin.py dump.txt          # writes dump.bin next to it
"""
import re, sys, os

ROW = re.compile(r'^[0-9a-fA-F]{6,8}[:\s]+((?:[0-9a-fA-F]{2}\s+){1,16})')


def convert(path):
    out = bytearray()
    with open(path, "r", encoding="utf-8", errors="ignore") as fh:
        for line in fh:
            m = ROW.match(line)
            if not m:
                continue
            for h in m.group(1).split():
                out.append(int(h, 16))
    return bytes(out)


def main():
    if len(sys.argv) < 2:
        print("usage: hexdump_to_bin.py dump.txt [out.bin]", file=sys.stderr); sys.exit(1)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + ".bin"
    data = convert(src)
    if not data:
        print("error: no hex rows matched — check the dump format", file=sys.stderr); sys.exit(1)
    with open(dst, "wb") as fh:
        fh.write(data)
    print(f"ok: {len(data)} bytes -> {dst}")


if __name__ == "__main__":
    main()
