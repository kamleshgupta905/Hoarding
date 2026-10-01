import { describe, it, expect } from 'vitest';
import { parseOfflineVoiceCommand, resolveRelativeDates } from './voiceActionEngine.js';

describe('Voice Action Engine (Offline NLP & Date Resolver)', () => {
  it('resolves relative dates properly', () => {
    const { startDate, endDate } = resolveRelativeDates();
    expect(startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(endDate) >= new Date(startDate)).toBe(true);
  });

  it('parses reset filter commands', () => {
    const res = parseOfflineVoiceCommand('saare filter reset karo aur saaf karo');
    expect(res).toBeDefined();
    expect(res.action).toBe('RESET_FILTERS');
  });

  it('parses tab switch commands for clients and analytics', () => {
    const resClients = parseOfflineVoiceCommand('client campaigns dikhao');
    expect(resClients.action).toBe('SWITCH_TAB');
    expect(resClients.tab).toBe('clients');

    const resAnalytics = parseOfflineVoiceCommand('analytics report kholo');
    expect(resAnalytics.action).toBe('SWITCH_TAB');
    expect(resAnalytics.tab).toBe('analytics');
  });

  it('parses dimension and location search commands (e.g. 40x10 at Begum Bridge)', () => {
    const res = parseOfflineVoiceCommand('Begum Bridge me 40x10 wale available unipoles filter karo');
    expect(res.action).toBe('FILTER_INVENTORY');
    expect(res.dimensions).toBe('40x10');
    expect(res.status).toBe('Available');
    expect(res.media).toBe('Unipole');
  });

  it('parses quick booking command with client name', () => {
    const res = parseOfflineVoiceCommand('Tata Motors ke liye Begum Bridge book kardo replace mode me override karo');
    expect(res.action).toBe('QUICK_BOOK');
    expect(res.clientName.toLowerCase()).toContain('tata motors');
    expect(res.isOverride).toBe(true);
    expect(res.overrideMode).toBe('replace');
  });

  it('parses view displaced / overridden command', () => {
    const res = parseOfflineVoiceCommand('overridden bookings dikhao jo cut hui thi');
    expect(res.action).toBe('VIEW_DISPLACED');
  });

  it('parses export PPT command', () => {
    const res = parseOfflineVoiceCommand('campaign proposal ka PPT download kardo');
    expect(res.action).toBe('EXPORT_PPT');
  });
});
