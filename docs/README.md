# @frsource/box3d-wasm demo

A three.js showcase of [`@frsource/box3d-wasm`](..), deployed to
[frsource.github.io/box3d-wasm](https://frsource.github.io/box3d-wasm/) from `main` by
`.github/workflows/pages.yml`. On GitHub Pages it runs the threaded (`deluxe`) build by registering
`public/coi-serviceworker.js`, which adds the cross-origin isolation headers the host cannot send, and falls
back to the single-threaded build when that is not possible. The classic scenes are adapted from
[monteslu/threejs-box3d-demo](https://github.com/monteslu/threejs-box3d-demo); the service worker follows
[pryme8's babylon-box3d demo](https://github.com/pryme8/babylon-box3d).

## Running locally

This is a pnpm workspace member linked to the library through `workspace:*`, so build the library first
(emsdk required, see the root README). The dev server sends the isolation headers itself; set
`VITE_COI_HEADERS=0` to exercise the service worker path instead.

```bash
pnpm install
pnpm build                                   # the library, into ../dist
pnpm --filter @frsource/box3d-wasm-demo dev  # or: pnpm dev, from the root
```

`?scene=<key>` starts on a scene, `?threads=0` forces the single-threaded build, `?threads=N` picks the
worker count and `?ff=600` fast-forwards steps before the first frame.

## Commits

semantic-release reads every commit on `main`, so a `feat(demo):` commit would publish a new minor of the
npm package even though `docs/` is not shipped. Use `docs(demo):` or `chore(demo):` for demo-only changes.
