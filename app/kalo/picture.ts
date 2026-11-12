/** Profile pictures: a chosen square of a photo, scaled to 256 pixels and stored as a small JPEG. Same approach as in MyStyle. */
const PREFIX = "data:image/jpeg;base64,";
const MAX = 120_000;

/** The square of the photo to keep, in the photo's own pixels. */
export type Crop = { x: number; y: number; side: number };

export function loadImage(file: Blob) {
  const url = URL.createObjectURL(file);
  return new Promise<{ image: HTMLImageElement; url: string }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Dieses Bild lässt sich nicht öffnen.")); };
    image.src = url;
  });
}

/** The middle square, used when nothing else was chosen. */
export function centerCrop(width: number, height: number): Crop {
  const side = Math.min(width, height);
  return { x: (width - side) / 2, y: (height - side) / 2, side };
}

/**
 * Where the photo sits in a round frame of `frame` pixels: zoom 1 fills the frame, the offset moves the photo.
 * The offset is clamped so the frame never shows anything outside the photo.
 */
export function cropOf(width: number, height: number, frame: number, zoom: number, offset: { x: number; y: number }) {
  const scale = (frame / Math.min(width, height)) * zoom;
  const limitX = (width * scale - frame) / 2;
  const limitY = (height * scale - frame) / 2;
  const x = Math.max(-limitX, Math.min(limitX, offset.x));
  const y = Math.max(-limitY, Math.min(limitY, offset.y));
  const side = frame / scale;
  return { offset: { x, y }, scale, crop: { x: width / 2 - x / scale - side / 2, y: height / 2 - y / scale - side / 2, side } };
}

export function renderPicture(image: HTMLImageElement, crop: Crop, size = 256): string {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Dieses Bild lässt sich nicht verarbeiten.");
  context.drawImage(image, crop.x, crop.y, crop.side, crop.side, 0, 0, size, size);
  for (const quality of [0.85, 0.7, 0.5]) {
    const data = canvas.toDataURL("image/jpeg", quality);
    if (data.startsWith(PREFIX) && data.length <= MAX) return data;
  }
  throw new Error("Dieses Bild ist zu gross.");
}
