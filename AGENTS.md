# AGENTS.md — `@bffless/components`

Guidance for AI coding agents (Claude Code, Cursor, etc.) working on this repo.
Read this before making changes. The conventions here are load-bearing — they
keep the consumers (5 demos + 4 templates + the `@sites/components` showcase)
working.

---

## What this repo is

`@bffless/components` is a public npm package shipping React **hooks** and
**headless primitives** that the BFFless celebration-site templates use under
the hood. It's the DRY layer that took ~8400 lines of duplicated `Wall.tsx`
state machinery across 9 sites and turned it into ~3600 lines of mostly-styling
JSX plus a single shared library.

- **Distribution**: public npm — `pnpm add @bffless/components`. CommonJS build
  in `dist/`, `.d.ts` types co-located. Source in `src/` is **never** shipped
  to consumers.
- **Repo**: <https://github.com/bffless/components> (private GitHub repo,
  public npm package — that combo is intentional).
- **Versioning**: conventional commits + release-please. Merging the auto-
  generated release PR triggers `pnpm publish` to npm.

---

## Three load-bearing design principles

1. **Logic ships from the lib. Presentation stays in the consumer.**
   The lib never imports a CSS framework. Hooks return state and handlers;
   primitives accept `className` props and render structure. Every consumer
   keeps its own brand classes.

2. **Hooks own state and side effects. Primitives are dumb.**
   When deciding "is this a hook or a primitive?" the rule is: if it touches
   the network, manages refs that outlive a render, or composes other hooks
   → it's a hook. If it only translates props to JSX → it's a primitive.

3. **Compound primitives over slot-className soup.**
   For anything more complex than a single styled element, use the compound
   pattern (e.g. `<TokenPanel.Toggle>`, `.Panel`, `.Controls`, …). Each
   subcomponent reads from a shared context and accepts its own className.
   Templates re-arrange or omit parts freely. **Do not** invent a
   `classNames={{ root: …, toggle: … }}` slot map again — that pattern was
   removed in v0.4.0 because it didn't scale to layout customization.

---

## Repo layout

```
web-templates/components/
├── package.json              name: "@bffless/components". main/types -> dist/.
├── tsconfig.json             noEmit; used by editors + `pnpm typecheck`.
├── tsconfig.build.json       extends tsconfig.json; emits CommonJS to dist/.
├── release-please-config.json
├── .release-please-manifest.json   anchors current version.
├── .github/workflows/release.yml   release-please + npm publish.
└── src/
    ├── index.tsx             single public entry. Re-exports everything.
    ├── hooks/                state + side effects. Zero styling concerns.
    │   ├── index.ts          re-exports each hook + its types.
    │   ├── useWallToken.ts
    │   ├── useWallScenes.ts
    │   ├── useWallPosts.ts
    │   ├── useWallSubmit.ts
    │   ├── usePhotoCapture.ts
    │   ├── useSceneBackgrounds.ts
    │   └── useAdminAccess.ts
    ├── primitives/           headless JSX, className-pass-through.
    │   └── Wall/
    │       ├── index.ts      re-exports each primitive + its types.
    │       ├── PhotoboothBanner.tsx   simple primitive.
    │       └── TokenPanel.tsx         compound primitive (Toggle/Panel/…).
    ├── styled/               OPTIONAL opinionated default styles. Off by
    │                         default; only imported if a consumer wants the
    │                         "just works" version. Currently empty.
    ├── types/                shared types (WallScene, WallPost, …).
    └── lib/                  framework-agnostic helpers (e.g. token.ts).
```

The four src/ subfolders map exactly onto the architecture sections in
`README.md`. Don't add a new top-level src/ folder without a strong reason —
plays badly with the showcase docs and CHANGELOG conventions.

---

## How consumers consume

```ts
// package.json:
"@bffless/components": "^0.4.2"
```

```tsx
import {
  // hooks
  useWallToken,
  useWallScenes,
  useWallPosts,
  useWallSubmit,
  usePhotoCapture,
  useSceneBackgrounds,
  useAdminAccess,
  // primitives
  PhotoboothBanner,
  TokenPanel,
  // helpers + types
  generateToken,
  type WallScene,
  type WallPost,
} from '@bffless/components';
```

Consumers run Astro/Vite, which compiles the consumer's own `Wall.tsx`. The
lib ships pre-compiled CJS so consumers don't need a TSX loader for our code.

The 9 known consumers (always check these still build before tagging a
release):

- `~/projects/sahp/web-templates/templates/{graduation/{laureate,gilded,vignette},birthday/little-hero}` — the templates that get cloned at site provision.
- `~/projects/sahp/sites-bffless-app-demos/{graduation-laureate-graduation-laureate,graduation-laureate-ricoman,graduation-gilded-graduation-gilded,graduation-vignette-graduation-vignette,birthday-little-hero-birthday-little-hero}` — the publicly-deployed demo sites.
- `~/projects/sahp/sites-bffless-app/apps/components` — the showcase docs site.

