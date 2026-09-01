// FILE: ui/installPanel.js
// VERSION: v1 — round 338
//
// One-stop reference for the local AI pipeline the engine talks to.
// Surfaces every tool, custom node, python package, model file, and
// code patch a user has to wire up to get the full pipeline running:
// ComfyUI + Trellis 2 + Ollama + the Node bridge.
//
// What the panel shows for each item:
//   - Name + one-line purpose
//   - Status pill: "online" / "offline" / "unknown" / "installed" / "missing"
//   - Action buttons: Copy Command, Mark Installed, Verify, Set Path
//   - Expanded details with the exact PowerShell command, file path, or
//     code-patch snippet
//
// The panel is intentionally pragmatic. A browser can't probe the user's
// disk, so for filesystem items it relies on a "marked installed"
// toggle persisted to localStorage. For network-pingable items
// (ComfyUI, Ollama, the bridge) it actually fetches a health URL on
// demand and flips the pill. The user can re-verify any time.
//
// The data here is the user's hard-won install knowledge: every dep
// that broke on Windows + every workaround (fake-triton folder, try/
// except wraps, the "Xet pointer" download trap, the dual trellis-2.0
// vs TRELLIS.2-4B-FP8 folder requirement, etc).

const LS_KEY = "voxelengine.installPanel.v1";

// ---------------------------------------------------------------------------
// Canonical item catalog.
//
// Sectioned by category. Each item:
//   id       — unique string (keys into localStorage state)
//   category — "runtime" | "node" | "python" | "model" | "patch" | "flag"
//   name     — short label shown in the row
//   purpose  — single-sentence explanation of why it matters
//   ping     — optional URL to GET for status (200 = online, else offline)
//   cmds     — array of shell commands (each one becomes a copyable block)
//   path     — destination filesystem path the user puts files into
//   src      — source URL (HuggingFace page, GitHub repo)
//   patch    — code-snippet content for patch items
//   file     — file path the patch applies to
//   notes    — extra warnings (the "Xet pointer" trap, dual folder need)
//   genFile  — { name, label, content } → renders a ⬇ button that downloads
//              `content` as `name` (e.g. a generated build script)
// ---------------------------------------------------------------------------

