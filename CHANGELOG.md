# Changelog

## [0.4.2](https://github.com/bffless/components/compare/v0.4.1...v0.4.2) (2026-04-27)


### Bug Fixes

* emit CommonJS so consumers can import without .js extensions ([43c5e64](https://github.com/bffless/components/commit/43c5e6471821c41226c3e533f1835f0e8d48a667))

## [0.4.1](https://github.com/bffless/components/compare/v0.4.0...v0.4.1) (2026-04-27)


### Miscellaneous

* prepare for npm publishing via release-please ([5d2a87b](https://github.com/bffless/components/commit/5d2a87b3299ba7b4c57bf00253ae01b14fb6410a))
* switch release-please to manifest mode anchored at 0.4.0 ([cd6b528](https://github.com/bffless/components/commit/cd6b528d8ef1139c673b72a943fcc937804e2624))
* use vX.Y.Z tag format (no component prefix) ([b0f474e](https://github.com/bffless/components/commit/b0f474e6ea6e21dd633c65e363983eaa9b91dd20))

## 0.4.0

**Breaking.** `TokenPanel` is now a compound component. The old single-element
API with a `classNames={{...}}` prop is gone — each subcomponent takes its own
`className`. This is much easier to read, lets templates re-arrange the layout
freely, and avoids the ever-growing slot-className map.

```tsx
<TokenPanel admin={tokenAdmin} open={open} onToggle={...} className="mb-3">
  <TokenPanel.Toggle className="..." />
  <TokenPanel.Panel className="...">
    <TokenPanel.Description className="..." />
    <TokenPanel.Controls className="...">
      <TokenPanel.Input className="..." />
      <TokenPanel.Generate className="..." />
      <TokenPanel.Save className="..." />
      <TokenPanel.Clear className="..." />
    </TokenPanel.Controls>
    <TokenPanel.ShareSection className="...">
      <TokenPanel.ShareLink className="..." />
      <TokenPanel.QR frameClassName="..." />
      <TokenPanel.Download className="..." />
    </TokenPanel.ShareSection>
  </TokenPanel.Panel>
</TokenPanel>
```

Migration: replace the single `<TokenPanel admin={..} classNames={{...}} />` call
with the compound shape above, mapping each `classNames.foo` onto the
corresponding subcomponent's `className`.

## 0.3.0

- Added headless primitives: `PhotoboothBanner` and `TokenPanel`. Both are className-pass-through with per-slot class overrides and copy/icon overrides. `TokenPanel` includes the canvas-rendered QR + Download PNG button.
- The lib still never imports a CSS framework. Consumers bring their own classes.

## 0.2.0

- Added remaining wall hooks: `useWallSubmit`, `usePhotoCapture`, `useSceneBackgrounds`, `useAdminAccess`, `useWallPosts`. Together with the v0.1.0 hooks this is the full hook surface needed to remove the duplicated state machinery from each template/demo `Wall.tsx`.

## 0.1.0

- Initial scaffold.
- `useWallToken` and `useWallScenes` hooks ported from the in-template `Wall.tsx` implementations.
