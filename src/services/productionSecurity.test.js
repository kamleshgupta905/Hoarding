import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('Production security boundaries', () => {
  it('does not ship Gemini API key fallbacks in the browser service', () => {
    const source = read('./geminiService.js');
    expect(source).not.toMatch(/AQ\\.[A-Za-z0-9_-]{20,}/);
    expect(source).not.toContain('AIza');
    expect(source).toContain("action: 'geminiVision'");
  });

  it('does not embed a staff token in the client API service', () => {
    const source = read('./secureApi.js');
    expect(source).not.toContain('OFFICIAL_STAFF_TOKEN');
    expect(source).not.toMatch(/export const OFFICIAL_STAFF_TOKEN\\s*=/);
  });

  it('requires admin or staff authorization before calling the Gemini proxy', () => {
    const source = read('../../google_apps_script/Code.gs');
    expect(source).toMatch(/if \(p\\.action === 'geminiVision'\) \{[\\s\\S]*?isValidAdminSession_\\(p\\.sessionToken\\)[\\s\\S]*?isValidStaffToken_\\(p\\.staffToken\\)/);
  });

  it('requires a valid staff token to read staff upload status', () => {
    const source = read('../../google_apps_script/Code.gs');
    expect(source).toMatch(/function getStaffUploadStatus_\\(clientUploadId, staffToken\\) \{\\s*if \(!isValidStaffToken_\\(staffToken\\)\)/);
  });

  it('does not synthesize an admin session for legacy upload endpoints', () => {
    const source = read('../../google_apps_script/Code.gs');
    expect(source).not.toContain('adm_session_master_authorized');
  });

  it('does not inject fallback Gemini keys into desktop build jobs', () => {
    const source = read('../../.github/workflows/build-desktop.yml');
    expect(source).not.toMatch(/VITE_GEMINI_API_KEY_[1-4]:.*\\|\\|/);
    expect(source).not.toMatch(/AQ\\.[A-Za-z0-9_-]{20,}/);
  });
});
