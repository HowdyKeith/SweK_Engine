// kaggle_templates/stable_fast_3d.js — Stable-Fast-3D / SF3D (Stability AI, 2024).
//
// 0.5s inference, ~6GB VRAM. Best-in-class UV unwrapping among the open
// image-to-3D models, so the output is the most "game ready" of the bunch
// — proper UV chart, materials, illumination disentanglement.
//
// IMPORTANT: this is a GATED HuggingFace model.
//   1. Request access at https://huggingface.co/stabilityai/stable-fast-3d
//      ("Agree" on the license popup — stabilityai-ai-community license,
//      commercial use threshold is $1M annual revenue).
//   2. Create a read-only HF token at https://huggingface.co/settings/tokens.
//   3. In Kaggle: Add-ons → Secrets → add `HF_TOKEN` with the token value,
//      ENABLE it for this notebook.
// Without that secret the first download cell will fail with a clear
// "couldn't access HF_TOKEN secret" message — that's the signal to fix
// the secret config, not a bug.
//
// Repo: https://github.com/Stability-AI/stable-fast-3d

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "stable_fast_3d",
    label: "Stable-Fast-3D (Stability AI · 0.5s · UV-unwrapped GLB · GATED, needs HF_TOKEN)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image — best results with clean object-on-background" },
        { name: "removeBackground", type: "bool", default: true,
          help: "auto-remove background; turn off if your input already has alpha" },
        { name: "foregroundRatio", type: "float", default: 0.85,
          help: "ratio of foreground to image size (0..1); only used when removeBackground=true" },
    ],

    buildNotebook(params, ctx) {
        const imgB64   = String(params.imageBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const removeBg = params.removeBackground !== false;
        const fgRatio  = Math.max(0, Math.min(1, parseFloat(params.foregroundRatio) || 0.85));

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Stable-Fast-3D: 0.5s image-to-3D with UV-unwrapped GLB output.",
                    "**GATED MODEL** — requires HF_TOKEN added to Kaggle Secrets.",
                    "If cell 4 fails on auth, the issue is the secret config, not the code."]),

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
                    "# 1. read HF_TOKEN from Kaggle Secrets, fail loudly if missing",
                    "import os",
                    "try:",
                    "    from kaggle_secrets import UserSecretsClient",
                    "    HF_TOKEN = UserSecretsClient().get_secret('HF_TOKEN')",
                    "    os.environ['HF_TOKEN'] = HF_TOKEN",
                    "    os.environ['HUGGING_FACE_HUB_TOKEN'] = HF_TOKEN",
                    "    print('HF_TOKEN loaded from Kaggle Secrets (length', len(HF_TOKEN), ')')",
                    "except Exception as e:",
                    "    raise RuntimeError(",
                    "        'Could not read HF_TOKEN from Kaggle Secrets: ' + str(e) +",
                    "        '\\n\\nTo fix:'",
                    "        '\\n  1. Request access at https://huggingface.co/stabilityai/stable-fast-3d'",
                    "        '\\n  2. Create read token at https://huggingface.co/settings/tokens'",
                    "        '\\n  3. Notebook menu → Add-ons → Secrets → Add label HF_TOKEN, paste token, ENABLE'",
                    "        '\\n  4. Re-run')",
                ]),

                cell([
                    "# 2. clone SF3D + install deps (setuptools pin is per the README)",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/stable-fast-3d'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/Stability-AI/stable-fast-3d.git', '/kaggle/working/stable-fast-3d'])",
                    "os.chdir('/kaggle/working/stable-fast-3d')",
                    "!pip install -q -U setuptools==69.5.1 wheel",
                    "!pip install -q -r requirements.txt",
                ]),

                cell([
                    "# 3. verify torch + CUDA",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 4. authenticate to HF (will fetch the gated model on first run.py invocation)",
                    "from huggingface_hub import login",
                    "login(token=os.environ['HF_TOKEN'], add_to_git_credential=False)",
                    "print('HF login OK')",
                ]),

                cell([
                    "# 5. decode input image",
                    "import base64, os",
                    `IMG_B64 = ${JSON.stringify(imgB64)}`,
                    "img_path = '/kaggle/working/stable-fast-3d/input.png'",
                    "with open(img_path, 'wb') as f: f.write(base64.b64decode(IMG_B64))",
                    "print('input image:', img_path, '·', os.path.getsize(img_path), 'bytes')",
                ]),

                cell([
                    "# 6. run inference",
                    "import subprocess, os",
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    `FG_RATIO = ${fgRatio}`,
                    "args = ['python', 'run.py', 'input.png',",
                    "        '--output-dir', '/kaggle/working/stable-fast-3d/output',",
                    "        '--foreground-ratio', str(FG_RATIO)]",
                    "if not REMOVE_BG:",
                    "    args += ['--no-remove-bg']",
                    "subprocess.check_call(args)",
                ]),

                cell([
                    "# 7. promote the output to /kaggle/working/output.glb",
                    "# SF3D writes mesh.glb under output/<image_basename>/.",
                    "import os, glob, shutil",
                    "candidates = sorted(glob.glob('/kaggle/working/stable-fast-3d/output/**/*.glb', recursive=True))",
                    "if not candidates:",
                    "    raise RuntimeError('SF3D produced no .glb under output/ — check the script output above')",
                    "src = candidates[-1]",
                    "out_glb = '/kaggle/working/output.glb'",
                    "shutil.copy(src, out_glb)",
                    "print('SF3D output:', out_glb, '·', os.path.getsize(out_glb), 'bytes  (source:', src, ')')",
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
