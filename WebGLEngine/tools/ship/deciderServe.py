#!/usr/bin/env python3
"""deciderServe.py -- a local server that keeps Mapika/decider (github.com/Mapika/decider, Apache-2.0) loaded and answers the Decider chip's
typed questions (brain/deciderAdvisor.mjs; the audit is tools/ship/deciderAudit.mjs, Round 14 of brain/NEEDS_AND_LIMITS.md).

  pip install decider-ai
  python tools/ship/deciderServe.py --model Mapika/decider-2b --port 8765        (downloads the weights on first use; about 4 GB)
  python tools/ship/deciderServe.py --selftest                                   (no model, no torch: checks the translation both ways)

POST /ask  body: {"schema":1,"state":{...},"questions":[{"id","type":"noul"|"choice","text","options"?}, ...]}
           reply: {"<id>": {"probs": {"yes": p, "no": 1-p}}  |  {"probs": {"<option>": p, ...}}, ...}
GET /health -> {"ok": true, "model": "..."}.   Binds 127.0.0.1 only: the state of a dive is not sent anywhere else, and the audit tool refuses a non-local --url.
No temperature, sampling or tau is involved: the answers are the model's own probabilities from one forward pass (Decider's calibrated temperature is its own).
"""
import argparse
import json
import sys
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer


def to_decider_questions(questions):
    """The chip's question list -> the dict decider.infer.Decider.system_one takes (README: 'noul' and 'choice' with criteria)."""
    out = {}
    for q in questions:
        if q["type"] == "noul":
            out[q["id"]] = {"type": "noul", "instructions": q["text"]}
        elif q["type"] == "choice":
            out[q["id"]] = {"type": "choice", "instructions": q["text"], "criteria": {str(o): None for o in q["options"]}}
        else:
            raise ValueError("unknown question type %r" % (q["type"],))
    return out


def from_decider_answers(result, questions):
    """system_one's {"answers": {id: {"noul": p} | {"choice", "probabilities": {...}}}} -> the chip's {id: {"probs": {...}}}. A question the model did not answer is left out (the chip counts it invalid)."""
    answers = result.get("answers", result)
    out = {}
    for q in questions:
        a = answers.get(q["id"])
        if not isinstance(a, dict):
            continue
        if q["type"] == "noul" and isinstance(a.get("noul"), (int, float)):
            p = min(1.0, max(0.0, float(a["noul"])))
            out[q["id"]] = {"probs": {"yes": p, "no": 1.0 - p}}
        elif q["type"] == "choice" and isinstance(a.get("probabilities"), dict):
            out[q["id"]] = {"probs": {str(k): float(v) for k, v in a["probabilities"].items() if str(k) in {str(o) for o in q["options"]}}}
    return out


def ask(decider, prompt):
    questions = prompt["questions"]
    return from_decider_answers(decider.system_one(prompt["state"], to_decider_questions(questions)), questions)


class _Fake:
    """A stand-in with the README's shape, for --selftest only."""
    def system_one(self, state, questions):
        res = {}
        for k, q in questions.items():
            res[k] = {"noul": 0.75} if q["type"] == "noul" else {"choice": "x", "probabilities": {o: 1.0 / len(q["criteria"]) for o in q["criteria"]}}
        return {"answers": res}


def selftest():
    qs = [{"id": "surface", "type": "noul", "text": "Surface?"}, {"id": "cap", "type": "choice", "text": "Depth?", "options": ["0.5", "0.6"]}, {"id": "station", "type": "choice", "text": "Which?", "options": ["0", "2", "none"]}]
    dq = to_decider_questions(qs)
    assert dq["surface"] == {"type": "noul", "instructions": "Surface?"}, dq
    assert dq["cap"]["criteria"] == {"0.5": None, "0.6": None}, dq
    got = ask(_Fake(), {"state": {"depth_m": 3}, "questions": qs})
    assert got["surface"] == {"probs": {"yes": 0.75, "no": 0.25}}, got
    assert got["cap"]["probs"] == {"0.5": 0.5, "0.6": 0.5}, got
    assert abs(sum(got["station"]["probs"].values()) - 1.0) < 1e-9, got
    # a model that omits a question, returns an option that was never offered, or a bad value
    odd = from_decider_answers({"answers": {"surface": {"noul": 1.7}, "cap": {"probabilities": {"0.5": 0.4, "9.9": 0.6}}}}, qs)
    assert odd["surface"]["probs"]["yes"] == 1.0 and "station" not in odd and list(odd["cap"]["probs"]) == ["0.5"], odd
    try:
        to_decider_questions([{"id": "x", "type": "score", "text": "?"}])
        raise SystemExit("an unknown question type was accepted")
    except ValueError:
        pass
    print("deciderServe selftest: ok")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="Mapika/decider-2b")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    from decider.infer import Decider   # imported late: --selftest needs neither torch nor the weights
    decider = Decider(a.model)

    class H(BaseHTTPRequestHandler):
        def _send(self, code, obj):
            body = json.dumps(obj).encode()
            self.send_response(code); self.send_header("Content-Type", "application/json"); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

        def do_GET(self):
            self._send(200, {"ok": True, "model": a.model}) if self.path == "/health" else self._send(404, {"error": "not found"})

        def do_POST(self):
            if self.path != "/ask":
                return self._send(404, {"error": "not found"})
            try:
                n = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(n).decode("utf-8", "replace")
                self._send(200, ask(decider, json.loads(body)))
            except Exception as e:   # reported to the caller, which stops the recording and keeps what it paid for; printed here too, with the traceback and the request
                traceback.print_exc()
                print("deciderServe: the failing request was: " + (body[:1500] if "body" in dir() else "(unread)"), file=sys.stderr, flush=True)
                self._send(500, {"error": "%s: %s" % (type(e).__name__, e)})

        def log_message(self, *args):
            pass

    srv = HTTPServer(("127.0.0.1", a.port), H)
    print("deciderServe: %s on http://127.0.0.1:%d/ask" % (a.model, a.port), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    sys.exit(main())
