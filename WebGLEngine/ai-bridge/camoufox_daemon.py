#!/usr/bin/env python
# ai-bridge/camoufox_daemon.py — v952
#
# A warm Camoufox browser the Node bridge drives over a tiny JSON-line protocol.
# The bridge launches ONE of these (lazily, on first scrape) and keeps it alive,
# so repeated ops (navigate PetFBI -> read data -> hit Google Maps -> grab the
# map) reuse a single browser instead of cold-starting Firefox each time.
#
# Protocol: the bridge writes one JSON object per line to stdin; this process
# writes one JSON object per line to stdout.
#   on launch  -> {"ready": true}   (browser is up)   OR  {"fatal": "..."}
#   per command-> {"id": N, "ok": bool, ...}
# Commands (each has an "id" and an "op"):
#   goto       {url}                  -> {ok, url}
#   content    {}                     -> {ok, url, html}      (fully rendered DOM)
#   evaluate   {expr}                 -> {ok, result}         (run/inject JS)
#   screenshot {fullPage?}            -> {ok, dataBase64}     (png)
#   grab       {urlPattern, url?}     -> {ok, url, contentType, dataBase64}
#                                        (capture a network response by substring
#                                         — the Google-Maps-image trick)
#   click      {selector}             -> {ok, url}
#   fill       {selector, value, submit?} -> {ok}
#   close      {}                     -> {ok}  then exits
#
# Anti-detect config is set HERE at launch (where Camoufox wants it). Tune the
# Camoufox(...) kwargs (headless, os, fingerprint, geoip, proxy) as needed.

import sys
import json
import base64

def emit(obj):
    try:
        sys.stdout.write(json.dumps(obj) + "\n")
        sys.stdout.flush()
    except Exception:
        pass

try:
    from camoufox.sync_api import Camoufox
except Exception as e:
    emit({"fatal": "camoufox import failed: %s (install via /camoufox.html)" % e})
    sys.exit(1)

def main():
    cam = None
    try:
        # Launch-time anti-detect options live here. headless=True for the bridge;
        # flip to False while debugging a stubborn target.
        cam = Camoufox(headless=True)
        browser = cam.__enter__()
        page = browser.new_page()
    except Exception as e:
        emit({"fatal": "launch failed: %s" % e})
        return

    emit({"ready": True})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except Exception:
            continue
        cid = msg.get("id")
        op = msg.get("op")
        try:
            if op == "goto":
                page.goto(msg["url"], wait_until="domcontentloaded", timeout=45000)
                emit({"id": cid, "ok": True, "url": page.url})

            elif op == "content":
                emit({"id": cid, "ok": True, "url": page.url, "html": page.content()})

            elif op == "evaluate":
                # expr may be a bare expression ("document.title") or an IIFE/arrow.
                val = page.evaluate(msg["expr"])
                emit({"id": cid, "ok": True, "result": val})

            elif op == "screenshot":
                png = page.screenshot(full_page=bool(msg.get("fullPage")))
                emit({"id": cid, "ok": True, "dataBase64": base64.b64encode(png).decode("ascii")})

            elif op == "grab":
                pat = msg["urlPattern"]
                cap = {}
                def on_resp(resp, pat=pat, cap=cap):
                    if "data" in cap:
                        return
                    if pat in resp.url:
                        try:
                            cap["data"] = resp.body()
                            cap["url"] = resp.url
                            cap["ct"] = resp.headers.get("content-type", "")
                        except Exception:
                            pass
                page.on("response", on_resp)
                if msg.get("url"):
                    page.goto(msg["url"], wait_until="load", timeout=45000)
                else:
                    page.wait_for_timeout(2500)
                # give late responses a moment
                if "data" not in cap:
                    page.wait_for_timeout(2000)
                try:
                    page.remove_listener("response", on_resp)
                except Exception:
                    pass
                if "data" in cap:
                    emit({"id": cid, "ok": True, "url": cap["url"], "contentType": cap.get("ct", ""),
                          "dataBase64": base64.b64encode(cap["data"]).decode("ascii")})
                else:
                    emit({"id": cid, "ok": False, "error": "no response URL contained '%s'" % pat})

            elif op == "click":
                page.click(msg["selector"], timeout=15000)
                emit({"id": cid, "ok": True, "url": page.url})

            elif op == "fill":
                page.fill(msg["selector"], msg.get("value", ""), timeout=15000)
                if msg.get("submit"):
                    page.keyboard.press("Enter")
                emit({"id": cid, "ok": True})

            elif op == "close":
                emit({"id": cid, "ok": True})
                break

            else:
                emit({"id": cid, "ok": False, "error": "unknown op '%s'" % op})
        except Exception as e:
            emit({"id": cid, "ok": False, "error": str(e)})

    try:
        if cam is not None:
            cam.__exit__(None, None, None)
    except Exception:
        pass

main()
