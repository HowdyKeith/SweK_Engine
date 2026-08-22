#!/usr/bin/env python3
"""
petfbi_map_grab — find the Google Maps image on a page (the location map you
fold into the post). Catches it two ways: by watching network responses for
Google-Maps URLs as the page loads, and by scanning the rendered DOM (img src
and CSS background-image url(...)).

Contract: prints exactly one final line of JSON.
    {ok, url, mapUrl, mapImages:[...], count}

Usage:  python petfbi_map_grab.py --url "https://petfbi.org/..."
"""
import argparse, json

MAP_HINTS = (
    "maps.googleapis.com/maps/api/staticmap",
    "maps.googleapis.com/maps/api/streetview",
    "maps.gstatic.com",
    "maps.google.com",
    "google.com/maps",
    "/staticmap",
    "streetview",
)


def is_map(u):
    if not u:
        return False
    lu = u.lower()
    return any(h in lu for h in MAP_HINTS)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="page URL containing the map")
    ap.add_argument("--timeout", type=int, default=45000)
    a = ap.parse_args()

    found = set()
    out = {"ok": False, "url": a.url}
    try:
        from camoufox.sync_api import Camoufox
        with Camoufox(headless=True) as browser:
            page = browser.new_page()

            def on_response(resp):
                try:
                    if is_map(resp.url):
                        found.add(resp.url)
                except Exception:
                    pass

            page.on("response", on_response)
            page.goto(a.url, wait_until="networkidle", timeout=a.timeout)

            # DOM scan: <img> srcs and inline background-image url(...)
            dom_urls = page.evaluate(
                "() => { const s=new Set();"
                " document.querySelectorAll('img').forEach(i => { if(i.src) s.add(i.src); });"
                " document.querySelectorAll('[style*=\"url(\"]').forEach(e => {"
                "   const m=(e.getAttribute('style')||'').match(/url\\(([^)]+)\\)/);"
                "   if(m) s.add(m[1].replace(/['\\\"]/g,'')); });"
                " return Array.from(s); }"
            )
            for u in dom_urls:
                if is_map(u):
                    found.add(u)

            maps = sorted(found)
            out = {
                "ok": len(maps) > 0, "url": a.url,
                "mapUrl": maps[0] if maps else None,
                "mapImages": maps, "count": len(maps),
            }
            if not maps:
                out["note"] = "no Google-Maps image detected — page may render the map in a way these hints miss; widen MAP_HINTS once you see a real page"
    except Exception as e:
        out = {"ok": False, "url": a.url, "error": str(e)}

    print(json.dumps(out))


if __name__ == "__main__":
    main()
