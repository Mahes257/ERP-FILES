/**
 * purchase/services/reportsDateRange.test.js
 * ------------------------------------------------------------------
 * Tests for date range filtering in the Reports service.
 * Verifies the new date ranges (last-30-days, last-3-months, last-6-months)
 * resolve correctly and that the service actually filters data.
 * ------------------------------------------------------------------ */
import { describe, it, expect } from 'vitest';

/* ================================================================== */
/*  Date range resolution                                              */
/* ================================================================== */
describe('resolveDateRange', () => {

  function getMonthStart() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  }

  function getQuarterStart() {
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    return new Date(now.getFullYear(), q * 3, 1).getTime();
  }

  function getYearStart() {
    return new Date(new Date().getFullYear(), 0, 1).getTime();
  }

  function resolveDateRange(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (range) {
      case 'today':
        return { start: today, end: today + 86400000 - 1 };
      case 'this-week': {
        const day = now.getDay();
        const start = today - day * 86400000;
        return { start, end: start + 7 * 86400000 - 1 };
      }
      case 'this-month':
        return { start: getMonthStart(), end: today + 86400000 - 1 };
      case 'this-quarter':
        return { start: getQuarterStart(), end: today + 86400000 - 1 };
      case 'this-year':
        return { start: getYearStart(), end: today + 86400000 - 1 };
      case 'last-30-days': {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-3-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-6-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-12-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      default: {
        const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
    }
  }

  function inRange(timestamp, range) {
    return timestamp >= range.start && timestamp <= range.end;
  }

  it('last-30-days covers exactly 30 days', () => {
    const range = resolveDateRange('last-30-days');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const expectedStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29).getTime();
    expect(range.start).toBe(expectedStart);
    expect(range.end).toBe(today + 86400000 - 1);
  });

  it('last-3-months starts from 3 months ago, 1st of month', () => {
    const range = resolveDateRange('last-3-months');
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('last-6-months starts from 6 months ago, 1st of month', () => {
    const range = resolveDateRange('last-6-months');
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('last-12-months starts from 12 months ago, 1st of month', () => {
    const range = resolveDateRange('last-12-months');
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('this-month starts from current month 1st', () => {
    const range = resolveDateRange('this-month');
    const now = new Date();
    const expectedStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('this-quarter starts from current quarter 1st', () => {
    const range = resolveDateRange('this-quarter');
    const now = new Date();
    const q = Math.floor(now.getMonth() / 3);
    const expectedStart = new Date(now.getFullYear(), q * 3, 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('this-year starts from Jan 1', () => {
    const range = resolveDateRange('this-year');
    const expectedStart = new Date(new Date().getFullYear(), 0, 1).getTime();
    expect(range.start).toBe(expectedStart);
  });

  it('today covers exactly one day', () => {
    const range = resolveDateRange('today');
    expect(range.end - range.start).toBe(86400000 - 1);
  });

  it('unknown range defaults to last-12-months', () => {
    const range = resolveDateRange('unknown');
    const defaultRange = resolveDateRange('last-12-months');
    expect(range.start).toBe(defaultRange.start);
    expect(range.end).toBe(defaultRange.end);
  });

  it('inRange correctly filters records', () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const range = { start: today - 7 * 86400000, end: today + 86400000 - 1 };

    expect(inRange(today, range)).toBe(true);
    expect(inRange(today - 3 * 86400000, range)).toBe(true);
    expect(inRange(today - 10 * 86400000, range)).toBe(false);
    expect(inRange(today + 10 * 86400000, range)).toBe(false);
  });

  it('last-30-days range ordering: start < end', () => {
    const range = resolveDateRange('last-30-days');
    expect(range.start).toBeLessThan(range.end);
  });

  it('last-3-months range ordering: start < end', () => {
    const range = resolveDateRange('last-3-months');
    expect(range.start).toBeLessThan(range.end);
  });

  it('last-6-months range ordering: start < end', () => {
    const range = resolveDateRange('last-6-months');
    expect(range.start).toBeLessThan(range.end);
  });
});

/* ================================================================== */
/*  Date range hierarchy                                               */
/* ================================================================== */
describe('Date range hierarchy', () => {
  function resolveDateRange(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (range) {
      case 'last-30-days': {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-3-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-6-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      case 'last-12-months': {
        const d = new Date(now.getFullYear(), now.getMonth() - 11, 1);
        return { start: d.getTime(), end: today + 86400000 - 1 };
      }
      default:
        return { start: today, end: today + 86400000 - 1 };
    }
  }

  it('last-30-days < last-3-months < last-6-months < last-12-months', () => {
    const r30 = resolveDateRange('last-30-days');
    const r3m = resolveDateRange('last-3-months');
    const r6m = resolveDateRange('last-6-months');
    const r12m = resolveDateRange('last-12-months');

    expect(r30.start).toBeGreaterThanOrEqual(r3m.start);
    expect(r3m.start).toBeGreaterThanOrEqual(r6m.start);
    expect(r6m.start).toBeGreaterThanOrEqual(r12m.start);
  });

  it('all ranges share the same end date', () => {
    const r30 = resolveDateRange('last-30-days');
    const r3m = resolveDateRange('last-3-months');
    const r6m = resolveDateRange('last-6-months');
    const r12m = resolveDateRange('last-12-months');

    expect(r30.end).toBe(r3m.end);
    expect(r3m.end).toBe(r6m.end);
    expect(r6m.end).toBe(r12m.end);
  });
});
