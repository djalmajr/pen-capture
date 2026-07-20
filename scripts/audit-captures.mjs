import { readdir } from "node:fs/promises";

const directories = process.argv.slice(2);
if (directories.length === 0) {
  console.error("Usage: bun scripts/audit-captures.mjs <capture-dir> [...capture-dir]");
  process.exit(2);
}

for (const directory of directories) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".capture.json")).sort();
  const totals = {
    files: files.length,
    visible: 0,
    images: 0,
    canvas: 0,
    svgOther: 0,
    formControls: 0,
    backgroundImages: 0,
  };
  const issues = [];

  for (const file of files) {
    const capture = await Bun.file(`${directory}/${file}`).json();
    const root = capture.nodes.find((node) => node.path === capture.rootPath);
    if (root?.rect.width > 0 && root?.rect.height > 0) totals.visible += 1;

    const special = capture.nodes.filter((node) => {
      if (node.tag === "img") totals.images += 1;
      if (node.tag === "canvas") totals.canvas += 1;
      if (node.namespace === "http://www.w3.org/2000/svg" && !["svg", "path"].includes(node.tag)) totals.svgOther += 1;
      if (["input", "textarea", "select"].includes(node.tag)) totals.formControls += 1;
      if (node.styles.backgroundImage && node.styles.backgroundImage !== "none") totals.backgroundImages += 1;
      return node.tag === "img"
        || node.tag === "canvas"
        || (node.namespace === "http://www.w3.org/2000/svg" && !["svg", "path"].includes(node.tag))
        || ["input", "textarea", "select"].includes(node.tag)
        || (node.styles.backgroundImage && node.styles.backgroundImage !== "none");
    });

    if (special.length > 0) {
      issues.push({
        file,
        label: capture.label,
        root: root?.rect,
        special: special.map((node) => ({
          path: node.path,
          tag: node.tag,
          backgroundImage: node.styles.backgroundImage,
          attributes: node.attributes,
          rect: node.rect,
        })),
      });
    }
  }

  console.log(JSON.stringify({ directory, totals, issues }, null, 2));
}
