---
type: claim
title: An uncertainty map belongs beside every reconstruction
description: "Limited-angle tomography hands you one image with no seam showing, and you cannot tell which voxels were MEASURED from which the regulariser INVENTED. The null space is constructib"
tags: [open, "swek-engine", v2543]
timestamp: v2543
---

# An uncertainty map belongs beside every reconstruction

- **Status:** open  
- **Since:** v2543

## Prediction

Limited-angle tomography hands you one image with no seam showing, and you cannot tell which voxels were MEASURED from which the regulariser INVENTED. The null space is constructible (Landweber from noise: simulation/tomo/nullspace.js) and MEASURED here: two images differing by 60% in the PICTURE differ by 2.6% in the DATA. A 45-degree wedge leaves 1.43x more unseen than a full scan, and the wedge's residue PERSISTS under 7x more iterations while the full scan's collapses -- so the residue is real, not unconverged.

## Why

A null-space image is A CONTROL in this engine's oldest sense: it MUST cast no shadow (measured 1.56e-3, against a solid disc's 3.59e-2 -- 23x, so the control can fail). If you reconstruct one and SEE structure, that structure came from the prior, not the object. The prediction is that shipping the uncertainty map beside the reconstruction changes what people conclude from it -- because right now the prior's contribution is invisible, not absent.

## Kill condition

Show a limited-angle reconstruction where the uncertainty map is flat -- i.e. the wedge constrains every pixel equally. Or show that a reader given map+image draws the same conclusions as one given the image alone, in which case the map is decoration and should be deleted.

# Citations

- Code: RIG-ONLY for the visual half: the module and its 11 assertions run here, but nobody has SEEN the map. Also honest: Landweber returns the true null space PLUS the nearly-invisible directions, because directions with tiny singular values shrink slowly. Arguably that is the MORE useful object -- a direction constrained at 1e-9 is not evidence either -- but it is not the textbook null space and calling it one would be a lie.
- Page: `/tomography.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
