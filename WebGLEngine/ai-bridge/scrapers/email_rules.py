#!/usr/bin/env python3
# email_rules.py - generic, Excel-driven email rule engine (v1122).
#
# Reads an "EmailRules" sheet from a workbook (.xls or .xlsx, via pandas), matches
# an incoming email (JSON on stdin) against each rule, fills the templated
# To/Subject/Body, and prints {ok, matched, actions:[...]} as one JSON line. This
# is the purpose-neutral generalization of the PetFBI routing - any email job.
#
# Sheet columns (case-insensitive, spaces/punct ignored in headers; all optional):
#   Enabled        TRUE/1/yes/x (blank = enabled)
#   Name           label for the rule
#   MatchFrom      substring (case-insensitive) or /regex/i, tested on sender
#   MatchSubject   "  on the subject
#   MatchBody      "  on the body
#   MatchTown      "  on email.town (if the caller supplied one)
#   MatchState     "  on email.state
#   MatchAny       "  on from+name+subject+body combined
#   Action         email (default) | note
#   To, Cc         recipient(s), comma/semicolon separated; may use {placeholders}
#   Subject        output subject template
#   Body           output body template
# A rule matches when every non-empty Match* constraint matches. Templates expand
# {from} {fromName} {subject} {body} {town} {state} {received} {date} and any other
# field present on the email.
#
#   echo '{"from":"x@y.com","subject":"Lost dog in Warwick","body":"..."}' | \
#     python email_rules.py --rules-xls Rules.xlsx --sheet EmailRules
#   python email_rules.py --rules-xls Rules.xlsx --list-rules

import argparse, json, sys, re, datetime


def _truthy(v):
    return str(v).strip().lower() in ("", "1", "true", "yes", "y", "x", "on")   # blank = enabled


def _read_rules(path, sheet):
    import pandas as pd  # same dependency the PetFBI assembler uses; handles .xls + .xlsx
    df = pd.read_excel(path, sheet_name=sheet, keep_default_na=False)
    norm = {c: re.sub(r"[^a-z0-9]", "", str(c).lower()) for c in df.columns}
    rules = []
    for _, row in df.iterrows():
        rules.append({norm[c]: str(row[c]).strip() for c in df.columns})
    return rules


def _match_one(term, value):
    term = (term or "").strip()
    if not term:
        return True
    v = value or ""
    m = re.match(r"^/(.*)/([a-z]*)$", term)
    if m:
        try:
            return re.search(m.group(1), v, re.I if "i" in m.group(2) else 0) is not None
        except re.error:
            return term.lower() in v.lower()
    return term.lower() in v.lower()


# v1140 — like _match_one, but also returns the regex capture groups so templates can
# reference {match1}, {match2}, ... from the matched text.
def _match_cap(term, value):
    term = (term or "").strip()
    if not term:
        return True, ()
    v = value or ""
    m = re.match(r"^/(.*)/([a-z]*)$", term)
    if m:
        try:
            mm = re.search(m.group(1), v, re.I if "i" in m.group(2) else 0)
            return (mm is not None), (mm.groups() if mm else ())
        except re.error:
            return (term.lower() in v.lower()), ()
    return (term.lower() in v.lower()), ()


def _parse_date(s):
    s = (s or "").strip()
    if not s:
        return None
    try:
        return datetime.date.fromisoformat(s[:10])
    except Exception:
        pass
    for fmt in ("%m/%d/%Y %I:%M:%S %p", "%m/%d/%Y %H:%M:%S", "%m/%d/%Y", "%Y-%m-%d %H:%M:%S", "%a, %d %b %Y %H:%M:%S"):
        try:
            return datetime.datetime.strptime(s, fmt).date()
        except Exception:
            continue
    return None


# v1140 — optional date-window match (MatchWithinDays / MatchAfter / MatchBefore). If the
# received date can't be parsed, we don't block (fail-open) so a quirky format never hides mail.
def _date_ok(r, em):
    wd = _get(r, "matchwithindays")
    after = _get(r, "matchafter")
    before = _get(r, "matchbefore")
    if not (wd or after or before):
        return True
    d = _parse_date(em.get("received", ""))
    if d is None:
        return True
    today = datetime.date.today()
    try:
        if wd and (today - d).days > int(float(wd)):
            return False
    except Exception:
        pass
    ad = _parse_date(after)
    if ad and d < ad:
        return False
    bd = _parse_date(before)
    if bd and d > bd:
        return False
    return True


def _get(r, *names):
    for n in names:
        if n in r and r[n] != "":
            return r[n]
    return ""


