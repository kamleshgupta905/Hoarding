import { normalizeText } from '../core/hoardingSchema';

let workerPromise = null;

const getOcrWorker = async () => {
    if (!workerPromise) {
        workerPromise = import('tesseract.js').then(({ createWorker }) => createWorker('eng'));
    }
    return workerPromise;
};

const loadImage = (source) => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not read image for local OCR.'));
    image.src = source;
});

const cropStamp = async (source) => {
    const image = await loadImage(source);
    const canvas = document.createElement('canvas');
    const sourceY = Math.floor(image.naturalHeight * 0.54);
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight - sourceY;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.filter = 'grayscale(1) contrast(1.35)';
    context.drawImage(image, 0, sourceY, image.naturalWidth, canvas.height, 0, 0, canvas.width, canvas.height);
    return canvas;
};

const meaningfulTokens = (value) => {
    const ignored = new Set(['road', 'near', 'main', 'site', 'facing', 'towards', 'opposite', 'india', 'uttar', 'pradesh']);
    return normalizeText(value).split(' ').filter((token) => token.length >= 4 && !ignored.has(token));
};

const scoreLocation = (detectedText, location) => {
    const normalizedDetected = normalizeText(detectedText);
    const siteName = location?.['Location '] || '';
    const normalizedSite = normalizeText(siteName);
    if (!normalizedSite) return 0;
    if (normalizedDetected.includes(normalizedSite)) return 100;
    const siteTokens = meaningfulTokens(siteName);
    if (!siteTokens.length) return 0;
    const hits = siteTokens.filter((token) => normalizedDetected.includes(token)).length;
    let score = Math.round((hits / siteTokens.length) * 75);
    if (location.City && normalizedDetected.includes(normalizeText(location.City))) score += 10;
    if (location["Area"] && normalizedDetected.includes(normalizeText(location["Area"]))) score += 15;
    return Math.min(100, score);
};

export const initializeAI = () => undefined;

export const analyzeHoardingImage = async (base64Image, locationList) => {
    if (!base64Image || !Array.isArray(locationList) || !locationList.length) {
        return { matchedLocation: null, status: 'Review', confidence: 0, reasoning: 'Image or master locations missing.' };
    }
    try {
        const worker = await getOcrWorker();
        const crop = await cropStamp(base64Image);
        const { data } = await worker.recognize(crop);
        const detectedStampText = String(data?.text || '').replace(/\s+/g, ' ').trim();
        const candidates = locationList
            .map((location, index) => ({ location, index, score: scoreLocation(detectedStampText, location) }))
            .sort((left, right) => right.score - left.score);
        const best = candidates[0];
        const second = candidates[1];
        const decisive = best?.score >= 70 && (!second || best.score - second.score >= 20);
        const normalized = normalizeText(detectedStampText);
        const status = normalized.includes('occupied') || normalized.includes('booked') ? 'Occupied' : 'Available';
        return {
            detectedStampText,
            matchedIndex: decisive ? best.index : -1,
            matchedLocation: decisive ? best.location['Location '] : null,
            status: decisive ? status : 'Review',
            confidence: best?.score || 0,
            reasoning: decisive ? 'Local OCR matched unique site keywords.' : 'Local OCR was ambiguous; manual review required.'
        };
    } catch (error) {
        return { matchedIndex: -1, matchedLocation: null, status: 'Review', confidence: 0, error: error.message };
    }
};
