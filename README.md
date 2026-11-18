# Solmara — GTA 6 (gta6-01)

Open-world crime game in a coastal low-poly city. Steal cars, outrun the
cops, run missions, and build your reputation across Solmara's 10×10
block grid, beachfront, and hills.

## Controls

- **W / ↑** — accelerate · **S / ↓** — brake / reverse
- **A D / ← →** — steer · **Space** — handbrake
- **E** — interact / enter car · **H** — horn · **L** — headlights
- **C** — camera · **R** — reset car · **P / Esc** — pause

## How to run

```sh
node serve.ts
# open http://localhost:8080
```

No build step, no network requests — plain ES modules with vendored
three.js under `game/vendor/`. Submit with `node main.ts`
(`MAKEFUN_OUTPUT_DIR=out` outside the grader container).
