#!/usr/bin/env bash
# Build the Box3D static library with emscripten, link the flat C shim into
# one ES module per flavour, then compile the TypeScript frontend on top.
#
# Flavours (both use wasm SIMD, which is baseline everywhere in 2026):
#   standard  single threaded
#   deluxe    wasm threads (SharedArrayBuffer, pthreads)
#
# Usage:
#   scripts/build.sh                 build both flavours, Release
#   FLAVOURS=standard scripts/build.sh
#   TARGET_TYPE=Debug scripts/build.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT="$(dirname "$DIR")"

FLAVOURS="${FLAVOURS:-standard deluxe}"
TARGET_TYPE="${TARGET_TYPE:-Release}"
# Box3D is a git dependency in package.json (github:erincatto/box3d#<sha>), so
# pnpm puts its source tree here. Renovate bumps the pinned commit.
BOX3D_SRC="$ROOT/node_modules/@erincatto/box3d"
ENGINE_SHA="$(node -p "(require('$ROOT/package.json').devDependencies['@erincatto/box3d'] || '').split('#')[1] || 'unknown'")"

if [ ! -f "$BOX3D_SRC/CMakeLists.txt" ]; then
  echo "node_modules/@erincatto/box3d missing. Run: pnpm install" >&2
  exit 1
fi

command -v emcc >/dev/null || { echo "emcc not found. Activate emsdk first." >&2; exit 1; }

WASM_DIR="$ROOT/src/wasm"
mkdir -p "$WASM_DIR" "$ROOT/build"

for FLAVOUR in $FLAVOURS; do
  CMAKE_BUILD_DIR="$ROOT/build/cmake-$FLAVOUR-$TARGET_TYPE"

  FLAVOUR_FLAGS=()
  case "$FLAVOUR" in
    standard)
      ;;
    deluxe)
      FLAVOUR_FLAGS=(-pthread)
      ;;
    *)
      echo "Unknown flavour: $FLAVOUR (expected standard or deluxe)" >&2
      exit 1
      ;;
  esac

  CMAKE_TYPE="$TARGET_TYPE"
  if [ "$TARGET_TYPE" = "Debug" ]; then
    # keeps the engine's asserts (B3_ENABLE_ASSERT) while staying fast enough to run the tests
    CMAKE_TYPE="RelWithDebInfo"
  fi

  echo "==> cmake ($FLAVOUR, $CMAKE_TYPE)"
  CFLAGS="${FLAVOUR_FLAGS[*]:-}" emcmake cmake \
    -S "$BOX3D_SRC" \
    -B "$CMAKE_BUILD_DIR" \
    -DCMAKE_BUILD_TYPE="$CMAKE_TYPE" \
    -DBOX3D_SAMPLES=OFF \
    -DBOX3D_UNIT_TESTS=OFF \
    -DBOX3D_BENCHMARKS=OFF \
    -DBOX3D_DOCS=OFF \
    -DBOX3D_VALIDATE=OFF \
    > "$CMAKE_BUILD_DIR.cmake.log" 2>&1 || { cat "$CMAKE_BUILD_DIR.cmake.log" >&2; exit 1; }

  echo "==> build libbox3d.a ($FLAVOUR)"
  cmake --build "$CMAKE_BUILD_DIR" -j"$(nproc 2>/dev/null || sysctl -n hw.ncpu)" > "$CMAKE_BUILD_DIR.build.log" 2>&1 \
    || { tail -50 "$CMAKE_BUILD_DIR.build.log" >&2; exit 1; }

  LIB="$CMAKE_BUILD_DIR/src/libbox3d.a"
  [ -f "$LIB" ] || { echo "missing $LIB" >&2; exit 1; }

  EMCC_OPTS=(
    -std=gnu17
    -msimd128
    -msse2
    # the engine is built with the same flag; identical rounding keeps the determinism fixture valid across flavours
    -ffp-contract=off
    "-DBX_ENGINE_SHA=\"$ENGINE_SHA\""
    -sMODULARIZE=1
    -sEXPORT_ES6=1
    -sEXPORT_NAME=Box3D
    -sENVIRONMENT=web,worker,node
    -sALLOW_MEMORY_GROWTH=1
    -sMAXIMUM_MEMORY=2147483648
    -sSTACK_SIZE=1048576
    -sFILESYSTEM=0
    -sEXPORTED_FUNCTIONS=_malloc,_free
    -sMIN_SAFARI_VERSION=160400
  )
  RUNTIME_METHODS="HEAPF32,HEAP32,HEAPU32,HEAPU8,wasmMemory,UTF8ToString,stringToUTF8,lengthBytesUTF8"

  if [ "$FLAVOUR" = "deluxe" ]; then
    EMCC_OPTS+=(
      -pthread
      -DBX_WORKER_POOL=8
      -sINITIAL_MEMORY=67108864
      # pre-spawned at load; the frontend reads the real count and the shim clamps worker requests to it
      "-sPTHREAD_POOL_SIZE=Module['pthreadPoolSize']??Math.min(8,Math.max(1,((globalThis.navigator&&navigator.hardwareConcurrency)||4)-1))"
    )
    RUNTIME_METHODS="$RUNTIME_METHODS,PThread"
  else
    EMCC_OPTS+=(-sINITIAL_MEMORY=33554432)
  fi
  EMCC_OPTS+=("-sEXPORTED_RUNTIME_METHODS=$RUNTIME_METHODS")

  case "$TARGET_TYPE" in
    Debug)
      EMCC_OPTS+=(-O1 -g3 -gsource-map -sASSERTIONS=2 -sSTACK_OVERFLOW_CHECK=2 -sSAFE_HEAP=1 -DBX_CHECK_HANDLES)
      ;;
    *)
      EMCC_OPTS+=(-O3 -DNDEBUG -sASSERTIONS=0)
      ;;
  esac

  echo "==> emcc link ($FLAVOUR) -> src/wasm/box3d.$FLAVOUR.js"
  # --emit-tsd describes every bx_* export, so the TypeScript frontend is
  # type-checked against the binding it actually calls.
  emcc "$ROOT"/csrc/*.c "$LIB" \
    -I "$BOX3D_SRC/include" \
    "${EMCC_OPTS[@]}" \
    "${FLAVOUR_FLAGS[@]:-}" \
    --emit-tsd "box3d.$FLAVOUR.d.ts" \
    -o "$WASM_DIR/box3d.$FLAVOUR.js"
done

echo "==> fix declarations"
node "$ROOT/scripts/fix-tsd.mjs" "$WASM_DIR/box3d.standard.d.ts" "$WASM_DIR/box3d.deluxe.d.ts"

echo "==> tsc -> dist/"
rm -rf "$ROOT/dist"
node "$ROOT/node_modules/typescript/bin/tsc" -p "$ROOT/tsconfig.build.json"
mkdir -p "$ROOT/dist/wasm"
cp "$WASM_DIR"/* "$ROOT/dist/wasm/"

echo "==> done"
ls -la "$ROOT/dist" "$ROOT/dist/wasm"
