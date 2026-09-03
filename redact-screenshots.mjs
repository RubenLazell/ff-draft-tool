import sharp from "sharp";

// Solid black boxes over personal info — chosen deliberately over blur,
// since a blur can sometimes be reversed; a solid fill can't.
const redactions = {
  "store-screenshot-1.png": [
    // Sleeper avatar + "xavierlegette..." username
    { left: 345, top: 15, width: 165, height: 73 },
  ],
  "store-screenshot-2.png": [
    // "Logged in as rubenlazell7@aol.com"
    { left: 400, top: 115, width: 430, height: 35 },
  ],
  "store-screenshot-3.png": [
    // "Ruben's Rowdy Team" heading + "Ruben Lazell" owner name
    { left: 60, top: 385, width: 350, height: 67 },
    // Truncated team name in the top-right nav
    { left: 1080, top: 55, width: 200, height: 30 },
  ],
  "store-screenshot-4.png": [
    // "rubenlazell7@aol.com" under "Welcome back"
    { left: 540, top: 215, width: 200, height: 35 },
  ],
};

for (const [file, boxes] of Object.entries(redactions)) {
  const overlays = boxes.map((b) => ({
    input: Buffer.from(
      `<svg width="${b.width}" height="${b.height}"><rect width="100%" height="100%" fill="black"/></svg>`
    ),
    left: b.left,
    top: b.top,
  }));
  await sharp(file).composite(overlays).png().toFile(file.replace(".png", "-redacted.png"));
  console.log(`Redacted ${file}`);
}
