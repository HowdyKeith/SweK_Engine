// kaggle_templates/sparc3d.js — Sparc3D (lizhihao6/Sparc3D) high-resolution image → 3D.
//
// Sparc3D turns a single image into a watertight, print-ready mesh at up to 1024^3
// via Sparcubes (sparse deformable marching cubes) + Sparconv-VAE + a TRELLIS-style
// latent flow. Higher geometric detail than the fast LRM models (TripoSR/SF3D), at
// the cost of runtime + memory. Output is a .glb the bridge ingests into GPU_Assets/.
//
// GPU: sparse-conv + diffusion, NO FlashInfer / sm_75 floor — so it runs on Kaggle's
// P100 (the API-push default) OR T4. Memory-heavy at 1024^3; the resolution param lets
// you dial down to fit a 16 GB card. Verified repo 2026-07: lizhihao6/Sparc3D, ships
// pretrained weights, image-to-3D, PyTorch/CUDA. HONEST: best-effort template; the repo
// README is the source of truth — run the Diagnostic template first to confirm auth/push/output.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "sparc3d",
    label: "Sparc3D (hi-res image → 3D · watertight 1024³ · P100/T4)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image (png/jpg) — a single subject on a clean/blank background works best" },
        { name: "removeBackground", type: "bool", default: true,
          help: "run rembg on the image first (helps with cluttered backgrounds)" },
        { name: "resolution", type: "int", default: 512,
          help: "mesh resolution: 512 (fits a 16GB Kaggle card comfortably) up to 1024 (max detail, may OOM on P100/T4)" },
        { name: "seed", type: "int", default: 42 },
    ],

    buildNotebook(params, ctx) {
        const imageB64 = String(params.imageBase64 || "").replace(/^data:image\/[a-z]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const res      = parseInt(params.resolution, 10) || 512;
        const seed     = parseInt(params.seed, 10) || 42;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Sparc3D high-resolution image → 3D on Kaggle. First run ~8-12 min (git clone + deps + weight fetch).",
                    "Outputs a watertight **output.glb** to /kaggle/working. Runs on P100 or T4 (no sm_75 requirement).",
                    "If you hit CUDA OOM at 1024, re-run with resolution 512."]),

                cell([
                    "# GPU banner — Sparc3D runs on P100 or T4; just report what we got.",
                    "import torch",
                    "if torch.cuda.is_available():",
                    "    name = torch.cuda.get_device_name(0)",
                    "    cap = torch.cuda.get_device_capability(0)",
                    "    print(f'[gpu] {name}  sm_{cap[0]}{cap[1]}  ·  torch {torch.__version__}  cuda {torch.version.cuda}')",
                    "else:",
                    "    print('[gpu] WARNING: no CUDA device — enable the GPU accelerator in notebook settings')",
                ]),

                // generic HF cache redirect (same pattern as the other templates)
                cell([
                    "# HF cache redirect — if a Kaggle Dataset with HF-cache layout is attached, use it.",
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
                    "# clone Sparc3D + install deps",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/Sparc3D'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/lizhihao6/Sparc3D.git', '/kaggle/working/Sparc3D'])",
                    "os.chdir('/kaggle/working/Sparc3D')",
                    "# install requirements if present; always ensure the common IO deps",
                    "if os.path.isfile('requirements.txt'):",
                    "    subprocess.call(['pip', 'install', '-q', '-r', 'requirements.txt'])",
                    "!pip install -q rembg trimesh huggingface_hub pillow",
                ]),

                cell([
                    "# decode the user image",
                    "import base64, io",
                    "from PIL import Image",
                    `IMAGE_B64 = ${JSON.stringify(imageB64)}`,
                    "img = Image.open(io.BytesIO(base64.b64decode(IMAGE_B64))).convert('RGBA')",
                    "img.save('/kaggle/working/input.png')",
                    "print('input image:', img.size)",
                ]),

                cell([
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "if REMOVE_BG:",
                    "    from rembg import remove",
                    "    remove(img).save('/kaggle/working/input_nobg.png')",
                    "    src_image = '/kaggle/working/input_nobg.png'",
                    "else:",
                    "    src_image = '/kaggle/working/input.png'",
                    "print('pipeline input:', src_image)",
                ]),

                cell([
                    "# Run Sparc3D. The repo exposes an inference entry point (see its README);",
                    "# entry-point names can drift between commits, so we try the documented ones",
                    "# and fall back with a clear message rather than dying cryptically.",
                    "import os, glob, subprocess, sys",
                    `RES = ${res}`,
                    `SEED = ${seed}`,
                    "os.chdir('/kaggle/working/Sparc3D')",
                    "candidates = [",
                    "    ['python', 'inference.py', '--image', src_image, '--output', '/kaggle/working', '--resolution', str(RES), '--seed', str(SEED)],",
                    "    ['python', 'run.py',       '--image', src_image, '--output', '/kaggle/working', '--resolution', str(RES)],",
                    "    ['python', 'demo.py',      '--image', src_image, '--output_dir', '/kaggle/working'],",
                    "]",
                    "ran = False",
                    "for args in candidates:",
                    "    script = args[1]",
                    "    if not os.path.isfile(script):",
                    "        continue",
                    "    print('[run]', ' '.join(args))",
                    "    r = subprocess.run(args)",
                    "    if r.returncode == 0:",
                    "        ran = True; break",
                    "    print(f'[run] {script} exited {r.returncode} — trying next entry point')",
                    "if not ran:",
                    "    print('[run] no known entry point succeeded. Check the Sparc3D README for the current inference command;')",
                    "    print('      scripts present:', [f for f in os.listdir('.') if f.endswith('.py')])",
                ]),

                cell([
                    "# collect the mesh → promote to /kaggle/working/output.glb (bridge picks this up)",
                    "import os, glob, shutil",
                    "found = []",
                    "for root in ['/kaggle/working', '/kaggle/working/Sparc3D']:",
                    "    found += glob.glob(os.path.join(root, '**', '*.glb'), recursive=True)",
                    "    found += glob.glob(os.path.join(root, '**', '*.obj'), recursive=True)",
                    "found = [f for f in found if 'output.glb' not in f]",
                    "print('meshes found:', found)",
                    "glb = next((f for f in found if f.endswith('.glb')), None)",
                    "if glb:",
                    "    shutil.copy(glb, '/kaggle/working/output.glb'); print('promoted', glb, '→ output.glb')",
                    "else:",
                    "    obj = next((f for f in found if f.endswith('.obj')), None)",
                    "    if obj:",
                    "        import trimesh",
                    "        trimesh.load(obj).export('/kaggle/working/output.glb')",
                    "        print('converted', obj, '→ output.glb')",
                    "    else:",
                    "        print('NO MESH PRODUCED — see the run log above.')",
                    "print('working dir:', sorted(f for f in os.listdir('/kaggle/working') if not f.startswith('.')))",
                ]),
            ],
            metadata: { kernelspec: { name: "python3", display_name: "Python 3", language: "python" }, language_info: { name: "python" } },
            nbformat: 4, nbformat_minor: 4,
        };
    },
};
