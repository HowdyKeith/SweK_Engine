# Putting VoxelEngine on GitHub

It's a monorepo — WebGLEngine (engine + ai-bridge), the VBA* projects, PetFBI,
KPop Listener, HomeAssistant, TaskerBridge, etc. all under one root. One repo
holds the whole thing fine; the folder layout carries over as-is.

## 1. One-time tooling
- git: https://git-scm.com/downloads
- (optional) GitHub CLI `gh`: https://cli.github.com/ — lets you create the repo from the terminal.

## 2. Initialize from the project root
The root is the folder that contains `WebGLEngine\`, `VBATransmitter\`, `PetFBI\`, etc.
Drop the included `.gitignore` there first, then:

```
cd C:\EngineProject
git init
git add .
git commit -m "Initial commit: VoxelEngine multi-runtime portfolio"
```

The `.gitignore` keeps out `node_modules`, the per-tool venvs, build zips,
runtime caches (board/counts/queue JSON), and anything secret-shaped
(app passwords, `~/.voxelbridge` copies).

## 3. Create the GitHub repo + push
With `gh` (one line):
```
gh repo create voxelengine --private --source=. --remote=origin --push
```

Or manually — make an empty repo on github.com, then:
```
git remote add origin https://github.com/<you>/voxelengine.git
git branch -M main
git push -u origin main
```

## Notes / safety
- Start **private**. Secrets live in `~/.voxelbridge` (outside the tree and gitignored),
  but private is the safe default until you've confirmed history is clean.
- Sanity check before the first push:
  `git ls-files | findstr /i "voxelbridge password apppw .env"` should return nothing.
- GitHub rejects single files over 100 MB. Your sample GLBs (~200 KB) are fine.
  If you later add big models (`.onnx`, large `.glb`), use Git LFS:
  `git lfs install` then `git lfs track "*.onnx"` and commit the `.gitattributes`.
- ComfyUI (`C:\VoxelBAK\...`) is a separate install — leave it out of the repo.
- The engine reaches the bridge at `http://localhost:8787`, so a fresh clone just
  needs `npm install` in `WebGLEngine\ai-bridge` and a `START_*.bat` to run.
