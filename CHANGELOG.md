# Changelog

## 0.3.0

- Added headless primitives: `PhotoboothBanner` and `TokenPanel`. Both are className-pass-through with per-slot class overrides and copy/icon overrides. `TokenPanel` includes the canvas-rendered QR + Download PNG button.
- The lib still never imports a CSS framework. Consumers bring their own classes.

## 0.2.0

- Added remaining wall hooks: `useWallSubmit`, `usePhotoCapture`, `useSceneBackgrounds`, `useAdminAccess`, `useWallPosts`. Together with the v0.1.0 hooks this is the full hook surface needed to remove the duplicated state machinery from each template/demo `Wall.tsx`.

## 0.1.0

- Initial scaffold.
- `useWallToken` and `useWallScenes` hooks ported from the in-template `Wall.tsx` implementations.
