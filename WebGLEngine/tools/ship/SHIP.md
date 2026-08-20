# SHIP.md — the SweK Engine ship ritual (codified)

Every version ships by the same ritual. Doing it by hand caused three real failures (a mislabeled build,
a nested fork in the zip, a blanked changelog). The steps below fold in `tools/ship/changelog.mjs` (atomic,
ASCII-guarded) and `tools/ship/verify.mjs` (hard-fail gate) so those failures cannot recur. Follow in order.

## 0. Know the base
Never re-implement a prior version from memory. Work from the latest zip Keith has (see `SESSION_START.md`).
Never reuse a version number — always supersede forward.

## 1. Edit
Make changes in the sandbox work dir `/tmp/w/EngineProject_vNNNN/WebGLEngine`.

## 2. Bump the version marker
```
sed -i 's/const ENGINE_VERSION = "vNNNN"/const ENGINE_VERSION = "vMMMM"/' WebGLEngine/main.js
```
The verify gate FAILS if this doesn't match the version you claim to ship — that's the guard against the
"old code wearing a new label" failure.

## 3. Changelog — ASCII-only, atomic
Write the BACKLOG entry and the TODO line to temp files, then:
```
node WebGLEngine/tools/ship/changelog.mjs --backlog /tmp/backlog-entry.md --todo /tmp/todo-line.md
```
It rejects any non-ASCII char (names it + shows context), backs up first, verifies the file grew, and
restores on any error. A bad changelog can no longer blank BACKLOG.md. Keep entries ASCII: no emoji, no
smart quotes, no en/em dashes — use `-`, `->`, plain quotes.

## 4. Strip volatile state before zipping
`rm -rf` the excluded cell-tracking subdirs (`test_data viz volumes src/__pycache__`) so they don't ride in.

## 5. Rename the work dir to the new version, then zip
```
mv /tmp/w/EngineProject_vNNNN /tmp/w/EngineProject_vMMMM
cd /tmp/w && zip -q -r /mnt/user-data/outputs/EngineProject_vMMMM.zip EngineProject_vMMMM --exclude <the standard list>
```
Standard exclusions: node_modules, asset_library, vendor/{xterm,go2rtc,hls}, *.apk, .kpop-wav,
incoming-updates, .update-backups, *.swekupdate.json, the per-box state JSONs (drive/gmail/tvnotify/
ha.config/whisper/cftunnel/remote-visitors/cam-shares/maps/postiz/languagetool/peer-rvz/kaggle/rustdesk),
ocis/, map-tiles/, tts-out/, admin-pw.txt, tombstones, cell-tracking heavy dirs, __pycache__, **nested
EngineProject_v\* folders AND their zips**. (vendor/htmx + vendor/wasm DO ship; root *.jpg DOES ship.)

## 6. Run the gate — do NOT present_files until it is ALL GREEN
```
cd /tmp/w/EngineProject_vMMMM/WebGLEngine
node tools/ship/verify.mjs --version vMMMM --markers "marker1,marker2" --zip /mnt/user-data/outputs/EngineProject_vMMMM.zip
```
Checks: version marker matches; no nested EngineProject forks in tree; check.mjs syntax OK; HTML div
balance; BACKLOG/TODO non-empty; optional feature markers present; zip has a single project root + sane size.
Exit 0 = ship. Exit 1 = STOP and fix.

## 7. present_files + trim
Only after ALL GREEN: `present_files` the zip. Then keep only the 2 newest zips:
```
ls -t /mnt/user-data/outputs/EngineProject_v*.zip | tail -n +3 | xargs rm -f
```

## 8. Refresh STATUS.md (do this before the zip, in step 5's tree)
Regenerate the living state file so the next session reads current state, not stale:
```
node WebGLEngine/tools/ship/status.mjs                    # preserves the manual "## Next" block
node WebGLEngine/tools/ship/status.mjs --next /tmp/next.md # or replace "## Next" from a file
```
It rewrites the version, the recent-shipped list, and the auto-extracted RIG-PENDING checklist from BACKLOG.
Run it after the changelog prepend (step 3) so it picks up the new entry, and before the zip so STATUS ships.

## Harmless noise to ignore
`index.html references missing: ./intro.mp4` from check.mjs is expected.
