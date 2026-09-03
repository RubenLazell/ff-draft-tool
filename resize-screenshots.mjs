import sharp from "sharp";

const W = 1280;
const H = 800;

const jobs = [
  { in: "Screenshot 1.png", out: "store-screenshot-1.png", mode: "cover" },
  { in: "screenshot 2.png", out: "store-screenshot-2.png", mode: "contain" },
  { in: "screenshot 3.png", out: "store-screenshot-3.png", mode: "cover" },
  { in: "screenshot 4.png", out: "store-screenshot-4.png", mode: "cover" },
  { in: "screenshot 5.png", out: "store-screenshot-5.png", mode: "cover" },
  { in: "screenshot 6.png", out: "store-screenshot-6.png", mode: "cover" },
];

for (const job of jobs) {
  const img = sharp(job.in);
  if (job.mode === "cover") {
    await img
      .resize(W, H, { fit: "cover", position: "centre" })
      .png()
      .toFile(job.out);
  } else {
    await img
      .resize(W, H, { fit: "contain", background: "#0a0a0a" })
      .flatten({ background: "#0a0a0a" })
      .png()
      .toFile(job.out);
  }
  console.log(`Wrote ${job.out}`);
}
