# @bffless/components

Shared React component library for BFFless celebration sites. Provides hooks and headless primitives so each template/demo can keep its own brand styling while sharing all the imperative state machinery.

Consumed source-only, exactly like [`@bffless/admin-toolbar`](https://github.com/bffless/admin-toolbar) — no build step, `main: src/index.tsx`, the consumer's bundler compiles the `.tsx` directly.

## Install

```bash
pnpm add github:bffless/components#v0.1.0
```

`react` and `react-dom` are peer deps (`^18 || ^19`).

## Components

### Wall

Interactive guest message wall with token-gated AI scene generation, photobooth banner, and auto-rotating slideshow (TV mode).

```tsx
import {
  useWallToken,
  useWallScenes,
} from '@bffless/components';

export default function Wall() {
  const token = useWallToken();
  const scenes = useWallScenes();
  // ...your styled JSX, using token.aiEnabled and scenes.activeScene
}
```

See [`src/hooks/`](./src/hooks) for the full hook surface and [`src/primitives/Wall/`](./src/primitives/Wall) for headless JSX building blocks.

## Architecture

- **`src/hooks/`** — state and side effects (URL token capture, scene polling + rotation, photo capture, posting + AI generation). Zero styling concerns.
- **`src/primitives/`** — headless JSX skeletons. Accept `className` / per-slot class props. The lib never imports a CSS framework; consumers bring their own classes.
- **`src/styled/`** — optional opinionated default styles (Tailwind classes baked in). Only imported if you want a "just works" version.
- **`src/lib/`** — small framework-agnostic helpers (e.g. `generateToken`).
- **`src/types/`** — shared types (`WallScene`, `WallPost`, etc.).

## Versioning

Git-tag-based. Pin exactly with `#v0.1.0`, or track `#main` while iterating. Releases are managed by [release-please](https://github.com/googleapis/release-please) on merge to `main`.
