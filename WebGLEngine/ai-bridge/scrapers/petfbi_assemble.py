#!/usr/bin/env python3
"""
petfbi_assemble — turn a scraped PetFBI report into a ready-to-post Facebook
post. This is the engine port of Keith's R_clean327pms2.py core: getSubstring()
START/END field extraction + the Lost/Found x type templates, made data-driven.

Pipeline:  petfbi_grab.py (Camoufox/HTTP) --> this --> coordination board packet.
It consumes the grabbed body TEXT (newline-delimited, as PetFBI's /api/view page
renders it) plus the og: meta, and emits one JSON line with the assembled post,
the parsed fields, the og:image, and the map URL.

The field tags + templates default to PetFBI's current /api/view format (derived
from a live report). Override them with --config <json> or --fields-xls
<R_clean.xls> (reads the 'Key' + 'Templates' sheets via pandas, exactly like the
original tool) so Keith can keep tuning in Excel.

Contract: prints exactly one final line of JSON.
    {ok, status, type, name, town, state, zip, post, fields, imageUrl, mapUrl}

Usage:
    python petfbi_assemble.py --text-file report.txt --meta '{"og:image":"..."}'
    echo "<report text>" | python petfbi_assemble.py --stdin
    python petfbi_assemble.py --text-file r.txt --fields-xls /path/R_clean.xls
"""
import argparse, json, re, sys, os

# ---- Keith's extractor, verbatim semantics: text between START and END.
# (.*) does not cross newlines, so an empty END captures to end of line -- which
# is exactly how PetFBI's report renders each field ("Label: value\n").
def get_substring(left, right, ostring):
    if left and left not in ostring:
        return ""
    s = re.escape(left or "")
    e = re.escape(right or "")
    m = re.findall(s + "(.*)" + e, ostring)
    if not m:
        return ""
    res = m[0]
    while right and re.search(re.escape(right), res):
        res = re.findall("(.*)" + e, res)[0]
    return res.strip()

# ---- default config: PetFBI /api/view web format (derived from a live report) ----
DEFAULT_CONFIG = {
    # field -> [START, END]  (END "" = to end of line). Order matters only for prune.
    "fields": {
        "DATE":        ["Date Lost:", ""],
        "DATE_FOUND":  ["Date Found:", ""],
        "DESCRIPTION": ["Description:", ""],
        "CONTACT":     ["Contact:", ""],
        "EMAIL":       ["Email:", ""],
        "PHONE1":      ["Primary (visible):", ""],
        "PHONE2":      ["Secondary (visible):", ""],
        "PETIDNUM":    ["Pet FBI Report ID:", ""],
        "BREED":       ["Breed:", ""],
        "COLOR":       ["Color(s):", ""],
        "GENDER":      ["Gender:", ""],
        "HEIGHT":      ["Height:", ""],
        "WEIGHT":      ["Weight:", ""],
        "AGE":         ["Age:", ""],
        "COLLAR":      ["Collar:", ""],
        "LOCATION":    ["Location:", ""],
        "STATE":       ["State:", "Zip Code:"],
        "ZIP":         ["Zip Code:", ""],
        "COMMENT":     ["Comments:", ""],
    },
    # find/replace fix-ups applied to every extracted value (Keith's blank-row rules)
    "fixups": {"icro-chipped": "icrochipped", "erman Shepard": "erman Shepherd"},
    # status x type -> post body. [FIELD] placeholders filled from the parsed fields.
    "templates": {
        "Lost": {
            "Dog": ">>  [TOWN], [STATE] - Lost [COLOR] Dog\n\n[STREET]\n\nLost on [DATE]. [GENDER-HE/SHE] is [BREED], age [AGE]. Collar: [COLLAR].\n\n[DESCRIPTION]\n\nPlease share and contact [EMAIL] if you can help bring [GENDER-HER/HIS] home.\n\nPetFBI: https://petfbi.org/api/view/[PETIDNUM]",
            "Cat": ">>  [TOWN], [STATE] - Lost [COLOR] Cat\n\n[STREET]\n\nLost on [DATE]. [GENDER-HE/SHE] is [BREED], age [AGE]. Collar: [COLLAR].\n\n[DESCRIPTION]\n\nPlease share and contact [EMAIL] if you can help bring [GENDER-HER/HIS] home.\n\nPetFBI: https://petfbi.org/api/view/[PETIDNUM]",
        },
        "Found": {
            "Dog": "<<  [TOWN], [STATE] - Found [COLOR] Dog\n\n[STREET]\n\nFound on [DATE]. [GENDER-HE/SHE] is [BREED]. Collar: [COLLAR].\n\n[DESCRIPTION]\n\nPlease share and contact [EMAIL] if this is your dog.\n\nPetFBI: https://petfbi.org/api/view/[PETIDNUM]",
            "Cat": "<<  [TOWN], [STATE] - Found [COLOR] Cat\n\n[STREET]\n\nFound on [DATE]. Collar: [COLLAR].\n\n[DESCRIPTION]\n\nPlease share and contact [EMAIL] if this is your cat.\n\nPetFBI: https://petfbi.org/api/view/[PETIDNUM]",
        },
    },
}

