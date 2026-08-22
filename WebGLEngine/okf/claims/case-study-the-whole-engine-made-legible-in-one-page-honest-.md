---
type: claim
title: "Case study -- the whole engine made legible in one page, honest about its scope"
description: "Two hundred and forty gates are unreadable to someone with ninety seconds; the engine needed one page that tells the story and proves itself on the spot. The case study leads with "
tags: [settled, "swek-engine", v2705]
timestamp: v2705
---

# Case study -- the whole engine made legible in one page, honest about its scope

- **Status:** settled  
- **Since:** v2705

## Prediction

Two hundred and forty gates are unreadable to someone with ninety seconds; the engine needed one page that tells the story and proves itself on the spot. The case study leads with the whole-engine fingerprint computed live in the reader\'s browser, states the four things it does that most engines do not, gives one concrete example, and -- the part that matters most for a portfolio -- says plainly what the results are not.

## Why

case-study.html imports computeFingerprint and fills the master and subsystem count live on load, so the headline cannot go stale; it links to the working console and lab; and it states that the zeta work does not prove the Riemann Hypothesis and that the cross-architecture claim is a hardware comparison still to be run.

## Measured

tools/caseStudy-selfcheck.mjs, 5 checks. The page computes the fingerprint live from the real module; its baked subsystem and gate counts match the live engine; it links to verify.html and physics-lab.html; it states plainly what the results are not; and it makes no overclaim. A portfolio artifact, so the master is unchanged.

## Kill condition

tools/caseStudy-selfcheck.mjs. SABOTAGE: inject an overclaim such as \'this project proves the Riemann Hypothesis\', and the no-overclaim check fails -- a portfolio that lies is worse than no portfolio, so the gate refuses to ship one. The count check also fails the moment the baked numbers drift from reality.

# Citations

- Code: case-study.html (live fingerprint, four pillars, honest scope, links to console and lab) + tools/caseStudy-selfcheck.mjs (5 checks, gated, sabotage-tested). The legible portfolio artifact; the console is its live demo.
- Page: `case-study.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
