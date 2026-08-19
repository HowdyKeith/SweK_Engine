# SESSION_START.md — read this first, every SweK session

The sandbox `/tmp` is wiped between sessions. The single most expensive failure on record was rebuilding a
version from memory (v878) while Keith's real machines were on a later one (v882) — a whole session's tree
had to be discarded. This protocol prevents that. It costs 30 seconds.

## The four rules

1. **Confirm the live version before building anything.** The first action of a SweK session is to establish
   what Keith is actually running. Ask, or read it from the zip he provides. Do not assume the number in an
   old transcript is current — versions move fast (10+/session).

2. **Work only from Keith's actual zip.** Rebuild the tree from the latest `EngineProject_vNNNN.zip` he
   uploads. Never re-implement a prior version's changes from memory to "catch up" — that path created the
   discarded-tree incident.

3. **Never reuse a version number.** If a shipped build was wrong, supersede FORWARD to a new number. Two
   builds with the same number but different bytes is exactly what jams the peer auto-update fleet-wide.

4. **End with a handoff.** When wrapping up, state the newest version shipped and what changed, so the next
   session (or Keith) knows the current base without guessing.

## First-action checklist
- [ ] Read `STATUS.md` (project root) — the living state: current version, what shipped recently, rig-pending.
- [ ] What version is Keith on? (confirm, don't assume)
- [ ] Have his zip in `/tmp/w/EngineProject_vNNNN/`? Unzip + confirm `main.js` ENGINE_VERSION matches.
- [ ] Read `WebGLEngine/tools/ship/SHIP.md` before the first ship.
- [ ] Wiring an external tool this session? Read `docs/VERIFY_EXTERNAL.md` first.

## Handoff template (session end)
```
Newest shipped: vMMMM  (zip present_files'd)
Changed: <one line per feature/fix>
Open / needs Keith's rig: <rig-only items>
Next: <the ranked next thing>
```
