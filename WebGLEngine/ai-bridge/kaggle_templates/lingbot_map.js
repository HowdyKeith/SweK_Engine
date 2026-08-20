// kaggle_templates/lingbot_map.js — LingBot-Map (Robbyant/lingbot-map) video/images → 3D scene.
//
// A feed-forward 3D foundation model (Ant Group embodied-AI): reconstructs a 3D scene from a
// streaming video or an ordered image folder (~20 FPS, 10k+ frames). Output is a 3D point/mesh
// scene (.glb/.ply) you can pull into GPU_Assets/ as reference geometry for the VoxelEngine.
//
// !!!! HARDWARE FLOOR — READ THIS !!!!
// LingBot-Map's stack (FlashInfer, and often flash-attn) requires GPU compute capability sm_75+
// (Turing). Kaggle's TWO free GPUs are:
//    • P100 = sm_60  ← BELOW the floor. FlashInfer will not build/run.
//    • T4   = sm_75  ← AT the floor. Works (may need care on some kernels).
// BUT: the Kaggle *API* (which the SweK bridge uses to push) has NO way to request T4 — an
// API push ALWAYS lands on P100. There is no kernel-metadata field for GPU type (open Kaggle
// feature request). So the honest workflow is:
//    1. SweK pushes this notebook (lands on P100).
//    2. You open it on kaggle.com, set Accelerator → "GPU T4 x2", and Run All.
// The first cell DETECTS the GPU and, if it's a P100, STOPS with that exact instruction instead
// of dying 10 minutes later on a cryptic FlashInfer compile error. Your local 1070 is sm_61 —
// also below the floor — so T4-on-Kaggle is genuinely the only free way to run this.
//
// HONEST: best-effort template. Repo verified 2026-07 (Robbyant/lingbot-map; weights + demo on
// HF: robbyant/lingbot-map, robbyant/lingbot-map-demo). The README is the source of truth for the
// exact demo command + checkpoint names. Run the Diagnostic template first.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "lingbot_map",
    label: "LingBot-Map (video → 3D scene · T4 ONLY — see notes)",
    gpu: true,
    inputKind: "video",
    defaultDatasets: [],
    paramsSchema: [
        { name: "videoBase64", type: "video", required: false,
          help: "a short video (mp4/mov) to reconstruct. Either this OR attach a Kaggle Dataset of ordered frames." },
        { name: "frameDatasetSlug", type: "text", default: "",
          help: "optional: a Kaggle Dataset slug (user/name) holding an ordered image folder, if you don't upload a video" },
        { name: "maxFrames", type: "int", default: 300,
          help: "cap the number of frames processed (keeps runtime/VRAM sane on a T4)" },
        { name: "fps", type: "int", default: 4,
          help: "frames-per-second to sample from the video (lower = fewer frames = faster)" },
    ],

    buildNotebook(params, ctx) {
        const videoB64  = String(params.videoBase64 || "").replace(/^data:video\/[a-z0-9]+;base64,/i, "");
        const frameSlug = String(params.frameDatasetSlug || "").trim();
        const maxFrames = parseInt(params.maxFrames, 10) || 300;
        const fps       = parseInt(params.fps, 10) || 4;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "LingBot-Map video → 3D scene on Kaggle.",
                    "",
                    "**⚠️ Set the accelerator to `GPU T4 x2` before Run All.** This model needs sm_75+ (FlashInfer);",
                    "Kaggle's other GPU (P100 = sm_60) is below the floor and an API push defaults to P100. The next",
                    "cell checks and will stop with instructions if you're on a P100."]),

                cell([
                    "# ---- HARDWARE GATE: require sm_75+ (T4). Stop loudly on P100 (sm_60). ----",
                    "import sys, torch",
                    "assert torch.cuda.is_available(), 'No CUDA device — enable the GPU accelerator in notebook settings.'",
                    "name = torch.cuda.get_device_name(0)",
                    "major, minor = torch.cuda.get_device_capability(0)",
                    "sm = major * 10 + minor",
                    "print(f'[gpu] {name}  sm_{major}{minor}  ·  torch {torch.__version__}  cuda {torch.version.cuda}')",
                    "if sm < 75:",
                    "    print()",
                    "    print('=' * 68)",
                    "    print(f' STOP: this GPU is {name} (sm_{major}{minor}), below LingBot-Map\\'s sm_75 floor.')",
                    "    print(' FlashInfer / flash-attn will NOT build here.')",
                    "    print()",
                    "    print(' FIX: top-right notebook settings → Accelerator → \"GPU T4 x2\" → Run All.')",
                    "    print(' (An API/automated push always lands on P100; you must switch to T4 by hand.)')",
                    "    print('=' * 68)",
                    "    raise SystemExit('Wrong GPU — switch to T4 x2 and re-run. Nothing below this ran.')",
                    "print('[gpu] OK — sm_75+ detected, proceeding.')",
                ]),

                // HF cache redirect
                cell([
                    "import os",
                    "cache_root = None",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if not os.path.isdir(p): continue",
                    "        if os.path.isdir(os.path.join(p, 'hub')):",
                    "            cache_root = os.path.join(p, 'hub'); break",
                    "        if any(n.startswith('models--') for n in os.listdir(p)):",
                    "            cache_root = p; break",
                    "if cache_root:",
                    "    os.environ['HF_HUB_CACHE'] = cache_root",
                    "    os.environ['HUGGINGFACE_HUB_CACHE'] = cache_root",
                    "    print(f'[cache] HF_HUB_CACHE -> {cache_root}')",
                    "else:",
                    "    print('[cache] no HF cache dataset attached — will download from HF')",
                ]),

                cell([
                    "# clone LingBot-Map + install deps (torch is preinstalled on Kaggle; add the model's extras)",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/lingbot-map'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/Robbyant/lingbot-map.git', '/kaggle/working/lingbot-map'])",
                    "os.chdir('/kaggle/working/lingbot-map')",
                    "if os.path.isfile('requirements.txt'):",
                    "    subprocess.call(['pip', 'install', '-q', '-r', 'requirements.txt'])",
                    "# common extras this class of model needs; tolerate failures so the run log is readable",
                    "for pkg in ['flashinfer-python', 'trimesh', 'huggingface_hub', 'opencv-python-headless', 'imageio[ffmpeg]']:",
                    "    subprocess.call(['pip', 'install', '-q', pkg])",
                ]),

                cell([
                    "# build the frame folder: from an uploaded video, or from an attached frame dataset",
                    "import os, base64, subprocess, glob",
                    `VIDEO_B64 = ${JSON.stringify(videoB64)}`,
                    `FRAME_SLUG = ${JSON.stringify(frameSlug)}`,
                    `MAX_FRAMES = ${maxFrames}`,
                    `FPS = ${fps}`,
                    "frames_dir = '/kaggle/working/frames'",
                    "os.makedirs(frames_dir, exist_ok=True)",
                    "if VIDEO_B64:",
                    "    with open('/kaggle/working/input.mp4', 'wb') as f:",
                    "        f.write(base64.b64decode(VIDEO_B64))",
                    "    # sample frames with ffmpeg",
                    "    subprocess.check_call(['ffmpeg', '-y', '-i', '/kaggle/working/input.mp4',",
                    "                           '-vf', f'fps={FPS}', '-frames:v', str(MAX_FRAMES),",
                    "                           os.path.join(frames_dir, 'frame_%05d.png')])",
                    "elif FRAME_SLUG:",
                    "    # frames come from the attached dataset under /kaggle/input/<name>",
                    "    src = None",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if os.path.isdir(p) and glob.glob(os.path.join(p, '**', '*.*'), recursive=True):",
                    "            src = p; break",
                    "    print('[frames] using attached dataset:', src)",
                    "    frames_dir = src or frames_dir",
                    "else:",
                    "    raise SystemExit('No input: upload a video OR set frameDatasetSlug to an attached frame dataset.')",
                    "n = len(glob.glob(os.path.join(frames_dir, '**', '*.png'), recursive=True) + glob.glob(os.path.join(frames_dir, '**', '*.jpg'), recursive=True))",
                    "print(f'[frames] {n} frames in {frames_dir}')",
                ]),

                cell([
                    "# run the LingBot-Map demo. Entry-point + checkpoint names may drift between commits,",
                    "# so try the documented forms and fall back with a clear message (check the README).",
                    "import os, subprocess",
                    "os.chdir('/kaggle/working/lingbot-map')",
                    "candidates = [",
                    "    ['python', 'demo.py', '--image_folder', frames_dir, '--output', '/kaggle/working/scene'],",
                    "    ['python', 'demo.py', '--input', frames_dir, '--output_dir', '/kaggle/working/scene'],",
                    "    ['python', 'inference.py', '--image_folder', frames_dir, '--output', '/kaggle/working/scene'],",
                    "]",
                    "ran = False",
                    "for args in candidates:",
                    "    if not os.path.isfile(args[1]): continue",
                    "    print('[run]', ' '.join(args))",
                    "    r = subprocess.run(args)",
                    "    if r.returncode == 0: ran = True; break",
                    "    print(f'[run] {args[1]} exited {r.returncode} — trying next')",
                    "if not ran:",
                    "    print('[run] no known entry point succeeded — check the LingBot-Map README for the current demo command.')",
                    "    print('      scripts:', [f for f in os.listdir('.') if f.endswith('.py')])",
                ]),

                cell([
                    "# collect the reconstructed scene → promote to /kaggle/working/output.glb (or .ply)",
                    "import os, glob, shutil",
                    "found = []",
                    "for ext in ('*.glb', '*.ply', '*.obj'):",
                    "    found += glob.glob(os.path.join('/kaggle/working', '**', ext), recursive=True)",
                    "found = [f for f in found if not f.endswith('output.glb')]",
                    "print('scene files:', found)",
                    "glb = next((f for f in found if f.endswith('.glb')), None)",
                    "ply = next((f for f in found if f.endswith('.ply')), None)",
                    "if glb:",
                    "    shutil.copy(glb, '/kaggle/working/output.glb'); print('promoted', glb, '→ output.glb')",
                    "elif ply:",
                    "    shutil.copy(ply, '/kaggle/working/output.ply'); print('kept', ply, '→ output.ply (point cloud)')",
                    "    try:",
                    "        import trimesh; trimesh.load(ply).export('/kaggle/working/output.glb'); print('also exported output.glb')",
                    "    except Exception as e:",
                    "        print('(could not convert ply→glb:', e, ') — the .ply point cloud is your output.')",
                    "else:",
                    "    print('NO SCENE PRODUCED — see the run log above.')",
                    "print('working dir:', sorted(f for f in os.listdir('/kaggle/working') if not f.startswith('.')))",
                ]),
            ],
            metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
            nbformat: 4, nbformat_minor: 4,
        };
    },
};
