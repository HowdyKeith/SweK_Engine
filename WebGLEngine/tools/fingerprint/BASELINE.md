# SweK Engine cross-architecture fingerprint -- BASELINE

Reference on x86_64 (Linux, Node). Fifty deterministic subsystems. All bit-identical.

REGENERATED v2889 after the libm-tripwire purge: three raw unspecified Math calls were running inside the
fingerprint (flowfieldCpu hypot x1800, voxelPose 4-arg hypot x6, solarSystem sin/cos x4 -- found by instrumenting
Math and running computeFingerprint, see libmTripwire-selfcheck.mjs). All three now use specified ops or
strictTrig. Only obb-collision's hash moved on x86_64 (the quat-norm hypot really differed from the sqrt form
here); flowfield and solar-system kept their x86_64 hashes because sqrt/strictTrig reproduce this libm's bits --
the point of the fix is that other machines' libms now cannot disagree.

| subsystem | sha-256 |
|---|---|
| strict-libm | `ec3018f3bee7d569b45d1bb8e26c20b7364461f36b0f037942e4d121e19bb823` |
| md-forcefield | `c2af614b682fde526458792b96dd6862d0949b2436058150588f3d66b0703366` |
| obb-collision | `3a0a1ce97d452571979e8a12b0760a2dbaeaba0fc908dda8b4b56b2aaa040ed1` |
| ewald-electrostatics | `2fc71720bde368dabc695158220222816226546ce658af9b96f77497f690c75a` |
| prime-transport | `8b0322df85b39ce43348eed328d7a2e8a30087224c9f4c569c80a965d2b4281c` |
| astar-pathfinding | `809983f98126d83bf7551fdaf03388479d10804f38f288f957c4f4fbacec23f6` |
| xpbd-cloth | `358dfbada63f779155b2ec93cb8f00998e822bc61f85fa3df89666fff638d44f` |
| tf-advect | `43df5910213848b7e9a7cc023c33d722d5f239931ba8585339148c0f638412ac` |
| cloth-collision | `3dfda19655e5a949efb83ac22a2fa33c559978b74b8a5319ccd4433e644aef33` |
| xpbd-damped | `fa39e22ad0cb8565298ca0904be602ea53fc319ce14d289b7ddcab1bfdddf1b3` |
| cloth-tear | `9d292b49fe479311ab5c641d177928f81d2775f8edf5f05d96fe17c0d4856baa` |
| cloth-pinned | `17762be1aa8e7addb2be94e84c79386d3b40d9bb9aa4d4b04255dcbaec959b2f` |
| thermal-cloth | `46b898a42df73eb0e958e9018e5c601f8cd919f0f11f0906ecc5803e5f876b55` |
| plastic-cloth | `14d22731c3d6c3488d89317954b7e44afd6fdb3742376af3c47a922b0cb644ae` |
| muscle-actuator | `466042a270de02bafac1db028c9b3dc5a4c2a4e36cb59bf5201ba49adce67841` |
| fluid-mesh | `1b5121e509fb7d2a6ec8caad3d2be8b98966d9036b3e034df89bc9d5ecae6df2` |
| pbf-fluid | `58107c6735d7ecdc31939deba13acf4ee31fec4284b3c8889db1288d5b044ef5` |
| fluid-pbf | `233dd704a1b74eef0f05a7ac44bd5fe42bd5c174701aef9df0555f28e550a42f` |
| volume-balloon | `b22b8ee75e7fbc34038fbe50773a2e6ce454cbed93832cd286cb8027b2894770` |
| friction-slope | `4bb0d750bca591612e479ef1e189f190fb3b38ea96a852cda1ced9ca26876106` |
| friction-pile | `d44a02e8dcd4b1b68a59354579ee64b6314c30f7862dfcf686cecf8b62873ff3` |
| fluid-drag | `da7a4d39e5955bd098e08d39088ba78f00f176fd1b4619c822d3a20e4cdf66c1` |
| cloth-anisotropy | `5c3cab463a66153a9070fa37a113295f23076d8cbf46ffd4f64465746724367a` |
| pbf-polish | `88ebde681e3d18e3961331056847df034cce65fb8838388b0311ec2d0a316ba6` |
| sampled-field | `4f4dd305bbb4c45f3fe2ec0a0a576fdf8d37fefba7c69a392f1e3fd7a5c86378` |
| wind-cloth | `bf32489ce4c78d48478c6ef6a8f4f1f150ba949de3cc62987026015f814f5616` |
| muscle-belly | `3ba9ea84891469c62df919ea2e04cecb95ca7c20bbc083f69e1d20890187c876` |
| thermal-diffusion | `679b1e99cf350b3f43104ba50ef966e87d2e0809e539ee741e24c3dfe8ae743e` |
| centrifuge | `bf347a198d8331dfac556c8f1ba59f1c65090ec4988668aeb51b1f9b2b23290e` |
| gyroscope | `f282fb799eaae8a7809331a5e79a8431e5db14abd03072c13405f9cf1b948776` |
| pendulum-wave | `d6cc3b961cc08175dede339fbfcef102655619e75e1291541e751eb504038d1a` |
| orbit | `60c576a99ca512798a120dc2db4404df35340ab45d6f7721d138fba13a5ab3da` |
| vibrations | `a75f9a4aac9183623e8bc9f8683f6e1edd0a8c72f624ac94f23f476f51918042` |
| fft | `3a93e86f03d36dd3770df9cf1e1859c19444b6869a65c46339f182456064e97e` |
| zeta | `2499ba14da065abf5da43810f98970e4c87aedc4c5cea34ba7932dc44c168a2d` |
| zeta-critical | `5f89e4b033c0a4fd0ea3c77809a441f542c032953df6f9ff6798f4cc6a5b8115` |
| figure-eight | `311cc72582281dce89233c72f20150dab208268490e08bb7bcb17c0b3a4663ab` |
| lockstep | `428a8769d3645898089fbb577cfc455b84a782c8adf4461779e4ba3ced509904` |
| black-hole | `a33e19892ffd7380e96f68f7352ca45e947edaefab0433d774e2e543885d5e8f` |
| solar-system | `8e95c3b24cc87fdff363d2ae774455369a54f76fe70bbad4d1e1ca9dcb185bd6` |
| neutron-star | `a6560fff12ba047b8a835057d1c316ff4dd425160ff8c895c151cedbfbf6c801` |
| plasma | `7efa76c77de6b9132772753eb74a7fe08f2499410d78a2984db9c76c8e1f6933` |
| impact | `34646a3e8fc53e1d1fc6bd30ec4f28bfff43872ff84079bc05c0dd31144c7ba7` |
| render | `d515e7cbed9be372241b1d04bb0cab0e0f3419883d2454721554e98159652bb9` |
| agent-arena | `754cdd85300c1ae065bf184daa9b095413009d080a5803ffa3580d3d842fd61a` |
| agent-pertick | `aa24187ca30187f02675c1a6feae50953b1f753698a9cb102ed93d41c2021108` |
| fleet-agent | `718c724f92be801ece39f5d85798c520928ef3408d55bb5d63a9238d611771b5` |
| trace-truth | `5e80d5d0e363b9d314ef604e624b7c6ab683c53311dc23b23d26f182d7cd3f51` |
| pulsar | `1591dfa0b2e824954aa923d8501e7b7674060820de4b4a7aa67f616114f3509d` |
| predict | `6df1e606c6ad7697945eeead3a1636c171641c40fdaf1e318b0ad25fcd9343aa` |

**MASTER** `50b891b6b090cf4ce7c54c38bc4bd0cf4c191c07dfaa5bb9a5bcdab67b964a24`
