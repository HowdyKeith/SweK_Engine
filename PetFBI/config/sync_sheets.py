#!/usr/bin/env python3
"""
sync_sheets.py -- export the PetFBI config sheets from Keith's workbook into the
JSON snapshot the engine reads (PetFBI/config/petfbi-sheets.json).

Keith's workbook (R_clean.xls / .xlsb) is the MASTER. The engine reads a synced
COPY as JSON so a locked/open/moved workbook never breaks the board. Run this
whenever the templates, Key rules, HTMLKey grabs, or FB page lists change.

The philosophy (Keith's): when the online HTML or the templates change, adjust
the FILTER in the spreadsheet -- not code. This exporter carries every tunable
layer across: Key (report-text parse rules), HTMLKey (page-HTML grabs: GPS /
pet pic / flyer / reunited flag), Templates (post text by status x type with
gender placeholders), and the per-state FB page routing.

Usage:
    python sync_sheets.py --src /path/to/R_clean.xls --out ../config/petfbi-sheets.json
Requires: pandas + an xls/xlsb engine (xlrd for .xls, pyxlsb for .xlsb, openpyxl for .xlsx).
"""
import argparse, json, sys

def load(src):
    import pandas as pd
    snap = {"_source": src, "sheets": {}}

    # --- Key: report-text parse rules (target, left-delim, right-delim) ---
    # rows with a target extract that field; empty-target rows are cleanup
    # replacements applied to the extracted value.
    key = pd.read_excel(src, sheet_name="Key", header=None, keep_default_na=False)
    krules = []
    for _, row in key.iterrows():
        t, l, r = str(row[0]).strip(), str(row[1]), str(row[2])
        if t == "" and l == "" and r == "":
            continue
        krules.append({"target": t, "left": l, "right": r})
    snap["sheets"]["Key"] = krules

    # --- Templates: post body keyed by [status][type] ---
    tpl = pd.read_excel(src, sheet_name="Templates", keep_default_na=False)
    type_cols = [c for c in tpl.columns if c != "PetFBI" and not str(c).startswith("Unnamed")]
    templates = {}
    for _, row in tpl.iterrows():
        status = str(row.get("PetFBI", "")).strip()
        if not status:
            continue
        templates[status] = {c: str(row[c]) for c in type_cols if str(row[c]).strip()}
    snap["sheets"]["Templates"] = templates

    # --- {STATE} Pages: town -> FB page routing ---
    def pages(sheet):
        try:
            d = pd.read_excel(src, sheet_name=sheet, keep_default_na=False)
        except Exception:
            return []
        return [{
            "fbPage": str(r.get("fbPage", "")).strip(),
            "fbURL": str(r.get("fbURL", "")).strip(),
            "fbPageID": str(r.get("fbPageID", "")).strip(),
            "town": str(r.get("Town", "")).strip(),
            "businessID": str(r.get("BusinessID", "")).strip(),
        } for _, r in d.iterrows()]
    snap["sheets"]["Pages"] = {st: p for st in ["MA", "RI", "CT", "NH", "ME"]
                               for p in [pages(f"{st} Pages")] if p}

    # --- HTMLKey: page-HTML grabs (seeded from the newest VBA patterns) ---
    # If the workbook has an "HTMLKey" sheet, use it; else seed the defaults so
    # the block always exists and Keith can start tuning it in the workbook.
    try:
        hk = pd.read_excel(src, sheet_name="HTMLKey", header=None, keep_default_na=False)
        hrules = []
        for _, row in hk.iterrows():
            t = str(row[0]).strip()
            if not t:
                continue
            hrules.append({"target": t, "left": str(row[1]), "right": str(row[2]),
                           "source": (str(row[3]).strip() if hk.shape[1] > 3 else "petfbi") or "petfbi"})
        snap["sheets"]["HTMLKey"] = hrules
    except Exception:
        snap["sheets"]["HTMLKey"] = [
            {"target": "GEO_LONG",   "left": "geo_longitude\\:", "right": ",\\geo_latitude",   "source": "petfbi"},
            {"target": "GEO_LAT",    "left": "geo_latitude\\:",  "right": ",\\location_state", "source": "petfbi"},
            {"target": "PETPIC",     "left": 'g:image" content="', "right": '"',               "source": "petfbi"},
            {"target": "PETPIC_ALT", "left": '"picture_file":"', "right": '"',                 "source": "petfbi"},
            {"target": "REUNITED",   "left": "reunited with their family", "right": "",         "source": "petfbi"},
        ]

    snap["sheets"]["UrlTemplates"] = {
        "REPORT_PAGE": "https://petfbi.org/api/view/{ID}/{EMAILNAME}#/",
        "PETPIC_BASE": "https://images.petfbi.org/{file}",
        "FLYER_URL":   "https://petfbi.org/admin.html#/flyer/{ID}",
    }
    snap["sheets"]["Gender"] = {
        "Male":   {"[GENDER-HE/SHE]": "he",  "[GENDER-HER/HIS]": "his"},
        "Female": {"[GENDER-HE/SHE]": "she", "[GENDER-HER/HIS]": "her"},
    }
    return snap

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, help="path to R_clean.xls / .xlsb")
    ap.add_argument("--out", required=True, help="output JSON path")
    a = ap.parse_args()
    try:
        snap = load(a.src)
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(snap, f, indent=2, ensure_ascii=False)
    counts = {k: (len(v) if isinstance(v, (list, dict)) else 1) for k, v in snap["sheets"].items()}
    print(json.dumps({"ok": True, "out": a.out, "counts": counts}))

if __name__ == "__main__":
    main()
