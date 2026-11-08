# gputaskman: an install page, and a one-button session that starts an Ollama model, takes GPU snapshots and saves one JSON file (UNNUMBERED; 2026-11-08)

Keith, 2026-11-08: "let's add a install link/page to swek engine that installs gputaskman. can we have swek also start the model, run gputaskman, save snapshot, and give me the json to send to you?" -- after asking whether `github.com/shanselman/gputaskman` could be used, and while trying to see a local model (Qwen3.8-27B, then a coding model) on a GTX 1080 whose 8 GB cannot hold it.

**This is a tool, not a study.** Nothing here is registered and nothing is a result: it measures a machine. What it is for is to put real numbers beside the question "does this model fit this card, and what does it cost when it does not": how much of the model sits in VRAM and how much spills into system memory, how fast it generates, and what else is using the GPU.

## 1. What exists, read from the sources and not recalled

* **gputaskman** (github.com/shanselman/gputaskman, MIT; README read 2026-11-08, not run): "An `htop` for what's inside your GPU, not just how full it is", "Early, experimental software". A Python terminal UI with a CLI: `--once`, `--json` (one snapshot; unavailable counters are `null`, not zero), `-i`, `--gpu N`, `--list-gpus`, `--no-host`, and a `diff` subcommand. Windows 10/11 (WDDM counters, NVML for NVIDIA, ADL for AMD), Linux and WSL (NVIDIA; AMD on native Linux), macOS Apple Silicon (from a clone). **Intel GPUs are not supported.** Installable with `uv tool install gputaskman` or `pipx install gputaskman` (Python 3.11 or newer); unsigned portable archives are on its releases page (the capture showed none). It reports per-process local GPU memory, "Spill" (GPU-accessible system RAM), an estimated non-resident commit, engine activity, detected runtimes (CUDA, HIP, Vulkan, Direct3D, ggml, ONNX Runtime) and, for language models, weights, KV-cache and compute-buffer estimates from GGUF math. **The README describes no importable library, and does not describe the shape of `--json`.**
* **The bridge's pattern for opt-in installs** (`ai-bridge/mlxInstallBridge.js`, read): a module required by `server.js`, one line a route, every process and network call injectable so a gate can drive every branch. `privatelm.html` (f17f8416) is the precedent for the page, the `server.html` link, the two indexes and `tools/ship/pageSections.mjs`.
* **Ollama** exposes `/api/version`, `/api/tags`, `/api/ps` (each loaded model with `size` and `size_vram`: the split between VRAM and everything else, from Ollama itself) and `/api/generate` (an EMPTY prompt loads a model; `keep_alive` 0 unloads it; the reply carries `eval_count`, `eval_duration`, `prompt_eval_*`, `load_duration`).

## 2. What was built (new files, and the lines added to three existing ones)