// build_diso.bat — written out by the ⬇ button on the py-diso row.
// Transcribed from a VERIFIED build log (diso\_C.pyd loaded: "Success!"),
// then parameterised. Run it from the "x64 Native Tools Command Prompt for VS"
// (it also calls vcvars64.bat itself). The ONLY non-verbatim part is the nvcc
// -I/-D set in step 1 — reconstructed from ComfyUI-3D-Pack's own printed build
// line; if nvcc reports a missing include, copy 3D-Pack's exact -I/-D flags.
const BUILD_DISO_BAT = `@echo off
REM ============================================================
REM  build_diso.bat  —  manual diso (Dual Marching Cubes) build
REM  Target: VS BuildTools 18 / MSVC 14.51 + CUDA 12.6, Pascal sm_61 (GTX 10xx)
REM  Why manual: CUDA 12.6 nvcc rejects MSVC 14.51 (host_config.h); the
REM  --allow-unsupported-compiler bypass then crashes cudafe++ (0xC0000005),
REM  and the automated pip path fails too. This forces the older MSVC 14.44
REM  toolset for the .cu files, drops _WINDLL on pybind.cpp, and links
REM  torch_python.lib — the combination that actually produced a working .pyd.
REM  Run from C:\\diso_manual (the diso repo root, with src\\ + diso\\).
REM ============================================================

call "C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Auxiliary\\Build\\vcvars64.bat"

set "PythonEmbed=C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded"
set "TorchInc=%PythonEmbed%\\Lib\\site-packages\\torch\\include"
set "CudaInc=C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.6\\include"
set "CudaLib=C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.6\\lib\\x64"
set "NVCC=C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.6\\bin\\nvcc.exe"
set "CCBIN=C:\\Program Files (x86)\\Microsoft Visual Studio\\18\\BuildTools\\VC\\Tools\\MSVC\\14.44.35207\\bin\\Hostx64\\x64"

echo [1/4] nvcc compile cumc.cu + cudualmc.cu  (forcing MSVC 14.44 via -ccbin)
REM  -I/-D set reconstructed from 3D-Pack's printed nvcc line; adjust if needed.
"%NVCC%" -c src\\cumc.cu     -o cumc.obj     -ccbin "%CCBIN%" --allow-unsupported-compiler -Isrc -I"%TorchInc%" -I"%TorchInc%\\torch\\csrc\\api\\include" -I"%CudaInc%" -I"%PythonEmbed%\\include" -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_BFLOAT16_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ -D_GLIBCXX_USE_CXX11_ABI=0 -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=_C -Xcompiler /EHsc -Xcompiler /MD --expt-relaxed-constexpr -gencode=arch=compute_61,code=sm_61 -std=c++17 || goto :err
"%NVCC%" -c src\\cudualmc.cu -o cudualmc.obj -ccbin "%CCBIN%" --allow-unsupported-compiler -Isrc -I"%TorchInc%" -I"%TorchInc%\\torch\\csrc\\api\\include" -I"%CudaInc%" -I"%PythonEmbed%\\include" -D__CUDA_NO_HALF_OPERATORS__ -D__CUDA_NO_HALF_CONVERSIONS__ -D__CUDA_NO_BFLOAT16_CONVERSIONS__ -D__CUDA_NO_HALF2_OPERATORS__ -D_GLIBCXX_USE_CXX11_ABI=0 -DTORCH_API_INCLUDE_EXTENSION_H -DTORCH_EXTENSION_NAME=_C -Xcompiler /EHsc -Xcompiler /MD --expt-relaxed-constexpr -gencode=arch=compute_61,code=sm_61 -std=c++17 || goto :err

echo [2/4] cl compile pybind.cpp  (NOTE: do NOT define _WINDLL)
cl.exe /c src\\pybind.cpp /Fopybind.obj /O2 /std:c++17 /MD /DWITH_CUDA /Isrc /I"%TorchInc%" /I"%TorchInc%\\torch\\csrc\\api\\include" /I"%PythonEmbed%\\include" /I"%CudaInc%" /D_GLIBCXX_USE_CXX11_ABI=0 /DTORCH_EXTENSION_NAME=_C /DTORCH_API_INCLUDE_EXTENSION_H || goto :err

echo [3/4] link _C.pyd  (with torch_python.lib)
if not exist diso mkdir diso
link.exe /DLL /OUT:diso\\_C.pyd pybind.obj cumc.obj cudualmc.obj /LIBPATH:"%PythonEmbed%\\libs" /LIBPATH:"%PythonEmbed%\\Lib\\site-packages\\torch\\lib" /LIBPATH:"%CudaLib%" torch.lib torch_cpu.lib torch_cuda.lib c10.lib c10_cuda.lib cuda.lib cudart.lib torch_python.lib || goto :err

echo [4/4] install into site-packages + verify import
xcopy /E /I /Y diso "%PythonEmbed%\\Lib\\site-packages\\diso"
"%PythonEmbed%\\python.exe" -c "import diso._C; print('OK loaded diso._C:', diso._C)"
echo.
echo DONE — if the line above printed "OK loaded diso._C", diso is built.
goto :eof

:err
echo.
echo *** BUILD FAILED at the step above. Read the compiler output. ***
echo If it is host_config.h / unsupported MSVC: confirm the 14.44.35207 path in CCBIN exists.
echo If nvcc reports a missing include: copy the exact -I/-D flags from 3D-Pack's printed nvcc line.
exit /b 1
`;
// ---------------------------------------------------------------------------
const ITEMS = [
    // === RUNTIMES (network-pingable) ===
    {
        id: "ollama", category: "runtime", name: "Ollama",
        specs: { sizeGB: 1, estMin: [3, 8], platforms: ["win32", "darwin", "linux"], note: "+ model pulls (GBs each)" },
        purpose: "Local LLM server — used for narrative, OBJ generation, diffuser prompts",
        ping: "http://127.0.0.1:11434/api/tags",
        cmds: [
            "# Install the Ollama binary via the tool-ollama row (winget / OllamaSetup.exe).",
            "# Then pull a model (Ollama auto-runs as a service on 11434):",
            "ollama pull llama3:8b",
        ],
        notes: "Default port 11434. The engine reaches Ollama via window.ollama.*. To install Ollama itself, run the 'Ollama (binary install)' tool row.",
    },
    {
        id: "personaplex", category: "runtime", name: "NVIDIA PersonaPlex (voice persona)",
        specs: { sizeGB: 14, estMin: [15, 40], platforms: ["win32", "linux"], note: "7B weights; NVIDIA GPU + CUDA; HF token" },
        purpose: "Real-time full-duplex speech-to-speech model (Moshi/Helium, NVIDIA, Jan 2026). One model does ASR+LLM+TTS in a single pass, conditioned on a VOICE prompt + a TEXT persona prompt (role/background). The engine hands off the current avatar as that text prompt via /personaplex/persona.",
        ping: "https://127.0.0.1:8998",
        timeoutMs: 1800000,
        cmds: [
            "# 1) clone the repo (MIT code; weights under the NVIDIA Open Model license)",
            "git clone https://github.com/NVIDIA/personaplex.git",
            "cd personaplex",
            "# 2) Opus dev lib is required. Linux: sudo apt install libopus-dev. Windows: install Opus (e.g. via vcpkg/conda) so the codec is on PATH.",
            "# 3) install (it's a Moshi fine-tune; the package lives in the moshi/ subdir):",
            "pip install moshi/.",
            "# 4) accept the model license at https://huggingface.co/nvidia/personaplex-7b-v1, then:",
            "set HF_TOKEN=<YOUR_HUGGINGFACE_TOKEN>   # PowerShell: $env:HF_TOKEN='<token>'",
            "# 5) launch the WebUI server (temporary self-signed SSL). Web UI then at https://localhost:8998 :",
            "python -m moshi.server --ssl %TEMP%\\pplex_ssl",
            "# 8GB Pascal (1070/1080): a 7B full-duplex model will likely NOT fit in 8GB - add --cpu-offload (needs `pip install accelerate`):",
            "python -m moshi.server --ssl %TEMP%\\pplex_ssl --cpu-offload",
        ],
        notes: "Speech-to-speech, NOT a text-chat provider (so it is not an aiProviders.chat() backend - it has its own WebUI on :8998). RIG CONCERN: PersonaPlex is a 7B real-time full-duplex model; on a Pascal GTX 1070/1080 (8GB, no bf16) expect to need --cpu-offload, and real-time turn-taking may be marginal - offline mode (`python -m moshi.offline ...`) processes a WAV without real-time constraints and is the safe fallback. Voices: NATF0-3 / NATM0-3 / VARF0-4 / VARM0-4. Persona handoff: the engine builds a text persona prompt from the current avatar at GET /personaplex/persona - copy it into the WebUI's text-prompt box. The bridge does NOT auto-launch it (a CUDA server would block this process); run the launch line in your own shell.",
    },
    {
        id: "comfyui", category: "runtime", name: "ComfyUI (Portable on Win / MPS on Mac)",
        specs: { sizeGB: 5, estMin: [15, 30], platforms: ["win32", "darwin"], note: "Win: multi-GB .7z (needs 7-Zip). Mac: git clone + venv + pip (MPS)" },
        purpose: "Image diffusion + Trellis 2 image-to-3D pipeline",
        ping: "http://127.0.0.1:8188/system_stats",
        timeoutMs: 1800000,
        cmds: [
            "$root='C:\\VoxelBAK\\ComfyUI_windows_portable'; if (Test-Path ($root+'\\run_nvidia_gpu.bat')) { Write-Host ('ComfyUI portable already present at '+$root+' - skipping so your torch 2.11/cu126 sm_61 build is preserved'); exit 0 }; $dl='C:\\VoxelBAK\\Downloads'; New-Item -ItemType Directory -Force -Path $dl | Out-Null; $h=@{ 'User-Agent'='voxelengine' }; $rel=Invoke-RestMethod 'https://api.github.com/repos/comfyanonymous/ComfyUI/releases/tags/latest' -Headers $h; $asset=($rel.assets | Where-Object { $_.name -like '*windows_portable_nvidia*.7z' } | Select-Object -First 1); if (-not $asset) { Write-Host 'no nvidia portable 7z in the latest release - check https://github.com/comfyanonymous/ComfyUI/releases'; exit 1 }; $out=$dl+'\\'+$asset.name; Write-Host ('downloading '+$asset.name+' ~'+[math]::Round($asset.size/1GB,2)+' GB -> '+$out); Invoke-WebRequest $asset.browser_download_url -OutFile $out -Headers $h; $7z=(Get-Command 7z.exe -ErrorAction SilentlyContinue); if ($7z) { Write-Host 'extracting with 7-Zip...'; & $7z.Source x $out ('-o'+$dl) -y; Write-Host ('extracted under '+$dl+' - if this is a fresh install, move the ComfyUI_windows_portable folder to C:\\VoxelBAK') } else { Write-Host ('downloaded to '+$out+' - install 7-Zip first (run the 7-Zip tool row), then extract it and place ComfyUI_windows_portable at C:\\VoxelBAK') }",
        ],
        cmdsMac: [
            "D=\"$HOME/ComfyUI-mac\"; if [ -d \"$D/.git\" ]; then echo \"ComfyUI already at $D - skipping clone\"; else mkdir -p \"$D\" && git clone https://github.com/comfyanonymous/ComfyUI.git \"$D\"; fi",
            "D=\"$HOME/ComfyUI-mac\"; [ -d \"$D/venv\" ] || python3 -m venv \"$D/venv\"; \"$D/venv/bin/pip\" install --upgrade pip && \"$D/venv/bin/pip\" install torch torchvision torchaudio && \"$D/venv/bin/pip\" install -r \"$D/requirements.txt\" && echo \"ComfyUI Mac deps installed\"",
            "echo \"ComfyUI (Mac/MPS) ready. RUN: cd ~/ComfyUI-mac && ./venv/bin/python main.py  then open http://127.0.0.1:8188 . ComfyUI 0.26.0+ has built-in Krea 2 - use bf16/GGUF (Metal has no fp8). If step 2 timed out, re-run this row (idempotent) or run the pip lines in Terminal.\"",
            "D=\"$HOME/ComfyUI-mac\"; MPS=$(\"$D/venv/bin/python\" -c 'import torch; print(torch.backends.mps.is_available())' 2>/dev/null); echo \"MPS available: $MPS\"; [ \"$MPS\" = \"True\" ] || echo \"MPS not active - for full Apple-Silicon accel run: $D/venv/bin/pip install --pre torch torchvision torchaudio --extra-index-url https://download.pytorch.org/whl/nightly/cpu (official ComfyUI Mac nightly)\"",
        ],
        notes: "v482: install is wired. IDEMPOTENT — skips if your C:\\VoxelBAK build already exists, so it NEVER clobbers your hand-tuned torch 2.11/cu126 sm_61 environment. Pulls the OFFICIAL Comfy-Org portable .7z via the GitHub API (version-proof). Multi-GB — best run in your own PowerShell; needs 7-Zip (run the 7-Zip tool row first). The bridge cannot auto-LAUNCH ComfyUI (would block this process). LAUNCH line (note the CORS flag — without it the engine hits 403s fetching assets across ports): C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -s C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\main.py --windows-standalone-build --lowvram --force-fp16 --enable-cors-header *  (see flag-launch for the full 8GB-Pascal incantation). v1596 MAC PATH (cmdsMac, runs on darwin): idempotent git clone -> ~/ComfyUI-mac, python3 venv, pip torch/torchvision/torchaudio (MPS-enabled stock wheels) + requirements.txt. Heavy pip step — if the bridge's 30-min cap kills it, just re-run the row (idempotent) or finish the pip lines in Terminal. LAUNCH on Mac: cd ~/ComfyUI-mac && ./venv/bin/python main.py (runs on MPS; ComfyUI 0.26.0+ has built-in Krea 2 — use bf16/GGUF, Metal has no fp8).",
    },
    {
        id: "bridge", category: "runtime", name: "Asset Pipeline Bridge",
        purpose: "Node.js orchestrator: routes between SweK Engine, ComfyUI, Ollama",
        ping: "/asset-pipeline/status",
        cmds: [
            "# In the bridge folder:",
            "node server.js",
        ],
    },
    {
        id: "tool-bun", category: "runtime", name: "Bun (JS runtime)",
        specs: { sizeMB: 90, estMin: [1, 2], platforms: ["win32", "darwin", "linux"] },
        purpose: "Fast Node-compatible JS runtime. The ai-bridge can run under Bun (START_BUN.bat or Settings \u2192 Runtime 'prefer Bun'), and the Discord voice path prefers Bun-friendly pure-JS libs. Installs to %USERPROFILE%\\.bun via the vendored official installer. Idempotent.",
        src: "https://bun.sh",
        checkPath: "%USERPROFILE%\\.bun\\bin\\bun.exe",
        cmds: [
            "# Idempotent: skips if 'bun' is already on PATH.",
            "# Runs the vendored official installer at ai-bridge/installers/bun-install.ps1.",
            "# After install, restart the bridge so PATH is picked up, then flip the Bun toggle in Settings \u2192 Runtime.",
        ],
        notes: "MIT license. Installs per-user (no admin). bun.exe lands in %USERPROFILE%\\.bun\\bin and is added to your user PATH; a running bridge won't see it until restarted.",
    },

    // === CUSTOM NODES (filesystem) ===
    {
        id: "node-manager", category: "node", name: "ComfyUI-Manager",
        purpose: "Auto-installs other custom nodes, dependency UI inside ComfyUI",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes",
            "git clone https://github.com/ltdrdata/ComfyUI-Manager.git",
        ],
    },
    {
        id: "node-trellis2", category: "node", name: "ComfyUI-Trellis2",
        specs: { sizeGB: 10, estMin: [20, 45], platforms: ["win32"], note: "incl. Dinov3 ViT-L/16 model" },
        purpose: "Image → 3D mesh + PBR textures (THE big one — needs Python deps + patches + weights)",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes",
            "# Download ComfyUI-Trellis2-main as zip and extract here",
            "# OR clone if a fork is available",
            "# Then apply patches (see Code Patches section) before launching",
        ],
        notes: "Hard-codes flash_attn + flex_gemm + triton on Linux — on Windows/GTX you MUST apply the try/except patches.",
    },
    {
        id: "tool-triposplat", category: "tool", name: "TripoSplat (standalone)",
        purpose: "Image → 3D Gaussian splats (.ply/.splat). NOT an LLM — flow-matching diffusion model. Standalone (no ComfyUI needed), two-file repo (~2000 LOC), near-zero deps. Clones to C:\\VoxelBAK\\TripoSplat.",
        path: "C:\\VoxelBAK\\TripoSplat",
        src: "https://github.com/VAST-AI-Research/TripoSplat",
        checkPath: "C:\\VoxelBAK\\TripoSplat\\triposplat.py",
        cmds: [
            "$root='C:\\VoxelBAK\\TripoSplat'; if (-not (Test-Path ($root+'\\triposplat.py'))) { git clone https://github.com/VAST-AI-Research/TripoSplat.git $root } else { Write-Host 'already cloned, skipping' }",
        ],
        notes: "MIT license. June 2026 release. Sm_61/Pascal compatibility not verified by VAST-AI but the 'near-zero deps' design (no transformers, no diffusers) makes it likely to work — verify by running run_example.py after model-triposplat downloads the weights.",
    },
    {
        id: "py-triposplat", category: "python", name: "TripoSplat Python deps", requiredIf: "tool-triposplat",
        purpose: "numpy + safetensors + pillow + tqdm — installed into ComfyUI's python_embeded so torch is shared with the existing 2.11/cu126/sm_61 build.",
        cmds: [
            "& C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install numpy safetensors pillow tqdm",
        ],
        notes: "torch + torchvision come from the ComfyUI portable already.",
    },
    {
        id: "model-triposplat", category: "model", name: "TripoSplat weights (HF: VAST-AI/TripoSplat)", requiredIf: "tool-triposplat",
        purpose: "Checkpoint weights for TripoSplat. Auto-downloaded via huggingface_hub.snapshot_download into C:\\VoxelBAK\\TripoSplat\\ckpts\\.",
        path: "C:\\VoxelBAK\\TripoSplat\\ckpts\\",
        src: "https://huggingface.co/VAST-AI/TripoSplat",
        cmds: [
            "# auto-installs huggingface_hub if missing, then snapshot_download into ckpts/",
            "& C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install huggingface_hub",
            "& C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -c \"from huggingface_hub import snapshot_download; snapshot_download(repo_id='VAST-AI/TripoSplat', local_dir=r'C:\\VoxelBAK\\TripoSplat\\ckpts')\"",
        ],
        notes: "File count + total size not pre-verified — VAST-AI/TripoSplat HF repo is days old. If snapshot_download fails: fall back to `hf download VAST-AI/TripoSplat --local-dir ckpts/` from a shell in C:\\VoxelBAK\\TripoSplat.",
    },
    {
        id: "tool-meshflow", category: "tool", name: "MeshFlow (artist meshes)",
        purpose: "Image / point-cloud → artist-like 3D mesh in ~1s. MeshVAE + flow-matching diffusion transformer (DiT), continuous geometry with explicit verts/edges — good for downstream 3D workflows. FacebookResearch, CVPR 2026. Clones to C:\\VoxelBAK\\meshflow.",
        path: "C:\\VoxelBAK\\meshflow",
        src: "https://github.com/facebookresearch/meshflow",
        checkPath: "C:\\VoxelBAK\\meshflow\\inference_dit.py",
        cmds: [
            "$root='C:\\VoxelBAK\\meshflow'; if (-not (Test-Path $root)) { git clone https://github.com/facebookresearch/meshflow.git $root } else { Write-Host 'already cloned, skipping' }",
        ],
        notes: "checkPath (inference_dit.py) is a best-guess from the repo's docs — verify the actual entry script after cloning. Sm_61/Pascal caveat: it's a DiT with torch.compile (recommended) and defaults to bf16 — Pascal has NO bf16, so run with --dtype fp16 (or fp32) and expect torch.compile to be the risky bit on a 1070/1080. Image conditioning needs DINOv3 configured (optional).",
    },
    {
        id: "py-meshflow", category: "python", name: "MeshFlow Python deps", requiredIf: "tool-meshflow",
        purpose: "Installs MeshFlow's requirements.txt into ComfyUI's python_embeded so it shares the existing torch 2.11/cu126/sm_61 build (avoids a second multi-GB torch).",
        cmds: [
            "$py='C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe'; $req='C:\\VoxelBAK\\meshflow\\requirements.txt'; if (Test-Path $req) { & $py -m pip install -r $req } else { Write-Host 'no requirements.txt found — check the repo for its dependency list' }",
        ],
        notes: "Honest: the exact dep list isn't pre-verified here. If requirements.txt pins a torch/cuda that conflicts with the shared 2.11/cu126 build, install with --no-deps for torch-adjacent lines or edit the file first. DINOv3 (for --ref_image conditioning) is a separate model download.",
    },
    {
        id: "model-meshflow", category: "model", name: "MeshFlow checkpoint bundle", requiredIf: "tool-meshflow",
        purpose: "config.yaml + model.pth placed under ckpt/meshflow/ (required before inference). Follow the repo's checkpoint instructions for the exact source.",
        path: "C:\\VoxelBAK\\meshflow\\ckpt\\meshflow\\",
        src: "https://github.com/facebookresearch/meshflow",
        cmds: [
            "$d='C:\\VoxelBAK\\meshflow\\ckpt\\meshflow'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Write-Host 'Created ckpt\\meshflow\\. Download config.yaml + model.pth into it per the repo README (HF repo id not hard-coded here on purpose — verify it).'",
        ],
        notes: "Placeholder by design — the repo's README says to download a checkpoint bundle (config.yaml + model.pth) into ckpt/meshflow/, but the exact HF/download URL should be confirmed from facebookresearch/meshflow rather than guessed. Once you have the repo id, a `hf download <id> --local-dir ckpt/meshflow` finishes it.",
    },
    {
        id: "py-triposplat-gradio", category: "python", name: "TripoSplat Gradio UI (optional)", optional: true,
        purpose: "pip install gradio so you can run TripoSplat's bundled run_gradio.py web UI for interactive image→splat.",
        cmds: [
            "& C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install gradio",
        ],
    },
    {
        id: "node-triposplat-workflow", category: "node", name: "TripoSplat ComfyUI workflow", optional: true,
        purpose: "Drop the official Comfy-Org workflow template into ComfyUI so TripoSplat appears under workflow templates. Reuses standard ComfyUI nodes (no custom node) — but needs model-dinov3 + model-triposplat-flux2-vae auxiliary models to actually run.",
        path: "ComfyUI\\user\\default\\workflows\\3d_triposplat_image_to_gaussian_splat.json",
        src: "https://github.com/Comfy-Org/workflow_templates/blob/main/templates/3d_triposplat_image_to_gaussian_splat.json",
        cmds: [
            "$wf='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\user\\default\\workflows'; New-Item -ItemType Directory -Force -Path $wf | Out-Null; $url='https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/3d_triposplat_image_to_gaussian_splat.json'; Invoke-WebRequest $url -OutFile ($wf+'\\3d_triposplat_image_to_gaussian_splat.json') -UseBasicParsing",
        ],
        notes: "Standalone TripoSplat (tool-triposplat) is the simpler path — only needs the 4 base entries. This workflow path is for users who prefer the ComfyUI node-graph UX over CLI/Gradio.",
    },
    {
        id: "model-triposplat-flux2-vae", category: "model", name: "FLUX.2 VAE (for TripoSplat ComfyUI workflow)", requiredIf: "node-triposplat-workflow", optional: true,
        purpose: "FLUX.2 VAE — image encoding VAE used by the TripoSplat ComfyUI workflow for conditioning alignment. Bundled inside the VAST-AI/TripoSplat HF repo (download via model-triposplat first, then copy).",
        path: "ComfyUI\\models\\vae\\flux2_vae.safetensors",
        src: "https://huggingface.co/VAST-AI/TripoSplat",
        cmds: [
            "# Manual: after running model-triposplat, look in C:\\VoxelBAK\\TripoSplat\\ckpts\\ for the *vae* file",
            "# and copy it to C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\vae\\flux2_vae.safetensors",
        ],
        notes: "Manual until the exact filename in VAST-AI/TripoSplat's release is confirmed (repo is days old, no file inventory verified). DINOv3 ViT-H (model-dinov3) is the other auxiliary — already in the catalog from Trellis 2 work.",
    },
    {
        id: "node-essentials", category: "node", name: "ComfyUI_essentials",
        specs: { sizeMB: 150, estMin: [1, 3], platforms: ["win32"] },
        purpose: "Image resize, mask, composite — required to feed Trellis a 512x512 input",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes",
            "git clone https://github.com/cubiq/ComfyUI_essentials.git",
        ],
    },
    {
        id: "node-layerdiffuse", category: "node", name: "ComfyUI-layerdiffuse",
        purpose: "Transparent-background generation — Trellis needs no-bg input",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes",
            "git clone https://github.com/huchenlei/ComfyUI-layerdiffuse.git",
            ".\\python_embeded\\python.exe -m pip install -r .\\ComfyUI\\custom_nodes\\ComfyUI-layerdiffuse\\requirements.txt",
        ],
    },
    {
        id: "node-gguf", category: "node", name: "ComfyUI-GGUF",
        purpose: "Quantized model loading (FP8, GGUF). Optional but speeds VRAM-tight rigs",
    },
    {
        id: "node-flowty-crm-clone", category: "node", name: "Flowty-CRM (1/3) — git clone",
        purpose: "Alternative image-to-3D path (CRM model). Step 1: clone repo into custom_nodes/",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ComfyUI-Flowty-CRM')) { git clone https://github.com/jtydhr88/ComfyUI-Flowty-CRM.git } else { Write-Host 'already cloned, skipping' }",
        ],
    },
    {
        id: "node-flowty-crm-req", category: "node", name: "Flowty-CRM (2/3) — requirements.txt",
        purpose: "Step 2: install base Python deps (open-clip-torch, timm, ftfy, etc)",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-Flowty-CRM; & C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install -r requirements.txt",
        ],
    },
    {
        id: "node-flowty-crm-cuda", category: "node", name: "Flowty-CRM (3/3) — requirements-cuda.txt (THE last step)",
        purpose: "Step 3: install CUDA deps AFTER neutralizing the nvdiffrast git-build line (we already installed the wheel)",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-Flowty-CRM; (Get-Content requirements-cuda.txt) -replace '^(\\s*git\\+https://github\\.com/NVlabs/nvdiffrast.*)$','# $1' | Set-Content requirements-cuda.txt; & C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install -r requirements-cuda.txt",
        ],
        notes: "v470: the OLD '--ignore-installed nvdiffrast' approach FAILED — requirements-cuda.txt line 1 is 'git+https://github.com/NVlabs/nvdiffrast', which forces a source build that errors with 'No matching distribution'. The flag can't skip it. This command first comments out that git line (idempotent — won't double-comment), then installs the rest. Pre-req: install py-nvdiffrast (the wheel) FIRST. v473: if this dies on '[WinError 5] Access is denied: cv2.pyd', ComfyUI is running and locking the file — close ComfyUI, run the OpenCV reset step above, then rerun this.",
    },
    // v341 — splat-capable image-to-3D pipelines. Hunyuan3D and Flowty-CRM
    // both export .ply Gaussian splats; TripoSR exports a mesh (NOT splats)
    // but is a popular fast alternative.
    {
        id: "node-3d-pack", category: "node", name: "ComfyUI-3D-Pack",
        purpose: "Bundle of 3D nodes — depth-to-3D, mesh ops, splat utilities. Needs pyhocon dep",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ComfyUI-3D-Pack')) { git clone https://github.com/MrForExample/ComfyUI-3D-Pack.git } else { Write-Host 'already cloned, skipping' }",
        ],
        notes: "After clone, run the py-pyhocon item to install the missing dep that prevents this from loading.",
    },
    {
        id: "node-triposr", category: "node", name: "ComfyUI-Flowty-TripoSR",
        purpose: "Fast image-to-mesh (NOT splat). Optional alternative to Trellis2 for plain GLB output",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ComfyUI-Flowty-TripoSR')) { git clone https://github.com/flowtyone/ComfyUI-Flowty-TripoSR.git } else { Write-Host 'already cloned, skipping' }",
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install -r C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-Flowty-TripoSR\\requirements.txt",
        ],
    },
    {
        id: "node-hunyuan3d", category: "node", name: "ComfyUI-Hunyuan3DWrapper",
        purpose: "Tencent Hunyuan3D — image-to-3D incl. Gaussian splat output (.ply)",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ComfyUI-Hunyuan3DWrapper')) { git clone https://github.com/kijai/ComfyUI-Hunyuan3DWrapper.git } else { Write-Host 'already cloned, skipping' }",
        ],
        notes: "Hunyuan3D is a splat-capable path. Outputs .ply to ComfyUI/output/ — drop into the engine via window.splat.load('http://127.0.0.1:8188/view?filename=foo.ply').",
    },
    {
        id: "node-hitem3d", category: "node", name: "comfyui-hitem3d",
        purpose: "HiTem3D (Hi3D) image-to-3D — Sparc3D+Ultra3D, watertight OBJ/GLB/FBX/STL. The engine's HiTem3D fallback rung drives this node.",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'comfyui-hitem3d')) { git clone https://github.com/GeekatplayStudio/comfyui-hitem3d.git } else { Write-Host 'already cloned, skipping' }",
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install -r C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\comfyui-hitem3d\\requirements.txt",
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\comfyui-hitem3d\\setup_wizard.py",
        ],
        notes: "Wrapper calls the HiTem3D Open Platform API server-side, so it needs your Access/Secret keys in config.json (the setup_wizard step writes them). Watertight meshes voxelize cleanly — ideal for this engine. Once installed + ComfyUI is up, the live pipeline auto-discovers the node and uses it after Trellis.",
    },
    {
        id: "node-ultrashape", category: "node", name: "ComfyUI-UltraShape (optional refiner)",
        purpose: "UltraShape 1.0 (PKU-YuanGroup) — refines a coarse mesh into high-detail geometry via 2-stage diffusion. Hahihula's ComfyUI wrapper.",
        checkPath: "ComfyUI\\custom_nodes\\ComfyUI-UltraShape",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ComfyUI-UltraShape')) { git clone https://github.com/hahihula/ComfyUI-UltraShape.git } else { Write-Host 'already cloned, skipping' }",
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-UltraShape; git submodule update --init --recursive",
            "$root='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-UltraShape'; $req=$null; if (Test-Path ($root+'\\requirements.txt')) {$req=$root+'\\requirements.txt'} elseif (Test-Path ($root+'\\ultrashape_repo\\requirements.txt')) {$req=$root+'\\ultrashape_repo\\requirements.txt'}; if ($req) { & 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install -r $req } else { Write-Host 'no requirements.txt found' }",
        ],
        notes: "⚠ OPTIONAL + HEAVY, and a marginal fit for your 8GB card. UltraShape's own docs say 12GB minimum, 16–20GB recommended — on a GTX 1080 expect to run it at low octree_resolution + low_vram mode or it OOMs. NOTE: requirements.txt lives in the ultrashape_repo submodule (handled above). It also depends on py-cubvh (source build → run py-embed-headers first) and the model-ultrashape weights, and the upstream repo targets torch 2.5.1/cu121. Trellis2's own remesh/refine nodes are the saner refiner on 8GB. ComfyUI Manager → search 'UltraShape' handles deps more gracefully than raw git.",
    },
    {
        // v688 — Pixal3D (TencentARC, packaged by Saganaki22). Image-to-3D
        // with textured GLB export. Repo: github.com/Saganaki22/Pixal3D-ComfyUI.
        // Note the unusual spelling — "Pixal" not "Pixel" — matches TencentARC.
        // requirements.txt installs only safe python pkgs; Torch / FlashAttn /
        // Triton / CUDA kernels are NOT auto-installed (they must match the
        // exact Python+PyTorch+CUDA+GPU combo). The install.py --check step is
        // critical — it surfaces what's missing for the user to fix manually.
        id: "node-pixal3d", category: "node", name: "ComfyUI-Pixal3D",
        purpose: "TencentARC Pixal3D — image-to-3D with textured GLB export. Manual camera control, FlashAttention 2/3 toggle, low-VRAM modes (hybrid_low_vram / native_low_vram) suitable for 8GB cards.",
        checkPath: "ComfyUI\\custom_nodes\\Pixal3D-ComfyUI",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'Pixal3D-ComfyUI')) { git clone https://github.com/Saganaki22/Pixal3D-ComfyUI.git } else { Write-Host 'already cloned, skipping' }",
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install -r 'C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\Pixal3D-ComfyUI\\requirements.txt'",
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\Pixal3D-ComfyUI; & 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' install.py --check",
        ],
        notes: "After install, restart ComfyUI then run 'Pixal3D Environment Check' node BEFORE loading the model — it tells you which Torch/FlashAttn/Triton/CUDA pieces are missing for YOUR rig. MoGe geometry-estimator files go in ComfyUI\\models\\geometry_estimation\\ (the wrapper handles this automatically on first run). On 8GB GTX 1080, set vram_mode=hybrid_low_vram in the Pixal3D Image-To-3D node — that's what the wrapper authors recommend for sub-12GB cards. Outputs textured GLB; pairs well with Trellis2 / TripoSR / Hunyuan3D as another image-to-3D rung. Wrapper does NOT install Torch/FlashAttn/Triton automatically because those wheels must match your exact Python+CUDA — same caveat as Trellis2.",
    },
    {
        // v691 — Qwen-Image (Alibaba Tongyi Qianwen). 20B-param MMDiT image
        // gen with industry-leading text rendering (esp. bilingual / CJK).
        // The full HM-RunningHub variant needs 24GB VRAM; AIFSH's wrapper
        // is the 8GB-friendly path via mmgp ("mixed memory GPU") quantized
        // weights — explicitly advertised as VRAM>=8GB on the AIFSH repo.
        id: "node-qwen-image", category: "node", name: "QwenImage-ComfyUI (8GB-friendly)",
        purpose: "Alibaba Qwen-Image — 20B MMDiT diffusion model with industry-leading text rendering, especially Chinese/multilingual. AIFSH's wrapper exposes mmgp-quantized weights that run on 8GB cards (vs. 24GB for the full RH variant).",
        checkPath: "ComfyUI\\custom_nodes\\QwenImage-ComfyUI",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'QwenImage-ComfyUI')) { git clone https://github.com/AIFSH/QwenImage-ComfyUI.git } else { Write-Host 'already cloned, skipping' }",
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install -r 'C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\QwenImage-ComfyUI\\requirements.txt'",
        ],
        notes: "REQUIRES three model files placed manually — the wrapper does NOT auto-download because files are ~10GB total and hosted on quark.cn (Chinese cloud drive): (1) qwen_image_transformer_mmgp.safetensors → ComfyUI\\models\\diffusion_models\\ (2) qwen_image_text_encoder_mmgp.safetensors → ComfyUI\\models\\text_encoders\\ (3) the wrapper auto-fetches anything else from HuggingFace on first run, keep network open. Quark.cn URLs are in the repo README. There's also a 5x distilled variant: qwen_image_transformer_step_15_cfg_1_mmgp.safetensors — same target folder, ~10s on a 4090 / 60-90s on a 1080. LoRA loading supported. On 8GB GTX 1080 expect 60-120s/image at 1024² + ~16GB system RAM usage. Best-in-class text rendering for in-game signage / UI text bitmaps.",
    },
    {
        // v691 — Z-Image (Alibaba Tongyi-MAI, Dec 2025 → Jan 2026 release).
        // 6B-param foundation model that claims to rival 20B competitors at
        // a fraction of the VRAM. Released checkpoint Tongyi-MAI/Z-Image-Turbo
        // on HuggingFace 2026-01-27. Three variants: Turbo (distilled, fast),
        // Base (full quality), Edit (image-to-image instructions).
        id: "node-z-image", category: "node", name: "Z-Image-Turbo (6B, low-VRAM image gen)",
        purpose: "Alibaba Tongyi-MAI Z-Image-Turbo — 6B distilled image gen claimed to rival 20B competitors at 1/4 the VRAM. Sub-second on H800, ~15-30s on a 1080. Strong bilingual text rendering. Variants: Turbo (fast distilled), Base (full), Edit (image-to-image instruction following).",
        checkPath: "ComfyUI\\models\\diffusion_models\\z-image",
        cmds: [
            "$dst='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\diffusion_models\\z-image'; New-Item -ItemType Directory -Force -Path $dst | Out-Null; & 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -c \"from huggingface_hub import snapshot_download; snapshot_download(repo_id='Tongyi-MAI/Z-Image-Turbo', local_dir=r'C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\diffusion_models\\z-image')\"",
            "Write-Host 'Z-Image-Turbo weights downloaded to ComfyUI\\models\\diffusion_models\\z-image\\.'",
            "Write-Host 'Native ComfyUI node integration is upstream-tracked — see github.com/Tongyi-MAI/Z-Image for the current path (HF Diffusers pipeline today; dedicated ComfyUI node likely soon).'",
        ],
        notes: "Released Jan 27 2026 as Tongyi-MAI/Z-Image-Turbo on HuggingFace. As of this write, no first-party ComfyUI custom node exists yet — easiest path today is the HF Diffusers pipeline. The ENGINE's diffuser bridge (port :9000) already speaks Diffusers natively, so Z-Image can drive directly into the engine WITHOUT going through ComfyUI at all. Paper claims <16GB VRAM compatibility with Turbo; on 8GB expect hybrid offload + 15-30s/image. Major win over Qwen-Image for the 1080: 6B vs 20B means faster inference + lower RAM pressure. Compare-and-contrast: stable-diffusion-1.5 (lightest, fastest, baseline quality) → Z-Image-Turbo (best quality/speed ratio for 8GB) → Qwen-Image (heaviest, slowest, best text rendering).",
    },
    {
        // v693 — Apple LiTo (ICLR 2026, Surface Light Field Tokenization).
        // Single image → 3D with view-dependent lighting (specular highlights,
        // Fresnel reflections preserved across viewing angles). Apple's
        // research team claims it outperforms TRELLIS on lighting consistency.
        // Repo: github.com/apple/ml-lito. Linux+NVIDIA: full support (verified
        // A100/H100/B200). macOS Apple Silicon: interactive demo only via MLX.
        // On Windows: experimental — needs xformers + FlashAttn + PyTorch3D.
        id: "node-lito", category: "node", name: "Apple LiTo (image → 3D with realistic lighting)",
        purpose: "Apple ml-lito (ICLR 2026) — single-image-to-3D with view-dependent appearance (specular, Fresnel). Claimed to outperform TRELLIS on lighting consistency. 4.7s per generation on H100 after torch compile.",
        checkPath: "ComfyUI\\custom_nodes\\ml-lito",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes; if (-not (Test-Path 'ml-lito')) { git clone https://github.com/apple/ml-lito.git } else { Write-Host 'already cloned, skipping' }",
            "Write-Host 'NOTE: Apple LiTo is NOT a native ComfyUI node — clone is for the engine to know where the code lives. Run inference via the repo''s demo script or the Kaggle template (kaggle_templates/lito.js). Windows install path is experimental — the repo verifies on Linux A100/H100/B200. xformers + flash-attn + PyTorch3D builds on Win10/CUDA12.8 may need iteration.'",
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install -q xformers flash-attn --no-build-isolation || Write-Host 'xformers/flash-attn install failed — LiTo will fall back to SDPA attention (slower).'",
        ],
        notes: "ICLR 2026 paper by Chang, Zhao, Chan, Tuzel at Apple. Key innovation: encodes geometry + view-dependent appearance into a shared latent space, so reflections/Fresnel/specular highlights stay consistent across viewing angles (other image-to-3D models often produce flat plastic-looking surfaces). On your 8GB GTX 1080, this is BORDERLINE — the paper benchmarks on H100, and the model needs PyTorch3D + xformers + FlashAttn which compile slowly on Windows. Recommended path: use the Kaggle template (kaggle_templates/lito.js, T4 16GB) instead of local install. The local-clone entry exists so the engine can scan the codebase for asset paths if you experiment, but real inference is much smoother on Kaggle.",
    },
    {
        // v693 — Realiz3D (arXiv 2605.13852, March 2026). Photo-realistic
        // 3D-consistent diffusion via domain-aware learning. Sobol et al.
        // NOT a single-image-to-3D — it's a framework for training/inference
        // of diffusion models that decouples control signals from synthetic
        // visual domain. Two flagship applications: text-to-multiview and
        // texturing-from-3D-inputs. The texturing use case is what's most
        // useful for the engine — takes a mesh + text prompt, returns PBR
        // textures that look photo-realistic instead of synthetic-rendered.
        id: "node-realiz3d", category: "node", name: "Realiz3D (photo-realistic texturing of 3D meshes)",
        purpose: "Realiz3D (Sobol et al. arXiv 2026) — diffusion-based framework that decouples geometry/control from synthetic visual domain. For this engine: useful as a TEXTURING pass for meshes generated by Trellis2/Pixal3D/LiTo — produces photo-realistic textures instead of the plastic-CG look common in image-to-3D outputs.",
        checkPath: "ComfyUI\\custom_nodes\\realiz3d",
        cmds: [
            "Write-Host 'Realiz3D status: published March 2026 (arXiv 2605.13852). Looking for an official code release on the authors'' GitHub.'",
            "Write-Host 'Search at https://github.com/search?q=Realiz3D or check the paper''s project page for current release status.'",
            "Write-Host 'When the repo URL is confirmed, this entry will be updated to clone + install it. For now this is a PLACEHOLDER row in the catalog — does nothing until the upstream is published.'",
        ],
        notes: "PLACEHOLDER pending official code release. The paper (Realiz3D: 3D Generation Made Photorealistic via Domain-Aware Learning) was posted to arXiv as 2605.13852 — code link not confirmed yet. **Different use case from Trellis2/Pixal3D/LiTo** — Realiz3D's flagship applications are text-to-multiview generation and TEXTURING existing 3D meshes. Most useful for this engine as a 'photo-realism upgrade' pass after generating a mesh via the image-to-3D rung. Add this after geometry is settled, not as a replacement for the geometry generators.",
    },
    {
        // v693 — Hyper3D Rodin V2 (Deemos Tech, October 2025). COMMERCIAL
        // REST API — not a local model. 10B params, BANG architecture.
        // Same shape as the engine's existing HiTem3D integration (API
        // call, server-side inference, results downloaded). Two ways to
        // access: WaveSpeedAI's REST endpoint OR fal.ai's hosted version
        // (~$0.40/image). Both require an API key. Strong on production-
        // ready outputs: clean topology, quad meshes, UV-unwrapping, PBR.
        id: "node-rodin", category: "node", name: "Hyper3D Rodin V2 (commercial API, image OR text → 3D)",
        purpose: "Deemos Tech Hyper3D Rodin V2 — 10B-param commercial 3D generation API. Single image OR text prompt → production-ready GLB with clean topology, UVs, and PBR textures. Quad or triangle meshes; polycount tiers selectable. NOT a local model — REST API access (WaveSpeedAI or fal.ai).",
        checkPath: "ai-bridge\\rodin.config.json",
        cmds: [
            "Write-Host 'Rodin is a COMMERCIAL REST API — no local install required. Setup is a one-time API key write.'",
            "Write-Host 'Step 1: sign up at https://hyper3d.ai/ OR https://wavespeed.ai/ OR https://fal.ai/ — pick whichever provider you prefer.'",
            "Write-Host 'Step 2: paste your API key + provider into ai-bridge\\rodin.config.json (the engine reads this at startup; same pattern as the engine''s HiTem3D config).'",
            "Write-Host 'Step 3: the engine''s Rodin client will be wired into the AAS pipeline in a future round — for now, the catalog row exists so you know how to access it.'",
        ],
        notes: "Cost: roughly $0.40/image on fal.ai. Pricing tiers vary by provider — WaveSpeedAI vs fal.ai vs direct from Hyper3D.AI. Like HiTem3D, this is an API-based path (no GPU on YOUR rig, no GPU on Kaggle — Deemos owns the compute). Strong on PRODUCTION-READY outputs: quad meshes for sculpting/rigging, triangle meshes for game-ready, T/A-pose toggle for characters. The architecture (10B BANG) is bigger than open-source alternatives but the meshes are noticeably cleaner — proper topology vs. the marching-cubes blobs that local models often produce. Best slot in your pipeline: when you NEED clean topology (rigging, retopology, sculpting) and free open-source isn't producing it. The engine doesn't have a bridge for Rodin yet — adding one is a similar shape to the existing HiTem3D bridge code.",
    },

    // === PYTHON PACKAGES (in python_embeded) ===
    {
        id: "py-trimesh", category: "python", name: "trimesh",
        specs: { sizeMB: 40, estMin: [1, 2], platforms: ["win32", "darwin", "linux"] },
        purpose: "OBJ/GLB mesh loading. Required by Trellis2 nodes.py",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable",
            ".\\python_embeded\\python.exe -m pip install trimesh",
        ],
    },
    {
        id: "py-pymeshlab", category: "python", name: "pymeshlab",
        specs: { sizeMB: 300, estMin: [2, 5], platforms: ["win32", "darwin", "linux"] },
        purpose: "Mesh cleanup (remove floaters, decimate). Required by Trellis2",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable",
            ".\\python_embeded\\python.exe -m pip install pymeshlab",
        ],
    },
    {
        id: "py-meshlib", category: "python", name: "meshlib",
        purpose: "Mesh decimation engine. Required by Trellis2 for mesh simplification",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable",
            ".\\python_embeded\\python.exe -m pip install meshlib",
        ],
    },
    {
        id: "py-imageio", category: "python", name: "imageio + opencv + easydict",
        purpose: "Image I/O + tensor utilities. Trellis2 needs these for input processing",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable",
            ".\\python_embeded\\python.exe -m pip install easydict imageio[ffmpeg] opencv-python",
        ],
        notes: "If 'Access is denied' on cv2.pyd, kill all python.exe first: Stop-Process -Name python -Force",
    },
    {
        id: "py-nvdiffrast", category: "python", name: "nvdiffrast (pre-compiled wheel)",
        purpose: "Differential rasterization. Source build wants CUDA_HOME — install this pre-built wheel instead",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install https://github.com/v8hid/nvdiffrast-wheels/releases/download/v0.3.1/nvdiffrast-0.3.1-py3-none-any.whl",
        ],
        notes: "v470: switched to the v8hid wheel (the HF Surn/HexaGrid 0.3.3 URL stopped resolving). Install this BEFORE node-flowty-crm-cuda. If it ever 404s, the last resort is the try/except patch in nodes.py line 41.",
    },
    {
        id: "py-opencv-reset", category: "python", name: "OpenCV reset (fix cv2.pyd lock)",
        purpose: "Fixes [WinError 5] Access denied on cv2.pyd during Flowty-CRM — flushes conflicting opencv variants, reinstalls headless",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip uninstall -y opencv-python opencv-contrib-python opencv-python-headless opencv-contrib-python-headless",
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install opencv-python-headless==4.9.0.80 opencv-contrib-python-headless==4.9.0.80",
        ],
        notes: "⚠ CLOSE COMFYUI COMPLETELY FIRST (check Task Manager for stray python.exe). [WinError 5] on cv2.pyd isn't a permission bug — a running ComfyUI has the compiled binary locked in memory, so pip can't overwrite it. With the engine cold, this uninstalls the four opencv variants that fight over the cv2 namespace, then reinstalls the headless versions Flowty-CRM pins (4.9.0.80).",
    },
    {
        id: "py-opencv-force", category: "python", name: "OpenCV reset — FORCE (cv2 lock won't release)",
        purpose: "Last resort when py-opencv-reset still hits WinError 5: kills stray python.exe, deletes the locked cv2 folder, reinstalls",
        cmds: [
            "taskkill /f /im python.exe 2>$null; Remove-Item -Recurse -Force 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\Lib\\site-packages\\cv2' -ErrorAction SilentlyContinue; Write-Host 'killed stray python.exe + cleared locked cv2 folder'; exit 0",
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install --no-cache-dir opencv-python-headless==4.9.0.80 opencv-contrib-python-headless==4.9.0.80",
        ],
        notes: "⚠ AGGRESSIVE — kills EVERY python.exe on the machine (ComfyUI included), then force-deletes the locked cv2 folder so pip can write a fresh copy. Only reach for this if the regular OpenCV reset still throws [WinError 5] because an orphaned python worker is holding cv2.pyd. The bridge (Node) survives; any python you care about does not. Save your work first.",
    },
    {
        id: "py-trellis2-wheels", category: "python", name: "Trellis2 native extensions (prebuilt wheels)", optional: true,
        purpose: "Auto-detect your torch version and install visualbruno's matching prebuilt native-extension wheels (cumesh, nvdiffrast, nvdiffrec_render, flex_gemm, o_voxel)",
        cmds: [
            "$raw=(& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -c 'import torch;print(torch.__version__)').Trim(); $tv=(($raw -split '\\+')[0] -replace '\\.',''); $base='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes\\ComfyUI-Trellis2-main\\wheels\\Windows'; $dir=$base+'\\Torch'+$tv; Write-Host ('torch '+$raw+' -> '+$dir); if (Test-Path $dir) { & 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install (Get-ChildItem ($dir+'\\*.whl') | ForEach-Object FullName) } else { Write-Host ('No wheels for Torch'+$tv+'. Available:'); Get-ChildItem $base | ForEach-Object Name }",
        ],
        notes: "✅ Auto-detects your torch version and picks the matching wheels\\Windows\\Torch<NNN> folder (so it adapts instead of forcing Torch270). Your logs show torch 2.11.0 / Python 3.12 — visualbruno may not ship wheels that new; if the folder isn't there it lists what IS available. If nothing matches your torch+python ABI, either build from source (run py-embed-headers first) or just skip: your fork is a clean fork that runs on graceful fallbacks without these. CLOSE COMFYUI FIRST (.pyd files lock like cv2).",
    },
    {
        id: "py-embed-headers", category: "python", name: "Python dev headers (fix 'Python.h not found')",
        purpose: "ComfyUI portable ships Python without dev headers, so source builds (cubvh, native exts) fail on 'Cannot open include file: Python.h'. This fetches the matching include/ + libs/.",
        cmds: [
            "if (Test-Path 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\include\\Python.h') { Write-Host 'already present'; exit 0 }; $pv=(& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -c 'import sys;print(sys.version.split()[0])').Trim(); $z=$env:TEMP+'\\pyhdr_'+$pv+'.zip'; Invoke-WebRequest ('https://www.nuget.org/api/v2/package/python/'+$pv) -OutFile $z; $d=$env:TEMP+'\\pyhdr_'+$pv; Expand-Archive $z -DestinationPath $d -Force; Copy-Item ($d+'\\tools\\include') 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\include' -Recurse -Force; Copy-Item ($d+'\\tools\\libs') 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\libs' -Recurse -Force; if (Test-Path 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\include\\Python.h') { Write-Host 'OK: Python.h installed' } else { Write-Host 'FAILED — copy include + libs from a matching Python install by hand' }",
        ],
        notes: "Run this BEFORE py-cubvh (or any source build). It detects your exact embedded-python version (your logs show 3.12), downloads the matching dev headers + libs from the NuGet python package, and drops include\\ + libs\\ into python_embeded\\ where the compiler looks. Idempotent (skips if Python.h is already there). If NuGet's layout differs, the fallback is manual: install the same Python 3.12.x from python.org and copy its include\\ and libs\\ folders into python_embeded\\.",
    },
    {
        id: "py-cubvh", category: "python", name: "cubvh (UltraShape dep — source build)",
        purpose: "CUDA BVH for UltraShape's marching-cubes acceleration. No prebuilt Windows wheel — compiles from source. CONFIRMED BUILT on this rig (sm_61).",
        timeoutMs: 1200000,
        checkPath: "python_embeded\\Lib\\site-packages\\cubvh\\__init__.py",
        cmds: [
            "$bd='C:\\VoxelBAK\\Tools\\cubvh_source'; $pe='C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded'; $py=$pe+'\\python.exe'; & $py -c 'import cubvh' 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host 'cubvh already installed'; exit 0 }; if (Test-Path $bd) { Remove-Item -Recurse -Force $bd }; git clone --recursive https://github.com/ashawkey/cubvh.git $bd; if ($LASTEXITCODE -ne 0) { Write-Host 'clone failed'; exit 1 }; Set-Location $bd; git submodule update --init --recursive; $env:PATH=$pe+'\\Scripts;'+$pe+'\\Lib\\site-packages\\ninja\\data\\bin;'+$env:PATH; $env:CPATH=$pe+'\\include'; $env:INCLUDE=$pe+'\\include;'+$env:INCLUDE; $env:LIB=$pe+'\\libs;'+$env:LIB; $env:TORCH_CUDA_ARCH_LIST='6.1'; & $py -m pip install . --no-build-isolation --no-cache-dir",
        ],
        notes: "✅ CONFIRMED BUILT on this rig — _cubvh.cp312-win_amd64.pyd is in site-packages and 'import cubvh' loads. PRE-REQ: py-embed-headers first (Python.h). This row now shows green via checkPath. ⚠ VERIFIED ROOT CAUSE of the long failure saga (it was NOT the 60s timeout and NOT a submodule drop): the portable's VS BuildTools 18 ships MSVC 14.51.36231, which CUDA 12.8 nvcc rejects (host_config.h: only VS 2017–2022 supported); -allow-unsupported-compiler then crashed cudafe++. WHAT FIXED IT: a patched setup.py that forces the older MSVC 14.44.35207 toolset, injects the Windows SDK include+lib dirs, and adds SDK Bin\\<ver>\\x64 to PATH so link.exe finds rc.exe (the LNK1158 'cannot run rc.exe' error), then `python setup.py install`. The pip build here works on rigs without that MSVC-version clash; if it dies on the host_config.h error, use the setup.py recipe in your OWN PowerShell (live nvcc output, no browser hold). Builds for your sm_61 (GTX 1080).",
    },
    {
        id: "py-diso", category: "python", name: "diso (3D-Pack dep — manual source build)", manual: true,
        purpose: "Dual Marching Cubes CUDA ext (cumc.cu / cudualmc.cu) that ComfyUI-3D-Pack's install.py builds. This is the sub-build that makes node-comfy3d-pack fail. CONFIRMED BUILT MANUALLY on this rig (diso\\_C.pyd loaded).",
        timeoutMs: 1200000,
        checkPath: "python_embeded\\Lib\\site-packages\\diso\\_C.pyd",
        // ⬇ button writes this batch file out for you to run from an x64 dev prompt.
        genFile: {
            name: "build_diso.bat",
            label: ".bat",
            content: BUILD_DISO_BAT,
        },
        cmds: [
            "$pe='C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded'; $py=$pe+'\\python.exe'; & $py -c 'import diso._C' 2>$null; if ($LASTEXITCODE -eq 0) { Write-Host 'diso._C already importable - nothing to do'; exit 0 }; Write-Host 'diso must be built MANUALLY. Click the .bat button in this row to download build_diso.bat, then run it from the x64 Native Tools Command Prompt for VS. (The bridge cannot reliably run vcvars64 + nvcc inline.)'",
        ],
        notes: "⚠ MANUAL build. ROOT CAUSE (same family as py-cubvh): VS BuildTools 18 ships MSVC 14.51.36231, which CUDA 12.6 nvcc rejects (host_config.h: only VS 2017–2022); --allow-unsupported-compiler bypasses the gate but then cudafe++ crashes 0xC0000005 on the v18 headers, and the automated pip path (even vcvars64 + DISTUTILS_USE_SDK + --no-build-isolation) fails too. WHAT WORKED (transcribed from a verified build log, not re-verified here): a fully manual x64 build — nvcc the .cu files with -ccbin forced to MSVC 14.44.35207 + --allow-unsupported-compiler + -gencode sm_61; cl-compile pybind.cpp WITHOUT _WINDLL (that macro forced dllimport on torch's pybind casters → unresolved symbols); link with torch_python.lib included; copy diso\\ into site-packages. The ⬇ .bat button writes build_diso.bat with exactly that sequence. NOTE: the nvcc -I/-D flags in the .bat are reconstructed from ComfyUI-3D-Pack's printed build line — if nvcc complains about a missing include, copy the -I/-D set from 3D-Pack's own failing nvcc command.",
    },
    {
        id: "tool-ollama", category: "tool", name: "Ollama (binary install)",
        purpose: "Installs the Ollama LLM host itself. winget-first, OllamaSetup.exe fallback (per-user, no admin). After this, the Ollama server row pings 11434.",
        cmds: [
            "if (Get-Command ollama -ErrorAction SilentlyContinue) { Write-Host 'ollama already installed'; exit 0 }; if (Get-Command winget -ErrorAction SilentlyContinue) { Write-Host 'installing Ollama via winget...'; winget install -e --id Ollama.Ollama --accept-source-agreements --accept-package-agreements; exit $LASTEXITCODE }; $dl='C:\\VoxelBAK\\Downloads'; New-Item -ItemType Directory -Force -Path $dl | Out-Null; $out=$dl+'\\OllamaSetup.exe'; Write-Host 'winget not found - downloading OllamaSetup.exe from ollama.com...'; Invoke-WebRequest 'https://ollama.com/download/OllamaSetup.exe' -OutFile $out; Write-Host 'running silent per-user install (no admin needed)...'; Start-Process -FilePath $out -ArgumentList '/VERYSILENT','/NORESTART' -Wait; Write-Host 'done - open a NEW PowerShell so PATH refreshes, then: ollama --version'",
        ],
        notes: "Idempotent (skips if 'ollama' is on PATH). Ollama installs a background service that auto-starts, so 11434 comes up by itself — then use the Ollama server row to pull a model. Open a fresh shell before 'ollama --version' so PATH refreshes.",
    },
    {
        id: "tool-git", category: "tool", name: "Git + Git LFS (prereq)",
        purpose: "Git is assumed by every node clone; Git LFS is required by the HuggingFace model clones (e.g. DINOv3). Quietly assumed-but-not-installable until now.",
        cmds: [
            "$haveGit=[bool](Get-Command git -ErrorAction SilentlyContinue); $haveLfs=$false; if ($haveGit) { & git lfs version 2>$null | Out-Null; $haveLfs=($LASTEXITCODE -eq 0) }; if ($haveGit -and $haveLfs) { Write-Host 'git + git-lfs already installed'; exit 0 }; if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Host 'winget not found - install Git for Windows (includes Git LFS) from https://git-scm.com/download/win then run: git lfs install'; exit 1 }; if (-not $haveGit) { Write-Host 'installing Git...'; winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements }; if (-not $haveLfs) { Write-Host 'installing Git LFS...'; winget install -e --id GitHub.GitLFS --accept-source-agreements --accept-package-agreements }; Write-Host 'open a NEW PowerShell, then run: git lfs install'",
        ],
        notes: "winget IDs Git.Git + GitHub.GitLFS. Idempotent. After install, run 'git lfs install' once so the model-dinov3 / TRELLIS weight clones pull real LFS blobs (not 1KB pointers).",
    },
    {
        id: "tool-7zip", category: "tool", name: "7-Zip (prereq for ComfyUI extract)",
        purpose: "Extracts the ComfyUI portable .7z. The ComfyUI install row looks for 7z.exe and falls back to a manual-extract message without it.",
        cmds: [
            "if (Get-Command 7z.exe -ErrorAction SilentlyContinue) { Write-Host '7-Zip already on PATH'; exit 0 }; if (Test-Path 'C:\\Program Files\\7-Zip\\7z.exe') { Write-Host '7-Zip present at C:\\Program Files\\7-Zip (add it to PATH if a command cannot find 7z.exe)'; exit 0 }; if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { Write-Host 'winget not found - install 7-Zip from https://www.7-zip.org/download.html'; exit 1 }; Write-Host 'installing 7-Zip via winget...'; winget install -e --id 7zip.7zip --accept-source-agreements --accept-package-agreements",
        ],
        notes: "winget ID 7zip.7zip. Idempotent. winget puts 7z.exe at C:\\Program Files\\7-Zip — add that to PATH (or the comfyui row's 7z.exe lookup may miss it in a fresh shell).",
    },
    {
        id: "tool-cuda-voxelizer", category: "tool", name: "cuda_voxelizer (Forceflow) — optional alt voxelizer", optional: true,
        purpose: "Standalone GPU mesh→voxel CLI. Optional — mesh_to_vox already covers voxelizing in your pipeline.",
        checkPath: "C:\\VoxelBAK\\Tools\\cuda_voxelizer\\cuda_voxelizer.exe",
        cmds: [
            "$dir='C:\\VoxelBAK\\Tools\\cuda_voxelizer'; New-Item -ItemType Directory -Force -Path $dir | Out-Null; if (Test-Path ($dir+'\\cuda_voxelizer.exe')) { Write-Host 'already installed'; exit 0 }; $h=@{ 'User-Agent'='voxelengine' }; $rel=Invoke-RestMethod 'https://api.github.com/repos/Forceflow/cuda_voxelizer/releases/latest' -Headers $h; $asset=($rel.assets | Where-Object { $_.name -like '*.zip' } | Select-Object -First 1); if (-not $asset) { Write-Host 'no zip asset in latest release'; exit 1 }; Write-Host ('downloading '+$asset.name); $zip=$dir+'\\dl.zip'; Invoke-WebRequest $asset.browser_download_url -OutFile $zip -Headers $h; Expand-Archive $zip -DestinationPath ($dir+'\\extracted') -Force; $exe=(Get-ChildItem ($dir+'\\extracted') -Recurse -Filter 'cuda_voxelizer.exe' | Select-Object -First 1); if ($exe) { Copy-Item $exe.FullName ($dir+'\\cuda_voxelizer.exe') -Force; Write-Host ('installed -> '+$dir+'\\cuda_voxelizer.exe') } else { Write-Host 'cuda_voxelizer.exe not found in archive' }",
        ],
        notes: "Pulls Forceflow's LATEST release via the GitHub API (so it won't rot to a dead v0.x link — the doc's v0.6.1 doesn't exist; current is v0.4.10), extracts, and flattens the exe to C:\\VoxelBAK\\Tools\\cuda_voxelizer\\ — where the bridge auto-detects it (AI MODELS → ↻). ⚠ The prebuilt binary targets an OLDER CUDA; on your CUDA 12.8 box the GPU path may fail with 'cudart64_110.dll missing'. If so: add `-cpu` (CPU voxelization, slower but works), or build from source against your 12.8 (you have the toolchain). Usage: `cuda_voxelizer -f mesh.obj -s 512 -o vox` (or `-o morton` for octree feeds, add `-solid` for watertight fill). On 8GB keep -s ≤ 1024; -s 2048 OOMs (grids scale N³).",
    },
    {
        id: "node-comfy3d-pack", category: "node", name: "ComfyUI-3D-Pack (MrForExample) — image→3D suite",
        purpose: "Umbrella suite: CRM, TripoSR, Wonder3D, LGM and more in one node pack. Detects as a generator; benchmarkable once a specific 3D-Pack workflow is wired.",
        checkPath: "ComfyUI\\custom_nodes\\ComfyUI-3D-Pack\\__init__.py",
        timeoutMs: 1200000,
        cmds: [
            "$nd='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\custom_nodes'; $pe='C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded'; $py=$pe+'\\python.exe'; $dir=$nd+'\\ComfyUI-3D-Pack'; if (Test-Path ($dir+'\\__init__.py')) { Write-Host 'ComfyUI-3D-Pack already cloned' } else { Set-Location $nd; git clone https://github.com/MrForExample/ComfyUI-3D-Pack.git; if ($LASTEXITCODE -ne 0) { Write-Host 'clone failed'; exit 1 } }; Set-Location $dir; & $py -s -m pip install -r requirements.txt; & $py install.py",
        ],
        notes: "⚠ HARDEST install in the panel. Needs VS Build Tools; several sub-nodes JIT-compile CUDA exts (nvdiffrast, gaussian rasterizers, etc.) that may fail on your Pascal sm_61 + torch 2.11. The FOLDER still detects green even if some exts don't build — so the row going ready ≠ every sub-node works. Best run in your OWN PowerShell for live output (like cubvh). Overlaps generators you already detect (TripoSR, CRM). Benchmark hook is present, but head-to-head timing needs a specific 3D-Pack workflow wired — not done in this pass.",
    },
    {
        id: "node-sparc3d", category: "node", name: "Sparc3D — placeholder (no ComfyUI node yet)",
        purpose: "Image→3D, watertight 1024³. NOT installable as a ComfyUI node today — this row is honest detection that lights up IF a community node ships.",
        checkPath: "ComfyUI\\custom_nodes\\ComfyUI-Sparc3D\\__init__.py",
        cmds: [
            "Write-Host 'Sparc3D has NO ComfyUI node yet.'; Write-Host 'Research repo (heavy, conda/spconv/CUDA, not portable-python): https://github.com/lizhihao6/Sparc3D'; Write-Host 'Hosted demo: HuggingFace Space ilcve21/Sparc3D'; Write-Host 'This row auto-detects a custom_nodes\\ComfyUI-Sparc3D folder if a community node lands.'",
        ],
        notes: "I checked: there is no maintained ComfyUI-Sparc3D node — the official repo is the research framework (conda + spconv + custom CUDA build, doesn't fit your portable embedded python), and there's an open community request for a wrapper but nothing shipped. So this stays 'missing' until someone builds one (or you run the HF Space). The ▶ just prints the real links — no fake clone. If/when a node lands at custom_nodes\\ComfyUI-Sparc3D, this row + the AI-MODELS generator both go green automatically.",
    },

    {
        id: "py-gradio", category: "python", name: "gradio (local web UI framework)",
        purpose: "Gradio — the web-UI framework a Sparc3D/diso image→mesh app runs on. Installs into the SAME embedded python that holds the diso _C.pyd you built.",
        cmds: [
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install gradio",
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -c \"import gradio as gr; print('gradio', gr.__version__)\"",
        ],
        notes: "This installs the FRAMEWORK only — it does not create or launch a UI by itself. A Gradio app needs an app script (commonly gradio_app.py / app.py) in the working directory. IMPORTANT: the diso repo you built in C:\\diso_manual does NOT ship a gradio_app.py — diso is just the Dual-Marching-Cubes dependency. To get an actual Sparc3D web UI you also need the Sparc3D app code + weights (see the 'Sparc3D — Gradio app' row). The verify line prints the installed gradio version so you can confirm the package landed in the embedded python.",
    },
    {
        id: "sparc3d-gradio", category: "node", name: "diso Gradio playground (real DiffDMC)",
        purpose: "Launch a local browser UI that drives your COMPILED diso._C end-to-end (analytic SDF → real DiffDMC → watertight mesh). Proves the diso build works. Requires py-gradio first.",
        checkPath: "diso_manual\\diso_gradio_app.py",
        cmds: [
            "$app='C:\\diso_manual\\diso_gradio_app.py'; if (-not (Test-Path $app)) { Write-Host 'diso_gradio_app.py not found in C:\\diso_manual.'; Write-Host 'Copy it from the EngineProject archive: diso_tools\\diso_gradio_app.py  ->  C:\\diso_manual\\diso_gradio_app.py'; Write-Host 'It is a REAL diso playground (DiffDMC). It is NOT full Sparc3D image->3D (that needs the Sparc3D model + spconv).'; exit 1 }; Write-Host 'Launching diso playground — open http://127.0.0.1:7860 when it prints the URL...'; Set-Location C:\\diso_manual; & 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' diso_gradio_app.py",
        ],
        notes: "Ships in the archive at diso_tools\\diso_gradio_app.py — copy it to C:\\diso_manual, then run py-gradio (installs gradio), then this row launches it. It uses the REAL diso API (from diso import DiffDMC; verts,faces = diffdmc(sdf, deform=None, normalize=True); diso convention is inner=NEGATIVE) to extract a mesh from an analytic SDF (sphere/torus/box/gyroid) and shows it in the browser. HONEST: this is a diso build-verifier + sandbox, NOT Sparc3D image→3D — Sparc3D needs its own trained model + spconv which don't fit the portable embedded python. If a clean mesh renders, your diso compile is correct and any pipeline that hands diso a dense SDF volume will work. NOTE: long-running server — for real use launch it from your own PowerShell window so it doesn't hold the bridge's command slot.",
    },
    {
        id: "kaggle-cli-classic", category: "python", name: "Kaggle CLI (classic 1.x — for kernels push)",
        purpose: "Pin the classic kaggle CLI (<2). The new 2.x CLI added OAuth and rejects the legacy kaggle.json for `kernels push` (write), which broke job submit. 1.x uses kaggle.json/username+key for everything.",
        cmds: [
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m pip install \"kaggle<2\"",
            "& 'C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe' -m kaggle --version",
        ],
        notes: "Installs into the EMBEDDED python (the one the bridge calls as `python -m kaggle`). NOTE: if you also installed kaggle into your user Python earlier, the bridge uses whichever `python` is first on PATH — make sure that's the one with 1.x. The bridge also now passes KAGGLE_USERNAME/KAGGLE_KEY as env vars (v629) which forces legacy auth regardless. Verify line prints the CLI version.",
    },
    {
        id: "kaggle-legacy-key", category: "node", name: "Kaggle legacy API key (open + how-to)",
        purpose: "Open the Kaggle API settings page to create a LEGACY API key (the kind that works for kernels push), then paste it into Settings → Kaggle credentials.",
        cmds: [
            "Start-Process 'https://www.kaggle.com/settings/api'; Write-Host 'Opened kaggle.com/settings/api in your browser.'; Write-Host 'Under \"Legacy API Credentials\" click \"Create Legacy API Key\" (NOT the default \"Generate New Token\" — that one is OAuth-style and the CLI push path rejects it).'; Write-Host 'A kaggle.json downloads with your username + key.'; Write-Host 'Then in the engine: SETTINGS -> Kaggle credentials -> paste username + key -> Save.'; Write-Host 'The bridge writes ~/.kaggle/kaggle.json and sets the env vars for you.'",
        ],
        notes: "This just opens the right page and prints the steps — it can't click Kaggle's site for you. The IMPORTANT detail: use 'Create Legacy API Key' under 'Legacy API Credentials', not the default 'Generate New Token'. The new token is OAuth-oriented and the CLI's `kernels push` rejects it; the legacy key works for read AND write. After downloading kaggle.json, paste username + key into the engine's Settings → Kaggle credentials (inline form, v626) and Save.",
    },
    {
        id: "py-kiui", category: "python", name: "kiui",
        purpose: "Geometry utilities used by Flowty-CRM",
        cmds: [
            ".\\python_embeded\\python.exe -m pip install kiui",
        ],
    },
    {
        id: "py-openclip", category: "python", name: "open-clip-torch + timm + ftfy",
        purpose: "Vision-language encoders for Flowty-CRM / texture pipelines",
        cmds: [
            ".\\python_embeded\\python.exe -m pip install open-clip-torch timm ftfy",
        ],
    },
    // v341 — additions from the user's actual install log: pyhocon (for
    // ComfyUI-3D-Pack), and the other 3D nodes they have installed.
    {
        id: "py-pyhocon", category: "python", name: "pyhocon (for ComfyUI-3D-Pack)",
        purpose: "HOCON config parser. Without it ComfyUI-3D-Pack fails to import",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install pyhocon",
        ],
        notes: "Symptom: 'ModuleNotFoundError: No module named pyhocon' on ComfyUI-3D-Pack import.",
    },
    {
        id: "py-fake-triton", category: "python", name: "Fake-Triton bypass", optional: true, optionalLabel: "not needed",
        purpose: "Trellis hard-imports triton. Windows can't compile it. This shim satisfies the check",
        cmds: [
            "# Comment out 'import triton' / 'import triton.compiler' in nodes.py",
            "# Do NOT create a fake triton folder — torch._dynamo will probe it for .language.dtype and crash.",
            "# Safer path: just comment out, leave triton actually-missing.",
        ],
        notes: "Earlier guidance to create a dummy triton folder backfires. Real fix is the source comment-out.",
    },

    // v347 — P3D! Pixal3D low-VRAM pipeline prereqs. The doc explicitly
    // tunes for Pascal cards (1070/1080): float16 mixed precision,
    // accelerate's cpu_offload_with_hook to keep only one sub-network in
    // VRAM at a time, marching cubes forced to CPU. These three pip
    // installs cover the dependencies; the actual Python pipeline lives
    // outside the engine.
    {
        id: "py-accelerate", category: "python", name: "accelerate (P3D low-VRAM)",
        purpose: "Provides cpu_offload_with_hook for sequential CPU offload — keeps one model block in VRAM",
        cmds: ["C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install accelerate"],
        notes: "Without this, the Pixal3D pipeline OOMs on 8GB cards mid-DiT-denoising.",
    },
    {
        id: "py-safetensors", category: "python", name: "safetensors",
        purpose: "Safe tensor serialization for modern model loaders",
        cmds: ["C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install safetensors"],
        notes: "Usually pulled in by transformers/diffusers but include explicit for the P3D venv.",
    },
    {
        id: "py-pixal3d-stack", category: "python", name: "P3D! Pixal3D stack (one-shot)",
        purpose: "Install trimesh + accelerate + safetensors + numpy 1.26.4 + scipy in one command",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install trimesh accelerate safetensors \"numpy==1.26.4\" scipy",
        ],
        notes: "Convenience: runs everything for the Pixal3D low-VRAM pipeline at once. Pin numpy 1.26.4 because >2.0 breaks many older Trellis-era libs.",
    },
    {
        id: "py-mol-pipeline", category: "python", name: "MOL! AtomicFieldProcessor (biopython)",
        purpose: "PDB/CIF reading for the MOL! molecular structure pipeline (v350)",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install biopython \"numpy==1.26.4\"",
        ],
        notes: "Pure Python — no model weights needed. Reads .pdb / .cif into the 24-byte stride .mol binary. AlphaFold-3 outputs work directly. v352 added.",
    },
    {
        id: "py-mto-pipeline", category: "python", name: "MTO! medical tomography pipeline",
        purpose: "SimpleITK + nibabel + scipy.ndimage for the MTO! pipeline (v351)",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install SimpleITK nibabel \"numpy==1.26.4\" scipy",
        ],
        notes: "SimpleITK reads DICOM, nibabel reads NIfTI, scipy.ndimage computes gradient normals for the 22-byte stride .mto binary. v352 added.",
    },
    {
        id: "py-wnd-pipeline", category: "python", name: "WND! fluid field pipeline",
        purpose: "netCDF4 + xarray + scipy for the WND! 3D fluid field pipeline (v353)",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install netCDF4 xarray \"numpy==1.26.4\" scipy",
        ],
        notes: "netCDF4 reads ERA5/GFS reanalysis NetCDF files, xarray is the friendly wrapper for label-based slicing. Output is the 3D RGBA32F texture data for the .wnd binary format (W×H×D × 16 B). v353 added.",
    },

    // === MODELS (downloaded weights) ===
    {
        id: "model-juggernaut", category: "model", name: "Juggernaut XL v9",
        purpose: "SDXL fine-tune for the initial 2D image step",
        path: "ComfyUI\\models\\checkpoints\\juggernaut_xl.safetensors",
        src: "https://civitai.com/api/download/models/348913",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints",
            "curl.exe -L --ssl-no-revoke \"https://civitai.com/api/download/models/348913?token=YOUR_CIVITAI_TOKEN\" -o juggernaut_xl.safetensors",
        ],
        notes: "Civitai requires --ssl-no-revoke on Windows or you'll hit CRYPT_E_NO_REVOCATION_CHECK. Get a token at civitai.com Settings > API Keys.",
    },
    {
        id: "model-sdxl", category: "model", name: "SDXL Base 1.0",
        purpose: "Baseline SDXL model. Fallback if Juggernaut is unavailable",
        path: "ComfyUI\\models\\checkpoints\\sdxl_base_1.0.safetensors",
        cmds: [
            "cd C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\checkpoints",
            "curl.exe -L --ssl-no-revoke \"https://civitai.com/api/download/models/128078?token=YOUR_CIVITAI_TOKEN\" -o sdxl_base_1.0.safetensors",
        ],
    },
    {
        id: "model-dinov3", category: "model", name: "DINOv3 ViT-L/16",
        purpose: "Vision backbone Trellis2 uses to encode the input image",
        path: "ComfyUI\\models\\facebook\\dinov3-vitl16-pretrain-lvd1689m\\mp_rank_00_model_states.pt",
        src: "https://huggingface.co/facebook/dinov3-vitl16-pretrain-lvd1689m",
        notes: "Folder name MUST be exactly 'dinov3-vitl16-pretrain-lvd1689m'. Trellis2 hard-checks this string. Open mirror PIA-SPACE-LAB/dinov3-... avoids the HF auth prompt.",
    },
    {
        id: "model-trellis-fp8", category: "model", name: "Trellis 2 FP8 weights (8 files)",
        purpose: "The actual 3D generation model. FP8 quantized — fits an 8 GB GPU",
        path: "ComfyUI\\models\\trellis\\trellis-2.0\\  AND  ComfyUI\\models\\trellis\\TRELLIS.2-4B-FP8\\",
        src: "https://huggingface.co/visualbruno/TRELLIS.2-4B-FP8 → ckpts_fp8/ folder",
        notes: "TWO folder copies required — Trellis2 loader checks both paths. Skip the _1024_ files (only grab 512). Use the DOWNLOAD ARROW icon, NOT the filename link, or you'll get a 1KB Xet pointer file instead of the real .safetensors.",
        cmds: [
            "# Required files from huggingface.co/visualbruno/TRELLIS.2-4B-FP8/tree/main/ckpts_fp8 :",
            "#   shape_dec_next_dc_f16c32_fp8.{json,safetensors}",
            "#   slat_flow_img2shape_dit_1_3B_512_fp8.{json,safetensors}",
            "#   slat_flow_imgshape2tex_dit_1_3B_512_fp8.{json,safetensors}",
            "#   ss_flow_img_dit_1_3B_64_fp8.{json,safetensors}",
            "# Also grab pipeline_fp8.json from repo root, rename to config.json",
            "# COPY all 8 files into BOTH trellis-2.0 AND TRELLIS.2-4B-FP8",
        ],
    },
    {
        id: "model-ultrashape", category: "model", name: "UltraShape weights (ultrashape_v1.pt)", requiredIf: "node-ultrashape",
        purpose: "Checkpoint for the UltraShape refiner node. REQUIRED once node-ultrashape is installed; shown as optional otherwise.",
        checkPath: "ComfyUI\\models\\ultrashape\\ultrashape_v1.pt",
        path: "ComfyUI\\models\\ultrashape\\ultrashape_v1.pt",
        src: "https://huggingface.co/infinith/UltraShape/tree/main",
        cmds: [
            "$dst='C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\models\\ultrashape'; New-Item -ItemType Directory -Force -Path $dst | Out-Null; $out=$dst+'\\ultrashape_v1.pt'; if ((Test-Path $out) -and ((Get-Item $out).Length -gt 1000000)) { Write-Host 'ultrashape_v1.pt already present'; exit 0 }; $url='https://huggingface.co/infinith/UltraShape/resolve/main/ultrashape_v1.pt?download=true'; Write-Host ('downloading '+$url); try { Invoke-WebRequest $url -OutFile $out -UseBasicParsing } catch { Write-Host ('download failed: '+$_.Exception.Message); Write-Host ('Download manually from https://huggingface.co/infinith/UltraShape (download-arrow icon) into '+$dst); exit 1 }; $sz=(Get-Item $out).Length; if ($sz -lt 100000) { Write-Host ('WARNING: only '+$sz+' bytes - likely an LFS/Xet pointer stub, not the real weight. Delete it and download manually from huggingface.co/infinith/UltraShape using the download-arrow icon.'); exit 1 } else { Write-Host ('OK: '+$sz+' bytes -> '+$out) }",
        ],
        notes: "REQUIRED once you install node-ultrashape (this row flips from 'optional' to 'missing' then). The ▶ download URL is built from the stated repo+filename (infinith/UltraShape, ultrashape_v1.pt) and verifies the byte size — if it returns a tiny LFS/Xet pointer stub or 404s, it FAILS loudly and tells you to grab it manually with the download-arrow icon at huggingface.co/infinith/UltraShape. UltraShape wants 12GB+ VRAM, so on 8GB it's experimental.",
    },
    {
        id: "model-totalsegmentator", category: "model", name: "TotalSegmentator (MTO! 3D U-Net)",
        purpose: "Optional pretrained CT segmentation U-Net for MTO! pipeline (v351). ~4 GB weights download on first invocation.",
        path: "Installed via pip; weights cached in ~/.cache/totalsegmentator/",
        src: "pip install TotalSegmentator",
        notes: "Optional — only for real DICOM/NIfTI work. The .mto demo and binary format are fully usable without it. Map TotalSegmentator's 100+ class IDs onto the 8-class MTO palette via your AtomicFieldProcessor adapter. v352 added.",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install TotalSegmentator",
        ],
    },

    // === CODE PATCHES (drop-in replacements for problematic imports) ===
    {
        id: "patch-cumesh", category: "patch", autoPatch: true, name: "nodes.py: cumesh try/except",
        purpose: "Trellis can't find the C++-accelerated cumesh on Windows. Fall back gracefully",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (~line 27)",
        patch: `try:
    import cumesh as CuMesh
except ImportError:
    CuMesh = None
    print("TRELLIS: cumesh not found, using fallback (this is fine)")`,
    },
    {
        id: "patch-ovoxel", category: "patch", autoPatch: true, name: "nodes.py: o_voxel try/except",
        purpose: "Same story as cumesh — Windows can't compile, use fallback",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (~line 32)",
        patch: `try:
    import o_voxel
except ImportError:
    o_voxel = None
    print("TRELLIS: o_voxel not found, using fallback (this is also fine)")`,
    },
    {
        id: "patch-nvdiffrast", category: "patch", autoPatch: true, name: "nodes.py: nvdiffrast try/except",
        purpose: "Wrap nvdiffrast import in case the pre-compiled wheel install didn't take",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (~line 41)",
        patch: `try:
    import nvdiffrast.torch as dr
except (ImportError, Exception):
    dr = None
    print("TRELLIS: nvdiffrast not found, using fallback (skipping diff-rasterization)")`,
    },
    {
        id: "patch-flex-gemm-nodes", category: "patch", autoPatch: true, name: "nodes.py: flex_gemm try/except",
        purpose: "flex_gemm isn't on PyPI. Wrap it. Sparse backend defaults to spconv",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (~line 46)",
        patch: `try:
    from flex_gemm.ops.grid_sample import grid_sample_3d
except (ImportError, Exception):
    grid_sample_3d = None
    print("TRELLIS: flex_gemm not found, using fallback")`,
    },
    {
        id: "patch-flex-gemm-pipeline", category: "patch", autoPatch: true, name: "trellis2_image_to_3d.py: flex_gemm fallback",
        purpose: "The PIPELINE file ALSO hard-imports flex_gemm. Must patch this too",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\trellis2\\pipelines\\trellis2_image_to_3d.py (~line 35)",
        patch: `try:
    from flex_gemm.ops.grid_sample import grid_sample_3d
except ModuleNotFoundError:
    import torch.nn.functional as F
    def grid_sample_3d(input, grid, mode='bilinear', padding_mode='zeros', align_corners=True):
        return F.grid_sample(input, grid, mode=mode, padding_mode=padding_mode, align_corners=align_corners)`,
        notes: "CRITICAL: indentation must be exactly 4 spaces, not tabs. Mismatching causes 'unindent does not match any outer indentation level'.",
    },
    {
        id: "patch-triton", category: "patch", autoPatch: true, name: "nodes.py: comment out triton imports",
        purpose: "Triton doesn't compile on Windows. Comment out — DON'T create a fake folder",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (~lines 15-16)",
        patch: `# import triton
# import triton.compiler`,
    },
    {
        id: "patch-defaults", category: "patch", autoPatch: true, name: "Trellis2LoadModel defaults (GTX 1080 safe)",
        purpose: "Flip the default model to the FP8 quant that fits 8GB (the other defaults are already Pascal-safe in your fork)",
        file: "custom_nodes\\ComfyUI-Trellis2-main\\nodes.py (Trellis2LoadModel.INPUT_TYPES)",
        patch: `"model_name": ([..., "visualbruno/TRELLIS.2-4B-FP8"], {"default": "visualbruno/TRELLIS.2-4B-FP8"}),
# (was "microsoft/TRELLIS.2-4B" — the full model won't fit 8GB)`,
        notes: "v474: your dumped INPUT_TYPES showed backend=sdpa, conv_backend=spconv, sparse_backend=xformers, low_vram=True are ALREADY Pascal-safe — the only 8GB-relevant change is the model. This flips model_name's default from microsoft/TRELLIS.2-4B (full) to visualbruno/TRELLIS.2-4B-FP8 (the FP8 quant). OPTIONAL + needs the FP8 weights (model-trellis-fp8) downloaded; both models stay selectable in the node. Idempotent.",
    },

    // === LAUNCH FLAGS ===
    {
        id: "flag-launch", category: "flag", name: "ComfyUI launch flags (the full incantation)",
        purpose: "Tested combination for an 8GB Pascal GPU with cross-origin engine access",
        cmds: [
            "C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -s C:\\VoxelBAK\\ComfyUI_windows_portable\\ComfyUI\\main.py --windows-standalone-build --lowvram --force-fp16 --enable-cors-header *",
        ],
        notes: "--lowvram forces aggressive offloading. --force-fp16 halves memory footprint. --enable-cors-header * lets the engine (different port) read generated files.",
    },
    {"id": "skill-marketing", "category": "agent", "name": "Marketing skills (coreyhaines31)", "purpose": "Corey Haines' 40 marketing skills (CRO/SEO/copy/analytics) for your AI CODING AGENT (Claude Code/Cursor) -- NOT the SweK engine.", "cmds": ["if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Node/npx not found -- install Node (or use your Bun npm)'; exit 1 }; Write-Host 'installing coreyhaines31/marketingskills (-> .agents/skills in this folder)...'; npx -y skills add coreyhaines31/marketingskills; Write-Host 'done -- TIP: run skillspector on a skill before trusting it'"], "notes": "Agent-skills are markdown your coding agent reads, not engine code. Installs to .agents/skills in the current folder via the Agent Skills CLI. Scan with skillspector first."},
    {"id": "skill-mattpocock", "category": "agent", "name": "Dev-workflow skills (mattpocock)", "purpose": "Matt Pocock's 17 dev-workflow skills: PRD writing, TDD, codebase architecture, git guardrails, refactoring plans. For your coding agent.", "cmds": ["if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Node/npx not found -- install Node (or use your Bun npm)'; exit 1 }; Write-Host 'installing mattpocock/skills (-> .agents/skills in this folder)...'; npx -y skills add mattpocock/skills; Write-Host 'done -- TIP: run skillspector on a skill before trusting it'"], "notes": "Markdown skills for Claude Code/Cursor, not the engine. -> .agents/skills. Scan with skillspector first."},
    {"id": "skill-addyosmani", "category": "agent", "name": "Engineering skills (addyosmani)", "purpose": "Addy Osmani's production-grade engineering skills (spec-driven dev, TDD, code review, CI/CD) -- MIT, 27K stars. For your coding agent.", "cmds": ["if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Node/npx not found -- install Node (or use your Bun npm)'; exit 1 }; Write-Host 'installing addyosmani/agent-skills (-> .agents/skills in this folder)...'; npx -y skills add addyosmani/agent-skills; Write-Host 'done -- TIP: run skillspector on a skill before trusting it'"], "notes": "Markdown skills for Claude Code/Cursor, not the engine. -> .agents/skills. Scan with skillspector first."},
    {"id": "skill-taste", "category": "agent", "name": "Taste skill (Leonxlnx) -- frontend design", "purpose": "Anti-slop FRONTEND design taste for your coding agent: layout, type scale, spacing rhythm, motion direction so AI-built UIs do not look templated. MIT.", "cmds": ["if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Node/npx not found'; exit 1 }; npx -y skills add https://github.com/Leonxlnx/taste-skill --skill \"design-taste-frontend\"; Write-Host 'done -- scan with skillspector first'"], "notes": "Markdown skill for Claude Code/Cursor/Codex, not engine code. -> .agents/skills. v2 (design-taste-frontend) is the default; pin v1 with design-taste-frontend-v1. Scan with skillspector first."},
    {"id": "skill-newsjack", "category": "agent", "name": "PR / newsjacking skills (newsjack)", "purpose": "elvisun/newsjack -- open PR skills (newsjacking, coverage tracking, journalist lists) + a small CLI. For your coding agent.", "cmds": ["if (-not (Get-Command npx -ErrorAction SilentlyContinue)) { Write-Host 'Node/npx not found -- install Node (or use your Bun npm)'; exit 1 }; Write-Host 'installing elvisun/newsjack (-> .agents/skills in this folder)...'; npx -y skills add elvisun/newsjack; Write-Host 'done -- TIP: run skillspector on a skill before trusting it'"], "notes": "Skill-pack via the Agent Skills CLI. It ALSO ships a CLI installer at newsjack.sh (curl/npm -> ~/.newsjack) if you want the standalone tool. Scan with skillspector first."},
    {"id": "tool-agent-reach", "category": "agent", "name": "Agent Reach (Panniantong) -- NEEDS Python", "purpose": "Python CLI/library that gives an agent read/search across 13 platforms (Twitter/Reddit/YouTube/GitHub/Bilibili/XiaoHongShu). Installer + doctor + router, not a wrapper.", "cmds": ["if (-not (Get-Command py -ErrorAction SilentlyContinue)) { Write-Host 'Agent Reach needs Python -- install Python 3.x from python.org and use py -3 (NOT the Store alias), then re-run'; exit 1 }; Write-Host 'installing Agent Reach (pip from repo zip)...'; py -3 -m pip install https://github.com/Panniantong/agent-reach/archive/main.zip; Write-Host 'running agent-reach install --env=auto ...'; agent-reach install --env=auto"], "notes": "THE ONE THAT NEEDS PYTHON on Windows -- use the Python Launcher 'py -3' (NOT the Microsoft Store alias). MIT v1.5.0. Cookie-login platforms: use throwaway accounts."},
    {"id": "tool-skillspector", "category": "agent", "name": "SkillSpector (NVIDIA) -- vet skills", "purpose": "Security scanner for agent skills -- scan any skill repo BEFORE installing the Group-A packs. ~26% of public skills carry vulnerabilities.", "cmds": ["if (Get-Command py -ErrorAction SilentlyContinue) { Write-Host 'installing skillspector (Python 3.12) via pip...'; py -3 -m pip install skillspector; exit $LASTEXITCODE } elseif (Get-Command docker -ErrorAction SilentlyContinue) { Write-Host 'no Python -- clone + docker build: git clone https://github.com/NVIDIA/skillspector; cd skillspector; docker build -t skillspector .'; exit 0 } else { Write-Host 'needs Python 3.12 (pip install skillspector) OR Docker'; exit 1 }"], "notes": "Apache-2.0. Needs Python 3.12 (pip install skillspector) OR Docker. Usage: skillspector scan <repo-or-dir>. 64 patterns / 16 categories; outputs a 0-100 risk score."},
    {"id": "app-immich", "category": "app", "name": "immich -- self-host photos (Docker)", "purpose": "Self-hosted Google Photos. Pulls the official compose + env to C:\\VoxelBAK\\immich and brings it up; browse http://localhost:2283.", "cmds": ["if (-not (Get-Command docker -ErrorAction SilentlyContinue)) { Write-Host 'Docker Desktop required -- install + start it, then re-run'; exit 1 }; $d='C:\\VoxelBAK\\immich'; New-Item -ItemType Directory -Force -Path $d | Out-Null; Invoke-WebRequest 'https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml' -OutFile (Join-Path $d 'docker-compose.yml'); Invoke-WebRequest 'https://github.com/immich-app/immich/releases/latest/download/example.env' -OutFile (Join-Path $d '.env'); Push-Location $d; docker compose up -d; Pop-Location; Write-Host 'immich starting -- open http://localhost:2283'"], "notes": "Needs Docker Desktop installed AND running. First 'up' pulls several GB. Idempotent-ish (compose up is safe to re-run)."},
    {"id": "app-firecrawl", "category": "app", "name": "Firecrawl -- web scraping for LLMs", "purpose": "Crawl/scrape sites into LLM-ready markdown. EASIEST = cloud API key + the JS SDK; self-host is heavy (Docker w/ Redis + Playwright). This row prints both paths.", "cmds": ["Write-Host 'Firecrawl options:'; Write-Host '  EASY  -- cloud API: get a key at https://firecrawl.dev, then: npm i @mendable/firecrawl-js'; Write-Host '  HEAVY -- self-host: git clone https://github.com/firecrawl/firecrawl ; cd firecrawl ; docker compose up -d  (needs Redis + Playwright)'"], "notes": "For the engine, the cloud API (just a key) is far simpler than self-hosting."},
    {"id": "app-voicebox", "category": "app", "name": "Voicebox -- local TTS / voice clone", "purpose": "Local TTS + voice cloning + dictation, with a localhost REST API + MCP server. The engine could USE it as its VOICE, not just install it. Windows = CUDA (your 1070/1080).", "cmds": ["Write-Host 'Voicebox (local TTS / voice clone / dictation):'; Write-Host '  Download the installer: https://voicebox.sh/download  (Windows CUDA build for your 1070/1080)'; Write-Host '  After install it serves a localhost REST API + an MCP server -- the engine can call it for TTS.'"], "notes": "No clean winget -- download from voicebox.sh/download. Once running it serves a REST API the engine can call for TTS (wire-up is a separate slice)."},
    {"id": "app-dokploy", "category": "app", "name": "Dokploy -- self-host PaaS (Linux/VPS)", "purpose": "Self-host Vercel/Heroku-style deploy platform. LINUX/VPS ONLY -- its installer sets up Docker Swarm. Not native Windows.", "cmds": ["Write-Host 'Dokploy is a Linux/VPS self-host PaaS (sets up Docker Swarm) -- not native Windows.'; Write-Host 'On a Linux server/VPS (or WSL2): curl -sSL https://dokploy.com/install.sh | sh'"], "notes": "Run on a Linux box / VPS (or WSL2). On this Windows rig it won't install natively -- the row prints the Linux command."},
    {"id": "app-apple-container", "category": "app", "name": "apple/container -- macOS only", "purpose": "Apple's Linux-container framework on Apple Silicon (run an LLM in a lightweight VM). macOS-only; belongs on the MAC side via the Mac agent.", "cmds": ["Write-Host 'apple/container is macOS (Apple Silicon) only -- not for this Windows rig. It runs on the Mac via the Mac agent.'"], "notes": "Not for this Windows rig. On the Mac: install Apple's container tool, then 'container system start'."},
    {"id": "feed-iptv", "category": "feed", "name": "IPTV-org -- public TV channels (m3u)", "purpose": "Public IPTV channel playlists. DATA, not an app -- point a TV-channels view at these m3u URLs.", "cmds": ["Write-Host 'IPTV-org playlists (data feed, not an install):'; Write-Host '  Master:      https://iptv-org.github.io/iptv/index.m3u'; Write-Host '  By category: https://iptv-org.github.io/iptv/categories/<cat>.m3u  (e.g. news, movies)'; Write-Host '  By country:  https://iptv-org.github.io/iptv/countries/<code>.m3u  (e.g. us, uk)'; Write-Host 'Feed one of these into a TV view.'"], "notes": "No install. Master/category/country playlists below feed a TV view."},
    {"id": "model-krea2-turbo", "category": "model", "name": "Krea 2 Turbo (text-to-image) -- ComfyUI 0.26.0+", "purpose": "Krea AI's open-weights ~12.9B DiT text-to-image (released 2026-06-23). 8-step distilled Turbo. Runs locally in ComfyUI 0.26.0+ with BUILT-IN support (no custom node for the base diffusion path).", "cmds": ["Write-Host 'Krea 2 Turbo - local text-to-image in ComfyUI:'; Write-Host '  1) Update ComfyUI to 0.26.0+ (built-in Krea 2 support; CLIPLoader type=krea2).'; Write-Host '  2) Pick a quant for your VRAM (see the GPU advisor banner at the TOP of this panel):'; Write-Host '       8GB  -> GGUF Q4/Q5 + the ComfyUI-GGUF node (row above): https://huggingface.co/realrebelai/KREA-2_GGUFs'; Write-Host '       16GB -> fp8 (12GB transformer):                          https://huggingface.co/Comfy-Org/Krea-2'; Write-Host '       24GB+-> bf16 / Raw (full quality):                       https://huggingface.co/krea/Krea-2-Turbo'; Write-Host '  3) Files: diffusion model -> ComfyUI/models/diffusion_models ; Qwen3-VL 4B text encoder -> models/text_encoders ; Qwen Image VAE -> models/vae'; Write-Host '  4) Load the Krea 2 template from the ComfyUI template library (or a workflow JSON), set your prompt, Queue Prompt.'; Write-Host 'Heavy multi-GB downloads: run in your own shell. Pascal (1070/1080): GGUF only, no fp8 accel -> fits 8GB but slow.'"], "manual": true, "specs": {"sizeGB": 13, "platforms": ["win32", "linux"], "note": "fp8 ~12GB / GGUF ~6.5GB + Qwen3-VL ~4.9GB + VAE"}, "notes": "VERIFIED 2026-06-24: ComfyUI 0.26.0+ has built-in Krea 2 support (no custom node for the base path); the low-VRAM GGUF path uses ComfyUI-GGUF (the node-gguf row). Community fp8/nvfp4/GGUF quants make Turbo runnable on 8-16GB. It is a 2D IMAGE model (concept/texture/reference), NOT a 3D mesh source. On Pascal there is no fp8 acceleration -> use a GGUF quant, expect slow; on a newer 8GB+ card it is quick. Repos: Comfy-Org/Krea-2 (fp8), realrebelai/KREA-2_GGUFs (GGUF), krea/Krea-2-Turbo (official). GUIDANCE row (manual): exact filenames shift, so pull them from the ComfyUI template library rather than a hardcoded URL."},
    {"id": "torch-40-50-note", "category": "runtime", "name": "RTX 40 / 50 torch note (Ada / Blackwell)", "purpose": "What torch/CUDA the 40- and 50-series need. The GPU advisor banner at the top auto-detects which you have; this row is the manual fix if a portable ships the wrong torch.", "cmds": ["Write-Host 'RTX 40-series (Ada, sm_89): the STOCK ComfyUI portable just works (cu126/cu128). Has fp8 acceleration -> Krea fp8 is fast.'; Write-Host 'RTX 50-series (Blackwell, sm_120): needs cu128 (torch 2.7+) AND the LATEST portable. A cu126 build throws: CUDA error: no kernel image is available for execution on the device.'; Write-Host 'Manual torch fix for a 50-series portable (close ComfyUI first):'; Write-Host '  C:\\VoxelBAK\\ComfyUI_windows_portable\\python_embeded\\python.exe -m pip install --upgrade --force-reinstall torch torchvision --index-url https://download.pytorch.org/whl/cu128'; Write-Host 'Confirm: the python_embeded torch reports a +cu128 build and torch.cuda.is_available() is True.'"], "manual": true, "specs": {"platforms": ["win32", "linux"], "note": "40-series = no action; 50-series = cu128"}, "notes": "VERIFIED 2026-06-24: vanilla/cu126 torch reports it supports up to sm_90, so Blackwell sm_120 fails with 'no kernel image'. cu128 torch 2.7+ (e.g. 2.9.0) runs the 50-series. The latest official ComfyUI portable already ships a cu128 torch, so a FRESH install is usually enough - this row is only for fixing a portable that shipped an older torch. 40-series (Ada) needs nothing special."},
    {"id": "amd-comfyui-rocm", "category": "runtime", "name": "AMD Radeon -> ComfyUI on ROCm (NOT CUDA)", "purpose": "Run ComfyUI on an AMD Radeon. AMD uses ROCm, not CUDA - the NVIDIA portable + this catalog's CUDA rows do NOT apply. Support is RDNA-only and there is NO fp8.", "cmds": ["Write-Host 'AMD Radeon -> ComfyUI on ROCm (CUDA alternative). Pick ONE path:'; Write-Host '  A) EASIEST (RDNA3/RDNA4): official ComfyUI Desktop for Windows, ROCm support since v0.7.0 (currently ROCm 7.1.1).'; Write-Host '     Install the AMD ROCm 7.1.1 Preview driver, then run ComfyUI with --use-pytorch-cross-attention. https://www.comfy.org'; Write-Host '  B) BROADEST (GCN5/Vega .. RDNA4, Windows, auto-installs ROCm+PyTorch + triton/sage/flash-attn/INT8-Fast):'; Write-Host '     https://github.com/patientx-cfz/comfyui-rocm   (run comfyui-rocm-updater.bat once first)'; Write-Host '  C) ZLUDA path (older): https://github.com/patientx/ComfyUI-Zluda'; Write-Host 'IMPORTANT: RDNA cannot run NVIDIA fp8 -> use BF16/FP16/INT8 or a GGUF quant. Check the AMD compatibility matrix - an AMD GPU is not automatically supported.'"], "manual": true, "specs": {"platforms": ["win32", "linux"], "note": "RDNA3/4 official; RDNA1-4 via comfyui-rocm; no fp8"}, "notes": "VERIFIED 2026-06-24: ComfyUI Desktop for Windows added official AMD ROCm from v0.7.0 (Jan 2026), now ROCm 7.1.1 (AMD ROCm 7.1.1 Preview driver recommended; --use-pytorch-cross-attention). Officially listed: Radeon 9000 (RDNA4), selected Radeon 7000 (RDNA3), Ryzen AI Max 300 / selected Ryzen AI 400/300 APUs - NOT universal, check the matrix. patientx-cfz/comfyui-rocm covers GCN5/Vega..RDNA4 and auto-installs AMD's official ROCm+PyTorch (TheRock) plus triton/sage/flash-attn/bitsandbytes/INT8-Fast. RDNA shaders can't do NVIDIA fp8 (BF16/FP16/INT8 only). The SweK WebGL2 engine itself is GPU-agnostic and runs fine on AMD; only the AI tooling (torch/ComfyUI) is the ROCm-vs-CUDA split. The advisor banner now detects a Radeon and shows this path automatically."},
    {"id": "mac-mlx-imagegen", "category": "runtime", "name": "Apple Silicon -> MLX image-gen (mflux / Draw Things)", "purpose": "Fast native image generation on an M-class Mac via MLX (no CUDA). For Krea 2 specifically, ComfyUI-on-MPS is the path TODAY; MLX runtimes are faster but have no Krea 2 port yet.", "cmds": ["Write-Host 'Apple Silicon image-gen options (M1/M2/M3/M4):'; Write-Host '  KREA 2 TODAY -> ComfyUI on MPS (Metal). Krea 2 has NO native MLX port yet (open weights dropped 2026-06-23).'; Write-Host '     Mac ComfyUI: git clone https://github.com/comfyanonymous/ComfyUI ; pip install -r requirements.txt ; python main.py   (runs on MPS). Or the official ComfyUI Desktop for Mac. Use bf16/GGUF - Metal has no fp8.'; Write-Host '  FASTEST MLX (for FLUX / Z-Image / Qwen Image, NOT Krea 2 yet): mflux'; Write-Host '     uv tool install --upgrade mflux   (or: pip install mflux). Then e.g.: mflux-generate-z-image-turbo --prompt \"...\" --steps 9 -q 8'; Write-Host '  GUI: Draw Things (App Store) - fastest Mac diffusion GUI, on-demand weight loading; check its model catalog.'; Write-Host 'Watch filipstrand/mflux for a Krea 2 add; until then use ComfyUI-MPS for Krea 2 or mflux for the FLUX/Z-Image families.'"], "manual": true, "specs": {"platforms": ["darwin"], "note": "MLX native; no fp8; Krea 2 = ComfyUI-MPS for now"}, "notes": "VERIFIED 2026-06-24: mflux (filipstrand/mflux, MIT) is the MLX-native runtime - line-by-line MLX ports of FLUX, Z-Image Turbo, FLUX.2 Klein, Qwen Image, FIBO, SeedVR2, etc., installed via `uv tool install mflux` or pip, CLI `mflux-generate-*`. It does NOT list Krea 2 (the OSS weights only released 2026-06-23). DiffusionKit (argmaxinc) = Core ML+MLX (SD3/FLUX); Draw Things = fastest Mac GUI (~25% faster than mflux, ~3x faster than ComfyUI on Mac). So on Apple Silicon: Krea 2 runs via ComfyUI on MPS today (bf16/GGUF, no fp8); for max MLX speed use mflux/Draw Things with a supported model (Z-Image, FLUX). The advisor's Mac branch points here. This row is GUIDANCE (manual) - no fabricated Krea-MLX command."},
    // v4291 -- NATIVE DESKTOP OPENGL FROM NODE. The first row whose support set is a set of PLATFORM PAIRS
    // rather than a product of os x arch, which is why ai-bridge/platformRequires.js grew a `platforms` field
    // this round. Apple Silicon is refused rather than recommended: there is no darwin-arm64 prebuilt.
    {
        id: "node3d-gl", category: "tool", name: "@node-3d (native GL window)",
        purpose: "Real desktop OpenGL window driven from Node. MIT, prebuilt binaries, NO compiler. Not headless.",
        cmds: [],
        notes: "Installs @node-3d/core (pulls webgl + glfw + image). No node-gyp: install.js downloads a prebuilt " +
               "from GitHub Releases -- measured at 4 packages / 3 seconds / ~7 MB on linux-x64. *** NOT A " +
               "HEADLESS RENDERER: *** GLFW needs a display server and fails with 'Failed to detect any supported " +
               "platform' on a headless box, so this does not replace the Chromium the shader gates use. Prebuilts " +
               "exist for win32-x64, linux-x64, darwin-x64 and linux-arm64 only; APPLE SILICON HAS NO BUILD. " +
               "Wants node >=24.13.0 (npm warns, does not enforce). Measured-vs-read is recorded in " +
               "world/nodeGlPlatforms.mjs; the real commands live in ai-bridge/install_catalog.json.",
    },
];