def load_config(args):
    cfg = json.loads(json.dumps(DEFAULT_CONFIG))  # deep copy
    if args.config and os.path.exists(args.config):
        try:
            with open(args.config) as f:
                user = json.load(f)
            for k in ("fields", "fixups", "templates"):
                if k in user:
                    cfg[k] = user[k]
        except Exception as e:
            print("config load warn: " + str(e), file=sys.stderr)
    if args.fields_xls and os.path.exists(args.fields_xls):
        try:
            import pandas as pd  # optional; only if Keith points at his workbook
            key = pd.read_excel(args.fields_xls, sheet_name="Key", header=None, keep_default_na=False)
            fields, fixups = {}, {}
            for row in key.to_dict(orient="records"):
                name, start, end = str(row.get(0, "")), str(row.get(1, "")), str(row.get(2, ""))
                if name == "" and start:
                    fixups[start] = end
                elif name:
                    fields[name] = [start, end]
            if fields:
                cfg["fields"] = fields
            if fixups:
                cfg["fixups"] = fixups
        except Exception as e:
            print("xls load warn: " + str(e), file=sys.stderr)
        try:
            import pandas as pd
            tdf = pd.read_excel(args.fields_xls, sheet_name="Templates", header=0, keep_default_na=False)
            tpl = {}
            for row in tdf.to_dict(orient="records"):
                st = str(row.get("Status", "")).strip()
                ty = str(row.get("Type", "")).strip()
                body = str(row.get("Template", ""))
                if st and ty:
                    tpl.setdefault(st, {})[ty] = body
            if tpl:
                cfg["templates"] = tpl
        except Exception:
            pass  # no Templates sheet -> keep defaults / --config
    return cfg

def parse_title(text):
    """First 'Lost Dog: NAME' / 'Found Cat: NAME' line -> (status, type, name)."""
    m = re.search(r"\b(Lost|Found|Spotted|Deceased|Sighting)\s+(Dog|Cat|Bird|Rabbit|Horse|Other)\s*:\s*(.*)", text)
    if m:
        return m.group(1), m.group(2), m.group(3).strip()
    return "", "", ""

def parse_location(loc):
    """'Brett St, ..., Corpus Christi, Nueces County, TX 78411' -> street/town/state/zip."""
    parts = [p.strip() for p in loc.split(",") if p.strip()]
    street = parts[0] if parts else ""
    town = ""
    for i, p in enumerate(parts):
        if re.search(r"\bCounty\b", p) and i > 0:
            town = parts[i - 1]
            break
    if not town and len(parts) >= 3:
        town = parts[-3]
    return {"street": street, "town": town}

