// kaggle_templates/kimodo.js — NVIDIA Kimodo (kinematic motion diffusion).
//
// Text-to-motion model from NVIDIA SIL. Takes a natural-language prompt
// ("a person walks forward, then waves") and produces an NPZ file with
// per-frame joint rotations + positions. Skeleton variants: SOMA (30
// joints, default), SMPLX (22 joints), Unitree G1 (34 joints).
//
// Repo:    https://github.com/nv-tlabs/kimodo
// License: Apache 2.0 (code) + NVIDIA Open Model (weights)
//
// VRAM:    ~17GB. Kaggle's free T4 and P100 are both 16GB — single-GPU
//          inference will OOM. The user has to pick "GPU T4 x2" in
//          Kaggle's accelerator settings for 32GB total. Cell 2 prints
//          nvidia-smi so the situation is visible up front.
//
// GATED:   Kimodo's text encoder uses Meta Llama 3 8B Instruct, which is
//          gated on HuggingFace. Same pattern as the SF3D template:
//             1. Request access at huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct
//             2. Create a read token at huggingface.co/settings/tokens
//             3. In the Kaggle notebook: Add-ons → Secrets → label HF_TOKEN, paste, ENABLE
//          Cell 1 reads the secret and fails loudly with the recipe if
//          it isn't there.
//
// OUTPUT:  /kaggle/working/output.npz — Kimodo's canonical format:
//             posed_joints     [T, J, 3]   global joint positions
//             global_rot_mats  [T, J, 3, 3] global joint rotation matrices
//             local_rot_mats   [T, J, 3, 3] parent-relative joint rotations
//             foot_contacts    [T, 4]      heel/toe contact labels
//             root_positions   [T, 3]      pelvis trajectory
//             global_root_heading [T, 2]   heading direction
//          Engine-side conversion to GLB animation tracks is a separate
//          follow-up — Kimodo's NPZ isn't directly playable in the engine's
//          SkeletalAnimator without a NPZ → BVH → GLB pipeline.
//
// INPUT KIND: "text". The user types the motion prompt into the Lab's
//          existing Note field; the bridge passes it as params.note and
//          this template reads it as the prompt. No file upload needed.

const cell = (lines) => ({ cell_type: "code", metadata: {}, source: lines.join("\n"), outputs: [], execution_count: null });
const md   = (lines) => ({ cell_type: "markdown", metadata: {}, source: lines.join("\n") });

