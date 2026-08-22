---
type: claim
title: "The button he asked for was not needed, and bun was installed the whole time"
description: "Keith, from Windows: 'can we have a Krbn button that installs it and a page for me to drop that file into?' -- after `bun run render blob.krbn.ts` gave 'Script not found' and `curl"
tags: [settled, "swek-engine", v2608]
timestamp: v2608
---

# The button he asked for was not needed, and bun was installed the whole time

- **Status:** settled  
- **Since:** v2608

## Prediction

Keith, from Windows: 'can we have a Krbn button that installs it and a page for me to drop that file into?' -- after `bun run render blob.krbn.ts` gave 'Script not found' and `curl -fsSL https://bun.sh/install | bash' gave 'Windows Subsystem for Linux has no installed distributions'. AND THEN THE BETTER QUESTION: 'is a .ts file that i would want to export, or import, or is it just a test that you export? if this is the last time I will see a .ts file, then we can just fix my Krbn installer.'

## Why

BOTH HIS ERRORS WERE MY FAULT AND BOTH WERE ONE LINE. (1) `bun run render` IS A PACKAGE SCRIPT -- it only exists inside the package. He was in C:\\box3d; Krbn cloned into C:\\box3d\\Krbn. He needed `cd Krbn` and I never said so. (2) `curl | bash` IS A BASH SCRIPT ON A MACHINE WITH NO BASH -- I HANDED A WINDOWS USER A UNIX INSTALL LINE and watched WSL cough up an interleaved error. Bun's Windows installer is powershell -c \"irm bun.sh/install.ps1|iex\".

## Measured

AND HIS INSTINCT WAS RIGHT: IT WAS THE LAST .ts FILE. THREE THINGS CHECKED INSTEAD OF ASSUMED. (1) Krbn's package.json says \"import\": \"./dist/index.js\" -- IT SHIPS COMPILED JS. The .ts is the CLI's format, NOT the library's interface, and API.md said so all along: 'A Drawing is just { toSvg(): string }, so you can also call it directly (scene.toSVG(cam)), embed the string, or ship it however you like.' Proved it: plain Node, `import { Scene, sphere } from krbn`, scene.toSVG(cam) -> a 30,848-byte SVG string with 45 stroke paths. NO BUN, NO CLI, NO FILE. (2) ONLY dist/cli/render.js IMPORTS node:fs / node:path / node:url -- walking the import graph from dist/index.js reaches 52 FILES AND NOT ONE NODE BUILT-IN, SO THE BROWSER CAN IMPORT THE WHOLE LIBRARY. Proved that too: Krbn running in a real headless browser, 131 exports, 142,500-byte SVG, 496 stroke paths, 708 ms. (3) AND THE ONE ABOUT ME: BUN WAS INSTALLED IN MY SANDBOX THE ENTIRE TIME -- /home/claude/.npm-global/bin/bun, with git beside it and github.com on the allowlist. I TOLD KEITH I COULD NOT RUN KRBN AND NEVER LOOKED. THE NINTH EXPIRED BLOCKER. THE PREFLIGHT I WROTE TO DIAGNOSE *HIS* MACHINE IS WHAT DIAGNOSED MINE. Clone, bun install, bun run build, and the hologram rendered in 0.6 s: 142,500 bytes, 496 strokes, 489 OF THEM DASHED -- THOSE DASHES ARE THE SEVEN GHOSTED LUMPS SHOWING THROUGH THE SKIN. I HAD BEEN PROMISING THAT PICTURE FOR TWO ROUNDS WHILE THE TOOLS TO MAKE IT SAT ON DISK.

## Kill condition

Pull node into the library core -> 1 fails (and krbn.html stops being true, WHICH IS EXACTLY WHEN I WANT TO HEAR ABOUT IT -- not after Keith opens the page). Render on drag instead of release -> 1 fails. DROP HIS LICENSE -> 1 FAILS: vendoring somebody's engine without their licence is not a packaging detail, IT IS TAKING IT.

# Citations

- Code: vendor/krbn (MIT, LICENSE beside it, cli/ deliberately NOT copied) + krbn.html + tools/krbnVendor-selfcheck.mjs (9 checks, gated, THREE sabotages) + ai-bridge/krbnRoutes.js (preflight). Live in a real browser: '30 deg -- well -- 562 verts, 554 tris -- 496 strokes -- 134.2 KB -- 526 ms', orbit to 120 deg re-renders to 583 strokes, ZERO page errors. RENDERS ON RELEASE, NOT ON DRAG: 708 ms measured, and A SLIDER THAT FIRES A 700 ms RENDER ON EVERY PIXEL OF TRAVEL IS A SLIDER THAT FIGHTS YOU -- `input` updates the readout, `change` does the work. THE VITALS RIDE ALONG (v2605's four gauges) because THE HOLOGRAM SHOULD TELL YOU IF THE BLOB IS STILL HIMSELF, not just that it drew something. NO FALLBACK if Krbn is missing: red text, buttons disabled -- A PAGE THAT QUIETLY DRAWS SOMETHING ELSE WHEN ITS SUBJECT IS MISSING IS LYING ABOUT WHAT IT IS SHOWING. AND ONE MORE BUG THIS FOUND: tools/krbnEmit.mjs had its CLI block at MODULE TOP LEVEL -- `if (import.meta.url === \"file://\" + process.argv[1])` -- so importing it into a page threw 'process is not defined' BEFORE ANY EXPORT COULD BE USED. THE MODULE WAS NODE-ONLY BY ACCIDENT, IN THREE CHARACTERS, AND NOTHING SAID SO UNTIL A BROWSER TRIED.
- Page: `/krbn.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
