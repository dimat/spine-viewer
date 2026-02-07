# Spine Viewer

Desktop app (macOS and Windows) to preview Spine animations exported from the Spine Animation Node (e.g. JSON + textures folder or atlas-based exports).

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run start   # run built app
```

## Package

### macOS

```bash
npm run pack    # build and create .app in dist/mac-arm64/ (or dist/mac-universal/)
npm run dist    # build and create DMG + ZIP in dist/
```

- **pack**: outputs `Spine Viewer.app` under `dist/mac-arm64/` (Apple Silicon). Double-click to run.
- **dist**: produces `Spine Viewer-0.1.0-arm64.dmg` and `Spine Viewer-0.1.0-arm64-mac.zip` in `dist/` for distribution.

On Apple Silicon, run `npm run pack` then open `dist/mac-arm64/Spine Viewer.app`. For Intel Macs, build on an Intel machine or use a universal build (e.g. `npm run dist -- --mac --x64` for x64 only).

### Windows (cross-compile from macOS)

You can build Windows installers from macOS:

```bash
npm run pack:win   # unpacked app in dist/win-unpacked/
npm run dist:win   # NSIS installer + portable exe in dist/
```

- **pack:win**: outputs an unpacked app under `dist/win-unpacked/` (run `Spine Viewer.exe`).
- **dist:win**: produces an NSIS installer (`.exe`) and a portable executable in `dist/` for distribution.

Builds are 64-bit by default. For 32-bit use: `npm run build && electron-builder --win --ia32`.

## Releasing (GitHub Actions)

Pushing a **version tag** triggers a workflow that builds macOS and Windows and publishes a [GitHub Release](https://docs.github.com/en/repositories/releasing-projects-on-github) with the installers attached.

1. **Tag and push** (version is taken from the tag; `package.json` is updated in CI):
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. The [Release workflow](.github/workflows/release.yml) runs: builds on `macos-latest` and `windows-latest`, then creates the release with DMG, ZIP (macOS) and NSIS + portable EXE (Windows).
3. Release notes are auto-generated from commits; use **conventional commits** for clearer notes:
   - `feat: add X` → feature
   - `fix: Y` → bugfix
   - `docs: Z` → documentation
   - See [Conventional Commits](https://www.conventionalcommits.org/) for more.

**If macOS says "Malware Blocked and Moved to Bin"**: The app is unsigned, so Gatekeeper blocks it. To run it anyway:
1. Restore **Spine Viewer.app** from Bin (drag it back to e.g. `dist/mac-arm64/` or your Desktop).
2. In Terminal:
   ```bash
   xattr -cr "/path/to/Spine Viewer.app"
   ```
   (Use the real path, e.g. `~/Desktop/Spine\ Viewer.app` or `dist/mac-arm64/Spine\ Viewer.app`.)
3. Right-click the app → **Open** → click **Open** in the dialog. After that you can double-click as usual.

To avoid the warning for everyone (e.g. when sharing the app), you need to **notarize** it with an Apple Developer account (Developer ID Application certificate + notarization). Then Gatekeeper will accept the app without these steps.

## Usage

1. Click **Open** and select a folder that contains a Spine skeleton JSON and its textures, or drag and drop the folder onto the window.
2. Use **Animation** and **Skin** dropdowns to switch state.
3. Use **Play** / **Pause** and **Loop** to control playback.

Supports:
- Individual textures: folder with a `.json` skeleton file and a `textures/` directory (or similar) with PNG/JPG/WebP images.
- Atlas-based: folder with `.json`, `.atlas` (or `.atlas.txt`), and the atlas texture image(s).

## Tech

Electron + Vite + React + TypeScript, using `@esotericsoftware/spine-pixi-v8` and PixiJS v8 for rendering.

## Contributing

Use [conventional commits](https://www.conventionalcommits.org/) (e.g. `feat:`, `fix:`, `docs:`) so release notes stay clear when cutting a new version.
