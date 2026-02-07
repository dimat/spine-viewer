# Spine Animation: Non-Intuitive Behaviors & Conventions

This document captures quirks and conventions discovered while building a Spine viewer that loads animations from arbitrary folders (skeleton JSON + various atlas formats). Use it when debugging load failures, supporting new export formats, or integrating Spine with PixiJS/Electron.

---

## 1. Atlas formats: three kinds

Spine runtimes expect a **Spine Texture Atlas** (pages + named regions with UVs). The source can be:

| Source | Detection | Notes |
|--------|-----------|--------|
| **Spine .atlas** | File ends in `.atlas` or `.atlas.txt`; first line is image name; then region blocks with `name: x, y, w, h` | Native Spine export. One text file + one or more images. |
| **Packed JSON** (TexturePacker / Phaser / Pixi Asset Pack) | JSON has `frames` (object) and `meta` (with optional `image`, `size`) | Very common in game pipelines. **Region names = keys of `frames`**. |
| **Synthetic** | No .atlas and no packed JSON; folder has skeleton JSON + loose images | Build atlas from images; match region names by filename and common variants (see below). |

**Choice order in this viewer:** packed JSON (if its image loads) → Spine .atlas → synthetic. Packed is preferred when the skeleton was exported for a pipeline that uses TexturePacker-style atlases.

---

## 2. Packed atlas JSON: structure and naming

- **Format:** `{ "frames": { "regionName": { "frame": { "x", "y", "w", "h" }, "rotated": boolean? }, ... }, "meta": { "image": "filename.png", "size": { "w", "h" }, "related_multi_packs": ["other.webp.json"]? } }`
- **Region names** the skeleton uses must match the **keys** of `frames` (e.g. `"AMAZING"`, `"bokeh_01"`). Case-sensitive.
- **`meta.image`** is the texture filename. The file on disk might differ:
  - Export may use **multi-pack index** in the name, e.g. `atlas-10LL-5J-0.webp`, while the only file present is `atlas-10LL-5J.webp`.
  - **Fallback:** if `meta.image` has a trailing `-<digits>` before the extension (e.g. `atlas-10LL-5J-0.webp`), also try the same name with that suffix removed: `atlas-10LL-5J.webp`.
- **File lookup:** compare against folder listing with case-insensitive match and path endings (e.g. `f.endsWith('/' + name)` or `f.toLowerCase() === nameLower`) so subfolders and casing don’t break loading.

---

## 3. Multi-pack (related_multi_packs)

Some exports split the atlas into **multiple images** (e.g. to stay under texture size limits). The main packed JSON may have:

```json
"meta": {
  "image": "atlas-10LL-5J-0.webp",
  "related_multi_packs": ["atlas-10LL-5J-1.webp.json"]
}
```

- **Semantics:** The skeleton can reference regions from **any** of these packs. If you only load the first image, attachments like `"AMAZING"` that live in the second pack will cause **"Region not found in atlas"**.
- **What to do:** For each entry in `related_multi_packs`:
  1. Find the JSON file in the folder (exact name or try `.json` instead of `.webp.json`).
  2. Parse it; get `meta.image`; load that image.
  3. Add a **new page** to the Spine TextureAtlas and add **regions** from that JSON’s `frames` (same UV math as the main pack).
- If a related pack file is **missing** from the folder, those regions won’t be in the atlas. To avoid runtime errors, you can add **placeholder regions** for missing names (see below).

---

## 4. Skeleton region names: what the skeleton actually asks for

The skeleton JSON describes attachments per skin. The Spine loader looks up **region names** in the atlas. Those names are not always the same as the attachment key or a single filename.

- **Attachment name / path:** Attachments can have `name`, `path`, or both. The loader may request the **path** (e.g. `Explosion_01/Explosion_01_000`) or the bare **name** (e.g. `Explosion_01_000`). Both can appear in different runtimes or exports.
- **Skin prefix:** Many runtimes request **skin-prefixed** names: `skinName/attachmentName` (e.g. `default/Explosion_01_000`). If your atlas or synthetic matcher only has `Explosion_01_000`, add regions (or aliases) for `default/Explosion_01_000` and any other skin names that use that attachment.
- **Sequences:** Sequence attachments define multiple frames (e.g. `count`, `digits`, `start`). The loader will request **base name + zero-padded index** (e.g. `Explosion_01_000`, `Explosion_01_001`, …). Your atlas (or synthetic name set) must include all of these; they often come from a single sprite sheet, so one packed region per frame name.
- **Collecting “all names the skeleton might ask for”:** Walk every skin’s attachments; for each, add the attachment name, path, skin-prefixed name, and for sequences add every frame name (base + padded index). Use this set to drive synthetic atlas matching or to add placeholders for missing regions.

