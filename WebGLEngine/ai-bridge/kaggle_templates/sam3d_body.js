// kaggle_templates/sam3d_body.js — Meta SAM 3D Body (image→human body mesh).
//
// Single-image full-body 3D human mesh recovery. Uses Meta's new
// Momentum Human Rig (MHR) — a parametric mesh that decouples skeletal
// structure from surface shape. State-of-the-art body+feet+hands pose.
// Released November 2025 alongside SAM 3 + SAM 3D Objects.
//
// Repo:    https://github.com/facebookresearch/sam-3d-body
// License: research-use; weights via gated HuggingFace
//
// GATED:   HF access required for facebook/sam-3d-body checkpoints.
//          Kaggle Secret HF_TOKEN.
//
// VRAM:    ~6-8 GB. Comfortably fits a free Kaggle T4/P100 (16GB).
//          Faster install than SAM 3D Objects (no pytorch3d).
//
// INPUT:   ONE image with a (visible) human. Optionally 2D keypoints
//          and/or a person mask, but we run the default no-prompt path
//          for the Kaggle Lab one-shot flow.
//
// OUTPUT:  /kaggle/working/output.glb  — rigged body mesh
//          /kaggle/working/human.ply   — raw MHR output for downstream tools
//          /kaggle/working/focal_length.json — camera params
//
// PAIRS WELL WITH: the kimodo template. Kimodo generates motion; SAM 3D
// Body generates the body. Apply Kimodo NPZ motion to a SAM 3D Body GLB
// for an end-to-end "image of a person → animated rigged human" pipeline.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "sam3d_body",
    label: "SAM 3D Body (Meta · image→rigged human body mesh · GATED · MHR rig)",
    gpu: true,
    inputKind: "image",
    defaultDatasets: [],
    paramsSchema: [
        { name: "imageBase64", type: "string", required: true,
          help: "input image containing a visible human" },
        { name: "useHandRefinement", type: "bool", default: true,
          help: "run the hand decoder for higher-quality hand pose (slightly slower)" },
        { name: "exportPly",  type: "bool", default: true,
          help: "save the raw MHR .ply alongside the GLB (for downstream tools that read PLY)" },
    ],

    buildNotebook(params, ctx) {
        const useHands = params.useHandRefinement !== false;
        const wantPly  = params.exportPly  !== false;
        const imgB64   = String(params.imageBase64 || "");

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "Meta SAM 3D Body — single-image full-body 3D human mesh recovery (3DB).",
                    "Uses the **Momentum Human Rig (MHR)**: parametric mesh that separates skeletal",
                    "structure from surface shape. Designed to pair with motion-gen models like Kimodo.",
                    "",
                    `**hand refinement:** ${useHands ? "on" : "off"} · **export PLY:** ${wantPly ? "on" : "off"}`,
                    "",
                    "**GATED:** request access at https://huggingface.co/facebook/sam-3d-body",
                    "then Add-ons → Secrets → HF_TOKEN.",
                    "",
                    "**Lighter install than SAM 3D Objects** (no pytorch3d). ~3-5 min first run."]),

                cell([
                    "# 1. HF_TOKEN from Kaggle Secrets",
                    "import os",
                    "try:",
                    "    from kaggle_secrets import UserSecretsClient",
                    "    HF_TOKEN = UserSecretsClient().get_secret('HF_TOKEN')",
                    "    os.environ['HF_TOKEN'] = HF_TOKEN",
                    "    os.environ['HUGGING_FACE_HUB_TOKEN'] = HF_TOKEN",
                    "    print('HF_TOKEN loaded (len', len(HF_TOKEN), ')')",
                    "except Exception as e:",
                    "    raise RuntimeError('No HF_TOKEN. Request access at huggingface.co/facebook/sam-3d-body and add the secret.\\n  ' + str(e))",
                ]),

                cell([
                    "# 2. GPU + VRAM probe — only ~6-8 GB needed, free T4/P100 comfortable",
                    "!nvidia-smi --query-gpu=name,memory.total,memory.free --format=csv",
                    "import torch",
                    "print('torch=', torch.__version__, 'cuda=', torch.version.cuda)",
                ]),

                cell([
                    "# 3. Install SAM 3D Body. Lighter than the Objects install: no",
                    "# pytorch3d, no kaolin. Direct pip from the repo.",
                    "import subprocess, os",
                    "if not os.path.isdir('/kaggle/working/sam-3d-body'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/facebookresearch/sam-3d-body.git', '/kaggle/working/sam-3d-body'])",
                    "os.chdir('/kaggle/working/sam-3d-body')",
                    "!pip install -q -e .",
                ]),

                cell([
                    "# 4. HF login + write input image",
                    "from huggingface_hub import login",
                    "login(token=os.environ['HF_TOKEN'], add_to_git_credential=False)",
                    "import base64",
                    `image_b64 = ${JSON.stringify(imgB64.replace(/^data:[^;]+;base64,/, ""))}`,
                    "if not image_b64: raise RuntimeError('no input image — Lab should have supplied imageBase64')",
                    "img_bytes = base64.b64decode(image_b64)",
                    "img_path = '/kaggle/working/input.png'",
                    "with open(img_path, 'wb') as f: f.write(img_bytes)",
                    "print(f'input image: {len(img_bytes)} bytes')",
                ]),

                cell([
                    "# 5. Run SAM 3D Body inference via the demo script wrapper",
                    "# The repo's demo.py is the cleanest entry point that handles the",
                    "# HF checkpoint snapshot + the inference + saves human.ply.",
                    "import subprocess, os",
                    "os.chdir('/kaggle/working/sam-3d-body')",
                    "out_dir = '/kaggle/working/sam3db_out'",
                    "os.makedirs(out_dir, exist_ok=True)",
                    "args = ['python', 'demo.py',",
                    "        '--image', '/kaggle/working/input.png',",
                    "        '--output_dir', out_dir]",
                    `if ${useHands ? "True" : "False"}:`,
                    "    args.append('--use_hand_decoder')",
                    "print('running:', ' '.join(args))",
                    "subprocess.check_call(args)",
                    "# Inspect what landed",
                    "import glob",
                    "for p in sorted(glob.glob(f'{out_dir}/**/*', recursive=True)):",
                    "    if os.path.isfile(p): print(f'  {p}  ({os.path.getsize(p)} bytes)')",
                ]),

                cell([
                    "# 6. Locate the produced human.ply + focal_length.json and copy to canonical paths.",
                    "import glob, shutil, os",
                    "plys = sorted(glob.glob(f'{out_dir}/**/human*.ply', recursive=True))",
                    "if not plys:",
                    "    plys = sorted(glob.glob(f'{out_dir}/**/*.ply', recursive=True))",
                    "if not plys: raise RuntimeError('demo.py did not produce a .ply')",
                    "src_ply = plys[0]",
                    `if ${wantPly ? "True" : "False"}:`,
                    "    shutil.copy(src_ply, '/kaggle/working/human.ply')",
                    "    print(f'PLY: /kaggle/working/human.ply ({os.path.getsize(\"/kaggle/working/human.ply\")} bytes)')",
                    "fls = sorted(glob.glob(f'{out_dir}/**/focal*.json', recursive=True))",
                    "if fls:",
                    "    shutil.copy(fls[0], '/kaggle/working/focal_length.json')",
                    "    print('focal_length.json copied')",
                ]),

                cell([
                    "# 7. Convert PLY → GLB so the engine's existing GLB loader picks it up",
                    "# straight from the kaggle results.",
                    "!pip install -q trimesh",
                    "import trimesh",
                    "mesh = trimesh.load('/kaggle/working/human.ply', force='mesh')",
                    "if mesh is None or (hasattr(mesh, 'is_empty') and mesh.is_empty):",
                    "    raise RuntimeError('loaded PLY is empty')",
                    "out_glb = '/kaggle/working/output.glb'",
                    "mesh.export(out_glb)",
                    "import os",
                    "print(f'GLB: {out_glb} ({os.path.getsize(out_glb)} bytes)')",
                    "print(f'  vertices: {len(mesh.vertices)}  faces: {len(mesh.faces)}')",
                    "print('engine playback: load this as a static rigged mesh, or pair with a Kimodo NPZ motion track')",
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