module.exports = {
    id: "kimodo",
    label: "Kimodo (NVIDIA text→motion · prompt goes in the Note field · GATED, needs HF_TOKEN · 17GB VRAM)",
    gpu: true,
    inputKind: "text",
    defaultDatasets: [],
    paramsSchema: [
        { name: "note", type: "string", required: true,
          help: "the motion prompt — describe what the figure should do (e.g. 'a person walks forward, stops, waves, then sits down')" },
        { name: "model", type: "string", default: "Kimodo-SOMA-RP-v1",
          help: "Kimodo-SOMA-RP-v1 (humanoid, recommended) · Kimodo-SMPLX-RP-v1 · Kimodo-G1-RP-v1 (Unitree G1 robot)" },
        { name: "duration", type: "float", default: 5.0,
          help: "motion length in seconds; chain multiple sentences with periods to get a sequence" },
        { name: "seed", type: "int", default: 42,
          help: "diffusion seed — same prompt + same seed = same motion" },
        { name: "diffusionSteps", type: "int", default: 100,
          help: "denoising steps; more = higher quality + slower (100 is the recommended default)" },
        { name: "numSamples", type: "int", default: 1,
          help: "how many motion variations to generate from one prompt" },
        { name: "postProcess", type: "bool", default: true,
          help: "foot-skate cleanup + constraint cleanup; ignored for the G1 robot model" },
    ],

    buildNotebook(params, ctx) {
        // Prompt comes from the Lab's Note field. Detect the auto-fill
        // placeholders ("Kaggle Lab one-shot", "phone lab YYYY-MM-DDTHH:MM")
        // and substitute a sensible demo prompt so the run still produces
        // useful motion when the user didn't type anything specific.
        const placeholderRe = /^(?:Kaggle Lab one-shot|phone lab \d{4}-\d{2}-\d{2}.*)$/;
        const noteRaw = String(params.note || "").trim();
        const usedDefault = !noteRaw || placeholderRe.test(noteRaw);
        const prompt   = usedDefault
            ? "a person walks forward, waves hello, then turns around and sits down"
            : noteRaw;
        const allowed  = ["Kimodo-SOMA-RP-v1", "Kimodo-SMPLX-RP-v1", "Kimodo-G1-RP-v1", "Kimodo-SOMA-SEED-v1", "Kimodo-G1-SEED-v1"];
        const modelRaw = String(params.model || "Kimodo-SOMA-RP-v1");
        const model    = allowed.includes(modelRaw) ? modelRaw : "Kimodo-SOMA-RP-v1";
        const duration = Math.max(1.0, Math.min(60.0, parseFloat(params.duration) || 5.0));
        const seed     = parseInt(params.seed, 10) || 42;
        const steps    = Math.max(10, Math.min(500, parseInt(params.diffusionSteps, 10) || 100));
        const samples  = Math.max(1, Math.min(5, parseInt(params.numSamples, 10) || 1));
        const post     = params.postProcess !== false;

        return {
            cells: [
                md([`# ${ctx.title}`, "",
                    "NVIDIA Kimodo: kinematic motion diffusion, text → 3D joint trajectories.",
                    `**Prompt:** \`${prompt.replace(/`/g, "'")}\``,
                    `**Model:** \`${model}\` · **duration:** ${duration}s · **seed:** ${seed} · **steps:** ${steps}`,
                    "",
                    "**~17GB VRAM** — make sure this notebook's accelerator is set to **GPU T4 x2** (32GB total).",
                    "Single T4 or P100 will OOM on the Llama 3 8B text encoder.",
                    "",
                    "**GATED MODEL** — requires `HF_TOKEN` Kaggle Secret with Meta Llama 3 access.",
                    "If cell 1 fails on auth, the issue is the secret config, not the code."]),

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
                    "        '\\n  1. Request access at https://huggingface.co/meta-llama/Meta-Llama-3-8B-Instruct'",
                    "        '\\n     (Kimodo uses Llama 3 as its text encoder)'",
                    "        '\\n  2. Create read token at https://huggingface.co/settings/tokens'",
                    "        '\\n  3. Notebook menu → Add-ons → Secrets → Add label HF_TOKEN, paste token, ENABLE'",
                    "        '\\n  4. Re-run')",
                ]),

                cell([
                    "# 2. show what GPU we got + how much VRAM is free.",
                    "# Kimodo needs ~17GB. Kaggle's free T4 and P100 are 16GB — single-GPU = OOM.",
                    "# Set accelerator to 'GPU T4 x2' (Settings → Accelerator) for 32GB total.",
                    "!nvidia-smi --query-gpu=index,name,memory.total,memory.free --format=csv",
                    "import torch",
                    "print()",
                    "print('torch =', torch.__version__, '· cuda =', torch.version.cuda)",
                    "print('cuda devices available:', torch.cuda.device_count())",
                    "if torch.cuda.is_available():",
                    "    total_gb = sum(torch.cuda.get_device_properties(i).total_memory for i in range(torch.cuda.device_count())) / 1024**3",
                    "    print(f'total VRAM across all visible GPUs: {total_gb:.1f} GB')",
                    "    if total_gb < 16.5:",
                    "        print('⚠ WARNING: <16.5GB total VRAM — Kimodo will probably OOM.')",
                    "        print('  Change accelerator to GPU T4 x2 in the notebook settings.')",
                ]),

                cell([
                    "# 3. clone Kimodo + install (this is the system-deps + editable-install combo from the official Dockerfile)",
                    "!apt-get update -qq && apt-get install -y -qq cmake build-essential > /dev/null",
                    "import os, subprocess",
                    "if not os.path.isdir('/kaggle/working/kimodo'):",
                    "    subprocess.check_call(['git', 'clone', '--depth=1', 'https://github.com/nv-tlabs/kimodo.git', '/kaggle/working/kimodo'])",
                    "os.chdir('/kaggle/working/kimodo')",
                    "# Editable install for the kimodo package itself (~5 min on first run)",
                    "!pip install -q -e .",
                    "# MotionCorrection is the C++ foot-skate cleanup module; non-editable",
                    "!pip install -q ./MotionCorrection",
                ]),

                cell([
                    "# 4. authenticate to HuggingFace so the gated Llama 3 + Kimodo weights pull cleanly",
                    "from huggingface_hub import login",
                    "login(token=os.environ['HF_TOKEN'], add_to_git_credential=False)",
                    "print('HF login OK')",
                ]),

                cell([
                    "# 5. run inference via the official CLI entry point.",
                    "# kimodo auto-downloads the model + text encoder weights on first call.",
                    "# First run: expect ~10-15 min while it pulls Llama 3 8B (16GB) +",
                    "# LLM2Vec adapters + the Kimodo model itself. Subsequent runs are fast.",
                    "import subprocess, os",
                    `PROMPT = ${JSON.stringify(prompt)}`,
                    `MODEL    = ${JSON.stringify(model)}`,
                    `DURATION = ${duration}`,
                    `SEED     = ${seed}`,
                    `STEPS    = ${steps}`,
                    `SAMPLES  = ${samples}`,
                    `POST     = ${post ? "True" : "False"}`,
                    "out_npz = '/kaggle/working/output.npz'",
                    "args = ['python', '-m', 'kimodo.scripts.generate', PROMPT,",
                    "        '--model', MODEL,",
                    "        '--duration', str(DURATION),",
                    "        '--seed', str(SEED),",
                    "        '--diffusion_steps', str(STEPS),",
                    "        '--num_samples', str(SAMPLES),",
                    "        '--output', out_npz]",
                    "if not POST:",
                    "    args.append('--no-postprocess')",
                    "print('running:', ' '.join(args))",
                    "subprocess.check_call(args)",
                ]),

                cell([
                    "# 6. confirm + summarize the output. Kimodo saves the NPZ to the path",
                    "# given by --output for single-sample runs, or to a folder for multi-sample.",
                    "import os, glob, numpy as np",
                    "candidates = ['/kaggle/working/output.npz'] + sorted(glob.glob('/kaggle/working/output*.npz')) + sorted(glob.glob('/kaggle/working/*motion*.npz'))",
                    "found = next((p for p in candidates if os.path.exists(p)), None)",
                    "if not found:",
                    "    raise RuntimeError('Kimodo produced no NPZ — check the script output above')",
                    "# Move whatever landed to the canonical output path the bridge looks for",
                    "if found != '/kaggle/working/output.npz':",
                    "    import shutil; shutil.copy(found, '/kaggle/working/output.npz')",
                    "data = np.load('/kaggle/working/output.npz', allow_pickle=True)",
                    "print('NPZ file:', '/kaggle/working/output.npz', '·', os.path.getsize('/kaggle/working/output.npz'), 'bytes')",
                    "print('arrays:')",
                    "for k in data.files:",
                    "    arr = data[k]",
                    "    shape = getattr(arr, 'shape', None)",
                    "    print(f'  {k:24s}  shape={shape}  dtype={getattr(arr, \"dtype\", type(arr).__name__)}')",
                    "# Print a quick sanity number: how many frames + joints",
                    "if 'posed_joints' in data.files:",
                    "    T, J, _ = data['posed_joints'].shape",
                    "    print(f'motion is {T} frames × {J} joints (= {T/30:.1f} seconds @ 30fps)')",
                ]),

                cell([
                    "# 7. Convert the NPZ to a glTF/GLB animation track the engine can play.",
                    "# Output: /kaggle/working/output.glb with skeleton nodes + animation",
                    "# channels (rotation per joint, root translation). No mesh — the engine",
                    "# attaches the animation to whatever rigged mesh the user wants (Mixamo,",
                    "# RigAnything output, etc.). This is the right separation; the animation",
                    "# is universal, the mesh is per-creature.",
                    "!pip install -q pygltflib scipy",
                    "import numpy as np",
                    "from scipy.spatial.transform import Rotation as R",
                    "import pygltflib",
                    "from pygltflib import GLTF2, Node, Skin, Animation, AnimationChannel, AnimationChannelTarget, AnimationSampler, Buffer, BufferView, Accessor, Scene",
                    "",
                    "data = np.load('/kaggle/working/output.npz', allow_pickle=True)",
                    "posed_joints   = data['posed_joints']     # [T, J, 3] global joint positions",
                    "local_rot_mats = data['local_rot_mats']   # [T, J, 3, 3] parent-relative rotation matrices",
                    "root_positions = data['root_positions']   # [T, 3] pelvis trajectory",
                    "T, J = posed_joints.shape[:2]",
                    "fps  = 30",
                    "print(f'converting {T} frames × {J} joints @ {fps}fps')",
                    "",
                    "# 7a. Get the skeleton's parent topology + joint names.",
                    "# Defensive: probe several kimodo module paths, fall back to SMPL-X hierarchy",
                    "# (SOMA is built on SMPL-X so the topology matches the 22-body-joint core).",
                    "parents = None",
                    "joint_names = None",
                    "for module_path, parent_attr, name_attr in [",
                    "    ('kimodo.skeleton.soma_skeleton',  'SOMA_PARENTS',       'SOMA_JOINT_NAMES'),",
                    "    ('kimodo.skeleton.soma',           'PARENTS',            'JOINT_NAMES'),",
                    "    ('kimodo.skeleton',                'SOMA_PARENTS',       'SOMA_JOINT_NAMES'),",
                    "]:",
                    "    try:",
                    "        mod = __import__(module_path, fromlist=[parent_attr, name_attr])",
                    "        parents = list(getattr(mod, parent_attr))",
                    "        joint_names = list(getattr(mod, name_attr))",
                    "        print(f'skeleton loaded from {module_path}')",
                    "        break",
                    "    except (ImportError, AttributeError):",
                    "        continue",
                    "",
                    "if parents is None:",
                    "    # Fallback: SMPL-X 22-joint body hierarchy. SOMA's first 22 joints match this.",
                    "    # If J > 22, we extrapolate the remaining joints as children of joint 9 (spine3)",
                    "    # which won't be perfect but won't crash either.",
                    "    SMPLX_22 = [",
                    "        ('pelvis',         -1), ('left_hip',         0), ('right_hip',        0),",
                    "        ('spine1',          0), ('left_knee',        1), ('right_knee',       2),",
                    "        ('spine2',          3), ('left_ankle',       4), ('right_ankle',      5),",
                    "        ('spine3',          6), ('left_foot',        7), ('right_foot',       8),",
                    "        ('neck',            9), ('left_collar',      9), ('right_collar',     9),",
                    "        ('head',           12), ('left_shoulder',   13), ('right_shoulder',  14),",
                    "        ('left_elbow',     16), ('right_elbow',     17), ('left_wrist',      18),",
                    "        ('right_wrist',    19),",
                    "    ]",
                    "    joint_names = [n for n, _ in SMPLX_22]",
                    "    parents = [p for _, p in SMPLX_22]",
                    "    # Pad to J joints if needed (extra Kimodo SOMA joints land as children of spine3)",
                    "    while len(joint_names) < J:",
                    "        idx = len(joint_names)",
                    "        joint_names.append(f'extra_{idx}')",
                    "        parents.append(9)   # spine3",
                    "    parents = parents[:J]",
                    "    joint_names = joint_names[:J]",
                    "    print('skeleton hierarchy from SMPL-X fallback (kimodo modules unavailable)')",
                    "",
                    "assert len(parents) == J, f'parent count {len(parents)} != joint count {J}'",
                    "",
                    "# 7b. Compute rest-pose joint offsets (each joint's position RELATIVE to its parent).",
                    "# Frame 0 of posed_joints serves as the rest pose for the offsets.",
                    "rest = posed_joints[0]                    # [J, 3]",
                    "offsets = np.zeros_like(rest)             # [J, 3]",
                    "for j in range(J):",
                    "    p = parents[j]",
                    "    offsets[j] = rest[j] if p < 0 else (rest[j] - rest[p])",
                    "",
                    "# 7c. Convert per-frame local rotation matrices → quaternions (xyzw for glTF).",
                    "# scipy returns xyzw by default for as_quat(); glTF wants xyzw.",
                    "quats = np.zeros((T, J, 4), dtype=np.float32)",
                    "for j in range(J):",
                    "    quats[:, j] = R.from_matrix(local_rot_mats[:, j]).as_quat().astype(np.float32)",
                    "",
                    "# Root translation per frame",
                    "root_trans = root_positions.astype(np.float32)   # [T, 3]",
                    "",
                    "# Time stamps in seconds",
                    "times = (np.arange(T, dtype=np.float32) / fps).astype(np.float32)",
                    "",
                    "# 7d. Build the glTF using pygltflib. Skeleton-only (no mesh).",
                    "gltf = GLTF2()",
                    "gltf.asset.version = '2.0'",
                    "gltf.asset.generator = 'Kimodo NPZ→GLB converter (engine v657)'",
                    "",
                    "# Joint nodes — one per joint, parented per the hierarchy",
                    "nodes = []",
                    "children_of = {j: [] for j in range(J)}",
                    "for j in range(J):",
                    "    p = parents[j]",
                    "    if p >= 0:",
                    "        children_of[p].append(j)",
                    "for j in range(J):",
                    "    n = Node()",
                    "    n.name = joint_names[j]",
                    "    n.translation = [float(x) for x in offsets[j]]",
                    "    if children_of[j]:",
                    "        n.children = sorted(children_of[j])",
                    "    nodes.append(n)",
                    "gltf.nodes = nodes",
                    "",
                    "# Scene with the root joints (those whose parent is -1) as scene roots",
                    "scene = Scene()",
                    "scene.nodes = [j for j in range(J) if parents[j] < 0]",
                    "gltf.scenes = [scene]",
                    "gltf.scene  = 0",
                    "",
                    "# Skin (joints array; inverse bind matrices left to identity since the engine",
                    "# will rebind to its own mesh)",
                    "skin = Skin()",
                    "skin.joints = list(range(J))",
                    "skin.skeleton = scene.nodes[0]",
                    "gltf.skins = [skin]",
                    "",
                    "# 7e. Pack all the binary data: times, quaternions, root translations.",
                    "# Layout in one big buffer:",
                    "#   [time stamps (T floats)] [quaternions (T*J*4 floats)] [root translations (T*3 floats)]",
                    "blob = bytearray()",
                    "def pad4(buf):",
                    "    while len(buf) % 4: buf.append(0)",
                    "    return buf",
                    "",
                    "time_offset = len(blob)",
                    "blob.extend(times.tobytes())",
                    "pad4(blob)",
                    "quat_offset = len(blob)",
                    "blob.extend(quats.reshape(-1).tobytes())",
                    "pad4(blob)",
                    "root_offset = len(blob)",
                    "blob.extend(root_trans.reshape(-1).tobytes())",
                    "pad4(blob)",
                    "",
                    "gltf.buffers = [Buffer(byteLength=len(blob))]",
                    "",
                    "# BufferViews",
                    "bv_time = BufferView(buffer=0, byteOffset=time_offset, byteLength=times.nbytes)",
                    "bv_quat = BufferView(buffer=0, byteOffset=quat_offset, byteLength=quats.nbytes)",
                    "bv_root = BufferView(buffer=0, byteOffset=root_offset, byteLength=root_trans.nbytes)",
                    "gltf.bufferViews = [bv_time, bv_quat, bv_root]",
                    "",
                    "FLOAT = 5126   # gl.FLOAT enum",
                    "acc_time = Accessor(bufferView=0, componentType=FLOAT, count=T,        type='SCALAR', min=[float(times.min())], max=[float(times.max())])",
                    "# We need one quaternion accessor per joint (each looking at a J-strided slice)",
                    "# Simpler: write quats per joint as separate bufferViews, each contiguous.",
                    "# Rewriting: pack per-joint blocks. Restart blob layout.",
                    "blob = bytearray()",
                    "time_offset = len(blob); blob.extend(times.tobytes()); pad4(blob)",
                    "quats_per_joint_offsets = []",
                    "for j in range(J):",
                    "    quats_per_joint_offsets.append(len(blob))",
                    "    blob.extend(quats[:, j, :].astype(np.float32).reshape(-1).tobytes())",
                    "    pad4(blob)",
                    "root_offset = len(blob); blob.extend(root_trans.reshape(-1).tobytes()); pad4(blob)",
                    "gltf.buffers = [Buffer(byteLength=len(blob))]",
                    "",
                    "buffer_views = [BufferView(buffer=0, byteOffset=time_offset, byteLength=times.nbytes)]",
                    "for j in range(J):",
                    "    buffer_views.append(BufferView(buffer=0, byteOffset=quats_per_joint_offsets[j], byteLength=T*4*4))",
                    "buffer_views.append(BufferView(buffer=0, byteOffset=root_offset, byteLength=root_trans.nbytes))",
                    "gltf.bufferViews = buffer_views",
                    "",
                    "accessors = [Accessor(bufferView=0, componentType=FLOAT, count=T, type='SCALAR', min=[float(times.min())], max=[float(times.max())])]",
                    "for j in range(J):",
                    "    accessors.append(Accessor(bufferView=1+j, componentType=FLOAT, count=T, type='VEC4'))",
                    "accessors.append(Accessor(bufferView=1+J, componentType=FLOAT, count=T, type='VEC3'))",
                    "gltf.accessors = accessors",
                    "",
                    "# 7f. Animation: one rotation channel per joint, plus one translation channel for the root",
                    "anim = Animation()",
                    "anim.name = 'kimodo_motion'",
                    "anim.samplers = []",
                    "anim.channels = []",
                    "for j in range(J):",
                    "    sampler = AnimationSampler(input=0, output=1+j, interpolation='LINEAR')",
                    "    anim.samplers.append(sampler)",
                    "    ch = AnimationChannel(sampler=j, target=AnimationChannelTarget(node=j, path='rotation'))",
                    "    anim.channels.append(ch)",
                    "# Root translation channel (only for the first root joint)",
                    "root_joint = scene.nodes[0]",
                    "root_sampler = AnimationSampler(input=0, output=1+J, interpolation='LINEAR')",
                    "anim.samplers.append(root_sampler)",
                    "anim.channels.append(AnimationChannel(sampler=len(anim.samplers)-1, target=AnimationChannelTarget(node=root_joint, path='translation')))",
                    "gltf.animations = [anim]",
                    "",
                    "# 7g. Save as GLB with the binary chunk embedded",
                    "gltf.set_binary_blob(bytes(blob))",
                    "out_glb = '/kaggle/working/output.glb'",
                    "gltf.save_binary(out_glb)",
                    "print(f'GLB written: {out_glb} · {os.path.getsize(out_glb)} bytes')",
                    "print(f'animation: {T} frames over {T/fps:.1f}s · {J} joints · {J+1} animation channels')",
                    "print('engine playback: load this .glb in the rig test demo or attach the animation to a rigged mesh')",
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
