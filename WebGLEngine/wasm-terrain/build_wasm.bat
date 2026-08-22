@echo off
REM build_wasm.bat - build the terrain-wasm crate and install the output
REM into WebGLEngine\world\wasm\ where world/terrainWasm.js expects it.
REM
REM Run from the wasm-terrain\ folder (double-click works).
REM
REM Requirements (one-time):
REM   winget install Rustlang.Rustup     (then: rustup default stable)
REM   cargo install wasm-pack            (or: winget install WasmPack.wasm-pack)
REM
REM The engine runs fine WITHOUT this build — world/terrainWasm.js detects
REM the missing pkg and uses the JS terrain path. This build is the opt-in
REM fast path.

title terrain-wasm build
cd /d "%~dp0"

REM v2798 - WASM SIMD (simd128) is ON by default: every browser this engine
REM targets (Chrome 91+, the launcher opens Chrome) supports it, and LLVM
REM autovectorizes the erosion + fill loops with it. If instantiation ever
REM fails on an exotic runtime, terrainWasm.js just falls back to the JS
REM path -- but you can also build without it:
REM   build_wasm.bat nosimd
set "WASM_RUSTFLAGS=-C target-feature=+simd128"
if /I "%~1"=="nosimd" ( set "WASM_RUSTFLAGS=" & echo [simd off] )

where cargo >nul 2>nul
if errorlevel 1 (
    echo ERROR: cargo not found. Install Rust first:
    echo        winget install Rustlang.Rustup
    echo        rustup default stable
    pause
    exit /b 1
)

where wasm-pack >nul 2>nul
if errorlevel 1 (
    echo wasm-pack not found -- installing via cargo (one-time, ~1-2 min)...
    cargo install wasm-pack
    if errorlevel 1 (
        echo ERROR: wasm-pack install failed.
        pause
        exit /b 1
    )
)

REM Native sanity tests first (fast; catches port regressions before the
REM slower wasm build).
echo Running native tests...
REM (native tests run WITHOUT the wasm SIMD flag -- simd128 is a wasm-only feature)
set "RUSTFLAGS="
cargo test --quiet
if errorlevel 1 (
    echo ERROR: cargo test failed -- not building wasm from a broken tree.
    pause
    exit /b 1
)

echo Building wasm (release)...
set "RUSTFLAGS=%WASM_RUSTFLAGS%"
wasm-pack build --target web --release --no-typescript --out-name terrain_wasm
if errorlevel 1 (
    echo ERROR: wasm-pack build failed.
    pause
    exit /b 1
)

REM Install: only the loader JS + wasm binary are needed at runtime.
set "DEST=..\world\wasm"
if not exist "%DEST%" mkdir "%DEST%"
copy /Y "pkg\terrain_wasm.js"      "%DEST%\" >nul
copy /Y "pkg\terrain_wasm_bg.wasm" "%DEST%\" >nul

echo.
echo Done. Installed:
echo   %DEST%\terrain_wasm.js
echo   %DEST%\terrain_wasm_bg.wasm
echo.
echo Verify in-engine: open the world, then in the console run
echo   world.wasmGenStats^(^)
echo Expect { ready: true, ... } and tilesOwned growing as you fly around.
echo Disable anytime with ?wasmgen=0 or localStorage voxelengine.terrain.wasm=0.
echo.
echo Optional: run the JS-vs-WASM parity check from WebGLEngine\:
echo   node tools\terrain-parity.mjs
pause
