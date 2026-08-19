// kaggle_templates/instantmesh.js — InstantMesh (TencentARC, 2024).
//
// Multi-view large reconstruction model: single image → Zero123++ novel
// views → sparse-view mesh reconstruction. Apache 2.0 license. Outputs an
// OBJ with vertex colors by default, or an OBJ + texture map when
// `--export_texmap` is set (longer; UV unwrap takes time).
//
// Repo: https://github.com/TencentARC/InstantMesh
// Requires Python ≥3.10, PyTorch ≥2.1.0, CUDA ≥12.1 — Kaggle's default
// image meets all three. Auto-downloads sudo-ai/zero123plus-v1.2 +
// TencentARC/InstantMesh weights on first run.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "instantmesh",
    label: "InstantMesh (multi-view LRM image→GLB, ~10s, vertex colors or texmap)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "image", required: true,
          help: "input image — multi-view will be generated, then meshed" },
        { name: "configName", type: "string", default: "instant-mesh-large",
          help: "instant-mesh-large | instant-mesh-base | instant-nerf-large | instant-nerf-base" },
        { name: "exportTexmap", type: "bool", default: true,
          help: "export OBJ + texture map (slower UV unwrap) instead of vertex-colored OBJ" },
        { name: "removeBackground", type: "bool", default: true,
          help: "auto-remove background; turn off if your input already has alpha" },
    ],

    buildNotebook(params, ctx) {
        const imgB64    = String(params.imageBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const cfgRaw    = String(params.configName || "instant-mesh-large").toLowerCase();
        const allowed   = ["instant-mesh-large", "instant-mesh-base", "instant-nerf-large", "instant-nerf-base"];
        const cfgName   = allowed.includes(cfgRaw) ? cfgRaw : "instant-mesh-large";
        const texmap    = params.exportTexmap !== false;
        const removeBg  = params.removeBackground !== false;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "InstantMesh: single image → Zero123++ multi-view → sparse-view mesh.",
                    `Config: \`${cfgName}\` · texmap: \`${texmap}\` · removeBg: \`${removeBg}\``,
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
                    "# 1. clone InstantMesh + install requirements",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/InstantMesh'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/TencentARC/InstantMesh.git', '/kaggle/working/InstantMesh'])",
                    "os.chdir('/kaggle/working/InstantMesh')",
                    "!pip install -q -r requirements.txt",
                    "# trimesh is used by the engine side to convert .obj → .glb if needed",
                    "!pip install -q trimesh",
                ]),

                cell([
                    "# 2. verify torch ≥2.1.0 + CUDA ≥12.1 (the InstantMesh requirements)",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda, '· device =', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')",
                ]),

                cell([
                    "# 3. decode input image",
                    "import base64, os",
                    `IMG_B64 = ${JSON.stringify(imgB64)}`,
                    "img_path = '/kaggle/working/InstantMesh/input.png'",
                    "with open(img_path, 'wb') as f: f.write(base64.b64decode(IMG_B64))",
                    "print('input image:', img_path, '·', os.path.getsize(img_path), 'bytes')",
                ]),

                cell([
                    "# 4. run inference",
                    "import subprocess, os, glob, shutil",
                    `CONFIG = ${JSON.stringify(cfgName)}`,
                    `TEXMAP = ${texmap ? "True" : "False"}`,
                    `REMOVE_BG = ${removeBg ? "True" : "False"}`,
                    "args = ['python', 'run.py', f'configs/{CONFIG}.yaml', 'input.png']",
                    "if TEXMAP:",
                    "    args += ['--export_texmap']",
                    "if not REMOVE_BG:",
                    "    args += ['--no_rembg']",
                    "args += ['--save_video', 'false']  # we don't need the preview video",
                    "subprocess.check_call(args)",
                ]),

                cell([
                    "# 5. promote the output mesh to /kaggle/working/output.glb",
                    "# InstantMesh writes to outputs/<config>/meshes/<image_basename>.obj.",
                    "# When export_texmap is on, the texture map sits beside it as .png.",
                    "# We convert OBJ → GLB so the engine's GLB loader picks it up.",
                    "import os, glob, shutil, trimesh",
                    `CONFIG = ${JSON.stringify(cfgName)}`,
                    "mesh_dir = f'outputs/{CONFIG}/meshes'",
                    "candidates = sorted(glob.glob(f'{mesh_dir}/*.obj')) + sorted(glob.glob(f'{mesh_dir}/*.glb'))",
                    "if not candidates:",
                    "    raise RuntimeError(f'no mesh produced under {mesh_dir} — check the script output above')",
                    "src = candidates[-1]",
                    "out_glb = '/kaggle/working/output.glb'",
                    "if src.endswith('.glb'):",
                    "    shutil.copy(src, out_glb)",
                    "else:",
                    "    # OBJ + texture → GLB (trimesh handles MTL + texture map inlining)",
                    "    mesh = trimesh.load(src, force='mesh', process=False)",
                    "    mesh.export(out_glb)",
                    "print('InstantMesh output:', out_glb, '·', os.path.getsize(out_glb), 'bytes')",
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
