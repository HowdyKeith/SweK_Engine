---
type: claim
title: He cannot starve. Every way he has ever died was a bug I shipped.
description: "Keith asked what the blobarium has AS A PRODUCT -- 'accessories, feeding options, tank cleaning. Quality of life... I am serious though' -- then pointed at the avatar: 'We have rea"
tags: [open, "swek-engine", v2605]
timestamp: v2605
---

# He cannot starve. Every way he has ever died was a bug I shipped.

- **Status:** open  
- **Since:** v2605

## Prediction

Keith asked what the blobarium has AS A PRODUCT -- 'accessories, feeding options, tank cleaning. Quality of life... I am serious though' -- then pointed at the avatar: 'We have reactions that we tried to give the avatar, also to alter its configuration.' OPEN until he opens /blobarium.html and the status line reads 'well'.

## Why

HE ALREADY BUILT THE VOCABULARY. ui/TamagotchiView.js: { type: 'tama', action: 'feed' | 'play' | 'sleep' | 'alert' | 'happy' | 'sad' | 'speak' }, with hunger/happiness/energy 0..100 DECAYING AT 1Hz. A TAMAGOTCHI'S STATS DECAY SO YOU MUST INTERVENE -- THAT IS THE GAME. And that is exactly where the blob does not fit: v2596 PROVED HE CANNOT STARVE. The field's peak can never fall below max(a) = 2.280, because at the tallest lump's own centre u = 1 so it contributes exactly its amplitude and every other lump can only ADD. NOTHING RUNS DOWN. HE CANNOT DIE OF NEGLECT. A HUNGER BAR WOULD BE A LIE PAINTED ON A CONSTANT.

## Measured

BUT HE HAS DIED FOUR TIMES, AND I KILLED HIM EVERY TIME. (1) v2595 DISMANTLED: blobsToBodies passed `half: b.r` -- THE FIELD RADIUS AS THE COLLISION RADIUS -- and box3d blew the closest pair 0.2103 -> 1.1255 in one second, 5.4x. box3d did its job PERFECTLY: a metaball's peak IS interpenetration and a rigid solver's job is to REMOVE interpenetration. (2) v2596 DISSOLVED: bake him into 64^3 and advect, peak 75.3 -> 63.0 -> 55.8 -> 50.5% WHILE THE MASS STAYS CONSTANT -- he does not evaporate, HE SMEARS. (3) v2597 DROPPED: the aquarium had NO BOTTOM, gravity on at -9.8, measured 872 units below the x-ray after fifteen seconds -- AND IT LOOKED FINE FOR THE LENGTH OF A GLANCE, peak still ~4.0 at step 186 because he had not LEFT the window YET. (4) v2597 VANISHED: the warmth slider called setTransform(id, x, y, z) -- THREE LOOSE NUMBERS -- when the real signature takes ARRAYS; p[0] was undefined, undefined went into the wasm, POSITION BECAME NaN, AND DRAGGING THE SLIDER MADE HIM DISAPPEAR. FOUR DEATHS. FOUR BUGS. ZERO NEGLECT. So the accessory he needs is NOT A FEEDING TUBE -- it is the four gauges that would have caught the four times I killed him. A TAMAGOTCHI'S STATS ARE A GAME; THESE ARE A SMOKE ALARM.

## Kill condition

EVERY GAUGE IS TESTED BY REPLAYING THE ACTUAL BUG IT WOULD HAVE CAUGHT, WITH THE REAL NUMBERS FROM THE RECORD -- not a hypothetical failure I invented to have something to check. A GAUGE THAT HAS NEVER SEEN ITS OWN EMERGENCY IS A DECORATION. Sabotages: let NaN pass -> 2 fail; ignore the baseline -> 1 fails; make the tank infinite -> 1 fails. And 'real' is checked FIRST because NaN comparisons are ALL false, so `Math.abs(NaN) < 4` is false and 'home' would catch it TOO -- BUT ONLY BY LUCK, AND A GAUGE THAT IS RIGHT BY LUCK IS A GAUGE THAT WILL BE WRONG BY LUCK.

# Citations

- Code: physics/blobVitals.js (closestPair/fieldPeak/vitals/diagnose) + physics/blobVitals-selfcheck.mjs (11 checks, gated, THREE sabotages) + blobarium.html status line. THE BASELINE MATTERS: 'together' compares against the closest pair captured AT RESET, because A BLOB THAT STARTS SPREAD OUT IS NOT SICK; A BLOB THAT *GETS* SPREAD OUT IS BEING SOLVED APART. Without it the gauge is a spread-o-meter with an opinion. NO 'HAPPINESS' GAUGE, ON PURPOSE: v2596 measured the peak WANDERING, sometimes ABOVE where it started, because lumps drift together and overlap builds a taller peak -- THAT IS WHAT A TEMPERATURE LOOKS LIKE, NOT A MOOD, and dressing it as one would make a fluctuation look like a feeling. diagnose() names the version that shipped each death, because AN ALARM THAT DOES NOT TELL YOU WHAT IT HAS SEEN BEFORE IS JUST A NOISE. AND THE ROUND COST ME FOUR SELF-INFLICTED WOUNDS WORTH RECORDING: I imported closestPair into a page that already had one (NAME COLLISION, the 'xray'/`new Blob()` joke a third time); I left a duplicate `const D` in report(); and TWICE I anchored a patch on indentation I had typed from memory instead of read from the file (six spaces vs four). THE FIX EACH TIME WAS TO STOP GUESSING AND READ.
- Page: `/blobarium.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
