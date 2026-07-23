import sharp from "sharp";

import type { TransientUploadedMenuImage } from "@foodseyo/menu-analysis";

const PROVIDER_LONG_EDGE = 2_048;
const MAX_DECODED_PIXELS = 40_000_000;
const MAX_PROVIDER_IMAGE_BYTES = 3 * 1024 * 1024;

export interface SafeImageDimensions {
  readonly width: number;
  readonly height: number;
}

export interface PreparedMenuImages {
  readonly images: readonly TransientUploadedMenuImage[];
  readonly originalDimensions: readonly SafeImageDimensions[];
  readonly providerDimensions: readonly SafeImageDimensions[];
}

const dimensionPair = (
  width: number | undefined,
  height: number | undefined,
): SafeImageDimensions => {
  if (
    width === undefined ||
    height === undefined ||
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width * height > MAX_DECODED_PIXELS
  ) {
    throw new TypeError("invalid or oversized decoded image dimensions");
  }
  return { width, height };
};

export const prepareMenuImagesForProvider = async (
  images: readonly TransientUploadedMenuImage[],
): Promise<PreparedMenuImages> => {
  const prepared = await Promise.all(
    images.map(async (image) => {
      const decoder = sharp(image.bytes, {
        failOn: "error",
        limitInputPixels: MAX_DECODED_PIXELS,
      });
      const originalMetadata = await decoder.metadata();
      const originalDimensions = dimensionPair(
        originalMetadata.width,
        originalMetadata.height,
      );
      const firstPass = await decoder
        .rotate()
        .flatten({ background: "#ffffff" })
        .resize({
          width: PROVIDER_LONG_EDGE,
          height: PROVIDER_LONG_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 82, progressive: true })
        .toBuffer({ resolveWithObject: true });
      const finalPass = firstPass.data.byteLength <= MAX_PROVIDER_IMAGE_BYTES
        ? firstPass
        : await sharp(firstPass.data)
            .jpeg({ quality: 70, progressive: true })
            .toBuffer({ resolveWithObject: true });
      const providerDimensions = dimensionPair(
        finalPass.info.width,
        finalPass.info.height,
      );
      return {
        image: {
          bytes: new Uint8Array(finalPass.data),
          mediaType: "image/jpeg" as const,
        },
        originalDimensions,
        providerDimensions,
      };
    }),
  );
  return {
    images: prepared.map((entry) => entry.image),
    originalDimensions: prepared.map((entry) => entry.originalDimensions),
    providerDimensions: prepared.map((entry) => entry.providerDimensions),
  };
};
