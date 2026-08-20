#!/usr/bin/env python3
"""
petfbi_grab — open a PetFBI report URL in Camoufox and pull everything useful
out of the rendered page, so the report can be reformatted into a post.

It deliberately grabs BROADLY (title, visible text, JSON-LD, og/meta tags, all
image URLs) rather than guessing exact selectors — that's the foundation for
the dynamic-parsing template. Once you see a real page's output, tighten the
field extraction in the `fields` block below.

Contract: prints exactly one final line of JSON.
    {ok, url, title, fields:{...}, text, ld_json, meta, images, text_len}

Usage:  python petfbi_grab.py --url "https://petfbi.org/..."
"""
import argparse, json, sys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", required=True, help="PetFBI report URL")
    ap.add_argument("--timeout", type=int, default=45000)
    a = ap.parse_args()

    out = {"ok": False, "url": a.url}
    try:
        from camoufox.sync_api import Camoufox
        with Camoufox(headless=True) as browser:
            page = browser.new_page()
            page.goto(a.url, wait_until="networkidle", timeout=a.timeout)

            title = page.title()
            text = page.inner_text("body") or ""
            ld = page.evaluate(
                "() => Array.from(document.querySelectorAll('script[type=\"application/ld+json\"]'))"
                ".map(s => s.textContent)"
            )
            meta = page.evaluate(
                "() => { const o={}; document.querySelectorAll('meta[property],meta[name]')"
                ".forEach(m => { const k=m.getAttribute('property')||m.getAttribute('name');"
                " if(k) o[k]=m.getAttribute('content'); }); return o; }"
            )
            images = page.evaluate(
                "() => Array.from(document.images).map(i => i.src).filter(Boolean)"
            )

            # Best-effort field guesses — refine once you see a real page.
            fields = {
                "ogTitle": meta.get("og:title"),
                "ogDescription": meta.get("og:description"),
                "ogImage": meta.get("og:image"),
                "description": meta.get("description"),
            }

            out = {
                "ok": True, "url": a.url, "title": title,
                "fields": fields,
                "text": text[:8000], "text_len": len(text),
                "ld_json": ld, "meta": meta,
                "images": images[:40], "image_count": len(images),
            }
    except Exception as e:
        out = {"ok": False, "url": a.url, "error": str(e)}

    print(json.dumps(out))


if __name__ == "__main__":
    main()
