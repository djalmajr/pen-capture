# Pencil Capture

Capture rendered web elements and paste them as editable layers directly in Pencil.

The project contains a browser-side capture library, a Chrome Manifest V3 extension with a Paper-like picker, a deterministic converter and CLI, a Codex skill, and `examples.pen` for integration tests.

## Extension interaction

Click the extension icon to enter capture mode. The page gets a floating toolbar and a blue outline around the current target.

- Move the pointer to choose an element.
- Click or press `Enter` to capture it.
- Press `↑` to select its parent.
- Press `↓` to return to the previously selected child, or its first child.
- Press `Cmd + Enter` on macOS or `Ctrl + Enter` elsewhere to capture the whole page.
- Press `Esc` to cancel.

The toolbar fades while the pointer is over it so content underneath remains selectable. The extension converts the selected DOM subtree into editable Pencil nodes and writes Pencil's native `data-pen-node-clipboard` `text/html` payload to the clipboard. No page data is transmitted.

During serialization the toolbar collapses to `Capturing selection…` or `Capturing page…`. It only shows `Copied to clipboard. Ready to paste into Pencil.` after the browser confirms that the `text/html` payload was written.

Direct extension paste runs in Pencil-safe asset mode. Remote `http(s)` images remain image fills, redirects are resolved before the URL reaches Pencil, and the clipboard never contains `data:` image URLs: Pencil Desktop 1.1.70 treats non-HTTP image values as filesystem paths, so an embedded base64 URL opens a large asset-error alert. Supported `brightness()` and `grayscale()` filters become editable overlay layers; CSS color blend overlays become Pencil blend fills. Canvas snapshots have no durable browser URL and therefore become a transparent `Canvas · Materialization required` frame with diagnostic metadata.

Before serialization, the extension waits for SVG geometry to stabilize so animated Recharts paths are not copied mid-transition. The color converter supports the computed `rgb()`, `oklab()`, `oklch()` and `lab()` forms used by current Tailwind/shadcn output, including small empty status bullets. Transparent CSS gradients are layered above their background color instead of replacing it. SVG `linearGradient` paint servers preserve their stops and combined opacity; sharp repeating-linear patterns become clipped editable vector strokes so their spacing remains uniform in Pencil.

The neutral `*.capture.json` IR and conversion CLI remain available for diagnostics, repeatable MCP imports, and regression tests. They are no longer the extension's clipboard format.

For durable, maximum-fidelity project captures, set `PENCIL_CAPTURE_MATERIALIZE_DIR` while running the clipboard smoke workflow or use the CLI/MCP import. Image and canvas fills are downloaded or decoded into project-local files, and the clipboard payload is rewritten to use paths relative to the `.pen` document. This is the required path when canvas pixels or filtered raster output must be preserved.

The transparent vector in `extension/icons/pencil.svg` recreates Pencil's public app icon from
`https://www.pencil.dev/_next/image?url=%2Fpencil-app-icon.png&w=96&q=75`. The Chrome PNG sizes are rendered from that SVG.

## Clipboard compatibility

The main extension path is independent of Figma. Its clipboard envelope mirrors the native format produced by Pencil itself, while the neutral capture IR and conversion pipeline remain testable outside the extension.

After rebuilding, reload the unpacked extension in `chrome://extensions` before testing changes to its clipboard behavior.

## Development

```sh
bun test
bun run build
```

Load `dist/extension` as an unpacked extension from `chrome://extensions`.

## CLI

```sh
bun bin/pencil-capture.mjs verify path/to/card.capture.json
bun bin/pencil-capture.mjs convert path/to/card.capture.json /tmp/card.pencil-tree.json
bun run smoke:clipboard
bun run smoke:preview-02
bun bin/pencil-capture.mjs batch /tmp/card.pencil-tree.json /tmp/card.batch.js
```

The generated batch is intended for Pencil MCP `batch_design`. The CLI never writes `.pen` files directly.

## Acceptance suite

The two shadcn amber/olive previews in [`fixtures/shadcn/catalog.json`](fixtures/shadcn/catalog.json) are the initial acceptance suite. Each direct column child is captured independently so keyboard selection does not accidentally choose an entire source column. The suite currently contains 61 visible blocks; one `display:none` duplicate is recorded and excluded.

Absolute positions are retained for fidelity, but the original DOM parent/child hierarchy is reconstructed with coordinates relative to each semantic frame. HTML backgrounds, text, form values, SVG paths and common SVG primitives remain editable. `<img>`, CSS image backgrounds and canvas content use Pencil image fills; remote assets are inlined when possible. Linear CSS and SVG gradients become native Pencil gradients; sharp repeating-linear patterns become clipped editable vector strokes. Auto Layout inference, pseudo-elements, masks and component recognition remain explicit follow-up capabilities.

`examples.pen` currently contains the consolidated `preview` capture. The `preview-02` capture is intentionally gated until the first reference is visually approved. The CLI never edits `.pen` files directly; generated batches are applied through Pencil MCP.

Pencil currently needs nested catalog captures to be materialized once with `Copy` after insertion. Because copying regenerates descendant IDs, the import workflow finishes by querying the copied subtree and normalizing every layer to `Name (#currentId)`.

## Visual comparison

The acceptance flow produces a browser screenshot, exports the corresponding Pencil frame as PNG through Pencil MCP and generates a deterministic ImageMagick report:

```sh
bun run capture:source -- <url> <selector> artifacts/source.png
bun run compare:visual -- artifacts/source.png artifacts/pencil.png artifacts/comparison
bun run compare:visual -- artifacts/source.png artifacts/pencil.png artifacts/comparison --require-same-size --max-rmse 0.10
```

The source capture waits for network idle, web fonts, reduced motion and a configurable settle interval (`PENCIL_CAPTURE_SETTLE_MS`, default `500`). The comparison output includes `report.json`, `report.html`, `side-by-side.png`, `diff.png` and the normalized Pencil render used for pixel comparison. Acceptance flags make the command exit unsuccessfully if dimensions differ or normalized RMSE exceeds the declared limit.

Current per-page evidence and known residual differences are recorded under [`docs/acceptance`](docs/acceptance).
