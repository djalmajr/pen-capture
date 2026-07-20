---
name: pencil-capture
description: Capture rendered web elements as editable Pencil layers through Pencil's native clipboard format or a neutral DOM/style IR converted through Pencil MCP. Use for HTML-to-Pencil fidelity experiments, browser component capture, direct design paste, scripted capture imports, or adding captured UI examples to a Pencil canvas.
---

# Pencil Capture

Capture browser UI into editable Pencil layers. Prefer the extension's native `data-pen-node-clipboard` flow for direct paste; use the neutral IR and MCP conversion flow for scripted or auditable imports. Never write `.pen` files directly.

## Workflow

1. For direct use, activate the extension, select an element, and paste the resulting design payload in Pencil. Use `Cmd/Ctrl + Enter` to capture the whole page. The extension deliberately excludes embedded `data:` assets because Pencil Desktop 1.1.70 interprets them as filesystem paths and displays the base64 payload in an asset-error alert.
2. For scripted use, obtain one `*.capture.json` file from the browser-side capture script or a fixture.
3. Run `scripts/pencil-capture.mjs verify <capture>`.
4. Run `scripts/pencil-capture.mjs convert <capture> <tree.json>`.
5. Run `scripts/pencil-capture.mjs batch <tree.json> <batch.js>`.
6. Open the target `.pen` file and call Pencil `get_editor_state(include_schema: true)`.
7. Read the generated batch and execute it with Pencil `batch_design` against the explicit target file path.
8. Validate the returned root with `snapshot_layout(problemsOnly: true)` and `get_screenshot`.
9. Query the inserted subtree and normalize every layer to `Name (#currentId)` through Pencil MCP. Clipboard paste always remaps IDs, including IDs supplied by the payload.
10. Export the completed root as PNG with Pencil MCP, capture the source element with `scripts/capture-source-screenshot.mjs`, and run `scripts/compare-visual.mjs` to produce the visual report.

Direct extension paste preserves remote `http(s)` images. Canvas content becomes a `Canvas · Materialization required` placeholder, and browser-only raster filters may remain metadata-only. When those pixels are required, use the scripted CLI/MCP path with `PENCIL_CAPTURE_MATERIALIZE_DIR` so assets are written to durable project-local files before insertion.

For nested catalogs, materialize each completed capture with `Copy` followed by deletion of the temporary insertion. Then query the copied subtree and normalize every copied layer to `Name (#currentId)`; copied descendants receive new IDs and must not retain stale suffixes.

Never read, grep or edit `.pen` files through filesystem tools. Use Pencil MCP exclusively.

## Placement and naming

- Keep each capture in one top-level frame.
- Preserve generated `Name (#ID)` names.
- Treat names in the clipboard payload as semantic base names. Pencil remaps IDs during paste, so exact suffixes are a post-insertion MCP responsibility.
- Use `FindEmptySpace`; never guess root coordinates.
- Keep `placeholder: true` only while inserting children.
- Do not replace existing screens unless explicitly requested.

## Fidelity checks

Compare the smallest meaningful captured node against the browser source. Check text, SVG geometry, backgrounds, borders, radii and clipping. Absolute positioning is expected in the first-pass capture; do not infer Auto Layout silently.

For an acceptance comparison:

```sh
bun scripts/capture-source-screenshot.mjs <url> <selector> artifacts/source.png
# Export the Pencil root to artifacts/pencil.png using Pencil MCP export_nodes.
bun scripts/compare-visual.mjs artifacts/source.png artifacts/pencil.png artifacts/comparison
```

The report records both original dimensions and whether normalization was needed. A low RMSE is evidence, not the only gate: inspect `side-by-side.png`, `diff.png`, the Pencil screenshot and `snapshot_layout` together.

For the direct extension path, also inspect the smoke result and require `containsDataUrl: false` before pasting into Pencil. Reload the unpacked extension after every rebuild.

Read [references/capture-ir.md](references/capture-ir.md) when modifying the schema or converter.
