const readAsDataUrl = (file: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error('The image could not be read.'));
  reader.readAsDataURL(file);
});

export async function imageFileToDataUrl(file: File, optimize = true): Promise<string> {
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose an image file.');
  if (!optimize) return readAsDataUrl(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('The image format is not supported.'));
      element.src = objectUrl;
    });
    const maximumWidth = 900;
    const maximumHeight = 1200;
    const scale = Math.min(1, maximumWidth / image.naturalWidth, maximumHeight / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('The image could not be prepared.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.82));
    return blob ? readAsDataUrl(blob) : readAsDataUrl(file);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
