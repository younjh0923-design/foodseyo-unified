import assert from "node:assert/strict";

import sharp from "sharp";

import { prepareMenuImagesForProvider } from "../src/menu-image-preprocessing-server.js";

const original = await sharp({
  create: {
    width: 4_032,
    height: 3_024,
    channels: 3,
    background: { r: 238, g: 232, b: 218 },
  },
})
  .jpeg({ quality: 98 })
  .toBuffer();
const immutableCopy = Buffer.from(original);

const prepared = await prepareMenuImagesForProvider([
  { bytes: new Uint8Array(original), mediaType: "image/jpeg" },
]);

assert.deepEqual(Buffer.from(original), immutableCopy, "source bytes must remain unchanged");
assert.deepEqual(prepared.originalDimensions, [{ width: 4_032, height: 3_024 }]);
assert.equal(prepared.images.length, 1);
assert.equal(prepared.images[0]?.mediaType, "image/jpeg");
assert.ok((prepared.providerDimensions[0]?.width ?? Infinity) <= 2_048);
assert.ok((prepared.providerDimensions[0]?.height ?? Infinity) <= 2_048);
assert.ok(
  (prepared.images[0]?.bytes.byteLength ?? Infinity) < original.byteLength,
  "the provider derivative should be smaller than an iPhone-size source",
);
assert.ok((prepared.images[0]?.bytes.byteLength ?? Infinity) <= 3 * 1024 * 1024);

const orientedSource = await sharp({
  create: {
    width: 1_200,
    height: 800,
    channels: 3,
    background: { r: 250, g: 250, b: 250 },
  },
})
  .jpeg({ quality: 90 })
  .withMetadata({ orientation: 6 })
  .toBuffer();
const oriented = await prepareMenuImagesForProvider([
  { bytes: new Uint8Array(orientedSource), mediaType: "image/jpeg" },
]);
assert.deepEqual(oriented.originalDimensions, [{ width: 1_200, height: 800 }]);
assert.deepEqual(
  oriented.providerDimensions,
  [{ width: 800, height: 1_200 }],
  "the provider derivative must apply the iPhone EXIF orientation",
);

const menuRows = Array.from(
  { length: 64 },
  (_, index) =>
    `<text x="${20 + (index % 4) * 500}" y="${30 + Math.floor(index / 4) * 88}" font-family="Arial" font-size="12" fill="#111">ITEM ${index + 1} · description · $12.00</text>`,
).join("");
const smallTextSource = await sharp(Buffer.from(
  `<svg width="2048" height="1536" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/>${menuRows}</svg>`,
))
  .jpeg({ quality: 95 })
  .toBuffer();
const smallText = await prepareMenuImagesForProvider([
  { bytes: new Uint8Array(smallTextSource), mediaType: "image/jpeg" },
]);
const raster = await sharp(smallText.images[0]?.bytes)
  .greyscale()
  .raw()
  .toBuffer();
let darkPixels = 0;
for (const value of raster) {
  if (value < 160) darkPixels += 1;
}
assert.ok(
  darkPixels > 2_000,
  "small high-contrast menu glyphs must remain visible after compression",
);

await assert.rejects(
  prepareMenuImagesForProvider([
    { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/jpeg" },
  ]),
  /image|unsupported|invalid/iu,
);

console.log("Foodseyo provider image preprocessing checks passed.");
