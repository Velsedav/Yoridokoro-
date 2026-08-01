async function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function fileToCompressedDataUrl(
  file: File,
  options?: { maxSide?: number; type?: string; quality?: number }
): Promise<string> {
  const maxSide = options?.maxSide ?? 1200; 
  const type = options?.type ?? "image/jpeg"; 
  const quality = options?.quality ?? 0.7;

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > height) {
            if (width > maxSide) {
                height *= maxSide / width;
                width = maxSide;
            }
        } else {
            if (height > maxSide) {
                width *= maxSide / height;
                height = maxSide;
            }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            resolve(fileToDataUrl(file));
            return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
            async (blob) => {
                if (blob) {
                    resolve(await fileToDataUrl(blob));
                } else {
                    resolve(await fileToDataUrl(file));
                }
            },
            type,
            quality
        );
    };

    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(fileToDataUrl(file));
    };

    img.src = objectUrl;
  });
}

export async function remoteImageToCompressedDataUrl(
  url: string,
  options?: { maxSide?: number; type?: string; quality?: number }
): Promise<string> {
  const dataUrl = await (window as any).electronAPI.images.fetchDataUrl(url.trim()) as string
  const response = await fetch(dataUrl)
  const blob = await response.blob()
  const file = new File([blob], 'remote-image', { type: blob.type || 'image/jpeg' })
  return fileToCompressedDataUrl(file, options)
}
