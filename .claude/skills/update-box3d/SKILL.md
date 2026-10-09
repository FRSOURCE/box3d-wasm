---
name: update-box3d
description: Update the pinned upstream Box3D engine in box3d-wasm and bring the wasm shim, TypeScript API, tests and demo back to full parity. Use when bumping @erincatto/box3d, when test/parity.test.ts fails, when Renovate opens an engine bump PR, or when asked to sync with upstream Box3D.
---

# Update Box3D and restore parity

The engine is a pinned git dependency (`@erincatto/box3d#<sha>` in `package.json`).
`test/parity.test.ts` plus `parity/manifest.json` are the drift gate: every `B3_API`
function in the pinned headers must be wrapped by `csrc/` or carry a `skip:` / `todo:`
reason in the manifest, and enum, `*Def` struct and constant snapshots must match.
Parity is measured against the pinned headers in `node_modules`, never against a
separate local `box3d/` checkout.

## Steps

1. **Bump the pin.** Set the sha in `package.json` (`devDependencies['@erincatto/box3d']`), `pnpm install`.
   Source is then at `node_modules/@erincatto/box3d`. Diff the old and new `include/box3d/*.h`
   (e.g. `git diff --no-index`) and read the upstream changelog or commit log.
2. **Run the gate.** `source ~/emsdk/emsdk_env.sh && pnpm build && pnpm vitest run --project standard test/parity.test.ts`.
   The failures list exactly what changed: unclassified new functions, removed functions still wrapped,
   enum or def-struct drift. A compile error in `build.sh` means a signature or field was renamed.
3. **Fix each category.**
   - _New function:_ wrap it in the right `csrc/bx_*.c` (scalars only; structs via `bx_scratch` / `bx_def`;
     slots, never b3 ids), add the TS method, add a test in `test/`. If it is native-only tooling,
     mark it `skip: <reason>` in the manifest instead. Never leave it unclassified.
   - _Removed or renamed function:_ delete or adapt the wrapper and TS method; call out the breaking change.
   - _Enum change:_ update the hardcoded maps (`SHAPE_TYPES` in `src/shape.ts`, `JOINT_TYPES` in
     `src/joints.ts`, `BODY_TYPES` in `src/body.ts`, plus any C-side `switch` / comment mapping).
   - _Def struct change:_ new fields silently take engine defaults. Decide whether to expose them:
     add words to the `bx*DefLayout` enums in `csrc/bx.h`, mirror them in `src/runtime/layouts.ts`
     (`test/exports.test.ts` cross-checks both), stage them in the TS option types.
   - _Profile / counters struct change:_ update `bx_World_GetProfile` / `GetCounters` scratch layout and `src/world.ts`.
4. **Demo.** For each new or changed capability add or update a scene under `docs/src/scenes/`
   and keep `docs/parity/samples.json` (upstream sample to web scene) accurate when upstream adds samples.
   List upstream samples with `grep -rn RegisterSample <upstream>/samples`.
5. **Refresh snapshots** only after the above is done and reviewed: `pnpm parity:update`.
   It rewrites enum / def / constant snapshots and adds any still-unwrapped new function as
   `todo: new upstream API`. Replace those with real decisions; `pnpm parity:strict` fails while any `todo:` remains.
6. **Verify.** `pnpm build && pnpm test && pnpm typecheck && pnpm bench`. Compare bench numbers to the
   previous run (regressions over ~10% need an explanation). Both flavours must pass, including determinism.
7. **Commit.** Engine bump: `feat(engine): ...`; API additions: `feat(api): ...`; demo-only: `docs(demo): ...`.

## Rules

- Do not edit `parity/manifest.json` by hand to silence the gate for an API you have not looked at.
- Do not hardcode struct offsets: add a `static_assert` or a layout export checked by `test/exports.test.ts`.
- Keep hot paths allocation-free (no bigint, object or array allocation per call; see `src/runtime/bits.ts`).
