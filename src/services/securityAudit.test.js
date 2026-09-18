import { describe, expect, it, vi, beforeEach } from 'vitest';
import { 
  loginAdmin, 
  refreshAdminSession, 
  postStaffPhoto,
  clearAdminSession,
  getAdminSession
} from './secureApi';
import { getGroqApiKey } from './groqService';
import { buildCompositeIdentity } from '../core/hoardingSchema';
import { analyzeImport } from '../core/importEngine';

const createStorageMock = () => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, val) => { store[key] = String(val); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
};

globalThis.localStorage = createStorageMock();
globalThis.sessionStorage = createStorageMock();

describe('Security & Reliability Audit Fixes Verification', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    globalThis.sessionStorage.clear();
    clearAdminSession();
    vi.restoreAllMocks();
  });

  describe('Fix A: Login Security & Rejection of Invalid Credentials', () => {
    it('throws error when server responds with status FAILED (wrong password)', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('loginStatus')) {
          return {
            ok: true,
            json: async () => ({
              success: false,
              status: 'FAILED',
              error: 'Invalid Admin ID or password.'
            })
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      });

      await expect(loginAdmin('admin', 'wrong_password_123'))
        .rejects
        .toThrow(/Invalid Admin ID or Password/i);

      expect(getAdminSession()).toBe('');
      expect(globalThis.localStorage.getItem('isAdminAuthenticated')).toBeNull();
      expect(globalThis.sessionStorage.getItem('adh_admin_session')).toBeNull();
    });

    it('throws error when server is unreachable or times out without confirmation', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('loginStatus')) {
          throw new Error('Network timeout');
        }
        return { ok: true, json: async () => ({ success: true }) };
      });

      await expect(loginAdmin('admin', 'any_password'))
        .rejects
        .toThrow(/Login server did not respond in time/i);

      expect(getAdminSession()).toBe('');
      expect(globalThis.localStorage.getItem('isAdminAuthenticated')).toBeNull();
    }, 15000);
  });

  describe('Fix B: Session Refresh Fail-Close', () => {
    it('returns false when network error occurs during session refresh', async () => {
      globalThis.sessionStorage.setItem('adh_admin_session', 'test_session_token');
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const isValid = await refreshAdminSession();
      expect(isValid).toBe(false);
    });
  });

  describe('Fix C: Honest Photo Upload Status', () => {
    it('returns success: false with pending: true when upload polling times out', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('staffUploadStatus')) {
          return {
            ok: true,
            json: async () => ({ status: 'PROCESSING' })
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      });

      const result = await postStaffPhoto({ clientUploadId: 'test-123' });
      expect(result.success).toBe(false);
      expect(result.pending).toBe(true);
      expect(result.clientUploadId).toBe('test-123');
      expect(result.error).toContain('timed out');
    }, 25000);

    it('returns success: false with error message when server explicitly reports FAILED', async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes('staffUploadStatus')) {
          return {
            ok: true,
            json: async () => ({ status: 'FAILED', error: 'Storage quota exceeded' })
          };
        }
        return { ok: true, json: async () => ({ success: true }) };
      });

      const result = await postStaffPhoto({ clientUploadId: 'test-456' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Storage quota exceeded');
    }, 15000);
  });

  describe('Fix D: No Hardcoded API Keys', () => {
    it('returns null when no Groq key is set in localStorage or env', () => {
      globalThis.localStorage.removeItem('adh_groq_api_key');
      const key = getGroqApiKey();
      expect(key).toBeNull();
    });
  });

  describe('Fix I: Identity Field Alignment', () => {
    it('uses canonical Locality header in composite identity calculation', () => {
      const canonicalRecord = {
        City: 'Meerut',
        'Location ': 'Delhi Road',
        Locality: 'Pallavpuram',
        'Traffic From': 'Modipuram',
        'Traffic To': 'City',
        Width: 20,
        Height: 10,
        'Lat.': 28.98,
        'Long.': 77.70
      };

      const identity = buildCompositeIdentity(canonicalRecord);
      expect(identity).toContain('pallavpuram');
    });
  });

  describe('Fix J & K: Import Whitespace Trimming & Row Offsets', () => {
    it('flags rows with whitespace-only required values as missing', () => {
      const grid = [
        ['City', 'Locality', 'Location'],
        ['   ', 'Pallavpuram', 'Delhi Road Site']
      ];

      const result = analyzeImport({
        grid,
        targetHeaders: ['City', 'Locality', 'Location ']
      });

      expect(result.summary.missingRequired.length).toBeGreaterThan(0);
      expect(result.summary.missingRequired[0].fields).toContain('City');
    });

    it('preserves accurate source row numbers even when blank rows exist in Excel grid', () => {
      const grid = [
        ['City', 'Locality', 'Location'],        // Row 1 (header)
        ['', '', ''],                            // Row 2 (blank row)
        ['Meerut', 'Civil Lines', 'Begum Bridge'],// Row 3 (valid data row)
        ['', '', ''],                            // Row 4 (blank row)
        ['', 'Delhi Road', 'Invalid Site No City'] // Row 5 (missing required City)
      ];

      const result = analyzeImport({
        grid,
        targetHeaders: ['City', 'Locality', 'Location ']
      });

      expect(result.summary.missingRequired.length).toBe(1);
      expect(result.summary.missingRequired[0].row).toBe(5);
      expect(result.summary.missingRequired[0].fields).toEqual(['City']);
    });
  });
});
