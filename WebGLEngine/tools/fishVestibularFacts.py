#!/usr/bin/env python3
# WebGLEngine/tools/fishVestibularFacts.py -- UNNUMBERED, UNGATED (the fish vestibular helper branch)
#
# THE COUNTS BEHIND THE RUNG 4b PRE-REGISTRATION, RE-DERIVABLE BY ANYONE. It reads ONLY the files in vendor/zebrafish-vestibular/ (Liu et al. 2022, Nat Commun 13:5060, CC BY 4.0),
# with nothing but the standard library: an .xlsx is a zip of XML, and the Source Data is a zip holding another .xlsx, both opened in memory and never extracted.
#
#     python3 tools/fishVestibularFacts.py            # prints the facts the pre-registration quotes
#
# NOT A GATE. Nothing checks this file's output against the note; the note's numbers are the ones it printed on 2026-10-24, and a reader who runs it should get them back. A tool that
# holds the counts to the tables, and a gate that holds the files to their hashes, are the next step and belong to the chat that registers gates (brain/FISH_VESTIBULAR_HELPER_WIP.md).
#
# THE RULES THIS FILE FIXES (each one a decision, none tuned):
#   - an afferent is MYELINATED iff its name is Ear_AnteriorMacula_R_01 .. _16 (the Source Data flags exactly those sixteen "Y"; the other 90, including ear_anteriormacula_R_17, are "N");
#   - a central neuron's class is its name's prefix (Mauthner_R, vestibular_commissural_R, tangential_nucleus_R, SuperiorVN_R, VS_R);
#   - the ESCAPE pathway (E) is Mauthner + vestibular commissural; the BALANCE pathway (B) is tangential + superior vestibular nucleus + vestibulospinal -- the paper's own division
#     ("early-born pathways carrying phasic information preferentially excite fast escape circuits, whereas later-born pathways carrying tonic signals excite slower postural and oculomotor circuits");
#   - an edge is an (afferent, central neuron) pair with at least one synapse; its weight is the synapse count;
#   - tuning angles are the workbooks' own, in radians: 0 = maximally sensitive to rightward (ipsilateral) tilt, pi/2 = maximally sensitive to rostral tilt (the Source Data's own notes).
import collections
import html
import io
import math
import os
import re
import sys
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
V = os.path.join(HERE, "..", "vendor", "zebrafish-vestibular")
DATA2 = os.path.join(V, "41467_2022_32824_MOESM5_ESM.xlsx")
DATA1 = os.path.join(V, "41467_2022_32824_MOESM4_ESM.xlsx")
SOURCE = os.path.join(V, "41467_2022_32824_MOESM11_ESM.zip")


