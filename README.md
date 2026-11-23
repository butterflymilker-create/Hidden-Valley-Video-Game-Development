# Hidden Valley — 3D Survival Game

**Play the current public game:** https://butterflymilker-create.github.io/Hidden-Valley-Video-Game-Development/

**Source code:** https://github.com/butterflymilker-create/Hidden-Valley-Video-Game-Development

Hidden Valley is a 3D survival game built with Three.js and Vite. The current canonical build is played from a first-person perspective.

In earlier conversations, “Roblox-like” referred to the game being 3D. It does **not** mean that a separate Roblox-platform version is required or that the current 3D build is a different, unrecovered project. The current public Three.js game is the intended 3D continuation of Hidden Valley.

## Current gameplay

Explore the valley, collect wood, stone, and berries, craft tools and a canteen, manage food and water, shelter from cold weather, and light the signal fire on the ridge.

## Controls

- **WASD:** move
- **Mouse:** look
- **Space:** jump
- **Ctrl:** toggle crouch
- **Shift:** jog
- **E:** gather resources / use stream
- **1 / 2:** equip axe / pickaxe
- **T:** put tool away
- **H:** build or pack lean-to shelter
- **I:** backpack
- **Esc:** release mouse

## Run locally

Requires Node.js 22.12+ and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

## Development checks

```sh
pnpm test
pnpm build
```

The public GitHub repository uses `main` as its default branch. The configured GitHub Actions workflow runs tests and a production build on updates; successful changes are published to the same permanent GitHub Pages URL above. The game address does not change between releases.

Keep the separate local recovery backup untouched during ordinary development. Consult the project notes for continuity and decisions, but inspect the actual code and tests before assuming a feature is implemented.
