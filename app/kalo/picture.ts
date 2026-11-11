/** Profile pictures: the middle square of a photo, scaled to 256 pixels and stored as a small JPEG. Same approach as in MyStyle. */
const PREFIX = "data:image/jpeg;base64,";
const MAX = 120_000;

export async function makePicture(file: Blob, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Dieses Bild lässt sich nicht öffnen."));
      img.src = url;
    });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Dieses Bild lässt sich nicht verarbeiten.");
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    for (const quality of [0.85, 0.7, 0.5]) {
      const data = canvas.toDataURL("image/jpeg", quality);
      if (data.startsWith(PREFIX) && data.length <= MAX) return data;
    }
    throw new Error("Dieses Bild ist zu gross.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