def read_xlsx(src):
    """{sheet name: [ {column letter: text} per row ]} from a path or bytes. Cells are the stored values; no formula is evaluated."""
    z = zipfile.ZipFile(io.BytesIO(src) if isinstance(src, bytes) else src)
    shared = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in re.findall(r"<si>(.*?)</si>", z.read("xl/sharedStrings.xml").decode("utf8"), re.S):
            shared.append(html.unescape("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S))))
    names = re.findall(r'<sheet [^>]*name="([^"]*)"', z.read("xl/workbook.xml").decode("utf8"))
    out = {}
    for i, name in enumerate(names, 1):
        xml = z.read("xl/worksheets/sheet%d.xml" % i).decode("utf8")
        rows = []
        for row in re.findall(r"<row [^>]*>(.*?)</row>", xml, re.S):
            cells = {}
            for m in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', row, re.S):
                col, attrs, body = m.group(1), m.group(2), m.group(3) or ""
                v = re.search(r"<v>(.*?)</v>", body, re.S) or re.search(r"<t[^>]*>(.*?)</t>", body, re.S)
                if v is None:
                    continue
                val = v.group(1)
                if 't="s"' in attrs:
                    val = shared[int(val)]
                cells[col] = html.unescape(val).strip()
            rows.append(cells)
        out[html.unescape(name)] = rows
    return out


def num(s):
    return int(s) if re.fullmatch(r"-?\d+", s or "") else None


CLASSES = (("VS_R", "VS"), ("SuperiorVN_R", "SVN"), ("tangential_nucleus_R", "tangential"),
           ("vestibular_commissural_R", "commissural"), ("Mauthner_R", "Mauthner"))


def cls(name):
    for prefix, c in CLASSES:
        if name.startswith(prefix):
            return c
    return None


def pathway(c):
    return "E" if c in ("Mauthner", "commissural") else "B"


def myelinated(name):
    return bool(re.fullmatch(r"Ear_AnteriorMacula_R_(0[1-9]|1[0-6])", name))


def main():
    # ---- layer 1: hair cells -> afferents
    d1 = read_xlsx(DATA1)["Matrix"]
    h1 = d1[0]
    a_cols = {k: v for k, v in h1.items() if re.match(r"(?i)\s*ear_anteriormacula", v)}
    hc = [r for r in d1[1:] if re.match(r"AM_haircell_R_\d+$", r.get("A", ""))]
    syn1 = sum(num(r.get(k)) or 0 for r in hc for k in a_cols)
    print("layer 1 (hair cell -> afferent): %d hair cells, %d afferents, %d synapses, %d pairs"
          % (len(hc), len(a_cols), syn1, sum(1 for r in hc for k in a_cols if (num(r.get(k)) or 0) > 0)))

    # ---- layer 2: afferents -> central neurons
    d2 = read_xlsx(DATA2)["Sheet1"]
    h2 = d2[0]
    t_cols = {k: v for k, v in h2.items() if cls(v)}
    tun_col = next(k for k, v in h2.items() if v == "Computed afferent tuning")
    rows = [r for r in d2[1:] if re.match(r"(?i)ear_anteriormacula", r.get("A", ""))]
    print("layer 2 (afferent -> central): %d afferents (%d myelinated), %d central neurons %s"
          % (len(rows), sum(1 for r in rows if myelinated(r["A"])), len(t_cols),
             dict(collections.Counter(cls(v) for v in t_cols.values()))))

    cell, reach = collections.Counter(), {}
    for r in rows:
        hit = set()
        for k, v in t_cols.items():
            w = num(r.get(k)) or 0
            if w > 0:
                cell[(myelinated(r["A"]), cls(v))] += w
                hit.add(pathway(cls(v)))
        reach[r["A"]] = hit
    print("\nsynapses from myelinated vs unmyelinated afferents, by target class (the paper's Fig. 6c claim, from the raw table):")
    for c in ("Mauthner", "commissural", "tangential", "SVN", "VS"):
        m, u = cell[(True, c)], cell[(False, c)]
        print("   %-12s myelinated %4d  unmyelinated %4d   myelinated share %5.1f%%" % (c, m, u, 100.0 * m / (m + u)))
    for p, members in (("E", ("Mauthner", "commissural")), ("B", ("tangential", "SVN", "VS"))):
        m = sum(cell[(True, c)] for c in members)
        u = sum(cell[(False, c)] for c in members)
        print("   pathway %s %-34s myelinated %4d  unmyelinated %4d   myelinated share %5.1f%%" % (p, members, m, u, 100.0 * m / (m + u)))

    live = [a for a, h in reach.items() if h]
    print("\nafferents reaching a central neuron: %d (E only %d, B only %d, both %d); myelinated %d, unmyelinated %d; unreached %d"
          % (len(live), sum(1 for a in live if reach[a] == {"E"}), sum(1 for a in live if reach[a] == {"B"}),
             sum(1 for a in live if reach[a] == {"E", "B"}), sum(1 for a in live if myelinated(a)),
             sum(1 for a in live if not myelinated(a)), len(rows) - len(live)))

    theta = {r["A"]: float(r[tun_col]) for r in rows if r.get(tun_col)}
    lt = [a for a in live if a in theta]
    print("tuning (0 = ipsilateral tilt, pi/2 = rostral tilt) known for %d of %d: rostral-leaning (sin>0) %d, caudal-leaning (sin<0) %d; ipsilateral-leaning %d, contralateral %d"
          % (len(lt), len(live), sum(1 for a in lt if math.sin(theta[a]) > 0), sum(1 for a in lt if math.sin(theta[a]) < 0),
             sum(1 for a in lt if math.cos(theta[a]) > 0), sum(1 for a in lt if math.cos(theta[a]) < 0)))

    print("\nedges by weight floor (afferent -> central neuron):")
    for floor in (1, 2, 3):
        e = [(r["A"], v, num(r.get(k))) for r in rows for k, v in t_cols.items() if (num(r.get(k)) or 0) >= floor]
        print("   floor >= %d: %d edges, %d synapses, %d afferents, %d central neurons" % (floor, len(e), sum(w for _, _, w in e), len({a for a, _, _ in e}), len({v for _, v, _ in e})))
    for p in ("E", "B"):
        e = [(r["A"], num(r.get(k))) for r in rows for k, v in t_cols.items() if (num(r.get(k)) or 0) >= 1 and pathway(cls(v)) == p]
        print("   floor >= 1, pathway %s: %d edges, %d synapses, %d central neurons" % (p, len(e), sum(w for _, w in e), sum(1 for v in t_cols.values() if pathway(cls(v)) == p)))

    # ---- the central neurons' own tuning, from the Source Data (opened in memory)
    sd = read_xlsx(zipfile.ZipFile(SOURCE).read("Source Data for figures.xlsx"))["Fig 3d, 4a,b,c"]
    ct = {r["B"]: float(r["C"]) for r in sd if r.get("B") and re.match(r"(Mauthner|vestibular_commiss|SuperiorVN|tangential|VS)", r["B"])
          and re.fullmatch(r"-?[\d.]+(E-?\d+)?", r.get("C", ""))}
    print("\ncentral neurons with a tuning angle in the Source Data: %d of %d" % (len(ct), len(t_cols)))
    groups = collections.defaultdict(list)
    for n, a in ct.items():
        groups[re.split(r"_R", n)[0]].append(a)
    for g, v in groups.items():
        print("   %-24s n=%2d  mean sin %+.2f (rostral +)  mean cos %+.2f (ipsilateral +)  rostral-leaning %d, caudal-leaning %d"
              % (g, len(v), sum(math.sin(a) for a in v) / len(v), sum(math.cos(a) for a in v) / len(v),
                 sum(1 for a in v if math.sin(a) > 0), sum(1 for a in v if math.sin(a) < 0)))


if __name__ == "__main__":
    sys.exit(main())