const CATEGORIES = [
    { id: "runtime", title: "🟢 Servers (pingable)",      hint: "ComfyUI, Ollama, the bridge — click ↻ Verify to ping" },
    { id: "node",    title: "🧩 ComfyUI Custom Nodes",    hint: "Git-clone or zip-extract into custom_nodes/" },
    { id: "python",  title: "🐍 Python Packages",         hint: "Install into python_embeded with the portable python.exe" },
    { id: "tool",    title: "🛠️ Tools & Binaries",        hint: "Standalone CLI binaries (voxelizers, etc.) — not pip packages" },
    { id: "model",   title: "💾 Model Weights",           hint: "Heavy files. Download from HuggingFace/Civitai into models/" },
    { id: "patch",   title: "🔧 Code Patches",            hint: "Edit nodes.py and trellis2_image_to_3d.py to bypass Linux-only imports" },
    { id: "flag",    title: "⚙️ Launch Flags",            hint: "The PowerShell command that fires the whole rig" },
    { id: "agent",   title: "🤖 Agent skills & tooling", hint: "Markdown skill-packs for your coding agent (Claude Code/Cursor) + the SkillSpector scanner + Agent Reach. NOT engine code -- scan before trusting." },
    { id: "app",     title: "📦 Self-hosted apps",       hint: "Docker / downloadable services: immich, firecrawl, voicebox, dokploy. Some need Docker; some are Linux/Mac only." },
    { id: "feed",    title: "📺 Content feeds",          hint: "Data sources (m3u playlists, etc.) -- not installs; point a view at them." },
];

