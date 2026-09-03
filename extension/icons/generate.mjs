// One-off icon generator — rasterizes icon.svg to the PNG sizes Chrome
// requires (manifest icons + Web Store listing both need real PNGs, not
// SVG). Re-run with `node extension/icons/generate.mjs` after editing
// icon.svg to regenerate.
import sharp from "sharp";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const sizes = [16, 48, 128];

for (const size of sizes) {
  await sharp(path.join(dir, "icon.svg"))
    .resize(size, size)
    .png()
    .toFile(path.join(dir, `icon${size}.png`));
  console.log(`Wrote icon${size}.png`);
}
