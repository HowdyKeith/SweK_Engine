# SweK render QA — does it actually render?

The one thing Claude can't check from its sandbox is whether a page *visually renders* — no GPU, no browser
there. This harness closes that gap: it boots each SweK page in a headless (GPU-accelerated) Chromium,
screenshots the canvas, and asserts pixel invariants so a page can't silently ship a **black screen** or a
broken render. It can also diff each screenshot against a saved baseline to catch visual regressions.

```
page -> headless Chrome (GPU) -> screenshot canvas -> pixel invariants (checks.mjs) -> [diff vs baseline]
```

## Run it (with the SweK bridge already running on :8787)
```bash
cd tools/render-qa
npm install                 # pulls playwright + pngjs + pixelmatch, then downloads Chromium
node render-qa.mjs                              # QA all manifest pages
node render-qa.mjs --only showcase,webgpu-bench # a subset
node render-qa.mjs --update-baselines           # FIRST run: capture the baseline PNGs
node render-qa.mjs --headed                     # watch it in a real window (if headless WebGL misbehaves)
```
Open `tools/render-qa/out/report.html` for a visual pass/fail board with every screenshot. Exit code is 0 if
all pages pass, 1 if any fails a check or diffs over threshold (so it drops straight into a pre-ship gate).

## Which box to run it on
- **Galaxina (Windows + GTX 1070/1080) is ideal.** On Windows with a real GPU, headless Chrome gets hardware
  WebGL cleanly — no xvfb needed. This is the box to use.
- **Stellar Atlas (Mac):** headless WebGL works but may fall back to software for some contexts; fine for the
  not-black / not-uniform checks, slower.
- **A Linux server with no display:** headless Chromium won't hardware-accelerate WebGL without help. Either
  run under `xvfb-run` in headed mode, or accept the SwiftShader software path (works, just slow). The harness
  passes GPU flags + a software fallback so it won't hard-fail, but hardware is faster and more representative.

## Baselines
First run with `--update-baselines` to snapshot the current renders into `baselines/`. After that, every run
diffs against them and flags any page that changed more than `SWEK_QA_DIFF` (default 2% of pixels); the diff
image is written to `out/<page>.diff.png`. Re-baseline whenever you intend a visual change. Baselines are
committed with the project; `out/` is throwaway.

## The manifest
`manifest.json` lists pages and the checks to run on each. Check types (all resolution-independent):
- `notAllBlack` `{minNonBlackFrac}` — the render isn't a black screen (the #1 failure).
- `notUniform` `{minUniqueColors}` — not a single flat color (catches solid error screens).
- `luminanceInRange` `{min,max}` — not crushed-black or blown-white.
- `colorPresent` `{rgb,tol,minFrac}` — an expected color (sky blue, terrain green) is on screen.
- `regionNotBlack` `{x0,y0,x1,y1,minNonBlackFrac}` — a fractional region isn't pure black (the LAAS
  "shadows must not be fully black" invariant, generalized).
- `pixelNear` `{x,y,rgb,tol}` — a landmark pixel is close to an expected color.
Plus `noConsoleErrors: true` per page to fail on any console/page error during load.

## Adding a page
Add an entry to `manifest.json`. Start with `notAllBlack` + `notUniform`; add `regionNotBlack` / `colorPresent`
once you know what the page should look like. Run `--update-baselines` to lock in the reference.

## Why the check core is separate
`checks.mjs` is pure functions over an RGBA pixel array — no browser, no I/O — so it's unit-testable anywhere
(that's how it's validated where a browser can't run). `render-qa.mjs` is just the Playwright driver that feeds
it screenshots.
