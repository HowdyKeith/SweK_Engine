#!/usr/bin/env python3
# scrapling_fetch.py - v1027
#   Fetch a URL with Scrapling and emit JSON {ok,status,title,text,links,matched}.
#   --url URL  [--mode basic|stealth]  [--selector CSS]  [--timeout 20]  [--max-links 60]
#   basic  = Scrapling Fetcher (httpx/curl_cffi; fast, no browser)
#   stealth= StealthyFetcher (camoufox-backed; needs `scrapling install` browsers)
import argparse, json


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True)
    ap.add_argument("--mode", default="basic", choices=["basic", "stealth"])
    ap.add_argument("--selector", default="")
    ap.add_argument("--timeout", type=int, default=20)
    ap.add_argument("--max-links", type=int, default=60)
    a = ap.parse_args()

    try:
        if a.mode == "stealth":
            from scrapling.fetchers import StealthyFetcher
            page = StealthyFetcher.fetch(a.url, timeout=a.timeout * 1000, headless=True)
        else:
            from scrapling.fetchers import Fetcher
            page = Fetcher.get(a.url, timeout=a.timeout)
    except Exception as e:
        print(json.dumps({"ok": False, "url": a.url, "mode": a.mode, "error": "fetch: " + str(e)}))
        return

    out = {"ok": True, "url": a.url, "mode": a.mode, "status": getattr(page, "status", None)}
    try:
        def texts(sel):
            try:
                return [str(x).strip() for x in page.css(sel) if str(x).strip()]
            except Exception:
                return []

        out["title"] = (texts("title::text") or [""])[0]

        if a.selector:
            sel = a.selector if "::" in a.selector else a.selector + " ::text"
            m = texts(sel)
            out["matchCount"] = len(m)
            out["matched"] = m[:200]

        full = ""
        try:
            full = page.get_all_text() or ""
        except Exception:
            pass
        out["textLen"] = len(full)
        out["text"] = full[:20000]

        links, seen = [], set()
        try:
            for h in page.css("a::attr(href)"):
                u = str(h).strip()
                if u and not u.startswith(("javascript:", "#", "mailto:")) and u not in seen:
                    seen.add(u)
                    links.append(u)
                    if len(links) >= a.max_links:
                        break
        except Exception:
            pass
        out["links"] = links
    except Exception as e:
        out = {"ok": False, "url": a.url, "mode": a.mode, "error": "parse: " + str(e)}

    print(json.dumps(out))


if __name__ == "__main__":
    main()
