// kaggle_templates/rig_anything.js — RigAnything auto-rig (Isabella98Liu, SIGGRAPH TOG 2025).
//
// Template-free autoregressive rigging for diverse 3D assets. Unlike
// Make-It-Animatable (CVPR 2025) which is biased toward humanoid characters,
// RigAnything handles arbitrary topology — kaiju, voxel golems, weird shapes
// from Gemini, hand-carved meshes, anything. Takes a .glb or .obj, produces
// a rigged .glb with skeleton + skinning weights bound.
//
// HONEST: like the other templates, first run may need iteration. The bpy
// + open3d + pymeshlab dependency stack on Kaggle can fight the system
// GL/X11 setup — if you hit `cannot find libGL` errors, the apt-get line in
// cell 1 covers most of them. Click 📋 log on the failed row to see the
// real traceback.
//
// VRAM: inference uses cuda:0 (first GPU). Should fit comfortably on T4
// (16GB) for meshes simplified to 8192 faces. Larger meshes may need the
// simplify pre-pass turned on.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "rig_anything",
    label: "RigAnything (auto-rig static mesh → skinned GLB)",
    gpu: true,
    inputKind: "mesh",           // v652 — UI hint: this template needs a mesh file, not an image
    defaultDatasets: [],         // once you cache Isabellaliu/RigAnything as a Kaggle Dataset, add the slug here
    paramsSchema: [
        { name: "meshBase64", type: "mesh", required: true,
          help: "input mesh (.glb or .obj) — kaiju, creatures, civs, whatever needs skinning" },
        { name: "meshFormat", type: "string", default: "glb",
          help: "input file extension: glb or obj — defaults to glb" },
        { name: "simplify", type: "bool", default: true,
          help: "decimate the mesh before rigging (recommended for anything over ~10K faces)" },
        { name: "simplifyCount", type: "int", default: 8192,
          help: "target face count after decimation (only used if simplify=true)" },
    ],

    buildNotebook(params, ctx) {
        const meshB64    = String(params.meshBase64 || "").replace(/^data:[^;]+;base64,/i, "");
        const meshFmt    = (String(params.meshFormat || "glb").toLowerCase() === "obj") ? "obj" : "glb";
        const simplify   = params.simplify !== false;
        const simpCount  = parseInt(params.simplifyCount, 10) || 8192;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "RigAnything: template-free auto-rigging on Kaggle.",
                    "Output: a rigged GLB with skeleton + skinning weights, importable into",
                    "Blender, the engine's SkeletalAnimator, or any glTF-aware DCC tool."]),

                cell([
                    "# 1. system deps for bpy / open3d / pymeshlab",
                    "!apt-get update -qq && apt-get install -y -qq libgl1 libegl1 libxkbcommon0 libdbus-1-3 > /dev/null",
                ]),

                cell([
                    "# 2. PyTorch matched to Kaggle's CUDA. Default base image usually has",
                    "#    a recent torch already; we verify and only force-reinstall if mismatched.",
                    "import torch",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                    "# !pip install -q torch torchvision --index-url https://download.pytorch.org/whl/cu121",
                ]),

                cell([
                    "# 3. clone RigAnything + install its requirements",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/RigAnything'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/Isabella98Liu/RigAnything.git', '/kaggle/working/RigAnything'])",
                    "os.chdir('/kaggle/working/RigAnything')",
                    "!pip install -q -r requirements.txt",
                    "# bpy via PyPI is the headless variant — works without a display server",
                    "!pip install -q bpy huggingface_hub",
                ]),

                cell([
                    "# 4. fetch the pretrained checkpoint from HuggingFace",
                    "import os",
                    "from huggingface_hub import snapshot_download",
                    "os.makedirs('ckpt', exist_ok=True)",
                    "snapshot_download(repo_id='Isabellaliu/RigAnything', local_dir='ckpt', local_dir_use_symlinks=False)",
                    "print('ckpt files:', sorted(os.listdir('ckpt')))",
                ]),

                cell([
                    "# 5. decode the user's mesh (embedded by the bridge as base64)",
                    "import base64, os",
                    `MESH_B64 = ${JSON.stringify(meshB64)}`,
                    `MESH_EXT = ${JSON.stringify(meshFmt)}`,
                    "mesh_path = '/kaggle/working/input.' + MESH_EXT",
                    "with open(mesh_path, 'wb') as f: f.write(base64.b64decode(MESH_B64))",
                    "print('input mesh:', mesh_path, '·', os.path.getsize(mesh_path), 'bytes')",
                ]),

                cell([
                    "# 6. optional simplify pre-pass",
                    `SIMPLIFY = ${simplify ? "True" : "False"}`,
                    `SIMP_COUNT = ${simpCount}`,
                    "import os, subprocess",
                    "os.makedirs('outputs/input', exist_ok=True)",
                    "if SIMPLIFY:",
                    "    subprocess.check_call(['python', 'inference_utils/mesh_simplify.py',",
                    "                           '--data_path', mesh_path,",
                    "                           '--mesh_simplify', '1',",
                    "                           '--simplify_count', str(SIMP_COUNT),",
                    "                           '--output_path', 'outputs/input'])",
                    "    rigging_input = 'outputs/input/input_simplified.glb'",
                    "else:",
                    "    # Even without decimation, the inference pipeline expects a .glb at outputs/input/input_simplified.glb",
                    "    subprocess.check_call(['python', 'inference_utils/mesh_simplify.py',",
                    "                           '--data_path', mesh_path,",
                    "                           '--mesh_simplify', '0',",
                    "                           '--simplify_count', '0',",
                    "                           '--output_path', 'outputs/input'])",
                    "    rigging_input = 'outputs/input/input_simplified.glb'",
                    "print('rigging input:', rigging_input, '·', os.path.getsize(rigging_input), 'bytes')",
                ]),

                cell([
                    "# 7. run rigging inference",
                    "import subprocess",
                    "subprocess.check_call(['python', 'inference.py',",
                    "                       '--config', 'config.yaml',",
                    "                       '--load', 'ckpt/riganything_ckpt.pt',",
                    "                       '-s', 'inference', 'true',",
                    "                       '-s', 'inference_out_dir', 'outputs/input',",
                    "                       '--mesh_path', rigging_input])",
                ]),

                cell([
                    "# 8. export the rigged GLB",
                    "import subprocess",
                    "subprocess.check_call(['python', 'inference_utils/vis_skel.py',",
                    "                       '--data_path', 'outputs/input/input_simplified.npz',",
                    "                       '--save_path', 'outputs/input',",
                    "                       '--mesh_path', 'outputs/input/input_simplified.glb'])",
                    "# Copy the rigged GLB to /kaggle/working so the bridge's downloadOutput",
                    "# picks it up. The bridge's loader prefers `output.glb` as the canonical",
                    "# name; keep the original beside it for posterity.",
                    "import shutil, os",
                    "rigged = 'outputs/input/input_simplified_rig.glb'",
                    "if os.path.exists(rigged):",
                    "    shutil.copy(rigged, '/kaggle/working/output.glb')",
                    "    shutil.copy(rigged, '/kaggle/working/input_simplified_rig.glb')",
                    "    print('rigged GLB exported → /kaggle/working/output.glb (', os.path.getsize(rigged), 'bytes )')",
                    "else:",
                    "    print('rigged GLB missing — check inference.log under outputs/input/')",
                    "print('files:', sorted(f for f in os.listdir('/kaggle/working') if not f.startswith('.')))",
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