| file | what it is |
|---|---|
| `ai-bridge/gpuTaskManBridge.js` | the bridge side: `detect`, `install`, `snapshot`, `nvidiaSmi`, `hostInfo`, the Ollama calls, `runSession`, and the jobs wrapper `startSession` / `jobStatus` |
| `ui/gpuTaskManClient.mjs` | the page logic, pure: install choices, status lines, the session body, polling, the plain-words summary |
| `gputaskman.html` | the opt-in page: 1 what is on this machine, 2 install, 3 start a model and take the snapshots, 4 the JSON to send (copy, download) |
| `tools/ship/gpuTaskManBridge-selfcheck.mjs`, `tools/ship/gpuTaskManClient-selfcheck.mjs` | the two gates (the second also runs the page's own script against a fake DOM) |
| `ai-bridge/server.js` | one `require` and five route lines |
| `server.html`, `tools/ship/pageSections.mjs`, `page-index.json`, `launch-index.json` | the link, the drawer entry (eleven of fifteen), the two generated indexes |

**The five routes** (all JSON; only the named fields are passed on from a request body): `GET /gputaskman/status`; `POST /gputaskman/install` `{method}` where method is `uv` or `pipx` and nothing else; `POST /gputaskman/snapshot` `{gpu}`; `POST /gputaskman/session` `{model, base, numPredict, settleMs, unloadWhenDone}` (returns a job id); `GET /gputaskman/job?id=`.

**The session, in order:** detect (what is installed, whether Ollama answers and has the model) -> baseline snapshot (gputaskman `--once --json` and an `nvidia-smi` query, if each exists) -> load the model through Ollama's HTTP API -> `/api/ps` and a snapshot with the model resident -> a short generation (the fixed prompt, 200 tokens unless changed) with `/api/ps` and a snapshot taken WHILE it runs (after a 2.5 s settle) -> `/api/ps` after -> optional unload. One file: `brain/rig-results/gpu-snapshots/gpusnap-<time>-<model>.json`. A session that fails part-way still saves what it has (a baseline with Ollama down is still worth sending).

**What the JSON holds:** `schema`, `kind: "gputaskman-session"`, the start and finish times, `ok` and `error`, the request (model, the Ollama address, tokens, the fixed prompt), `host` (OS, release, architecture, CPU model and count, total and free memory in GB, the Node version), `ollama` (version, whether the model was already pulled, load time in ms, `/api/ps` after the load, during the generation and after it, the generation's own timings and rates), `gputaskman` (found, working, its GPU list), `snapshots.baseline|loaded|busy` (gputaskman's JSON, stored as it comes), `nvidiaSmi.baseline|loaded|busy`, `steps` (a log with times), `summary` (model size, GB in VRAM, percent on the GPU, tokens per second, load seconds).

## 3. Using it (cmd, on the rig)

1. Start the engine's bridge as usual (default port 8787), open `http://localhost:8787/gputaskman.html` (or the **gputaskman** link in `server.html`).
2. **Check this machine.** It reads uv, pipx, Python, gputaskman and Ollama.
3. **Install with uv** (or pipx). If gputaskman installs but the page still says it cannot find it, restart the bridge from a NEW terminal: uv and pipx add `~/.local/bin` to the PATH for new shells only (the bridge also looks in `~/.local/bin` itself).
4. Type the model exactly as `ollama list` shows it (pull it first with `ollama pull <name>` if needed; Ollama must be running: the Windows app starts it). Press **Start the model, run gputaskman, save a snapshot**. A large model can take minutes to load; the progress box shows each step.
5. When it finishes the JSON is in the box, saved in `brain/rig-results/gpu-snapshots/`, and can be copied or downloaded. **Look at it, then send it: gputaskman lists the programs using the GPU.** The file holds no host name, user name or path of its own.

## 4. Safety properties (each held by a gate row)

* `install` runs one of two fixed argument vectors chosen by name from a frozen table; any other string (`__proto__` and `constructor` included) is refused with no command run. No command goes through a shell (`execFile`, `shell: false`).
* The only Ollama this module will talk to is a loopback one (`127.0.0.1`, `localhost`, `[::1]`; no credentials, no path); a LAN address is refused before a request is made.
* The saved file's name is built from a timestamp and the model name with everything outside `[A-Za-z0-9._-]` replaced; it cannot leave its folder.
* `--gpu` takes a whole number 0 to 63 and nothing else.
* **Said plainly:** the bridge has no origin check (it never had one: `Access-Control-Allow-Origin: *`), so any web page open in the same browser can ask it to run these routes. What they can do is fixed and small (install one named package with a named tool, load a model into a local Ollama, run gputaskman, write one JSON file into one folder), and it is the same exposure as `/mlx/install` and `/mlx/pull`. The package comes from PyPI through uv or pipx, unpinned and unscanned.

## 5. NOT DONE, NOT CHECKED, said plainly

* **It has not run against a real gputaskman, a real Ollama or a real GPU.** The sandbox has none. What was run: the gates (every command, request, clock, timer, file system and OS faked), and one end-to-end smoke with the REAL module, the REAL route lines pulled out of `server.js`, REAL child processes (shell scripts standing in for `gputaskman`, `nvidia-smi` and `uv`) and a REAL HTTP server on loopback standing in for Ollama. That smoke passed; it proves the plumbing, not the programs.
* **The shape of `gputaskman --json` is not described in its README**, so the snapshots are stored exactly as printed (a banner before the JSON is skipped). If the first real snapshot is not what is expected, that is the first thing to look at.
* **Windows is untested.** The code looks for `gputaskman` on the PATH and then in `~/.local/bin` (with `.exe`), tries `python`, `python3` and `py` for the version (the Microsoft Store stub for `python` exits non-zero and is skipped), and runs `nvidia-smi` by name. None of that has seen a Windows machine.
* **A model with thinking on by default** will spend part of the generation's tokens thinking; the speed figure counts tokens either way, and the saved reply head shows what came back. The fixed prompt and 200 tokens are a probe of speed, not of quality.
* **The session does not start Ollama and does not pull weights;** it says so and says how.
* The generation request, if the session is interrupted part-way, keeps running inside Ollama until it ends; the bridge does not cancel it.

## 6. The gates and their sabotage

`tools/ship/gpuTaskManBridge-selfcheck.mjs` (257 rows; 0.1 s) and `tools/ship/gpuTaskManClient-selfcheck.mjs` (120 rows, about 2 s, with the page's script RUN against a fake DOM and a stub bridge). Mutation sweeps in isolated trees, logged in the gates' headers: **the bridge module 4 sweeps of about 540 mechanical mutants each, ending at 29 survivors, each argued equivalent in the header; the client file 161 mutants, 5 survivors, argued; the page 45 hand mutants, 0 survivors.** What the sweeps found is worth the line it takes here: four faults in the module itself (a failed file save left `ok: true` beside an error; another tag of the same model could be taken for the one asked about; `--gpu` accepted `[1]` and `true`; a host that would not name itself could reject the whole session), and a weakness in the first version of the gate (every "nothing was run" row used a fake that throws, which the module's own error handling swallows, so a mutant that DID make the call passed; the rows now count calls).
Neighbouring gates run and green after the page joined the indexes: pageIndex, launchIndex, pagePlacement, orphanScan, goLinkStyle.
