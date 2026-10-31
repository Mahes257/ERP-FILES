import { describe, expect, it } from 'vitest';
import {
  ERP_STATE_ERROR,
  ERP_STATE_READY,
  buildErpEvent,
  describeSources,
  emptyErpFeed,
  erpEntriesToEvents,
  erpSourceLabel,
  failedErpFeed,
  isErpFeedLoading,
  isReadOnlyEvent,
  localEventsOf,
  mergeCalendarEvents,
  readyErpFeed
} from './calendarErpEntries';
import { CATEGORY_MAP, ERP_CATEGORIES, countByCategory } from './calendarEvents';

const baseEntry = {
  id: 'crm:FollowUp:7:followupDate:2026-10-20',
  source: 'crm',
  entityType: 'FollowUp',
  entityId: 7,
  title: 'Follow-up — Acme',
  date: '2026-10-20',
  startTime: '09:30',
  endTime: null,
  allDay: false,
  status: 'Open',
  category: 'crm',
  linkPath: '/followups/7',
  readOnly: true
};

const localEvent = {
  id: 'cal-local-1',
  title: 'Local booking',
  date: '2026-10-20',
  start: '11:00',
  end: '12:00',
  category: 'general',
  source: 'local'
};

describe('buildErpEvent', () => {
  it('maps a real backend entry without inventing values', () => {
    const event = buildErpEvent(baseEntry);

    expect(event).toMatchObject({
      id: 'erp:crm:FollowUp:7:followupDate:2026-10-20',
      title: 'Follow-up — Acme',
      date: '2026-10-20',
      start: '09:30',
      end: '',
      category: 'crm',
      source: 'erp',
      readOnly: true,
      erpSource: 'crm',
      entityType: 'FollowUp',
      entityId: 7,
      status: 'Open',
      linkPath: '/followups/7',
      allDay: false,
      description: ''
    });
  });

  it('keeps a dateless or malformed entry out of the calendar', () => {
    expect(buildErpEvent({ ...baseEntry, date: null })).toBeNull();
    expect(buildErpEvent({ ...baseEntry, date: '2026-02-30' })).toBeNull();
    expect(buildErpEvent({ ...baseEntry, date: '20-10-2026' })).toBeNull();
    expect(buildErpEvent({ ...baseEntry, id: '' })).toBeNull();
    expect(buildErpEvent(null)).toBeNull();
  });

  it('treats a missing or unreadable time as all-day instead of guessing', () => {
    expect(buildErpEvent({ ...baseEntry, startTime: null }).allDay).toBe(true);
    expect(buildErpEvent({ ...baseEntry, startTime: null }).start).toBe('');
    expect(buildErpEvent({ ...baseEntry, startTime: 'after lunch' }).allDay).toBe(true);
    // A stored end without a start is ignored rather than placed on the grid.
    expect(buildErpEvent({ ...baseEntry, startTime: null, endTime: '10:00' }).end).toBe('');
  });

  it('falls back to the neutral category and a readable title', () => {
    const event = buildErpEvent({ ...baseEntry, category: 'not-a-category', title: '   ' });
    expect(event.category).toBe('general');
    expect(event.title).toBe('ERP record');
  });

  it('maps a CPR entry onto the existing Sales category', () => {
    const event = buildErpEvent({
      ...baseEntry,
      id: 'cpr:Cpr:12:requiredDate:2026-11-05',
      source: 'cpr',
      entityType: 'Cpr',
      entityId: 12,
      title: 'Required by CAL-CPR-1 — Acme',
      date: '2026-11-05',
      startTime: null,
      status: 'PENDING_APPROVAL',
      category: 'cpr',
      linkPath: '/cprs/12'
    });

    // The seven-key catalogue is untouched: CPR lives under the Sales area, so
    // the Sales chip both counts and filters it.
    expect(event.category).toBe('sales');
    expect(ERP_CATEGORIES.map((category) => category.key)).toHaveLength(7);
    expect(CATEGORY_MAP[event.category]).toBeTruthy();
    // Provenance still says CPR, and the entry stays read-only and all-day.
    expect(event.erpSource).toBe('cpr');
    expect(event.status).toBe('PENDING_APPROVAL');
    expect(event.readOnly).toBe(true);
    expect(event.allDay).toBe(true);
    expect(event.linkPath).toBe('/cprs/12');
  });

  it('keeps a Production entry on the existing Production category', () => {
    const event = buildErpEvent({
      ...baseEntry,
      id: 'production:ProductionOrder:WO-0007:dueDate:2026-11-15',
      source: 'production',
      entityType: 'ProductionOrder',
      entityId: 7,
      title: 'Work order due WO-0007 — Apex',
      date: '2026-11-15',
      startTime: null,
      status: 'Approved',
      category: 'production',
      linkPath: '/production/orders/WO-0007'
    });

    // No override: the backend's key is already the existing Production chip.
    expect(event.category).toBe('production');
    expect(CATEGORY_MAP.production.label).toBe('Production & Quality');
    expect(event.erpSource).toBe('production');
    expect(event.status).toBe('Approved');
    expect(event.readOnly).toBe(true);
    expect(event.allDay).toBe(true);
    expect(event.linkPath).toBe('/production/orders/WO-0007');
    expect(countByCategory([event]).production).toBe(1);
  });

  it('counts Sales and CPR under one key without duplicating either event', () => {
    const salesEvent = buildErpEvent({
      ...baseEntry,
      id: 'sales:Quotation:3:validUntil:2026-11-05',
      source: 'sales',
      entityType: 'Quotation',
      entityId: 3,
      category: 'sales'
    });
    const cprEvent = buildErpEvent({
      ...baseEntry,
      id: 'cpr:Cpr:12:requiredDate:2026-11-05',
      source: 'cpr',
      entityType: 'Cpr',
      entityId: 12,
      category: 'cpr'
    });

    const counts = countByCategory([salesEvent, cprEvent]);
    expect(counts.sales).toBe(2);
    expect(counts).not.toHaveProperty('cpr');
    // Distinct ids: the same Sales count can never be inflated by a repeat.
    expect(salesEvent.id).not.toBe(cprEvent.id);
  });
});