def assemble(text, meta, cfg):
    status, ptype, name = parse_title(text)
    fields = {"STATUS": status, "TYPE": ptype, "NAME": name}
    for fld, (start, end) in cfg["fields"].items():
        val = get_substring(start, end, text)
        for a, b in cfg.get("fixups", {}).items():
            val = val.replace(a, b)
        fields[fld] = val.strip()

    loc = parse_location(fields.get("LOCATION", ""))
    fields["STREET"] = loc["street"]
    fields["TOWN"] = loc["town"]
    if not fields.get("STATE"):
        fields["STATE"] = get_substring("in ", ",", text)  # header "...in TX, 78411"

    g = (fields.get("GENDER") or "").lower()
    heshe = "She" if g.startswith("f") else ("He" if g.startswith("m") else "They")
    herhis = "Her" if g.startswith("f") else ("His" if g.startswith("m") else "Their")

    tpl = (cfg["templates"].get(status, {}) or {}).get(ptype, "")
    post = tpl
    for fld, val in fields.items():
        post = post.replace("[" + fld + "]", val or "")
    post = post.replace("[GENDER-HE/SHE]", heshe).replace("[GENDER-HER/HIS]", herhis)
    post = re.sub(r"\[[A-Z0-9_/-]+\]", "", post)          # drop any unfilled placeholders
    post = re.sub(r"[ \t]+\n", "\n", post).strip()

    # map URL from the embedded Google maps link (q=lat,lng) if grab passed it through
    map_url = meta.get("mapUrl") or ""
    mm = re.search(r"q=([-\d.]+),([-\d.]+)", text)
    if not map_url and mm:
        map_url = "https://www.google.com/maps?q=%s,%s" % (mm.group(1), mm.group(2))

    return {
        "ok": bool(status and ptype),
        "status": status, "type": ptype, "name": name,
        "town": fields.get("TOWN", ""), "state": fields.get("STATE", ""), "zip": fields.get("ZIP", ""),
        "post": post, "fields": fields,
        "imageUrl": meta.get("og:image") or meta.get("ogImage") or "",
        "mapUrl": map_url,
    }

def groups_for_town(town, state, ptype, xls_path):
    """Read the '<STATE> Pages' sheet from R_clean.xls and return the FB groups to
    post into for this town: the statewide Default group, the species group
    (DOG/CAT) matching the pet, and any group whose Town matches. Source is the
    .xls (Keith's sheet); a SharePoint/OneDrive/Google-Sheets backend can later
    feed the same shape."""
    out = {"groups": [], "state": state, "town": town, "sheet": None, "note": ""}
    if not state:
        out["note"] = "no state parsed from report"
        return out
    try:
        import pandas as pd  # only needed when a groups source is configured
    except Exception:
        out["note"] = "pandas not available (pip install pandas xlrd)"
        return out
    sheet = state.strip().upper() + " Pages"
    out["sheet"] = sheet
    try:
        df = pd.read_excel(xls_path, sheet_name=sheet, keep_default_na=False)
    except Exception:
        out["note"] = "no stored groups for %s (sheet '%s' not found)" % (state, sheet)
        return out

    def col(row, *names):
        for n in names:
            if n in row and str(row[n]).strip():
                return str(row[n]).strip()
        return ""

    want_town = (town or "").strip().lower()
    want_species = (ptype or "").strip().upper()[:3]  # DOG / CAT
    seen = set()
    for row in df.to_dict(orient="records"):
        t = col(row, "Town")
        url = col(row, "fbURL")
        if not url or url in seen:
            continue
        page = col(row, "fbPage")
        pid = col(row, "fbPageID")
        biz = col(row, "BusinessID")
        tl = t.lower()
        kind = None
        if tl == "default":
            kind = "statewide"
        elif tl in ("dog", "cat"):
            if want_species and want_species.startswith(tl[:3].upper()[:3]) or tl.upper().startswith(want_species):
                kind = "species"
        else:
            parts = [p.strip().lower() for p in t.split(",") if p.strip()]
            if want_town and want_town in parts:
                kind = "town"
        if not kind:
            continue
        seen.add(url)
        if not page or "log into facebook" in page.lower():
            page = (t + ", " + state + " Lost & Found Pets").strip(", ")
        out["groups"].append({"name": page, "url": url, "pageId": pid, "businessId": biz, "town": t, "kind": kind})

    # statewide first, then town, then species
    order = {"statewide": 0, "town": 1, "species": 2}
    out["groups"].sort(key=lambda g: order.get(g["kind"], 9))
    if not out["groups"]:
        out["note"] = "no groups matched town '%s' in %s" % (town, sheet)
    return out

