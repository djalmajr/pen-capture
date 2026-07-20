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

The neutral `*.capture.json` IR and conversion CLI remain available for diagnostics, repeatable MCP imports, and regression tests. They are no longer the extension's clipboard format.

For durable project captures, set `PENCIL_CAPTURE_MATERIALIZE_DIR` while running the clipboard smoke workflow. Image and canvas fills are downloaded or decoded into project-local files, and the clipboard payload is rewritten to use paths relative to the `.pen` document. This avoids Pencil exposing large `data:` URLs as asset errors.

The transparent vector in `extension/icons/pencil.svg` recreates Pencil's public app icon from
`https://www.pencil.dev/_next/image?url=%2Fpencil-app-icon.png&w=96&q=75`. The Chrome PNG sizes are rendered from that SVG.

## Clipboard compatibility

The main extension path is independent of Figma. Its clipboard envelope mirrors the native format produced by Pencil itself, while the neutral capture IR and conversion pipeline remain testable outside the extension.

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
bun bin/pencil-capture.mjs batch /tmp/card.pencil-tree.json /tmp/card.batch.js
```

The generated batch is intended for Pencil MCP `batch_design`. The CLI never writes `.pen` files directly.

## Acceptance suite

The two shadcn amber/olive previews in [`fixtures/shadcn/catalog.json`](fixtures/shadcn/catalog.json) are the initial acceptance suite. Each direct column child is captured independently so keyboard selection does not accidentally choose an entire source column. The suite currently contains 61 visible blocks; one `display:none` duplicate is recorded and excluded.

Absolute positions are retained for fidelity, but the original DOM parent/child hierarchy is reconstructed with coordinates relative to each semantic frame. HTML backgrounds, text, form values, SVG paths and common SVG primitives remain editable. `<img>`, CSS image backgrounds and canvas content use Pencil image fills; remote assets are inlined when possible. Linear and repeating-linear gradients are translated to native Pencil gradients. Auto Layout inference, pseudo-elements, masks and component recognition remain explicit follow-up capabilities.

`examples.pen` contains both catalogs grouped by source and column. The CLI never edits it directly; generated batches are applied through Pencil MCP.

Pencil currently needs nested catalog captures to be materialized once with `Copy` after insertion. Because copying regenerates descendant IDs, the import workflow finishes by querying the copied subtree and normalizing every layer to `Name (#currentId)`.

## Visual comparison

The acceptance flow produces a browser screenshot, exports the corresponding Pencil frame as PNG through Pencil MCP and generates a deterministic ImageMagick report:

```sh
bun run capture:source -- <url> <selector> artifacts/source.png
bun run compare:visual -- artifacts/source.png artifacts/pencil.png artifacts/comparison
```

The output includes `report.json`, `report.html`, `side-by-side.png`, `diff.png` and the normalized Pencil render used for pixel comparison.
