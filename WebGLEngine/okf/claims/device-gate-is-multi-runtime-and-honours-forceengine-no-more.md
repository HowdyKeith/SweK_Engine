---
type: claim
title: "Device gate is multi-runtime and honours forceEngine -- no more false 'no WebGL2'"
description: "index.html's entry banner stops crying wolf. It offered the Simple view and said 'this device can\\'t run the 3D engine (no WebGL2)' on a machine that runs WebGL2 fine -- because it"
tags: [settled, "swek-engine", v2728]
timestamp: v2728
---

# Device gate is multi-runtime and honours forceEngine -- no more false 'no WebGL2'

- **Status:** settled  
- **Since:** v2728

## Prediction

index.html's entry banner stops crying wolf. It offered the Simple view and said 'this device can\'t run the 3D engine (no WebGL2)' on a machine that runs WebGL2 fine -- because it probed a detached throwaway canvas, only checked WebGL2, ignored WebGPU, and did not honour the forceEngine override at all. Now the probe sizes its canvas and releases the context it opens, the gate accepts WebGL2 OR WebGPU since the engine is multi-runtime, and forceEngine=1 bypasses the banner outright.

## Why

index.html early inline script. forced is read from the query string; the WebGL2 probe runs on a 2x2 canvas and calls WEBGL_lose_context to avoid leaking a context into the pool the real render draws from; hasWebGPU checks navigator.gpu; canEngine is the OR of the two; limited is gated behind !forced so the override wins. The banner was always advisory -- it never blocked the engine, which draws on an attached canvas exactly like the working krbn-compare pane -- but a false 'can\'t run' scares a capable user onto the lightweight view.

## Measured

A WebGPU-capable laptop that renders the krbn-compare WebGL2 pane (confirmed by screenshot) was being shown the no-WebGL2 banner and could not override it with forceEngine=1. After the fix: forceEngine=1 suppresses the banner; a device with WebGPU but a flaky detached-canvas WebGL2 probe reads as engine-capable; the probe no longer leaks its context. The inline script parses; the engine entry path is unchanged.

## Kill condition

Open index.html?forceEngine=1 on any device: the banner must not appear. On a WebGPU-only or WebGL2-flaky-probe device, the 'can\'t run' message must not show when the engine can in fact run. HONEST SCOPE: this fixes the DETECTION and the override; if a specific device genuinely cannot create a render context, the engine still needs it -- the gate now errs toward letting capable devices through rather than turning them away.

# Citations

- Code: index.html entry banner: forceEngine bypass + WebGL2-or-WebGPU multi-runtime probe + sized, released probe canvas. The gate now trusts the multi-runtime engine and the user's explicit override.
- Page: `index.html`
- Recorded in [/index.md](/index.md) of the SweK Engine OKF bundle, generated from predictions.html.