---

## 5. Synthetic atlas: matching loose images to region names

When there is no .atlas and no packed JSON, we build an atlas from **all images** in the folder and assign each image to one or more region names so the skeleton finds them.

- **Per image**, consider multiple **candidate region names:** full path without extension, filename without extension, lowercase variants, and common prefixes like `Textures/`, `textures/`, `images/`, `Images/`, or `""`.
- **Match against skeleton names:** For each candidate, if it’s in the set of “names the skeleton might request”, add a **full-page region** (UV 0,0–1,1) for that name. Prefer the name the skeleton actually uses (e.g. skin-prefixed) when multiple candidates match.
- **Sequence / suffix conventions:** Some exports use names like `name_000` or `name/name_000`. If the **filename** (without extension) equals the last segment of a skeleton name (e.g. `Explosion_01_000`), or the skeleton name ends with `'/' + fileNameWithoutExt` or `'_' + fileNameWithoutExt`, treat that image as the source for that region.
- **One region per name:** Each skeleton region name should map to exactly one atlas region (one image). If the same image must answer to multiple names (e.g. bare name and skin/name), add multiple regions pointing to the same texture page/UVs.

---

## 6. Placeholder regions for missing names

If the skeleton references a region that doesn’t exist in the atlas (e.g. missing multi-pack, or typo, or different export), the Spine loader **throws** (e.g. "Region not found in atlas: AMAZING").

- **Robust approach:** Before calling `SkeletonJson.readSkeletonData()`, compute the set of region names the skeleton needs (same walk as in §4). For any name that is **not** already in `atlas.regions`, add a **placeholder region** to the atlas (e.g. a small 16×16 magenta texture, one page, one region per missing name with full-page UVs). Then the loader never throws; missing attachments appear as small placeholder quads.
- **Alternative:** If you control the pipeline, fix the export so all referenced regions exist in the provided atlases.

---

## 7. Loading textures in Electron (Pixi + Spine)

- **Don’t rely on custom protocols (e.g. `spine-asset://`) for Pixi textures** when the asset path is a local file path. Protocol handling and CORS can make texture loading fail silently or throw.
- **Use data URLs:** Read the image file in the main process (or preload with proper access), then pass a **data URL** (e.g. `readFileAsDataURL`) to the renderer and create the Pixi texture from that (e.g. `new ImageSource({ resource: img })` with `img.src = dataUrl`). This avoids protocol and filesystem restrictions in the renderer.
- **Spine TextureAtlas:** After building the atlas (from .atlas, packed JSON, or synthetic), assign each **TextureAtlasPage** to the actual Pixi/Spine texture (e.g. `page.setTexture(SpineTexture.from(pixiTexture.source))`). Pages must be bound before the skeleton is created.

---

## 8. Driving Spine updates (Pixi v8)

- **Use the same ticker as the one driving the canvas.** If you use `Application` from Pixi, use `app.ticker.add(...)` and inside the callback call `spine.update(deltaSeconds)`. Do **not** use a different ticker (e.g. `Ticker.shared`) if the app’s canvas is driven by `app.ticker`; otherwise animation can appear stuck or out of sync.
- **Initial frame:** After setting the skin and animation, call `spine.update(0)` once so the first frame is applied before the first paint; otherwise the first frame can be blank.

---

## 9. Reloading / changing folder

- **Invalidate in-flight loads** when the user opens a different folder: e.g. increment a `loadId` at the start of the load and in a cleanup; before applying any result (creating app, creating skeleton, updating state), check that the current `loadId` still matches. If not, destroy the newly created app and don’t update state so the UI doesn’t flip to the wrong folder’s content.
- **DOM:** When replacing the viewer content, remove only the **canvas** node(s) you added, not the whole container (so overlays, loading UI, or refs aren’t wiped).

---

## 10. Quick reference: “Region not found” checklist

1. **Packed JSON:** Is the region name exactly a key in `frames`? (Case-sensitive.)
2. **Multi-pack:** Is the region in a **related** pack? Load all `related_multi_packs` JSONs and images and add their regions to the atlas.
3. **Image filename:** Does `meta.image` exist on disk? Try the fallback without the `-<digits>` suffix before the extension.
4. **Skin/sequence names:** Does your synthetic or .atlas include skin-prefixed names and all sequence frame names (base + padded index)?
5. **Placeholder fallback:** Add placeholder regions for any skeleton-requested name that’s missing from the atlas so the loader doesn’t throw and you can at least see the rest of the animation.

---

*This doc reflects behavior and fixes implemented in the Spine Viewer (Electron + Vite + React + PixiJS v8 + @esotericsoftware/spine-pixi-v8).*
