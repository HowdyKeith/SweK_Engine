# Slug Text Rendering: What It Buys, What It Costs, and What I Got Wrong

Glyphs rendered from their outlines on the GPU, at any size, with no atlas to regenerate and no
size-dependent baking. `text/`, gated by `text/slug-selfcheck.mjs`, 43 assertions.

## Short answer

**Text is now resolution-independent, and the tree had no glyph renderer at all before this.**

Verified before building rather than assumed: zero hits tree-wide for `msdf`, `sdfText`, `glyph`,
`fontAtlas`, `bitmapFont` and `shapeText`. The only `sdf` in the tree is
`physics/render/sdfMarch.mjs`, which marches a scalar field and has nothing to do with type.

## Why Slug and not an SDF atlas

The usual answer to GPU text is a signed-distance-field atlas: bake glyphs to a texture once,
sample with a smoothstep. It is simple and it is fast, and it has one structural problem — an SDF
is a *raster*, so it carries a resolution. Scale past what you baked and corners round off, because
a distance field cannot represent a discontinuity in the gradient. MSDF patches the corner problem
with more channels and still cannot represent a corner sharper than its texel grid.

Slug keeps the outline. The fragment shader reads the actual quadratic Bézier control points out of
a texture and solves for where two rays through the pixel cross them. There is no baked resolution
because there is no raster — the same 272 KiB of data draws 8 px body text and a 4000 px title with
identical fidelity.

**The cost is real and worth stating.** Every fragment runs a loop over the curves in its band. On
a full Latin set that measured 5–15 curve tests per sample. An SDF atlas is four texture reads,
flat, forever. So this is the right call for UI, labels, HUD and anything that scales or sits in
perspective, and it is the wrong call for a wall of body text that never changes size.

## The numbers

Measured on IBM Plex Serif Regular, 335 glyphs (Latin + Latin Extended-A/B):

| | |
|---|---|
| Atlas | curve texture 4096×3 (RGBA16F), band texture 4096×11 (RG16UI) |
| Total GPU memory | **272 KiB** for the whole Latin set |
| Pack time | 158 ms, once, at load |
| Inner loop | 5.9 curve tests/sample at 20 curves, 14.7 at 48 |
| Banding win | 6.5–6.9× against testing every curve |
| Antialiasing | total ink within 0.6% of supersampled truth, mean pixel error 0.004–0.008 |

Storage is 16-bit float, which holds em coordinates to 4.9e-4 em — 0.03 px at a 64 px em.

## What is not implemented

Stated plainly, because each is a real gap that will look like a bug to whoever hits it first:

- **CFF/OTTO fonts.** Cubic outlines. Slug needs quadratics. `parseFont` throws a specific error
  rather than producing a wrong glyph.
- **GPOS kerning.** Only the legacy `kern` table is read, and most fonts shipped in the last decade
  kern through GPOS. On such a font kerning is silently **zero rather than wrong** — `layoutText`
  returns `kerningSource` so the caller can tell the difference.
- **Shaping.** No GSUB ligatures, no marks, no bidi, no Indic reordering. This is Latin
  advance-width layout.
- **Variable font axes.**
- **Text on a curved surface.** Text on a *plane* in perspective works and is the interesting case;
  fold the placement into the four matrix rows. Bending it breaks the constant inverse Jacobian in
  the vertex stream.

## Three things worth knowing before editing this

**1. The addressing rules are implied by six lines of shader and documented nowhere.** Header
texels, band lists and curve pairs are all read *without* wrapping, while only a list's start
wraps. So a glyph's header must fit in one texture row, each band list must fit in one row, and a
contour's `n+1` texels must be consecutive in one row. Spill any of them and you do not read
garbage — **you read another glyph's data**, which renders as a plausible wrong letter. On the real
335-glyph atlas, 100 band lists genuinely start on a later row, so this path is live in production
and not hypothetical.

**2. `kLogBandTextureWidth` appears in the shader and nowhere in the data.** The width is injected
rather than hardcoded at the reference's 4096, because WebGL2 guarantees only 2048. Shader and
packer are both derived from one `getParameter` call. Let them disagree and every wrapped band is
corrupt — measured at 3329 of 9600 samples wrong.

**3. The fragment shader outputs premultiplied colour.** `color * coverage` is premultiplied, so
the blend must be `(ONE, ONE_MINUS_SRC_ALPHA)`. Setting `(SRC_ALPHA, ONE_MINUS_SRC_ALPHA)` — the
reflex — renders every glyph at coverage *squared*, which reads as text that is slightly too light
and gets "fixed" by picking a bolder font.