def _fill(tmpl, email):
    if not tmpl:
        return ""
    repl = dict(email)
    repl["date"] = datetime.date.today().isoformat()
    return re.sub(r"\{([a-zA-Z0-9_]+)\}", lambda m: str(repl.get(m.group(1).strip().lower(), "")), tmpl)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rules-xls", required=True)
    ap.add_argument("--sheet", default="EmailRules")
    ap.add_argument("--list-rules", action="store_true")
    ap.add_argument("--write", action="store_true")
    a = ap.parse_args()

    if a.write:
        # rules JSON array on stdin -> write the EmailRules sheet (openpyxl, .xlsx).
        try:
            rules = json.loads(sys.stdin.read() or "[]")
        except Exception as e:
            print(json.dumps({"ok": False, "error": "bad rules json: " + str(e)})); return
        try:
            import openpyxl
            cols = ["Enabled", "Name", "MatchFrom", "MatchSubject", "MatchBody", "MatchState", "MatchTown", "MatchAny", "MatchSenderDomain", "MatchHasAttachment", "MatchWithinDays", "Action", "To", "Cc", "Subject", "Body"]
            wb = openpyxl.Workbook(); ws = wb.active; ws.title = a.sheet or "EmailRules"
            ws.append(cols)
            for r in (rules if isinstance(rules, list) else []):
                rl = {re.sub(r"[^a-z0-9]", "", str(k).lower()): ("" if v is None else v) for k, v in r.items()}
                ws.append([rl.get(re.sub(r"[^a-z0-9]", "", c.lower()), "") for c in cols])
            out = a.rules_xls
            if out.lower().endswith(".xls"):
                out = out[:-4] + ".xlsx"   # openpyxl writes xlsx only
            wb.save(out)
            print(json.dumps({"ok": True, "wrote": len(rules) if isinstance(rules, list) else 0, "path": out}))
        except Exception as e:
            print(json.dumps({"ok": False, "error": "write: " + str(e)}))
        return

    try:
        rules = _read_rules(a.rules_xls, a.sheet)
    except Exception as e:
        print(json.dumps({"ok": False, "error": "read rules: " + str(e)}))
        return

    if a.list_rules:
        print(json.dumps({"ok": True, "rules": rules}))
        return

    try:
        email = json.loads(sys.stdin.read() or "{}")
    except Exception as e:
        print(json.dumps({"ok": False, "error": "bad email json: " + str(e)}))
        return
    em = {str(k).lower(): ("" if v is None else str(v)) for k, v in email.items()}

    actions = []
    for r in rules:
        if not _truthy(_get(r, "enabled")):
            continue
        ok = True
        caps = []

        def chk(term, value):
            okk, g = _match_cap(term, value)
            if okk and g:
                caps.extend(g)
            return okk

        anyterm = _get(r, "matchany")
        if anyterm:
            blob = " ".join([em.get("from", ""), em.get("fromname", ""), em.get("subject", ""), em.get("body", "")])
            ok = chk(anyterm, blob)
        if ok and not chk(_get(r, "matchfrom"), em.get("from", "")): ok = False
        if ok and not chk(_get(r, "matchsubject"), em.get("subject", "")): ok = False
        if ok and not chk(_get(r, "matchbody"), em.get("body", "")): ok = False
        if ok and not chk(_get(r, "matchtown"), em.get("town", "")): ok = False
        if ok and not chk(_get(r, "matchstate"), em.get("state", "")): ok = False
        # v1140 — sender-domain match (domain part of the From address)
        frm = em.get("from", "")
        dom = frm.split("@")[-1].strip("<> ").lower() if "@" in frm else ""
        if ok and not chk(_get(r, "matchsenderdomain", "matchdomain"), dom): ok = False
        # v1140 — has-attachment match (rule sets TRUE/FALSE; needs inbox hasAttachment)
        ha_term = _get(r, "matchhasattachment", "hasattachment")
        if ok and str(ha_term).strip():
            if _truthy(ha_term) != _truthy(em.get("hasattachment", "")):
                ok = False
        # v1140 — date window
        if ok and not _date_ok(r, em):
            ok = False
        if not ok:
            continue

        # expose regex captures as {match1}, {match2}, ...
        emc = dict(em)
        for i, g in enumerate(caps, 1):
            emc["match%d" % i] = "" if g is None else str(g)

        action = (_get(r, "action") or "email").lower()
        # v1140 — a rule can hand the email off to the PetFBI assemble+route+email chain.
        if action == "petfbi":
            actions.append({
                "rule": _get(r, "name") or "(unnamed)",
                "action": "petfbi",
                "entryId": em.get("entryid", ""),
                "from": em.get("from", ""), "subject": em.get("subject", ""), "body": em.get("body", ""),
            })
            continue
        to = [x.strip() for x in re.split(r"[;,]", _fill(_get(r, "to", "admin", "adminemail", "email"), emc)) if x.strip()]
        cc = [x.strip() for x in re.split(r"[;,]", _fill(_get(r, "cc"), emc)) if x.strip()]
        # reply defaults to the original sender if no explicit To
        if action == "reply" and not to and em.get("from"):
            to = [em.get("from")]
        subj_t = _get(r, "subject", "subjecttemplate", "outsubject")
        if subj_t:
            subject = _fill(subj_t, emc)
        elif action == "forward":
            subject = "Fwd: " + em.get("subject", "")
        else:
            subject = "Re: " + em.get("subject", "")
        body_t = _get(r, "body", "bodytemplate", "outbody", "template")
        if body_t:
            body = _fill(body_t, emc)
        elif action == "forward":
            body = _fill("---------- Forwarded ----------\nFrom: {from}\nSubject: {subject}\n\n{body}", emc)
        else:
            body = em.get("body", "") if action == "reply" else ""
        actions.append({
            "rule": _get(r, "name") or "(unnamed)",
            "action": action,
            "to": to, "cc": cc, "subject": subject, "body": body,
        })

    print(json.dumps({"ok": True, "matched": len(actions), "actions": actions}))


if __name__ == "__main__":
    main()
