// kaggle_templates/triposg.js — TripoSG (VAST-AI-Research, 2025-03).
//
// Higher-fidelity successor to TripoSR. 1.5B parameter rectified flow
// model, image-conditioned shape synthesis. Higher quality than TripoSR
// but slower (~minutes vs seconds). VRAM ≥8GB.
//
// Repo: https://github.com/VAST-AI-Research/TripoSG
// Auto-downloads VAST-AI/TripoSG (model) + briaai/RMBG-1.4 (background
// removal) on first run. Both are public — no HF token gating.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "triposg",
    label: "TripoSG (1.5B rectified flow image→GLB, higher quality than TripoSR)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image — PNG/JPG, will be background-removed via RMBG-1.4" },
        { name: "faces", type: "int", default: 0,
          help: "target face count after mesh extraction; 0 = no remesh decimation" },
    ],

    buildNotebook(params, ctx) {
        const imgB64 = String(params.imageBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const faces  = parseInt(params.faces, 10) || 0;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "TripoSG: 1.5B parameter rectified flow image-to-3D shape synthesis.",
                    "Outputs a textured GLB to `/kaggle/working/output.glb`."]),

                cell([
                    "# v701 — generic HF cache redirect (cache-retrofit).",
                    "# If the user has attached a Kaggle Dataset with HF-cache layout",
                    "# (./hub/models--repo/... or just models--repo/...), point HF_HUB_CACHE",
                    "# at it so transformers/diffusers pull weights from the cache instead",
                    "# of downloading. No-op when no cached dataset is attached — template",
                    "# proceeds with its normal HF download path.",
                    "import os",
                    "cache_root = None",
                    "if os.path.isdir('/kaggle/input'):",
                    "    for d in sorted(os.listdir('/kaggle/input')):",
                    "        p = os.path.join('/kaggle/input', d)",
                    "        if not os.path.isdir(p): continue",
                    "        # Look for HF cache structure (hub/ subdir OR top-level models--*)",
                    "        if os.path.isdir(os.path.join(p, 'hub')):",
                    "            cache_root = os.path.join(p, 'hub'); break",
                    "        if any(n.startswith('models--') for n in os.listdir(p)):",
                    "            cache_root = p; break",
                    "if cache_root:",
                    "    os.environ['HF_HUB_CACHE'] = cache_root",
                    "    os.environ['HUGGINGFACE_HUB_CACHE'] = cache_root",
                    "    os.environ['TRANSFORMERS_CACHE'] = cache_root",
                    "    print(f'[cache] HF_HUB_CACHE -> {cache_root}')",
                    "else:",
                    "    print('[cache] no HF cache dataset attached — will download from HF')",
                ]),

                cell([
                    "# 1. clone TripoSG + install deps",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/TripoSG'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/VAST-AI-Research/TripoSG.git', '/kaggle/working/TripoSG'])",
                    "os.chdir('/kaggle/working/TripoSG')",
                    "!pip install -q -r requirements.txt",
                ]),

                cell([
                    "# 2. verify torch + CUDA (TripoSG needs ≥8GB VRAM)",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 3. decode input image (embedded by the bridge as base64)",
                    "import base64, os",
                    `IMG_B64 = ${JSON.stringify(imgB64)}`,
                    "img_path = '/kaggle/working/input.png'",
                    "with open(img_path, 'wb') as f: f.write(base64.b64decode(IMG_B64))",
                    "print('input image:', img_path, '·', os.path.getsize(img_path), 'bytes')",
                ]),

                cell([
                    "# 4. run inference",
                    "import subprocess, os",
                    `FACES = ${faces}`,
                    "out_glb = '/kaggle/working/output.glb'",
                    "args = ['python', '-m', 'scripts.inference_triposg',",
                    "        '--image-input', '/kaggle/working/input.png',",
                    "        '--output-path', out_glb]",
                    "if FACES > 0:",
                    "    args += ['--faces', str(FACES)]",
                    "subprocess.check_call(args)",
                    "if os.path.exists(out_glb):",
                    "    print('TripoSG output:', out_glb, '·', os.path.getsize(out_glb), 'bytes')",
                    "else:",
                    "    raise RuntimeError('output.glb not produced — check the script output above')",
                ]),
            ],
            metadata: {
                kernelspec: { name: "python3", display_name: "Python 3", language: "python" },
                language_info: { name: "python" },
            },
            nbformat: 4,
            nbformat_minor: 4,
        };
    },
};
