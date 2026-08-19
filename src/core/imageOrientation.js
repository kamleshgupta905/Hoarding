const JPEG_ORIENTATION_TAG = 0x0112;

const rotationForExif = (orientation) => ({ 3: 180, 6: 90, 8: 270 }[orientation] || 0);

const readUint16 = (view, offset, littleEndian) => view.getUint16(offset, littleEndian);
const readUint32 = (view, offset, littleEndian) => view.getUint32(offset, littleEndian);

export const getJpegExifRotation = (buffer) => {
    const view = new DataView(buffer);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return 0;

    let offset = 2;
    while (offset + 4 < view.byteLength) {
        if (view.getUint8(offset) !== 0xff) break;
        const marker = view.getUint8(offset + 1);
        const length = view.getUint16(offset + 2);
        if (length < 2 || offset + 2 + length > view.byteLength) break;
        if (marker === 0xe1 && length >= 10 && String.fromCharCode(...new Uint8Array(buffer, offset + 4, 4)) === 'Exif') {
            const tiff = offset + 10;
            const littleEndian = view.getUint16(tiff) === 0x4949;
            const firstIfd = tiff + readUint32(view, tiff + 4, littleEndian);
            if (firstIfd + 2 > view.byteLength) return 0;
            const count = readUint16(view, firstIfd, littleEndian);
            for (let index = 0; index < count; index += 1) {
                const entry = firstIfd + 2 + (index * 12);
                if (entry + 12 > view.byteLength) break;
                if (readUint16(view, entry, littleEndian) === JPEG_ORIENTATION_TAG) {
                    return rotationForExif(readUint16(view, entry + 8, littleEndian));
                }
            }
        }
        offset += length + 2;
    }
    return 0;
};

const canvasToBlob = (canvas) => new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not create corrected image.')), 'image/jpeg', 0.84);
});

const createRawBitmap = async (blob) => {
    if (typeof createImageBitmap === 'function') {
        return createImageBitmap(blob, { imageOrientation: 'none' });
    }
    const url = URL.createObjectURL(blob);
    try {
        const image = await new Promise((resolve, reject) => {
            const element = new Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('Could not load image.'));
            element.src = url;
        });
        return image;
    } finally {
        URL.revokeObjectURL(url);
    }
};

const drawRotatedImage = async (blob, rotation) => {
    const bitmap = await createRawBitmap(blob);
    const sourceWidth = bitmap.width || bitmap.naturalWidth;
    const sourceHeight = bitmap.height || bitmap.naturalHeight;
    const sideways = rotation === 90 || rotation === 270;
    const canvas = document.createElement('canvas');
    canvas.width = sideways ? sourceHeight : sourceWidth;
    canvas.height = sideways ? sourceWidth : sourceHeight;
    const context = canvas.getContext('2d');
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((rotation * Math.PI) / 180);
    context.drawImage(bitmap, -sourceWidth / 2, -sourceHeight / 2);
    bitmap.close?.();
    return { blob: await canvasToBlob(canvas), sourceWidth, sourceHeight };
};

const getRawDimensions = async (blob) => {
    const bitmap = await createRawBitmap(blob);
    const dimensions = { sourceWidth: bitmap.width || bitmap.naturalWidth, sourceHeight: bitmap.height || bitmap.naturalHeight };
    bitmap.close?.();
    return dimensions;
};

export const prepareImageOrientation = async (imageUrl, rotation = 0) => {
    const response = await fetch(imageUrl, { mode: 'cors', cache: 'force-cache' });
    if (!response.ok) throw new Error(`Could not load image (${response.status}).`);
    const sourceBlob = await response.blob();
    const exifRotation = getJpegExifRotation(await sourceBlob.arrayBuffer());
    const totalRotation = ((Number(rotation) || 0) + exifRotation) % 360;
    const rendered = totalRotation ? await drawRotatedImage(sourceBlob, totalRotation) : { blob: sourceBlob, ...(await getRawDimensions(sourceBlob)) };
    return {
        rotation: totalRotation,
        previewUrl: totalRotation ? URL.createObjectURL(rendered.blob) : imageUrl,
        blob: rendered.blob,
        width: rendered.sourceWidth,
        height: rendered.sourceHeight
    };
};

export const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not prepare corrected image.'));
    reader.readAsDataURL(blob);
});