def build_routing(town, state, groups):
    n = len(groups)
    return {
        "town": town, "state": state, "count": n,
        "adminShare": ("Admin on the Page: post the report once, then use "
                       "\u201cShare to Groups\u201d \u2014 it goes to the %d group(s) the Page has joined in one step." % n),
        "editorSteps": ("Editor (not Admin): open each group link below while logged in AS the Page, "
                        "paste the post, and submit \u2014 one group at a time."),
        "links": [g["url"] for g in groups],
    }

# ---- v1021: admins-to-email + rules (the VBA-Transmitter alternative) ----
def _read_sheet(xls_path, name):
    import pandas as pd
    return pd.read_excel(xls_path, sheet_name=name, keep_default_na=False)

def admins_for_town(town, state, xls_path):
    """Read an 'Admins' sheet (Name|Email|State|Towns|Role) and return the admins
    to email for this town. State '*'/blank = all states; Towns '*'/'all'/'default'
    = the whole state; otherwise a comma list of towns. Same 'look in the .xls'
    pattern as the VBA Transmitter."""
    out = {"admins": [], "note": ""}
    try:
        df = _read_sheet(xls_path, "Admins")
    except Exception:
        out["note"] = "no Admins sheet in workbook"
        return out
    wt = (town or "").strip().lower()
    ws = (state or "").strip().lower()
    seen = set()
    for row in df.to_dict(orient="records"):
        def c(*names):
            for n in names:
                if n in row and str(row[n]).strip():
                    return str(row[n]).strip()
            return ""
        email = c("Email", "email")
        if not email or email.lower() in seen:
            continue
        st = c("State", "state").lower()
        if st and st not in ("*", "all") and ws and st != ws:
            continue
        towns = c("Towns", "towns", "Town").lower()
        tl = [p.strip() for p in towns.split(",") if p.strip()]
        covers = (not towns) or (towns in ("*", "all", "default")) or (wt and wt in tl)
        if not covers:
            continue
        seen.add(email.lower())
        out["admins"].append({
            "name": c("Name", "name") or email.split("@")[0],
            "email": email,
            "role": (c("Role", "role") or "Editor").title(),
            "scope": towns or "*",
        })
    if not out["admins"]:
        out["note"] = "no admins matched %s, %s in Admins sheet" % (town, state)
    return out

def apply_rules(ctx, xls_path):
    """Optional 'Rules' sheet (When|Match|Action|Value), applied in order.
    When in {state,town,pettype,status,any}; Action in {addadmin,suppress,note,
    skipgroup}. A pragmatic, extensible base for the Transmitter's rule set."""
    res = {"addAdmins": [], "suppress": False, "notes": [], "skipGroups": []}
    try:
        df = _read_sheet(xls_path, "Rules")
    except Exception:
        return res
    for row in df.to_dict(orient="records"):
        def c(*names):
            for n in names:
                if n in row and str(row[n]).strip():
                    return str(row[n]).strip()
            return ""
        when = c("When", "when").lower()
        match = c("Match", "match")
        action = c("Action", "action").lower()
        value = c("Value", "value")
        field = {"state": ctx.get("state"), "town": ctx.get("town"),
                 "pettype": ctx.get("type"), "status": ctx.get("status")}.get(when, "")
        ok = (when == "any") or (match == "*") or (str(field or "").strip().lower() == match.strip().lower())
        if not ok:
            continue
        if action == "addadmin" and value:
            res["addAdmins"].append({"name": value.split("@")[0], "email": value, "role": "Admin", "scope": "rule"})
        elif action == "suppress":
            res["suppress"] = True
        elif action == "note" and value:
            res["notes"].append(value)
        elif action == "skipgroup" and value:
            res["skipGroups"].append(value.lower())
    return res