---

## Adding a new hook

1. Create `src/hooks/useFoo.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseFooOptions {
  // Public knobs. Default each one in the body so consumers don't have to.
  endpoint?: string;
  pollMs?: number;
}

export interface UseFooResult {
  // Everything the consumer needs. Avoid leaking refs unless they need to
  // wire them into JSX (e.g. canvasRef, fileInputRef).
  data: T[];
  refresh: () => Promise<void>;
}

export function useFoo(opts?: UseFooOptions): UseFooResult {
  const endpoint = opts?.endpoint ?? '/api/foo';
  // ...
}
```

2. Add re-exports to `src/hooks/index.ts` AND `src/index.tsx`. Both spots —
   the lib's public surface lives in `src/index.tsx`, and tooling that
   reads `src/hooks/index.ts` (some consumers do `from '@bffless/components/hooks'`-ish patterns) needs them too.

3. Run `pnpm typecheck`. Then `pnpm build`. Inspect `dist/hooks/useFoo.js`
   to confirm CJS output is sane.

4. Commit as `feat: add useFoo hook` (conventional commits). release-please
   will bump minor on the next merge to main.

---

## Adding a new primitive

### Simple primitive (single element)

Use this only for one-element wrappers. Anything more should be compound.

```tsx
// src/primitives/Wall/MyBadge.tsx
import type { ReactNode } from 'react';

export interface MyBadgeProps {
  visible: boolean;
  className?: string;
  children?: ReactNode;
}

export function MyBadge({ visible, className, children }: MyBadgeProps) {
  if (!visible) return null;
  return <span className={className}>{children ?? 'Default'}</span>;
}
```

### Compound primitive (multi-part)

Mirror `TokenPanel`. Quick template:

```tsx
import { createContext, useContext, type ReactNode } from 'react';

interface Ctx {
  // Everything subcomponents need to read.
}
const PanelContext = createContext<Ctx | null>(null);
function usePanelContext() {
  const ctx = useContext(PanelContext);
  if (!ctx) throw new Error('<Panel.*> must be inside <Panel>.');
  return ctx;
}

export interface PanelProps {
  // Root props.
  className?: string;
  children: ReactNode;
}

function PanelRoot({ className, children, ...rest }: PanelProps) {
  return (
    <PanelContext.Provider value={{ /* ... */ }}>
      <div className={className}>{children}</div>
    </PanelContext.Provider>
  );
}

function Toggle({ className, children }: { className?: string; children?: ReactNode }) {
  const ctx = usePanelContext();
  return <button className={className} onClick={ctx.onToggle}>{children ?? 'Default label'}</button>;
}

// Repeat for each subcomponent...

export const Panel = Object.assign(PanelRoot, { Toggle, /* ... */ });
```

Re-exports go in `src/primitives/Wall/index.ts` AND `src/index.tsx`. Export
**every** subcomponent's props type — `<Panel.Toggle>` users will want
`PanelToggleProps` for their own wrappers.

### Rules for primitives

- Never import a CSS framework. No Tailwind utilities baked in.
- Default copy and icons go behind `children?` and `icon?` props so consumers
  can override.
- For boolean-conditional rendering (e.g. `if (!open) return null`), keep it
  inside the subcomponent — don't make the consumer wrap with `{open && …}`.
- For QR code or other rendering that requires a ref forwarded from a hook
  (e.g. `admin.qrCanvasRef`), pull the ref from context, not props.

---

## Adding a whole new component type (e.g. `<Gallery>`)

Roughly: pick a slug, scaffold the same shape as `Wall`, then surface it on
the showcase.

1. **Hooks** — anything stateful goes in `src/hooks/useGallery*.ts`. Even if
   the component initially has just one hook, give it a Gallery prefix
   (`useGalleryItems`) so future hooks can group naturally.

2. **Primitives** — `src/primitives/Gallery/`. Compound if more than one
   element, simple if not.

3. **Types** — shared shapes in `src/types/gallery.ts`. Re-export from
   `src/index.tsx`.

4. **Helpers** — anything framework-agnostic (formatters, validators) goes in
   `src/lib/`.

5. **Public API** — re-export everything from `src/index.tsx`. The pattern is
   "named exports, no default export." Every consumer destructures from the
   single root entry.

6. **Showcase entry** — add a `ComponentEntry` to
   `~/projects/sahp/sites-bffless-app/apps/components/src/data/components.ts`
   with name, description, hooks, primitives (+ compound parts), install +
   usage snippets, AI prompt, parent install prompt, and the `pipelines`
   block (per-site rules + schemas the new component needs in any consumer's
   project).

7. **Mock preview** — add `apps/components/src/components/GalleryPreview.tsx`
   and wire it into `PreviewSlot.tsx` so the new slug renders something on
   `/reference/<slug>/` and `/add/<slug>/`.

8. Commit as `feat: add Gallery component` — release-please does the rest.

---

## Versioning

`bump-minor-pre-major: true` is set, so on 0.x:

- `feat:` → minor bump (0.4.0 → 0.5.0)
- `fix:`, `chore:`, `refactor:`, `docs:` → patch (0.4.0 → 0.4.1)
- `feat!:` or any commit with `BREAKING CHANGE:` footer → major (0.x → 1.0.0)

Once the lib hits 1.x:

- `feat:` → minor (1.0.0 → 1.1.0)
- `fix:` → patch (1.0.0 → 1.0.1)
- `feat!:` → major (1.0.0 → 2.0.0)

Consumers pin via `^X.Y.Z` so semver-compatible updates flow on `pnpm install`.
A `feat!:` is a hard break — every consumer must be migrated before the
release PR is merged. We did this in v0.4.0 (TokenPanel compound rewrite);
the migration playbook there is the reference for future breaking changes.

### Releasing

1. Land your changes on `main` with conventional commits.
2. release-please opens/updates a `chore(main): release X.Y.Z` PR.
3. Verify the PR's CHANGELOG diff is what you want.
4. Merge the PR.
5. The publish job runs `pnpm build && pnpm publish --access public`.
6. The new version appears at <https://www.npmjs.com/package/@bffless/components>.

If a release fails for transient API reasons (release-please did this in
v0.4.0), re-running the workflow usually clears it. If it fails repeatedly,
check the `.release-please-manifest.json` matches the latest published
version on npm.

---

## Backend dependencies (important!)

Components in this lib usually call BFFless backend pipelines that **must
exist on the consuming project** (or be referenced via an alias for centralized
pipelines). The `Wall` component, for example, requires:

- **Per-site** (each consumer's project): `wall_posts`, `wall_scenes`,
  `wall_scene_backgrounds`, `wall_photos` upload schemas + corresponding
  proxy rules at `/api/wall`, `/api/wall-scenes`, `/api/wall-scene-backgrounds`,
  `/api/uploads/wall-photos`.
- **Centralized** (hosted by BFFless on the `bffless-sites` project, the
  consumer's alias just references the rule set): `/api/generate-wall-scene`,
  `/api/admin/wall-scene-token` (GET + POST).

When adding a new component, document its backend requirements in the
showcase's `data/components.ts` `pipelines` field. The reference page
(`apps/components/src/pages/reference/[slug].astro`) renders this into a
"Backend setup" section automatically — split into "Pipelines you create on
your project" and "Hosted by BFFless".

**Don't expose internal centralized schemas (e.g. `site_credits`,
`credit_transactions`) in public docs.** They're our accounting layer and
consumers can't (and shouldn't) create them. Listing the centralized rules at
high level is fine because the lib calls them and consumers need to know they
exist; listing the schemas behind them isn't.

Long term, BFFless skills (e.g. `bffless:install-wall`) should bootstrap the
per-site pipelines for new consumers automatically. Until that exists, the
templates handle setup at clone time.

---

## When you make changes

Mandatory:

- `pnpm typecheck` — no errors.
- `pnpm build` — produces `dist/` with both `.js` and `.d.ts`.

Recommended for non-trivial changes:

- Bump a known consumer locally, point its `package.json` at a `pnpm pack`
  tarball or a relative `file:` path to your local dist, and `pnpm build`
  the consumer to confirm.
- For breaking API changes, update **all 9 consumers** in the same change
  before tagging the release. The `v0.4.0 TokenPanel` migration is the
  template — see commit `fa5ce1a` for the lib change and the matching
  refactor commits across all 9 consumer repos.

Don't:

- Don't import Tailwind or any CSS-in-JS lib in `src/`. The lib stays
  className-agnostic.
- Don't add inline styles in primitives. (Inline styles are how
  `@bffless/admin-toolbar` works because it's dropped onto arbitrary host
  pages without Tailwind. Different problem; different solution.)
- Don't ship source `.tsx` to npm. `files: ["dist"]` enforces this; don't
  expand it.
- Don't add a default export. Every public symbol is a named export.
- Don't break ESM/CJS interop without a plan. We're CommonJS today; switching
  to ESM requires either explicit `.js` extensions in source imports or a
  bundler (tsup, rollup) — see the v0.4.1 → v0.4.2 incident in the changelog.
- Don't skip the conventional-commit prefix. release-please relies on it
  end-to-end.

---

## Showcase site

The public showcase (where a developer or AI agent learns the API) lives at
`https://components.sites.bffless.app` and its source is at
`~/projects/sahp/sites-bffless-app/apps/components/`. When adding a new
component, also touch:

- `apps/components/src/data/components.ts` — add a `ComponentEntry`.
- `apps/components/src/components/<Slug>Preview.tsx` — a self-contained mock
  React island. No real hooks, no network calls — the preview is meant to be
  visually accurate but data-stubbed so the showcase isn't dependent on a
  deployed consumer.
- `apps/components/src/components/PreviewSlot.tsx` — wire the slug to the
  preview component.

That repo deploys via the `sites-bffless-app` workflow on push to main.
