import { mkdir, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { spawn } from "node:child_process";

const [sourcePath, pencilPath, outputDirectory] = process.argv.slice(2);
if (!sourcePath || !pencilPath || !outputDirectory) {
  console.error("Usage: bun scripts/compare-visual.mjs <source.png> <pencil.png> <output-directory>");
  process.exit(2);
}

function run(command, args, allowDifference = false) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0 || (allowDifference && code === 1)) resolvePromise({stdout,stderr,code});
      else reject(new Error(`${command} exited with ${code}: ${stderr}`));
    });
  });
}

async function dimensions(path) {
  const result = await run("magick", ["identify", "-format", "%w %h", path]);
  const [width, height] = result.stdout.trim().split(/\s+/).map(Number);
  return {width,height};
}

const source = resolve(sourcePath);
const pencil = resolve(pencilPath);
const output = resolve(outputDirectory);
await mkdir(output, {recursive:true});
const sourceDimensions = await dimensions(source);
const pencilDimensions = await dimensions(pencil);
const normalizedPencil = `${output}/pencil-normalized.png`;
const diff = `${output}/diff.png`;
const sideBySide = `${output}/side-by-side.png`;
await run("magick", [pencil, "-resize", `${sourceDimensions.width}x${sourceDimensions.height}!`, normalizedPencil]);
const metricResult = await run("magick", ["compare", "-metric", "RMSE", source, normalizedPencil, diff], true);
await run("magick", [source, normalizedPencil, "+append", sideBySide]);
const metricMatch = metricResult.stderr.match(/([\d.]+)\s*\(([\d.]+)\)/);
const report = {
  source:{path:source, ...sourceDimensions},
  pencil:{path:pencil, ...pencilDimensions},
  normalized:pencilDimensions.width !== sourceDimensions.width || pencilDimensions.height !== sourceDimensions.height,
  rmse:metricMatch ? Number(metricMatch[1]) : null,
  normalizedRmse:metricMatch ? Number(metricMatch[2]) : null,
  outputs:{diff,sideBySide,normalizedPencil},
};
await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(`${output}/report.html`, `<!doctype html><meta charset="utf-8"><title>Pencil Capture visual comparison</title><style>body{font:14px system-ui;margin:24px;background:#f5f5f2;color:#181817}main{max-width:1400px;margin:auto}section{margin:24px 0}img{max-width:100%;border:1px solid #ddd;background:white}code{background:#e9e9e5;padding:2px 5px;border-radius:4px}</style><main><h1>Pencil Capture visual comparison</h1><p>RMSE: <code>${report.rmse}</code> · normalized RMSE: <code>${report.normalizedRmse}</code> · resized: <code>${report.normalized}</code></p><section><h2>Source × Pencil</h2><img src="${basename(sideBySide)}"></section><section><h2>Pixel difference</h2><img src="${basename(diff)}"></section></main>`);
console.log(JSON.stringify(report));