// ---------------------------------------------------------------------------
// v557 — Model-grouped view. Each "model" (a generator/pipeline you actually
// run) lists the requirement ids it needs. An id MAY appear in several groups
// — that's intentional: a shared requirement shows in every model that needs
// it, with ONE shared status (same id → same pill/checkbox everywhere).
//
// SEEDED from dependencies the catalog/notes actually STATE (UltraShape→cubvh+
// embed-headers+weights; 3D-Pack→pyhocon+diso+kiui+openclip; Flowty-CRM→
// nvdiffrast+openclip+opencv; Trellis2→wheels+dinov3+fp8+patches). It is NOT a
// verified full dependency graph — hand-tune `items` as you learn more. Any
// item not listed in ANY group falls into an auto "Unassigned" section, so
// nothing is ever hidden. "_shared" is pinned first.
// ---------------------------------------------------------------------------
const MODEL_GROUPS = [
    { id: "_shared", label: "🔗 Shared tools & prereqs", hint: "Model-agnostic: runtimes, managers, base libs, prereqs. Several are reused by the models below.",
      items: ["comfyui", "bridge", "ollama", "tool-git", "tool-7zip", "tool-ollama", "node-manager",
              "py-embed-headers", "py-trimesh", "py-pymeshlab", "py-meshlib", "py-imageio", "py-safetensors", "py-accelerate",
              "node-essentials", "node-layerdiffuse", "node-gguf", "model-juggernaut", "model-sdxl", "flag-launch"] },
    { id: "trellis2", label: "🌀 Trellis2 — image→3D (the big one)", hint: "Needs native ext wheels + DINOv3 + FP8 weights + the Linux-import bypass patches.",
      items: ["node-trellis2", "py-trellis2-wheels", "model-dinov3", "model-trellis-fp8",
              "patch-cumesh", "patch-ovoxel", "patch-nvdiffrast", "patch-flex-gemm-nodes", "patch-flex-gemm-pipeline", "patch-triton", "patch-defaults", "py-fake-triton"] },
    { id: "comfy3dpack", label: "📦 ComfyUI-3D-Pack — image→3D suite", hint: "install.py builds diso (manual). Also needs pyhocon, kiui, open-clip.",
      items: ["node-comfy3d-pack", "node-3d-pack", "py-pyhocon", "py-diso", "py-kiui", "py-openclip", "py-embed-headers"] },
    { id: "flowtycrm", label: "🟦 Flowty-CRM", hint: "3 ordered steps; install the nvdiffrast WHEEL before the cuda requirements.",
      items: ["node-flowty-crm-clone", "node-flowty-crm-req", "node-flowty-crm-cuda", "py-nvdiffrast", "py-openclip", "py-opencv-reset", "py-opencv-force"] },
    { id: "ultrashape", label: "💎 UltraShape — refiner (optional, heavy)", hint: "Source-builds cubvh; run py-embed-headers first; needs the ultrashape_v1.pt weights.",
      items: ["node-ultrashape", "py-cubvh", "py-embed-headers", "model-ultrashape"] },
    { id: "triposr",   label: "⚡ TripoSR",            hint: "Fast single-image→mesh.", items: ["node-triposr"] },
    { id: "hunyuan3d", label: "🐉 Hunyuan3D",          hint: "Splat-capable; outputs .ply.", items: ["node-hunyuan3d"] },
    { id: "hitem3d",   label: "🔷 HiTem3D",            hint: "Calls the HiTem3D API server-side (needs keys).", items: ["node-hitem3d"] },
    { id: "p3d",       label: "🟪 P3D! — Pixal3D stack", hint: "One-shot pixel/voxel pipeline.", items: ["py-pixal3d-stack", "py-accelerate", "py-safetensors"] },
    { id: "mol",       label: "🧬 MOL! — molecular field", hint: "AtomicFieldProcessor (biopython).", items: ["py-mol-pipeline"] },
    { id: "mto",       label: "🩻 MTO! — medical tomography", hint: "3D U-Net segmentation.", items: ["py-mto-pipeline", "model-totalsegmentator"] },
    { id: "wnd",       label: "🌊 WND! — fluid field",  hint: "Fluid simulation pipeline.", items: ["py-wnd-pipeline"] },
    { id: "kaggle",    label: "☁️ Kaggle — free cloud GPU jobs", hint: "Pin the classic CLI + create a legacy API key so kernels push works.", items: ["kaggle-cli-classic", "kaggle-legacy-key"] },
    { id: "sparc3d",   label: "🧪 Sparc3D — placeholder + local Gradio", hint: "No ComfyUI node yet; or run the standalone Gradio app locally.", items: ["node-sparc3d", "py-gradio", "sparc3d-gradio"] },
    { id: "nativegl", label: "🖥️ Native GL in Node — desktop window", hint: "MIT, prebuilt (no compiler). NOT headless: needs a display, so it does not replace the gates' Chromium. No Apple Silicon build.",
      items: ["node3d-gl", "tool-git"] },
    { id: "agent-tooling", label: "🤖 Agent skills & tooling", hint: "Skill-packs for your coding agent + SkillSpector (scan first) + Agent Reach. Not engine code.",
      items: ["tool-skillspector", "skill-marketing", "skill-mattpocock", "skill-addyosmani", "skill-taste", "skill-newsjack", "tool-agent-reach"] },
    { id: "selfhost", label: "📦 Self-hosted apps & feeds", hint: "Docker/downloadable services + content feeds. Platform notes per row.",
      items: ["app-immich", "app-firecrawl", "app-voicebox", "app-dokploy", "app-apple-container", "feed-iptv"] },
];

