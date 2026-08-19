import { parsePptx } from '../core/pptxEngine';

self.onmessage = async (event) => {
  try {
    const slides = await parsePptx(event.data.arrayBuffer, event.data.sites || []);
    self.postMessage({ success: true, result: slides });
  } catch (error) {
    self.postMessage({ success: false, error: error.message || String(error) });
  }
};
