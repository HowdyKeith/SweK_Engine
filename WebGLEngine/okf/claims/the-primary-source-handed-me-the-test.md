---
type: claim
title: The primary source handed me the test
description: "Can this engine implement Panini projection? PREDICTION: yes, and -- unusually -- it can be PROVEN CORRECT WITHOUT A GPU, because Panini's defining properties are mathematical rath"
tags: [settled, "swek-engine", v2571]
timestamp: v2571
---

# The primary source handed me the test

- **Status:** settled  
- **Since:** v2571

## Prediction

Can this engine implement Panini projection? PREDICTION: yes, and -- unusually -- it can be PROVEN CORRECT WITHOUT A GPU, because Panini's defining properties are mathematical rather than aesthetic.

## Why

Every wide-FOV projection write-up says the same aesthetic things: 'corrects edge distortion', 'more natural', 'immersive'. NONE OF THAT IS FALSIFIABLE. A shader that looked plausible and was subtly wrong would pass every one of those descriptions.

## Measured

CONFIRMED, AND THE PRIMARY SOURCE IS WHY. lazarus-pkgs/panini's own USAGE.md (fetched, not paraphrased) says: 'Bruno Postle recently deduced one very simple but effective way of combining the cylindrical and linear projections by studying a Pannini painting of St. Peter\'s... It is A LINEAR PERSPECTIVE VIEW OF A CYLINDRICAL IMAGE -- the cylindrical analog of the stereographic projection of a sphere.' And then the sentence that turned this from a rendering task into a testable one: 'THE LINEAR PERSPECTIVE PROJECTION, AT Ez = 0, BELONGS TO BOTH FAMILIES.' THAT IS A FALSIFIABLE IDENTITY, not a design note. MEASURED: at d=0, Panini reproduces the rectilinear camera\'s x/-z and y/-z with WORST ERROR 1.78e-15 ACROSS 825 DIRECTIONS spanning +-80 deg horizontal and +-60 deg vertical. The horizon at d=0 comes out to EXACTLY 90 degrees -- rectilinear\'s hard limit -- and it FALLS OUT OF THE ALGEBRA (d + cos th = 0) rather than being asserted. AND THE DEFINING PROPERTY: a world-space vertical projects to a screen vertical with u varying by EXACTLY 0.0 across 41 samples at d = 0, 0.5, 1 and 5. Not a tolerance passing -- zero. AND THE BENEFIT AS A NUMBER INSTEAD OF FOLKLORE: at 150 deg hfov a rectilinear camera must stretch the edge to tan(75) = 3.73 SCREEN HALF-WIDTHS; Panini fits the same 150 degrees in 1.0 at d=20.75.

## Kill condition

Any d where a world vertical does not project to a screen vertical, or any direction where d=0 differs from x/-z by more than float noise. Both are gated over grids, not spot-checked.

# Citations

- Code: render/panini.js + render/panini-selfcheck.mjs (10 checks, gated). !! RIG-ONLY AND SAID OUT LOUD: paniniGLSL() emits the same arithmetic AS A STRING. THE JS AND THE GLSL ARE NOT AUTOMATICALLY THE SAME FUNCTION -- one is JS on a CPU, one is GLSL on a GPU, and nothing here can run a GPU. The gate compares the shader TEXT against the same constants, WHICH IS GRADING PROSE, and the check says so in its own failure message. The shader\'s real output needs a screenshot on Galaxina. Also: paniniFitD REFUSES impossible requests (360 deg hfov -> null) and paniniProject returns null behind the horizon rather than 1e9 -- a plausible-looking number for an impossible request is how a bad value gets into a shader and comes out as \'the art looks weird\'.
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
