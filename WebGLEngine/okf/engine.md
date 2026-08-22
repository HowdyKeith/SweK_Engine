---
type: system
title: SweK Engine
description: "A multi-runtime WebGL2/WebGPU/Node LAN portfolio engine with a verify-gate ship ritual."
tags: ["swek-engine", v3200]
timestamp: v3200
---

# SweK Engine

A multi-runtime WebGL2 / WebGPU / Node engine, shipped as numbered builds through a hard-fail verify gate. Its differentiator is verification discipline: nothing ships that a gate has not checked.

## What this bundle contains

- [/claims/index.md](/claims/index.md) -- 240 falsifiable claims (203 settled, 28 open, 9 broken), each with the measurement that supports it and the condition that would prove it wrong.
- [/components/index.md](/components/index.md) -- the engine's subsystems, each pinned to real code and linked to its claims.
- [/docs/index.md](/docs/index.md) -- round-by-round design notes.
- [/log.md](/log.md) -- version history.

## The one law

A control that cannot fail is decoration. Every claim here carries a kill condition for that reason.
