---
type: claim
title: "The blob dies of uniform heat, not of heat"
description: "Keith: 'Can we bake it? In a sun? Does it have to die?' PREDICTION: heating pulls v2554's Rosensweig threshold in BOTH directions at once -- M(T) falls toward zero at the Curie poi"
tags: [settled, "swek-engine", v2558]
timestamp: v2558
---

# The blob dies of uniform heat, not of heat

- **Status:** settled  
- **Since:** v2558

## Prediction

Keith: 'Can we bake it? In a sun? Does it have to die?' PREDICTION: heating pulls v2554's Rosensweig threshold in BOTH directions at once -- M(T) falls toward zero at the Curie point, but sigma(T) falls too, which LOWERS the bar. M falls like a critical exponent while sigma just slides, so M should lose the race and THE SPIKES SHOULD DIE STRICTLY BELOW THE CURIE POINT, with the fluid still magnetic. And the blob should NOT die of heat at all -- only of UNIFORM heat.

## Why

Web-verified (Elveflow/MAMI review): 'As the temperature exceeds the Curie temperature the ferrofluid LOSES ITS NET MAGNETIZATION. An applied thermal gradient thus results in a NON-UNIFORM MAGNETIZATION and the ferrofluid will experience a body force, THE KELVIN BODY FORCE, inducing a fluid flow along the thermal gradient. THIS THERMOMAGNETIC CONVECTION CAN DRIVE THE FERROFLUID WITHOUT A PUMP.' Love et al.'s magnetocaloric pump is the mechanism: cold fluid is pulled into the magnet, heats, its attraction weakens, and COOLER FLUID DISPLACES IT. A heat engine with no moving parts.

## Measured

THE SPIKES DIE AT 552.8 K -- 47.2 K BELOW the Curie point (600 K) -- WITH 5.61 kA/m STILL IN THE FLUID. It does not stop being magnetic; IT STOPS BEING MAGNETIC ENOUGH. (At 293 K: M 14.31 vs M_c 6.71. At 580 K: M 3.65 vs M_c 5.45 -- the bar fell from 6.71 to 5.45 and M still lost.) AND IT DOES NOT HAVE TO DIE: a sun on ONE SIDE gives Kelvin drive 7.51e+3 N/m^3 and it CIRCULATES; a HOTTER sun pumps HARDER (1.45e+4 -- the hot side has more magnetism to lose); baked EVENLY at 500 K the drive is EXACTLY 0 and it is DEAD -- at a temperature where it still has 8.16 kA/m and still spikes. THE ENGINE IS NOT THE HEAT. THE ENGINE IS THE DIFFERENCE.

## Kill condition

Show a temperature where the spikes survive above the Curie point (impossible in this model -- M is exactly 0 there), or a uniform-temperature configuration that still circulates. Either would mean the Kelvin force is not the driver. The sharper kill: the real M(T) of a superparamagnetic ferrofluid is Langevin, not mean-field beta=0.5 -- swap the curve and the 552.8 K number moves. IF THE SPIKE DEATH STOPS BEING BELOW T_c UNDER A LANGEVIN CURVE, the ordering claim is wrong and only the convection half survives.

# Citations

- Code: simulation/ferroThermal.js + ferroThermal-selfcheck.mjs (13 checks, gated). HONEST LIMIT: this is v2554's 1D linear-stability model with T-dependent coefficients bolted on. IT IS NOT A FERROHYDRODYNAMICS SOLVER AND IT DOES NOT INTEGRATE A CONVECTION CELL -- it computes the Kelvin force that would drive one, the threshold that kills the spikes, and WHICH HAPPENS FIRST. Nothing here selects hexagons and nothing here simulates a flow. NOT WIRED TO blobulator.html.
- Page: `/blobulator.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