// ---------------------------------------------------------------------------
// State store
// ---------------------------------------------------------------------------

function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return {};
        return JSON.parse(raw) || {};
    } catch { return {}; }
}

function saveState(s) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {}
}

// ---------------------------------------------------------------------------
// Status pill style
// ---------------------------------------------------------------------------

function pill(text, kind = "unknown") {
    const colors = {
        online:    ["#8aff9a", "#0d3a14"],
        offline:   ["#ff8a8a", "#3a0000"],
        unknown:   ["#888",    "#222"],
        installed: ["#8acfff", "#0d2a3a"],
        missing:   ["#ffd884", "#3a2a00"],
        optional:  ["#8a9bb5", "#171c26"],
    }[kind] || ["#888", "#222"];
    const span = document.createElement("span");
    span.style.cssText = `padding:1px 6px; font-family:monospace; font-size:9px; border-radius:8px; background:${colors[1]}; color:${colors[0]};`;
    span.textContent = text;
    return span;
}

// ---------------------------------------------------------------------------
// Panel class
// ---------------------------------------------------------------------------

export class InstallPanel {
    constructor() {
        this.state = loadState();
        // v557 — view mode: "model" (grouped by what you run) is the default;
        // "category" is the flat complete list. Persisted per-browser.
        this.viewMode = this.state._viewMode === "category" ? "category" : "model";
        this.root = this._build();
        this._pingPromises = new Map();
        this._lastVerifyAll = 0;

        // v1597 — auto-verify on visibility REMOVED. Opening the panel no longer pings every service
        // (Ollama/ComfyUI/diffuser/etc.) on its own; the user clicks "↻ Verify All" (or a per-row ↻) to
        // probe. This stops CONNECTION_REFUSED spam when those services aren't running.
    }