describe('erpEntriesToEvents', () => {
  it('drops duplicates and malformed entries', () => {
    const events = erpEntriesToEvents({
      entries: [baseEntry, baseEntry, { ...baseEntry, id: 'x', date: 'nope' }]
    });
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe('erp:crm:FollowUp:7:followupDate:2026-10-20');
  });

  it('returns an empty list for a missing payload', () => {
    expect(erpEntriesToEvents(null)).toEqual([]);
    expect(erpEntriesToEvents({})).toEqual([]);
    expect(erpEntriesToEvents({ entries: 'not-an-array' })).toEqual([]);
  });
});

describe('mergeCalendarEvents', () => {
  it('returns the local list untouched when there is no feed', () => {
    const local = [localEvent];
    expect(mergeCalendarEvents(local, [])).toBe(local);
  });

  it('keeps every local event and appends derived entries', () => {
    const derived = buildErpEvent(baseEntry);
    const merged = mergeCalendarEvents([localEvent], [derived]);

    expect(merged).toHaveLength(2);
    expect(merged[0]).toBe(localEvent);
    expect(merged[1]).toBe(derived);
  });

  it('never lets a derived entry replace a local one with the same id', () => {
    const derived = { ...buildErpEvent(baseEntry), id: localEvent.id };
    const merged = mergeCalendarEvents([localEvent], [derived]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('local');
  });
});

describe('read-only helpers', () => {
  it('separates local events from derived ones', () => {
    const derived = buildErpEvent(baseEntry);
    expect(isReadOnlyEvent(derived)).toBe(true);
    expect(isReadOnlyEvent(localEvent)).toBe(false);
    expect(localEventsOf([localEvent, derived])).toEqual([localEvent]);
  });

  it('labels the modules the backend can feed', () => {
    expect(erpSourceLabel('sales')).toBe('Sales');
    expect(erpSourceLabel('marketing')).toBe('Marketing');
    expect(erpSourceLabel('crm')).toBe('CRM');
    expect(erpSourceLabel('purchase')).toBe('Purchase');
    expect(erpSourceLabel('cpr')).toBe('CPR');
    expect(erpSourceLabel('production')).toBe('Production');
    expect(erpSourceLabel('unknown')).toBe('Unknown');
    expect(erpSourceLabel(null)).toBe('ERP');
    expect(describeSources(['marketing', 'crm'])).toBe('Marketing + CRM');
    expect(describeSources(['crm'])).toBe('CRM');
    expect(describeSources([])).toBe('');
  });
});

describe('feed state', () => {
  const range = { from: '2026-10-01', to: '2026-10-31' };

  it('starts idle and empty', () => {
    expect(emptyErpFeed()).toMatchObject({
      status: 'idle',
      events: [],
      sources: [],
      unavailableSources: [],
      error: ''
    });
  });

  it('records a successful load, including a genuinely empty one', () => {
    const ready = readyErpFeed({ entries: [], sources: ['marketing', 'crm'] }, range);
    expect(ready.status).toBe(ERP_STATE_READY);
    expect(ready.events).toEqual([]);
    expect(ready.sources).toEqual(['marketing', 'crm']);
    expect(ready.error).toBe('');
    expect(isErpFeedLoading(ready, range, 0)).toBe(false);
  });

  it('derives loading while a different range is on screen', () => {
    const ready = readyErpFeed({ entries: [baseEntry], sources: ['crm'] }, range);

    expect(isErpFeedLoading(ready, { from: '2026-11-01', to: '2026-11-30' }, 0)).toBe(true);
    // Nothing settled yet → loading, not a fake empty result.
    expect(isErpFeedLoading(emptyErpFeed(), range, 0)).toBe(true);
    // A retry of the same range is loading until it settles again.
    expect(isErpFeedLoading(ready, range, 1)).toBe(true);
  });

  it('keeps the last successful entries when a refresh fails', () => {
    const ready = readyErpFeed({ entries: [baseEntry], sources: ['crm'] }, range);
    const failed = failedErpFeed(ready, 'Network down', range);

    expect(failed.status).toBe(ERP_STATE_ERROR);
    expect(failed.error).toBe('Network down');
    expect(failed.events).toHaveLength(1);
    // The failure settles the range, so the UI shows the error rather than a
    // spinner that never stops.
    expect(isErpFeedLoading(failed, range, 0)).toBe(false);
  });
});