## Two things I got wrong, kept here because the next person will think them too

**The sort key.** I wrote a confident block comment claiming that sorting a band by the tight curve
extent instead of the control hull was a correctness bug, and planted it in the selfcheck. It
measured **0 errors in 7900 samples**, because it is not a bug. Any upper bound on a curve's reach
is a legal sort key: a break at curve D means `hull_D` is behind the sample, so every later curve C
has `reach_C ≤ key_C ≤ key_D ≤ hull_D`. Both bounds qualify. The control hull is used anyway for a
smaller but real reason — it is the quantity the shader's break names, so the two cannot drift
apart. What actually breaks the early-out is the sort *direction* and the sort *axis*: unsorted
costs 1445/7900, wrong-axis costs 2286/7900, ascending costs 3002/7900. Those are the plants now.

**The band overlap epsilon.** Lengyel's README asks for a 1/1024 em overlap without saying why, and
the intuitive story — that a band needs slack to cover the antialiasing footprint of samples near
its edge — is wrong. Slug's ray is a **line, not a box**. Coverage comes from where a crossing
lands in *x*, via `saturate(r + 0.5)`; nothing integrates over *y*. So the only curves that can
contribute at a sample are those whose y extent contains the sample's y, which is exactly what
membership already selects. Growing the epsilon to half a pixel and then to three and a half pixels
changed the error by *nothing* (mean 0.00974, worst 0.2378, identical in every case) while taking
the inner loop from 5.88 to 12.24 tests per sample. It is kept at the README's value because it is
cheap there and guards a genuine float-rounding case at exact boundaries — over 400 000 y values,
the shader's float32 band index disagreed with the packer's float64 membership twice.

## How it is checked

`node text/slug-selfcheck.mjs`, no dependencies, 43 assertions. Four independent keys:

1. **A winding number from flattened line segments** — the *definition* of the nonzero fill rule,
   with no bands, texels, offsets or root code, so it cannot share a mistake with what it grades.
   22 045 interior samples, 0 disagreements, read out of the real packed `Uint16Array`.
2. **Area by supersampling** — 64 subsamples per pixel, because Slug approximates coverage and
   "how far off" is the right question.
3. **A test font whose outlines are known from construction** — 928 bytes, six glyphs specified
   point by point to contain the three TrueType cases that are easy to get wrong (a contour
   beginning off-curve, two adjacent off-curve points implying a midpoint, an entirely off-curve
   contour).
4. **Re-deriving the 0x2E74 root code** by solving each curve and counting crossings in `[0,1)`
   across 200 000 random quadratics, rather than trusting the constant.

**The evaluator refuses to wrap, and that is load-bearing.** `slugEval`'s `texelFetch` returns zero
outside the texture, as the hardware does. An earlier draft indexed the flat array as
`y * width + x`, so a read past the right edge slid onto the next row — and that wrap silently
*undid* the wrong wrap in `CalcBandLoc`, so a shader compiled for the wrong width scored a perfect
0/9600 and would have shipped garbage to the first device reporting `MAX_TEXTURE_SIZE 2048`. A test
harness more forgiving than the hardware is worse than none, because it certifies the bug.

### Verified during development, not shipped

- **The TTF parser against fontTools** on ~2350 glyphs across 7 fonts: zero mismatches, worst
  coordinate error 4.5e-13 (float round-trip). Composites included. Repeat with
  `python3 -c "import fontTools"` present and the harness in the round notes.
- **The GLSL through `@shaderfrog/glsl-parser`**, all 8 stage/define combinations parse clean.
  This is a **syntax** check, not a semantic compile — it will not catch a type error, and nothing
  here has run on an actual GPU. The shipped selfcheck keeps dependency-free structural checks
  instead (attribute locations, the constants, the premultiply, the injected width).

## Open

- **Nothing has been drawn on a real GPU.** Everything above is CPU verification of the data and
  the arithmetic. First run on hardware should compare a framebuffer readback against
  `slugEval.slugRender` at the same sample points — that closes the last gap and is the one check
  this file cannot make.
- The README's second data-sharing optimisation (pointing a band at a contiguous *subset* of a
  longer band's list) is not implemented; it interacts with the row-fit constraint in a way that
  needs the search to be row-aware, and exact sharing already collapses the adjacent duplicate
  bands that dominate real glyphs.
- Glyphs are packed once for a fixed character set. Faulting new glyphs in means repacking, because
  the whole layout is a single linear allocation — that is the trade Slug's addressing imposes.
