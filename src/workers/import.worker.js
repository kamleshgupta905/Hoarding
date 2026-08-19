import { readWorkbook } from '../core/workbookIO';

self.onmessage = async (event) => {
  try {
    const result = await readWorkbook(event.data.arrayBuffer, event.data.fileName);
    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ success: false, error: error.message || String(error) });
  }
};