    _build() {
        const root = document.createElement("div");
        root.id = "install-panel";
        Object.assign(root.style, {
            position: "fixed",
            top: "60px",
            right: "16px",
            width: "440px",
            maxHeight: "78vh",
            overflowY: "auto",
            background: "rgba(8, 8, 14, 0.96)",
            border: "1px solid #444",
            borderRadius: "6px",
            padding: "10px 12px",
            zIndex: "8400",
            fontFamily: "monospace",
            fontSize: "11px",
            color: "#d0d0d0",
            // v339 — don't set display:none here. The dock manages visibility
            // by reparenting this root into a drawer with its own slide
            // animation. Hiding the root with display:none would defeat
            // the drawer. For non-docked usage, show()/hide()/toggle()
            // still work.
            boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        });

        // Header
        const header = document.createElement("div");
        header.style.cssText = "display:flex; align-items:center; gap:8px; margin-bottom:8px; padding-bottom:6px; border-bottom:1px solid #333;";

        const title = document.createElement("span");
        title.style.cssText = "flex:1; color:#fff; font-weight:bold; letter-spacing:0.06em;";
        title.textContent = "INSTALL PANEL — local pipeline setup";
        header.appendChild(title);

        // v557 — view toggle: grouped-by-model (default) ↔ full category list
        const viewBtn = document.createElement("button");
        viewBtn.style.cssText = "padding:2px 8px; background:#1a1a1a; color:#9ed5ff; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px;";
        const setViewLabel = () => { viewBtn.textContent = this.viewMode === "model" ? "📂 By model" : "📃 All items"; };
        setViewLabel();
        viewBtn.title = "Switch between grouping by model (default) and the full category list";
        viewBtn.addEventListener("click", () => {
            this.viewMode = this.viewMode === "model" ? "category" : "model";
            this.state._viewMode = this.viewMode;
            saveState(this.state);
            setViewLabel();
            this._renderSections();
        });
        header.appendChild(viewBtn);

        const verifyAllBtn = document.createElement("button");
        verifyAllBtn.style.cssText = "padding:2px 8px; background:#1a1a1a; color:#aaa; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px;";
        verifyAllBtn.textContent = "↻ Verify All";
        verifyAllBtn.title = "Ping every pingable server right now";
        verifyAllBtn.addEventListener("click", () => this.verifyAll());
        header.appendChild(verifyAllBtn);

        const exportBtn = document.createElement("button");
        exportBtn.style.cssText = "padding:2px 8px; background:#1a1a1a; color:#aaa; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px;";
        exportBtn.textContent = "📋 Export";
        exportBtn.title = "Copy a full setup script of all commands to clipboard";
        exportBtn.addEventListener("click", () => this._exportAll());
        header.appendChild(exportBtn);

        root.appendChild(header);

        // v1592 — GPU advisor: detect the card + arch + VRAM and recommend torch/CUDA + which Krea 2
        // Turbo quant fits, so people on Turing/Ampere/Ada/Blackwell get correct guidance (not the
        // Pascal-only defaults the catalog notes assume).
        const gpuBanner = document.createElement("div");
        gpuBanner.style.cssText = "margin-bottom:8px; padding:7px 10px; border:1px solid #2a3a4a; border-radius:6px; background:#0c1420; color:#bcd; font-size:11px; line-height:1.55;";
        root.appendChild(gpuBanner);
        const _esc = (s) => String(s == null ? "" : s).replace(/[&<>]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
        // v1597 — don't auto-probe on open. Show an idle banner with a Detect button; fetch only on click.
        const runGpuProbe = async () => {
            gpuBanner.textContent = "Detecting GPU\u2026";
            try {
                const g = await fetch("/install/gpu").then(r => r.json());
                if (!g || !g.gpu) { gpuBanner.innerHTML = "<b style='color:#caa05a'>GPU:</b> " + _esc((g && (g.note || "not detected")) || "not detected"); return; }
                const r = g.recommend || {};
                const isAmd = (g.vendor === "AMD");
                const isApple = (g.vendor === "Apple" || g.vendor === "AppleIntel");
                let tag, computeLabel, memLabel;
                if (isApple) { tag = (g.vendor === "Apple" ? "Apple Silicon \u00b7 Metal" : "Intel Mac"); computeLabel = "compute / Metal"; memLabel = (g.vramGb ? _esc(g.vramGb) + " GB unified" : "memory ?"); }
                else if (isAmd) { tag = "AMD \u00b7 fp8 no"; computeLabel = "torch / ROCm"; memLabel = (g.vramGb ? _esc(g.vramGb) + " GB" : "VRAM ?"); }
                else { tag = "sm " + _esc(g.computeCap || "?") + ", fp8 " + (g.fp8 ? "yes" : "no"); computeLabel = "torch / CUDA"; memLabel = (g.vramGb ? _esc(g.vramGb) + " GB" : "VRAM ?"); }
                const o = r.ollama || {};
                const ollamaLine = o.tier ? ("<br><b style='color:#c8a6ff'>Local LLM (Ollama):</b> " + _esc(o.tier) + " \u2014 " + _esc(o.models || "") + (o.note ? " <span style='color:#7a8290'>(" + _esc(o.note) + ")</span>" : "")) : "";
                gpuBanner.innerHTML =
                    "<b style='color:#9fe88f'>GPU:</b> " + _esc(g.gpu) + " \u00b7 " + memLabel + " \u00b7 " + _esc(g.arch || "?") + " (" + tag + ")<br>" +
                    "<b style='color:#9ed5ff'>" + computeLabel + ":</b> " + _esc(r.torchCuda || "?") + "<br>" +
                    "<b style='color:#9ed5ff'>Krea 2 Turbo:</b> " + _esc(r.kreaQuant || "?") + " \u2014 " + _esc(r.kreaNote || "") + " <span style='color:#7a8290'>(needs ComfyUI " + _esc(r.comfyMin || "0.26.0+") + ")</span>" +
                    ollamaLine;
            } catch (e) { gpuBanner.textContent = "GPU probe failed (open this on the rig with the bridge running)."; }
        };
        const renderGpuIdle = () => {
            gpuBanner.innerHTML = "<span style='color:#8aa9b8'>GPU advisor idle \u2014 </span>";
            const btn = document.createElement("button");
            btn.textContent = "\u25b6 Detect GPU";
            btn.style.cssText = "padding:2px 10px; background:#16261a; color:#9effb0; border:1px solid #2a6a3a; border-radius:4px; cursor:pointer; font-family:monospace; font-size:10px;";
            btn.title = "Run nvidia-smi / sysctl to detect the card + recommend torch/Krea/Ollama. Nothing probes until you click.";
            btn.addEventListener("click", runGpuProbe);
            gpuBanner.appendChild(btn);
        };
        renderGpuIdle();

        // Sections host — rebuilt by _renderSections() on view toggle.
        this._sectionsHost = document.createElement("div");
        root.appendChild(this._sectionsHost);
        // (root must exist for querySelectorAll in _renderSections → set first)
        this.root = root;
        this._renderSections();

        // Footer hint + v347 catalog source-path indicator + v352 audit
        const footer = document.createElement("div");
        footer.style.cssText = "margin-top:8px; padding-top:6px; border-top:1px solid #222; color:#666; font-size:9.5px; line-height:1.5;";
        footer.innerHTML =
            "Marks persist per-browser. <b>Verify</b> pings live servers + checks disk via the bridge. " +
            "<b>Copy</b> puts a command on the clipboard for PowerShell.<br>" +
            "<span id=\"installPanel-fscheck\" style=\"color:#888;\">Disk check: not run yet — click ↻ Verify All</span><br>" +
            "<span id=\"installPanel-catalog-path\" style=\"color:#888;\">Catalog source: loading…</span><br>" +
            "<span id=\"installPanel-audit\" style=\"color:#888;\">Audit: loading…</span>";
        root.appendChild(footer);

        // v347 — Hit /install/catalog so the user sees the editable JSON
        // path. Bridge re-reads the file on every exec call, so edits take
        // effect immediately without restarting Node.
        fetch("/install/catalog").then(r => r.json()).then(d => {
            if (d && d.platform) { this._platform = d.platform; try { this._renderSections && this._renderSections(); } catch (e) {} }   // v1246 — flag non-applicable installs
            const el = root.querySelector("#installPanel-catalog-path");
            if (!el || !d?.ok) return;
            const tag = d.lastError
                ? `<span style="color:#f66;">⚠ parse error: ${d.lastError}</span>`
                : `<span style="color:#6b6;">✓ ${d.ids.length} entries</span>`;
            el.innerHTML = `Edit installs: <code style="color:#9c6;">${d.sourcePath}</code> · ${tag} · re-read on every ▶ click`;
        }).catch(() => {
            const el = root.querySelector("#installPanel-catalog-path");
            if (el) el.textContent = "Catalog source: bridge offline";
        });

        // v352 — Audit endpoint compares the UI's ITEMS against the
        // bridge's catalog and reports gaps. This used to silently 404
        // on items like model-trellis-fp8 / node-trellis2 etc.; the
        // footer now shows whether any drift remains.
        const uiIds = ITEMS.map(it => it.id);
        fetch("/install/audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ uiIds }),
        }).then(r => r.json()).then(d => {
            const el = root.querySelector("#installPanel-audit");
            if (!el || !d?.ok) return;
            const missing = d.missing || [];
            const extra   = d.extra   || [];
            const manual  = d.manual  || [];
            if (missing.length === 0 && extra.length === 0) {
                el.innerHTML = `<span style="color:#6b6;">✓ audit: all ${d.totalUi} UI items wired into the ${d.totalCatalog}-entry catalog · ${manual.length} marked manual (require human steps)</span>`;
            } else {
                const missTxt = missing.length ? `<span style="color:#f66;">${missing.length} UI items missing from catalog: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}</span>` : "";
                const extraTxt = extra.length ? `<span style="color:#fa3;">${extra.length} catalog entries with no UI button: ${extra.slice(0, 5).join(", ")}${extra.length > 5 ? "…" : ""}</span>` : "";
                el.innerHTML = `Audit: ${[missTxt, extraTxt].filter(Boolean).join(" · ")}`;
            }
        }).catch(() => {
            const el = root.querySelector("#installPanel-audit");
            if (el) el.textContent = "Audit: bridge offline";
        });

        return root;
    }