def compose_email(packet, admins, extra_notes=None):
    f = packet.get("fields", {}) or {}
    town, state = packet.get("town", ""), packet.get("state", "")
    subject = "[PetFBI] %s %s - %s \u2014 %s, %s" % (
        packet.get("status", ""), packet.get("type", ""), packet.get("name", ""), town, state)
    groups = packet.get("groups", []) or []
    rt = packet.get("routing", {}) or {}
    lines = [packet.get("post", ""), ""]
    if groups:
        lines.append("\u2014 Groups for %s, %s (%d) \u2014" % (town, state, len(groups)))
        for g in groups:
            lines.append("  [%s] %s  %s" % (g.get("kind", ""), g.get("name", ""), g.get("url", "")))
        lines += ["", "Admin: " + rt.get("adminShare", ""), "Editor: " + rt.get("editorSteps", "")]
    link = packet.get("url") or (("https://petfbi.org/api/view/" + f.get("PETIDNUM", "")) if f.get("PETIDNUM") else "")
    if link:
        lines += ["", "Report: " + link]
    if packet.get("imageUrl"):
        lines.append("Photo: " + packet["imageUrl"])
    if packet.get("mapUrl"):
        lines.append("Map: " + packet["mapUrl"])
    for n in (extra_notes or []):
        lines.append("\u2022 " + n)
    return {"to": [a["email"] for a in admins], "subject": subject, "body": "\n".join(lines).strip()}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text-file")
    ap.add_argument("--stdin", action="store_true")
    ap.add_argument("--meta", default="{}", help="JSON of og: meta (og:image, mapUrl)")
    ap.add_argument("--config", help="JSON config override (fields/fixups/templates)")
    ap.add_argument("--fields-xls", help="read Key+Templates from an R_clean.xls (pandas)")
    ap.add_argument("--groups-xls", help="read '<STATE> Pages' groups (+ Admins/Rules) from an R_clean.xls (pandas)")
    ap.add_argument("--admins-xls", help="read Admins/Rules from a separate workbook (default: --groups-xls)")
    ap.add_argument("--list-admins", action="store_true", help="dump all rows of the Admins sheet as JSON and exit")
    a = ap.parse_args()

    if a.list_admins:
        xls = a.admins_xls or a.groups_xls
        if not xls:
            print(json.dumps({"ok": False, "error": "no admins workbook (--admins-xls/--groups-xls)"})); return
        try:
            df = _read_sheet(xls, "Admins"); admins = []
            for row in df.to_dict(orient="records"):
                def c(*names):
                    for n in names:
                        if n in row and str(row[n]).strip():
                            return str(row[n]).strip()
                    return ""
                email = c("Email", "email")
                if not email:
                    continue
                admins.append({"name": c("Name", "name") or email.split("@")[0], "email": email,
                               "state": c("State", "state"), "towns": c("Towns", "towns", "Town"),
                               "role": (c("Role", "role") or "Editor").title()})
            print(json.dumps({"ok": True, "admins": admins}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": str(e)}))
        return

    if a.text_file:
        with open(a.text_file, encoding="utf-8") as f:
            text = f.read()
    elif a.stdin:
        text = sys.stdin.read()
    else:
        print(json.dumps({"ok": False, "error": "no input (--text-file or --stdin)"})); return

    try:
        meta = json.loads(a.meta or "{}")
    except Exception:
        meta = {}
    cfg = load_config(a)
    try:
        result = assemble(text, meta, cfg)
        if a.groups_xls and result.get("ok"):
            g = groups_for_town(result.get("town"), result.get("state"), result.get("type"), a.groups_xls)
            admins_xls = a.admins_xls or a.groups_xls
            ad = admins_for_town(result.get("town"), result.get("state"), admins_xls)
            rules = apply_rules(result, admins_xls)
            if rules["skipGroups"]:
                g["groups"] = [x for x in g["groups"] if not any(s in (x.get("name", "") + x.get("url", "")).lower() for s in rules["skipGroups"])]
            admins = ad["admins"] + rules["addAdmins"]
            result["groups"] = g["groups"]
            result["groupsNote"] = g["note"]
            result["routing"] = build_routing(result.get("town"), result.get("state"), g["groups"])
            result["admins"] = admins
            result["adminsNote"] = ad["note"]
            result["suppress"] = rules["suppress"]
            result["email"] = compose_email(result, admins, rules["notes"])
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))

if __name__ == "__main__":
    main()
