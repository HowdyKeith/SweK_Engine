#!/usr/bin/env python
# scrapers/example_title.py — a template scraper skill.
#
# The skills library runs each skill as:  <venv-python> example_title.py [args]
# Convention: print ONE final line of JSON to stdout — the bridge parses the
# last JSON line into `result`. Use argparse so the skill is re-runnable with
# different inputs (this is exactly the shape Webwright's final_script.py takes).
#
#   <venv>/python example_title.py --url https://example.com
#
# This template opens the page in Camoufox (the anti-detect Firefox) and returns
# the URL + page title. Swap the body for whatever you (or Webwright) need:
# scrape PetFBI fields, grab a Google Maps image, etc.

import argparse
import json
import sys


def main():
    ap = argparse.ArgumentParser(description="Open a URL in Camoufox and return its title.")
    ap.add_argument("--url", required=True, help="page to open")
    ap.add_argument("--headless", default="true", help="true/false")
    args = ap.parse_args()

    try:
        from camoufox.sync_api import Camoufox
    except Exception as e:
        print(json.dumps({"ok": False, "error": "camoufox import failed: %s" % e}))
        sys.exit(1)

    headless = str(args.headless).lower() != "false"
    try:
        with Camoufox(headless=headless) as browser:
            page = browser.new_page()
            page.goto(args.url, wait_until="domcontentloaded", timeout=45000)
            print(json.dumps({"ok": True, "url": page.url, "title": page.title()}))
    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