    // v557 — (re)build the sections host for the current view mode.
    _renderSections() {
        const host = this._sectionsHost;
        if (!host) return;
        host.innerHTML = "";
        this._cbById = {};   // rebuild the per-id checkbox index for the new DOM
        this._groupBtns = []; // v558 — per-model "install missing" buttons
        this._groupCtl = {};  // v560 — per-group collapse/size controls
        if (this.viewMode === "model") {
            const count = {};
            for (const g of MODEL_GROUPS) for (const id of g.items) count[id] = (count[id] || 0) + 1;
            this._sharedCount = count;
            const seen = new Set();
            for (const g of MODEL_GROUPS) {
                host.appendChild(this._buildModelSection(g));
                for (const id of g.items) seen.add(id);
            }
            const unassigned = ITEMS.filter(it => !seen.has(it.id)).map(it => it.id);
            if (unassigned.length) {
                host.appendChild(this._buildModelSection({
                    id: "_unassigned",
                    label: "❔ Unassigned — not mapped to a model yet",
                    hint: "Add these to a group's items[] in MODEL_GROUPS (installPanel.js).",
                    items: unassigned,
                }));
            }
        } else {
            this._sharedCount = {};
            for (const cat of CATEGORIES) host.appendChild(this._buildSection(cat).wrap);
        }
        // Repaint installed/missing from real disk state (keeps saved marks if offline).
        this._refreshGroupCounts();         // immediate count from saved state (no probe — uses saved marks)
        // v1597 — no auto disk-check on render; "↻ Verify All" triggers verifyFilesystem() on demand.
    }

    _buildModelSection(group) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-bottom:10px;";

        const collapsed = this._isCollapsed(group.id);   // v560 — default minimized

        const head = document.createElement("div");
        head.style.cssText = "display:flex; align-items:center; gap:6px; margin-bottom:2px; border-left:3px solid #3a6cff; padding-left:6px; cursor:pointer;";
        head.title = "Click to expand / collapse dependencies";

        const chevron = document.createElement("span");
        chevron.style.cssText = "color:#9ab; font-size:10px; width:10px; flex:none;";
        chevron.textContent = collapsed ? "▸" : "▾";
        head.appendChild(chevron);

        const label = document.createElement("span");
        label.style.cssText = "flex:1; color:#fff; font-weight:bold; font-size:11px;";
        label.textContent = group.label;
        head.appendChild(label);

        // v560 — approx install size (filled lazily on expand / after install)
        const sizeBadge = document.createElement("span");
        sizeBadge.style.cssText = "font-size:9px; color:#8a9bb5; font-family:monospace; white-space:nowrap;";
        head.appendChild(sizeBadge);

        // v558 — per-model "Install missing (N)" button (does NOT toggle collapse)
        if (group.id !== "_unassigned") {
            const inst = document.createElement("button");
            inst.style.cssText = "padding:1px 7px; background:#10243a; color:#9ed5ff; border:1px solid #2a4a6a; border-radius:3px; cursor:pointer; font-family:monospace; font-size:9.5px; white-space:nowrap;";
            inst.textContent = "▶ Install missing";
            inst.addEventListener("click", (e) => { e.stopPropagation(); this._installGroupMissing(group, inst); });
            head.appendChild(inst);
            (this._groupBtns = this._groupBtns || []).push({ group, btn: inst });
        }
        wrap.appendChild(head);

        // Body (hint + dep rows) — hidden when collapsed.
        const body = document.createElement("div");
        body.style.display = collapsed ? "none" : "block";

        if (group.hint) {
            const hint = document.createElement("div");
            hint.style.cssText = "color:#777; font-size:9.5px; margin:0 0 4px 9px;";
            hint.textContent = group.hint;
            body.appendChild(hint);
        }
        const list = document.createElement("div");
        list.style.cssText = "margin-left:9px;";
        body.appendChild(list);

        const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
        for (const id of group.items) {
            const item = byId[id];
            if (!item) {
                const miss = document.createElement("div");
                miss.style.cssText = "color:#f66; font-size:9.5px; padding:3px 0;";
                miss.textContent = "⚠ unknown item id in MODEL_GROUPS: " + id;
                list.appendChild(miss);
                continue;
            }
            const shared = (this._sharedCount?.[id] || 0) >= 2 && group.id !== "_unassigned";
            list.appendChild(this._buildItemRow(item, shared));
        }
        wrap.appendChild(body);

        // Collapse toggle + per-group control registry.
        const setCollapsed = (c, persist = true) => {
            body.style.display = c ? "none" : "block";
            chevron.textContent = c ? "▸" : "▾";
            if (persist) { (this.state._collapsed = this.state._collapsed || {})[group.id] = c; saveState(this.state); }
            if (!c) this._fetchGroupSizes(group);   // lazy size fetch when opened
        };
        head.addEventListener("click", () => setCollapsed(body.style.display !== "none"));
        (this._groupCtl = this._groupCtl || {})[group.id] = { setCollapsed, sizeBadge, group };

