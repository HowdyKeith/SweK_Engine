// kaggle_templates/triposplat.js — TripoSplat (VAST-AI-Research, 2026-06).
//
// Single-image → 3D Gaussian splats (.ply). Flow-matching generative
// model with learned density control. Two-file repo (~2000 LOC), MIT
// license. NOT an LLM. Successor in spirit to TripoSG but outputs
// Gaussian splats instead of polygon meshes — view in SuperSplat /
// SparkJS, or load via the engine's splat renderer (v784+).
//
// Repo:    https://github.com/VAST-AI-Research/TripoSplat
// Weights: https://huggingface.co/VAST-AI/TripoSplat
// Paper:   arXiv:2605.16355 — "Generative 3D Gaussians with Learned Density Control"
//
// Auto-downloads VAST-AI/TripoSplat on first run (public, no token).
// Output: .ply Gaussian splat point cloud → /kaggle/working/output.ply

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "triposplat",
    label: "TripoSplat (image → 3D Gaussian splats .ply, VAST-AI June 2026)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image — PNG/JPG. README recommends square images with the subject centered and a clean background." },
        { name: "numGaussians", type: "int", default: 32768,
          help: "Gaussian count (power-of-2 up to 262144). Higher = better quality + larger .ply + slower render. 32768 is a good portfolio-grade default." },
    ],

    buildNotebook(params, ctx) {
        const imgB64    = String(params.imageBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const numGauss  = parseInt(params.numGaussians, 10) || 32768;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "TripoSplat: flow-matching image→3D Gaussian splats. ~2000 LOC, near-zero deps (no transformers, no diffusers).",
                    "Outputs a Gaussian splat point cloud to `/kaggle/working/output.ply`.",
                    "",
                    "**View externally**: SuperSplat (https://superspl.at/editor) or SparkJS (https://sparkjs.dev).",
                    "**View in-engine**: SplatRenderer (engine v784+) loads .ply directly."]),

                cell([
                    "# generic HF cache redirect — reuses Kaggle Dataset cache when attached",
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
                    "# 1. clone TripoSplat + install minimal deps",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/TripoSplat'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/VAST-AI-Research/TripoSplat.git', '/kaggle/working/TripoSplat'])",
                    "os.chdir('/kaggle/working/TripoSplat')",
                    "# README: 'no transformers, no diffusers, no version-conflict hell.'",
                    "!pip install -q numpy safetensors pillow tqdm huggingface_hub",
                ]),

                cell([
                    "# 2. download model weights",
                    "import os",
                    "from huggingface_hub import snapshot_download",
                    "ckpt_dir = '/kaggle/working/TripoSplat/ckpts'",
                    "os.makedirs(ckpt_dir, exist_ok=True)",
                    "if not any(os.scandir(ckpt_dir)):",
                    "    snapshot_download(repo_id='VAST-AI/TripoSplat', local_dir=ckpt_dir)",
                    "    print('downloaded TripoSplat weights to', ckpt_dir)",
                    "else:",
                    "    print('TripoSplat weights already present')",
                ]),

                cell([
                    "# 3. verify torch + CUDA",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =',",
                    "      torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 4. decode input image (embedded by the bridge as base64)",
                    "import base64, os",
                    `IMG_B64 = ${JSON.stringify(imgB64)}`,
                    "img_path = '/kaggle/working/TripoSplat/input.png'",
                    "with open(img_path, 'wb') as f: f.write(base64.b64decode(IMG_B64))",
                    "print('input image:', img_path, '·', os.path.getsize(img_path), 'bytes')",
                ]),

                cell([
                    "# 5. run inference via run_example.py",
                    "#    The repo script processes one image and writes .ply. Different",
                    "#    repo versions name the entry point or output path differently —",
                    "#    we cover both common patterns + fall back to importing the API.",
                    "import os, subprocess, sys, glob",
                    `N_GAUSS = ${numGauss}`,
                    "os.chdir('/kaggle/working/TripoSplat')",
                    "out_ply = '/kaggle/working/output.ply'",
                    "ran = False",
                    "# Pattern A: run_example.py accepts --image + --output flags",
                    "try:",
                    "    subprocess.check_call([sys.executable, 'run_example.py',",
                    "                           '--image', 'input.png',",
                    "                           '--output', out_ply,",
                    "                           '--num-gaussians', str(N_GAUSS)])",
                    "    ran = os.path.exists(out_ply)",
                    "except Exception as e:",
                    "    print('run_example.py --image/--output failed:', e)",
                    "# Pattern B: positional arg fallback",
                    "if not ran:",
                    "    try:",
                    "        subprocess.check_call([sys.executable, 'run_example.py', 'input.png'])",
                    "        ran = True",
                    "    except Exception as e:",
                    "        print('run_example.py positional failed:', e)",
                    "# Promote any .ply / .splat produced to /kaggle/working/output.ply",
                    "if not os.path.exists(out_ply):",
                    "    for pat in ('output/*.ply', '*.ply', 'output/*.splat', '*.splat'):",
                    "        hits = glob.glob(pat)",
                    "        if hits:",
                    "            import shutil",
                    "            shutil.copy(hits[0], out_ply)",
                    "            print('promoted', hits[0], '→', out_ply)",
                    "            break",
                    "if os.path.exists(out_ply):",
                    "    print('TripoSplat output:', out_ply, '·', os.path.getsize(out_ply), 'bytes')",
                    "else:",
                    "    print('!! no .ply produced — check run_example.py output above')",
                    "    raise SystemExit(1)",
                ]),
            ],
            metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
            nbformat: 4, nbformat_minor: 4,
        };
    },
};