        this._renderGroupSize(group);                 // show any cached size now
        if (!collapsed) this._fetchGroupSizes(group);  // refresh if opened on load
        return wrap;
    }

    // v557 — update EVERY pill (and checkbox) for an id. An item can appear in
    // multiple model groups, so a single querySelector would desync duplicates.
    _applyStatusToAll(id, kind) {
        // Optional items render "optional"/"not needed" instead of alarm "missing".
        let pillKind = kind;
        if (kind === "missing") {
            const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
            if (byId[id] && this._isOptional(byId[id])) pillKind = "optional";
        }
        if (this.root) {
            const pills = this.root.querySelectorAll(`[data-item-id="${id}"]`);
            for (const p of pills) this._setStatus(p, pillKind);
        }
        if (kind === "installed" || kind === "missing") {
            const installed = (kind === "installed");
            for (const cb of (this._cbById?.[id] || [])) { if (cb.checked !== installed) cb.checked = installed; }
        }
    }

    // ----- v560: collapse + size helpers -------------------------------------

    // Default state is MINIMIZED (deps hidden). Only an explicit `false` opens it.
    _isCollapsed(groupId) {
        return this.state._collapsed?.[groupId] !== false;
    }

    _fmtSize(bytes) {
        if (bytes == null || !isFinite(bytes)) return "";
        const u = ["B", "KB", "MB", "GB", "TB"];
        let n = bytes, i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i === 0 || n >= 10 ? Math.round(n) : n.toFixed(1)) + " " + u[i];
    }

    // Sum the measured size of a group's INSTALLED items. `partial` = some
    // installed items have no measured size (pip packages have no single
    // target, or not measured yet) → the total is a lower bound.
    _groupSizeBytes(group) {
        const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
        const sizes = this.state._sizes || {};
        let bytes = 0, known = 0, installedCount = 0;
        for (const id of group.items) {
            const it = byId[id];
            if (!it || !["node", "python", "model"].includes(it.category)) continue;
            if (this.state[id] !== true) continue;   // only count what's installed
            installedCount++;
            const s = sizes[id];
            if (typeof s === "number") { bytes += s; known++; }
        }
        return { bytes, known, installedCount, partial: known < installedCount };
    }

    _renderGroupSize(group) {
        const ctl = this._groupCtl?.[group.id];
        if (!ctl) return;
        const { bytes, known, installedCount, partial } = this._groupSizeBytes(group);
        if (known === 0) { ctl.sizeBadge.textContent = ""; ctl.sizeBadge.title = ""; return; }
        ctl.sizeBadge.textContent = "~" + this._fmtSize(bytes) + (partial ? "+" : "");
        ctl.sizeBadge.title =
            `Measured on-disk size of ${known} of ${installedCount} installed item(s)` +
            (partial ? `; the rest (pip packages / not yet measured) aren't counted, so this is a lower bound. ` : ". ") +
            "Shared dependencies are counted in every model that lists them.";
    }

    _refreshAllSizeBadges() {
        for (const id of Object.keys(this._groupCtl || {})) {
            this._renderGroupSize(this._groupCtl[id].group);
        }
    }

    // Lazily measure a group's installed items that haven't been sized yet,
    // via GET /install/size. Stores numbers (or null = no measurable target)
    // so we never re-ask. Bridge offline → leave unmeasured, try again later.
    async _fetchGroupSizes(group) {
        const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
        const sizes = (this.state._sizes = this.state._sizes || {});
        const todo = [];
        for (const id of group.items) {
            const it = byId[id];
            if (!it || !["node", "python", "model"].includes(it.category)) continue;
            if (this.state[id] !== true) continue;
            if (id in sizes) continue;     // already measured (number or null)
            todo.push(id);
        }
        if (!todo.length) return;
        let changed = false;
        for (const id of todo) {
            try {
                const r = await fetch(this._bridgeUrl(`/install/size?id=${encodeURIComponent(id)}`), { cache: "no-store" });
                const j = await r.json();
                sizes[id] = (j && j.ok && typeof j.bytes === "number") ? j.bytes : null;
                changed = true;
            } catch { break; }   // bridge offline — stop, retry on next expand
        }
        if (changed) { try { saveState(this.state); } catch {} this._renderGroupSize(group); }
    }

    // Force a fresh measurement of one item (after it's (re)installed), then
    // repaint every group badge that includes it.
    async _remeasure(id) {
        if (this.state._sizes) delete this.state._sizes[id];
        try {
            const r = await fetch(this._bridgeUrl(`/install/size?id=${encodeURIComponent(id)}`), { cache: "no-store" });
            const j = await r.json();
            (this.state._sizes = this.state._sizes || {})[id] = (j && j.ok && typeof j.bytes === "number") ? j.bytes : null;
            try { saveState(this.state); } catch {}
        } catch { /* offline */ }
        this._refreshAllSizeBadges();
    }

    // v559 — "effectively optional right now": flagged optional, OR required
    // only when a parent node is installed and that parent isn't yet. Lets the
    // UltraShape weights read 'optional' until node-ultrashape is in, then
    // become a real 'missing' dependency.
    _isOptional(item) {
        if (item.optional) return true;
        if (item.requiredIf) return this.state[item.requiredIf] !== true;
        return false;
    }

    // v558 — items in a group that are auto-installable AND not yet installed.
    // Skips: non-filesystem (runtimes/tools/flags), optional/not-needed, and
    // manual-build items (diso etc.), plus anything with no runnable cmds.
    _groupMissing(group) {
        const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
        const out = [];
        for (const id of group.items) {
            const it = byId[id];
            if (!it) continue;
            if (!["node", "python", "model", "patch"].includes(it.category)) continue;
            if (this._isOptional(it) || it.manual) continue;
            if (!this._isRunnable(it)) continue;
            if (this.state[it.id] === true) continue;
            out.push(it);
        }
        return out;
    }

    // v558 — missing items in a group that need a MANUAL build (e.g. diso).
    _groupManualMissing(group) {
        const byId = this._itemById || (this._itemById = Object.fromEntries(ITEMS.map(it => [it.id, it])));
        return group.items
            .map(id => byId[id])
            .filter(it => it && it.manual && !this._isOptional(it) && this.state[it.id] !== true);
    }

    // v558 — refresh every per-model button's label/count to match current state.
    _refreshGroupCounts() {
        for (const { group, btn } of (this._groupBtns || [])) {
            if (btn._installing) continue;
            const n = this._groupMissing(group).length;
            const m = this._groupManualMissing(group).length;
            if (n > 0) {
                btn.textContent = `▶ Install missing (${n})`;
                btn.disabled = false; btn.style.opacity = "1";
                btn.title = "Run each auto-installable missing item in this group, in order, via the bridge";
            } else if (m > 0) {
                btn.textContent = `⚙ ${m} need manual build`;
                btn.disabled = true; btn.style.opacity = "0.6";
                btn.title = "These need a manual build (e.g. diso) — use the row's ⬇ .bat / ▶";
            } else {
                btn.textContent = "✓ complete";
                btn.disabled = true; btn.style.opacity = "0.5";
                btn.title = "All required items in this group are installed";
            }
        }
    }

    // v558 — run every missing auto-installable item in a group, in order.
    async _installGroupMissing(group, btn) {
        const targets = this._groupMissing(group);
        if (!targets.length) { this._refreshGroupCounts(); return; }
        // v560 — drop the dependencies down so the user watches the run.
        this._groupCtl?.[group.id]?.setCollapsed(false);
        const ok = confirm(
            `Install ${targets.length} missing item(s) for "${group.label}" on YOUR machine, in order, via the bridge?\n\n` +
            targets.map(t => "• " + t.name).join("\n") +
            `\n\nEach is looked up by id server-side and run with PowerShell. Stops if the bridge goes offline.`
        );
        if (!ok) return;
        this.state._confirmedExec = true; saveState(this.state);

        btn._installing = true;
        btn.disabled = true;
        const origOpacity = btn.style.opacity;
        let done = 0, failed = 0, stopped = false;
        for (let i = 0; i < targets.length; i++) {
            const item = targets[i];
            btn.textContent = `▶ ${i + 1}/${targets.length}…`;
            try {
                const r = await fetch(this._bridgeUrl("/install/exec"), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id: item.id }),
                });
                const j = await r.json().catch(() => ({ ok: false }));
                const allOk = j.ok && Array.isArray(j.ran) && j.ran.length > 0 && j.ran.every(x => x.exitCode === 0);
                if (allOk) {
                    done++; this.state[item.id] = true;
                    this._applyStatusToAll(item.id, "installed");
                    this._remeasure(item.id);   // v560 — size it now that it's installed
                } else {
                    failed++;
                }
            } catch {
                failed++; stopped = true; break;   // bridge unreachable → stop the run
            }
        }
        saveState(this.state);
        btn._installing = false;
        btn.disabled = false;
        btn.style.opacity = origOpacity || "1";
        btn.textContent = stopped ? "× bridge offline" : `✓ ${done} done${failed ? ` / ${failed} failed` : ""}`;
        // Re-sync against real disk truth, then relabel the counts.
        setTimeout(() => { try { this.verifyFilesystem(); } catch {} this._refreshGroupCounts(); }, 600);
    }

    _buildSection(cat) {
        const wrap = document.createElement("div");
        wrap.style.cssText = "margin-bottom:10px;";

        const head = document.createElement("div");
        head.style.cssText = "color:#fff; font-weight:bold; font-size:11px; margin-bottom:2px;";
        head.textContent = cat.title;
        wrap.appendChild(head);

        const hint = document.createElement("div");
        hint.style.cssText = "color:#777; font-size:9.5px; margin-bottom:4px;";
        hint.textContent = cat.hint;
        wrap.appendChild(hint);

        const list = document.createElement("div");
        wrap.appendChild(list);

        // Populate items in this category
        for (const item of ITEMS) {
            if (item.category !== cat.id) continue;
            list.appendChild(this._buildItemRow(item));
        }

        return { wrap, list };
    }

    _buildItemRow(item, shared = false) {
        const row = document.createElement("div");
        row.style.cssText = "padding:5px 0; border-bottom:1px solid #1a1a1a;";

        const topLine = document.createElement("div");
        topLine.style.cssText = "display:flex; align-items:center; gap:6px;";

        const name = document.createElement("span");
        name.style.cssText = "flex:1; color:#d0d0d0;";
        name.textContent = item.name;
        topLine.appendChild(name);

        if (shared) {
            const sb = document.createElement("span");
            sb.textContent = "shared";
            sb.title = "Required by more than one model — same install status everywhere";
            sb.style.cssText = "padding:1px 5px; font-size:8.5px; border-radius:7px; background:#23314a; color:#9ed5ff; border:1px solid #356;";
            topLine.appendChild(sb);
        }

        const status = pill("unknown", "unknown");
        status.dataset.itemId = item.id;
        if (item.optional || item.requiredIf) status.dataset.optLabel = item.optionalLabel || "optional";
        topLine.appendChild(status);

        // Per-category actions
        if (item.category === "runtime" && item.ping) {
            const btn = this._mkBtn("↻", "Ping " + item.ping);
            btn.addEventListener("click", () => this._verifyItem(item, status));
            topLine.appendChild(btn);
        } else if (["node", "python", "model"].includes(item.category)) {
            // v470 — re-check this item against the bridge's disk view.
            const btn = this._mkBtn("↻", "Verify against disk via bridge");
            btn.addEventListener("click", () => this.verifyFilesystem());
            topLine.appendChild(btn);
        }

        if ((this._cmdsFor(item).length) || item.patch) {
            const btn = this._mkBtn("📋", "Copy command/patch to clipboard");
            btn.addEventListener("click", () => this._copyItemPayload(item, btn));
            topLine.appendChild(btn);
        }

        // Generated-file download (e.g. build_diso.bat). Writes the file out
        // client-side — no bridge round-trip, no PowerShell quote-escaping.
        if (item.genFile && item.genFile.content) {
            const gb = this._mkBtn("⬇ " + (item.genFile.label || "file"), "Download " + item.genFile.name);
            gb.style.color = "#c0ffc0";
            gb.addEventListener("click", () => this._downloadFile(item.genFile.name, item.genFile.content, gb));
            topLine.appendChild(gb);
        }

        // v339 — Execute button. Only enabled when the item has cmds that
        // aren't entirely comments. Posts to /install/exec on the bridge;
        // bridge looks the id up server-side, no raw command pass-through.
        const runnable = this._isRunnable(item);
        if (runnable) {
            const runBtn = this._mkBtn("▶", "Execute via bridge");
            runBtn.style.color = "#9ed5ff";
            runBtn.addEventListener("click", () => this._executeItem(item, row, status, runBtn));
            topLine.appendChild(runBtn);
            // v652 — Uninstall button. Asks the bridge to derive uninstall
            // commands from this item's install cmds (git clone → rm-rf,
            // pip install → pip uninstall). Bridge runs a dryRun first so
            // the user sees a confirmation prompt with the actual commands
            // before anything happens. Items whose install cmds don't match
            // a safe uninstall pattern get a clear "no automated uninstall"
            // message instead of running anything.
            const unBtn = this._mkBtn("🗑", "Uninstall via bridge (auto-derived)");
            unBtn.style.color = "#f8a";
            unBtn.addEventListener("click", () => this._uninstallItem(item, row, status, unBtn));
            topLine.appendChild(unBtn);
        }

        // Mark-installed toggle for filesystem items
        if (["node", "python", "model", "patch"].includes(item.category)) {
            const cb = document.createElement("input");
            cb.type = "checkbox";
            cb.checked = !!this.state[item.id];
            cb.title = "Mark as installed";
            cb.style.cssText = "margin:0; cursor:pointer;";
            cb.addEventListener("change", () => {
                this.state[item.id] = cb.checked;
                saveState(this.state);
                this._applyStatusToAll(item.id, cb.checked ? "installed" : "missing");
            });
            topLine.appendChild(cb);
            // initial state
            this._setStatus(status, cb.checked ? "installed" : (this._isOptional(item) ? "optional" : "missing"));
            // Stash the checkbox on the row so executeItem can flip it
            row._installedCb = cb;
            // v470/v557 — index by id (ARRAY: an item may appear in multiple
            // model groups) so verifyFilesystem() syncs every copy to disk.
            (this._cbById = this._cbById || {});
            (this._cbById[item.id] = this._cbById[item.id] || []).push(cb);
        }

        row.appendChild(topLine);

        // Purpose subtext
        if (item.purpose) {
            const p = document.createElement("div");
            p.style.cssText = "color:#888; font-size:9.5px; margin-top:2px; line-height:1.35;";
            p.textContent = item.purpose;
            row.appendChild(p);
        }

        // v1246 — install specs: rough download size, estimated time, platforms. Flags
        // items that don't apply to the bridge's OS (this._platform, from /install/catalog).
        if (item.specs) {
            const s = item.specs, bits = [];
            if (s.sizeGB != null) bits.push("~" + s.sizeGB + " GB");
            else if (s.sizeMB != null) bits.push("~" + s.sizeMB + " MB");
            if (Array.isArray(s.estMin)) bits.push("~" + s.estMin[0] + "\u2013" + s.estMin[1] + " min");
            else if (s.estMin != null) bits.push("~" + s.estMin + " min");
            let mismatch = false;
            if (Array.isArray(s.platforms)) {
                const nice = { win32: "Win", darwin: "Mac", linux: "Linux" };
                if (this._platform && !s.platforms.includes(this._platform)) { bits.push("\u2014 not " + (nice[this._platform] || this._platform)); mismatch = true; }
                else bits.push(s.platforms.map(p => nice[p] || p).join("/"));
            }
            if (s.note) bits.push(s.note);
            const sp = document.createElement("div");
            sp.style.cssText = "color:" + (mismatch ? "#a66" : "#6c9") + "; font-size:9px; margin-top:2px; letter-spacing:.3px;";
            sp.textContent = "\u23F1 " + bits.join(" \u00B7 ");
            row.appendChild(sp);
            if (mismatch) row.style.opacity = "0.5";
        }

        // Expandable details (click name to toggle)
        const details = document.createElement("div");
        details.style.cssText = "display:none; margin-top:4px; padding:6px 8px; background:#0a0a14; border:1px solid #222; border-radius:3px; font-size:10px;";
        if (item.path) {
            details.appendChild(this._kv("Path", item.path));
        }
        if (item.file) {
            details.appendChild(this._kv("File", item.file));
        }
        if (item.src) {
            details.appendChild(this._kv("Source", item.src));
        }
        // v1596 — platform-aware command display: show cmdsMac on macOS / cmdsLinux on Linux when present,
        // matching what the bridge actually runs (it prefers cmdsMac/cmdsLinux in /install/exec).
        const _dcmds = this._cmdsFor(item);
        if (_dcmds && _dcmds.length) {
            const pre = document.createElement("pre");
            pre.style.cssText = "white-space:pre-wrap; word-break:break-all; color:#9ed5ff; background:#000; padding:6px; margin:4px 0; border-radius:3px; font-size:10px;";
            pre.textContent = _dcmds.join("\n");
            details.appendChild(pre);
        }
        if (item.patch) {
            const pre = document.createElement("pre");
            pre.style.cssText = "white-space:pre-wrap; word-break:break-all; color:#c0ffc0; background:#000; padding:6px; margin:4px 0; border-radius:3px; font-size:10px;";
            pre.textContent = item.patch;
            details.appendChild(pre);
        }
        if (item.notes) {
            const n = document.createElement("div");
            n.style.cssText = "color:#ffd884; font-size:9.5px; margin-top:4px; line-height:1.4;";
            n.textContent = "⚠ " + item.notes;
            details.appendChild(n);
        }
        // v339 — output area for executed commands. Initially hidden,
        // populated by _executeItem when the user clicks ▶.
        const output = document.createElement("div");
        output.style.cssText = "display:none; margin-top:4px;";
        row._output = output;
        details.appendChild(output);

        row.appendChild(details);

        // Click name (or row) to toggle
        const toggle = () => {
            details.style.display = details.style.display === "none" ? "block" : "none";
        };
        name.style.cursor = "pointer";
        name.title = "Click to expand";
        name.addEventListener("click", toggle);

        // Stash details ref so execute can auto-expand
        row._details = details;

        return row;
    }

    /** v1597 — platform-aware command set: cmdsMac on macOS / cmdsLinux on Linux when present, else cmds.
     *  Mirrors what the bridge's /install/exec actually runs, so display/check/execute/copy/export all agree. */
    _cmdsFor(item) {
        if (this._platform === "darwin" && Array.isArray(item.cmdsMac) && item.cmdsMac.length) return item.cmdsMac;
        if (this._platform === "linux" && Array.isArray(item.cmdsLinux) && item.cmdsLinux.length) return item.cmdsLinux;
        return Array.isArray(item.cmds) ? item.cmds : [];
    }

    /** v339 — runnable = has cmds, and at least one isn't a comment. */
    _isRunnable(item) {
        if (item.autoPatch) return true;   // v471 — code patches applied in Node via the bridge
        const cmds = this._cmdsFor(item);
        if (!cmds.length) return false;
        return cmds.some(c => {
            const t = String(c).trim();
            return t && !t.startsWith("#");
        });
    }

    /** v339 — execute an item via the bridge. */
    async _executeItem(item, row, status, runBtn) {
        // Auto-expand so user sees output
        if (row._details && row._details.style.display === "none") {
            row._details.style.display = "block";
        }
        const out = row._output;
        out.style.display = "block";

        // Render execution shell
        out.innerHTML = "";
        const head = document.createElement("div");
        head.style.cssText = "color:#9ed5ff; font-size:10px; margin-bottom:4px;";
        head.textContent = "▶ executing on bridge…";
        out.appendChild(head);

        const log = document.createElement("pre");
        log.style.cssText = "white-space:pre-wrap; word-break:break-all; background:#000; color:#ccc; padding:6px; margin:0; border-radius:3px; font-size:10px; max-height:240px; overflow-y:auto;";
        out.appendChild(log);

        // Show actual one-time confirmation IF this is the user's first run
        if (!this.state._confirmedExec) {
            const ok = confirm(
                `About to run install commands on YOUR machine via the bridge.\n\n` +
                `Item: ${item.name}\n\n` +
                `${this._cmdsFor(item).filter(c => !String(c).trim().startsWith("#")).join("\n")}\n\n` +
                `Continue? (This warning shown once per session.)`
            );
            if (!ok) {
                head.textContent = "× cancelled";
                head.style.color = "#ff8a8a";
                return;
            }
            this.state._confirmedExec = true;
            saveState(this.state);
        }

        // Disable button during execution
        const origLabel = runBtn.textContent;
        runBtn.disabled = true;
        runBtn.textContent = "…";

        try {
            const r = await fetch(this._bridgeUrl("/install/exec"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id }),
            });
            const j = await r.json().catch(() => ({ ok: false, error: "bad_response" }));
            if (!j.ok) {
                head.textContent = "× error: " + (j.error || "unknown");
                head.style.color = "#ff8a8a";
                log.textContent = JSON.stringify(j, null, 2);
            } else {
                const lines = [];
                let allOk = true;
                for (const r of (j.ran || [])) {
                    lines.push(`$ ${r.cmd}`);
                    if (r.stdout) lines.push(r.stdout.trimEnd());
                    if (r.stderr) lines.push(r.stderr.trimEnd());
                    lines.push(r.exitCode === 0 ? "  → exit 0" : `  → exit ${r.exitCode}`);
                    if (r.exitCode !== 0) allOk = false;
                    lines.push("");
                }
                log.textContent = lines.join("\n");
                head.textContent = allOk
                    ? `✓ completed (${j.elapsed_ms}ms)`
                    : `× failed after ${j.ran?.length || 0} command${(j.ran?.length || 0) === 1 ? "" : "s"} (${j.elapsed_ms}ms)`;
                head.style.color = allOk ? "#8aff9a" : "#ff8a8a";

                // v339 — auto-verify after successful exec. For runtime items,
                // ping the URL. For filesystem items, flip the installed flag.
                if (allOk) {
                    if (item.category === "runtime") {
                        this._verifyItem(item, status);
                    } else if (row._installedCb) {
                        row._installedCb.checked = true;
                        row._installedCb.dispatchEvent(new Event("change"));
                        this._remeasure(item.id);   // v560 — size it now that it's installed
                    }
                }
            }
        } catch (e) {
            head.textContent = "× bridge unreachable";
            head.style.color = "#ff8a8a";
            log.textContent =
                "Could not reach the bridge at " + this._bridgeUrl("/install/exec") + ".\n" +
                "Start it with: node ai-bridge/server.js\n\n" +
                (e?.message || String(e));
        } finally {
            runBtn.disabled = false;
            runBtn.textContent = origLabel;
        }
    }

    /** v652 — uninstall an item via auto-derived commands. */
    async _uninstallItem(item, row, status, unBtn) {
        if (row._details && row._details.style.display === "none") {
            row._details.style.display = "block";
        }
        const out = row._output;
        out.style.display = "block";

        // Reuse the head/log surfaces from the execute panel.
        let head = out.querySelector("._head"), log = out.querySelector("._log");
        if (!head) {
            out.innerHTML = "";
            head = document.createElement("div"); head.className = "_head";
            head.style.cssText = "padding:3px 6px; font-size:11px; font-weight:bold; color:#fda;";
            out.appendChild(head);
            log = document.createElement("pre"); log.className = "_log";
            log.style.cssText = "margin:0; padding:6px; font-size:10.5px; line-height:1.3; color:#cfd; background:#0a0606; border:1px solid #543; border-radius:3px; max-height:340px; overflow:auto; white-space:pre-wrap; word-break:break-all;";
            out.appendChild(log);
        }

        const origLabel = unBtn.textContent;
        unBtn.disabled = true; unBtn.textContent = "…";

        try {
            // Step 1: dry-run to derive the commands. Show them to the user for confirmation.
            head.textContent = "deriving uninstall commands…";
            head.style.color = "#fda";
            const dryR = await fetch(this._bridgeUrl("/install/uninstall"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, dryRun: true }),
            });
            const dry = await dryR.json().catch(() => ({ ok: false, error: "bad_response" }));
            if (!dry.ok) {
                head.textContent = "× " + (dry.error === "no_safe_uninstall_pattern_matched"
                    ? "no automated uninstall for this item (commands didn't match git-clone or pip-install patterns)"
                    : "× error: " + (dry.error || "unknown"));
                head.style.color = "#fa8";
                log.textContent = JSON.stringify(dry, null, 2);
                return;
            }
            const cmdList = dry.derived.map((c, i) => `${i + 1}.  ${c}`).join("\n");
            const skipList = (dry.skipped && dry.skipped.length)
                ? "\n\nSkipped (no uninstall pattern):\n" + dry.skipped.map(s => "  - " + s.cmd).join("\n")
                : "";
            const confirmed = window.confirm(
                `Uninstall "${item.id}" — these commands will run:\n\n${cmdList}${skipList}\n\nProceed?`
            );
            if (!confirmed) {
                head.textContent = "uninstall cancelled";
                head.style.color = "#bbb";
                log.textContent = "Preview only — nothing was run:\n\n" + cmdList + skipList;
                return;
            }
            // Step 2: real run.
            head.textContent = "uninstalling…";
            const realR = await fetch(this._bridgeUrl("/install/uninstall"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: item.id, dryRun: false }),
            });
            const real = await realR.json().catch(() => ({ ok: false, error: "bad_response" }));
            if (!real.ok && !real.ran) {
                head.textContent = "× error: " + (real.error || "unknown");
                head.style.color = "#ff8a8a";
                log.textContent = JSON.stringify(real, null, 2);
                return;
            }
            const lines = [];
            for (const r of (real.ran || [])) {
                lines.push(`$ ${r.cmd}`);
                if (r.stdout) lines.push(r.stdout.trimEnd());
                if (r.stderr) lines.push(r.stderr.trimEnd());
                lines.push(r.exitCode === 0 ? "  → exit 0" : `  → exit ${r.exitCode}`);
                lines.push("");
            }
            log.textContent = lines.join("\n");
            head.textContent = real.ok ? "✓ uninstalled" : "× failed (some commands non-zero exit)";
            head.style.color = real.ok ? "#8aff9a" : "#fa8";
            // Mark uninstalled in our local state for filesystem items
            if (real.ok && row._installedCb) {
                row._installedCb.checked = false;
                row._installedCb.dispatchEvent(new Event("change"));
                this._remeasure(item.id);
            }
        } catch (e) {
            head.textContent = "× bridge unreachable";
            head.style.color = "#ff8a8a";
            log.textContent = (e?.message || String(e));
        } finally {
            unBtn.disabled = false;
            unBtn.textContent = origLabel;
        }
    }

    /** v339 — figure out where the bridge lives. By default same origin. */
    _bridgeUrl(path) {
        // If the engine is served by the bridge directly (typical),
        // relative paths work. Otherwise the user can set
        // window._installBridgeBase = "http://localhost:3001".
        const base = (typeof window !== "undefined" && window._installBridgeBase) || "";
        return base + path;
    }

    _mkBtn(label, title) {
        const b = document.createElement("button");
        b.style.cssText = "padding:1px 6px; background:#1a1a1a; color:#aaa; border:1px solid #444; border-radius:3px; cursor:pointer; font-family:monospace; font-size:10px;";
        b.textContent = label;
        b.title = title;
        return b;
    }

    _kv(k, v) {
        const d = document.createElement("div");
        d.style.cssText = "margin:2px 0; color:#aaa;";
        d.innerHTML = `<span style='color:#888'>${k}:</span> <span style='color:#d0d0d0; word-break:break-all;'>${escape(v)}</span>`;
        return d;
    }

    _setStatus(pillEl, kind) {
        const labels = { online: "online", offline: "offline", unknown: "unknown", installed: "installed", missing: "missing", optional: "optional" };
        // optional items can carry a custom label (e.g. "not needed")
        pillEl.textContent = (kind === "optional" && pillEl.dataset.optLabel) ? pillEl.dataset.optLabel : (labels[kind] || kind);
        const colors = {
            online:    ["#8aff9a", "#0d3a14"],
            offline:   ["#ff8a8a", "#3a0000"],
            unknown:   ["#888",    "#222"],
            installed: ["#8acfff", "#0d2a3a"],
            missing:   ["#ffd884", "#3a2a00"],
            optional:  ["#8a9bb5", "#171c26"],
        }[kind] || ["#888", "#222"];
        pillEl.style.color = colors[0];
        pillEl.style.background = colors[1];
    }

    async _verifyItem(item, pillEl) {
        if (!item.ping) return;
        this._setStatus(pillEl, "unknown");
        pillEl.textContent = "pinging…";
        try {
            const r = await fetch(item.ping, { cache: "no-store", method: "GET" });
            this._setStatus(pillEl, r.ok ? "online" : "offline");
        } catch {
            this._setStatus(pillEl, "offline");
        }
    }

    async verifyAll() {
        this._lastVerifyAll = Date.now();
        for (const item of ITEMS) {
            if (!item.ping) continue;
            const pillEl = this.root.querySelector(`[data-item-id="${item.id}"]`);
            if (pillEl) this._verifyItem(item, pillEl);
        }
        // v470 — also verify node/python/model items against real disk state
        // via the bridge, instead of trusting the localStorage checkboxes.
        this.verifyFilesystem();
    }

    // v470 — ask the bridge what's actually installed on disk. The bridge
    // derives each item's check target from its catalog commands (clone
    // folder for nodes, pip package for python) and stats the filesystem.
    // "installed"/"missing" come from real disk state and override the
    // checkbox; "unknown"/"manual" leave the manual checkbox in charge; if
    // the bridge is unreachable we change nothing (offline → keep marks).
    async verifyFilesystem() {
        let data;
        try {
            const r = await fetch("/install/check", { cache: "no-store" });
            data = await r.json();
        } catch {
            this._setFsNote("⚠ bridge offline — showing your saved marks (disk not verified)");
            return;
        }
        if (!data?.ok || !data.statuses) return;
        this._lastFsCheck = data;

        if (!data.rootExists) {
            this._setFsNote(`⚠ ComfyUI root not found at <code>${data.comfyRoot}</code> — set <code>comfyRoot</code> in asset-pipeline-config.json. Showing saved marks.`);
            return;
        }

        let verified = 0;
        for (const item of ITEMS) {
            if (!["node", "python", "model", "patch"].includes(item.category)) continue;
            const st = data.statuses[item.id];
            if (st !== "installed" && st !== "missing") continue;   // unknown/manual/ping → leave the checkbox alone
            verified++;
            // v557 — update EVERY pill + checkbox for this id (duplicates
            // across model groups), not just the first one.
            this._applyStatusToAll(item.id, st);
            this.state[item.id] = (st === "installed");
        }
        try { saveState(this.state); } catch {}
        this._refreshGroupCounts();   // v558 — relabel per-model buttons from disk truth
        this._refreshAllSizeBadges(); // v560 — repaint size badges (install state may have changed)
        const pipTag = data.pipKnown ? "" : " (python packages unread — is python_embeded present?)";
        this._setFsNote(`✓ verified ${verified} items against disk at <code>${data.comfyRoot}</code>${pipTag}`);
    }

    _setFsNote(html) {
        const el = this.root?.querySelector("#installPanel-fscheck");
        if (el) el.innerHTML = "Disk check: " + html;
    }

    _downloadFile(name, content, btn) {
        try {
            const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = name;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 3000);
            if (btn) { const o = btn.textContent; btn.textContent = "✓"; setTimeout(() => { btn.textContent = o; }, 1200); }
        } catch (e) {
            console.warn("[installPanel] download failed:", e);
        }
    }

    async _copyItemPayload(item, btn) {
        let payload = "";
        if (this._cmdsFor(item).length) payload += this._cmdsFor(item).join("\n");
        if (item.patch) payload += (payload ? "\n\n" : "") + item.patch;
        if (!payload) return;
        try {
            await navigator.clipboard.writeText(payload);
            const orig = btn.textContent;
            btn.textContent = "✓";
            setTimeout(() => { btn.textContent = orig; }, 1200);
        } catch (e) {
            console.warn("[installPanel] clipboard write failed:", e);
        }
    }

    async _exportAll() {
        const lines = [
            "# SweK Engine local pipeline setup — generated by Install Panel",
            (this._platform === "darwin" || this._platform === "linux") ? "# Run from Terminal (sh/zsh), top to bottom. Stop and inspect on any failure." : "# Run from PowerShell, top to bottom. Stop and inspect on any failure.",
            "",
        ];
        for (const cat of CATEGORIES) {
            lines.push(`# === ${cat.title} ===`);
            for (const item of ITEMS) {
                if (item.category !== cat.id) continue;
                lines.push(`# --- ${item.name} ---`);
                if (item.purpose) lines.push(`#   ${item.purpose}`);
                if (item.path)    lines.push(`#   Path: ${item.path}`);
                if (item.file)    lines.push(`#   File: ${item.file}`);
                if (item.src)     lines.push(`#   Source: ${item.src}`);
                if (item.notes)   lines.push(`#   ⚠ ${item.notes}`);
                { const _c = this._cmdsFor(item); if (_c.length) lines.push(..._c); }
                if (item.patch)   lines.push("# PATCH:\n" + item.patch.split("\n").map(l => "# " + l).join("\n"));
                lines.push("");
            }
            lines.push("");
        }
        const text = lines.join("\n");
        try {
            await navigator.clipboard.writeText(text);
            console.log("[installPanel] full setup script copied (" + text.length + " chars)");
        } catch (e) {
            console.warn("[installPanel] export failed:", e);
        }
    }

    // v339 — non-docked helpers. When dock-managed, the dock controls
    // visibility via its drawer's CSS class; the IntersectionObserver
    // catches that path. When called directly (e.g. window.installPanel.show()
    // from the console), we override display.
    show() {
        this.root.style.display = "block";
        this.verifyAll();
    }
    hide() { this.root.style.display = "none"; }
    toggle() {
        if (this.root.style.display === "none") this.show();
        else this.hide();
    }
}

function escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[c]));
}

// Export the catalog separately so tests can validate without instantiating the panel
export { ITEMS, CATEGORIES, MODEL_GROUPS, LS_KEY };
