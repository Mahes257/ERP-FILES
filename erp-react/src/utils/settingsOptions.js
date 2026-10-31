/**
 * settingsOptions.js
 * ------------------------------------------------------------------
 * Bridges the database-backed Marketing Settings into the shared
 * dropdown option system.
 *
 * Architecture:
 *   Marketing Settings (DB: /settings/marketing)
 *     → marketingSettingsService (cache, single-flight GET)
 *       → settingsOptions (this file)
 *         → ManagedSelect / Lead form / Leads filters / Marketing forms
 *
 * Why: Marketing lists (Lead Sources, Lead Stages, Lead Priorities,
 * Follow-up Types, ...) must be managed by the administrator in
 * Marketing Settings and persisted in the database. Adding
 * "Exhibition" as a Lead Source in Marketing Settings must make it
 * appear in every Lead form without any source-code change.
 *
 * Categories NOT listed in SETTINGS_CATEGORY_MAP keep their existing
 * dropdownManager behaviour (ERP base list + local overlay), so the
 * CRM/geo/currency option management keeps working unchanged.
 * ------------------------------------------------------------------
 */
import marketingSettingsService from '../services/marketingSettingsService';
import { getFlatOptions, subscribeDropdownChanges } from './dropdownManager';
import { useEffect, useMemo, useState } from 'react';

/* ===== Marketing Settings-backed category registry =====
 * categoryKey → dotted path inside the Marketing Settings object.
 * Items may be objects ({ name, active }) or plain strings.
 */
export const SETTINGS_CATEGORY_MAP = {
  // Lead management
  lead_source: 'leadSettings.leadSources',
  lead_stage: 'leadSettings.leadStages',
  lead_priority: 'leadSettings.leadPriorities',
  lead_status: 'leadSettings.leadStatuses',
  // Campaigns
  campaign_type: 'campaignSettings.campaignTypes',
  campaign_status: 'campaignSettings.campaignStatuses',
  campaign_objective: 'campaignSettings.campaignObjectives',
  campaign_priority: 'campaignSettings.campaignPriorities',
  // Marketing channels (shared: leads, campaigns, follow-ups, reports)
  marketing_channel: 'marketingChannels',
  // Follow-ups
  fu_mode: 'followupSettings.followupTypes',
  fu_status: 'followupSettings.followupStatuses',
  fu_priority: 'followupSettings.followupPriorities',
  // Visits
  visit_status: 'visitSettings.visitStatuses',
  visit_outcome: 'visitSettings.outcomes',
  // Marketing masters
  marketer: 'masters.marketers'
};

const norm = (v) => String(v == null ? '' : v).trim();
const normKey = (v) => norm(v).toLowerCase();

/** Dotted-path resolver that also understands numeric segments (a.list.0.name). */
function getPath(obj, path) {
  let val = obj;
  for (const part of path.split('.')) {
    if (val == null) return undefined;
    val = val[part];
  }
  return val;
}

/** True when the category is served from the Marketing Settings database. */
export function isSettingsBacked(categoryKey) {
  return Object.prototype.hasOwnProperty.call(SETTINGS_CATEGORY_MAP, categoryKey);
}

/**
 * Effective options for a category, in the same { value, original, enabled }
 * shape dropdownManager returns. Returns null when the category is not
 * settings-backed (caller falls back to dropdownManager).
 */
export function getSettingsOptions(categoryKey) {
  const path = SETTINGS_CATEGORY_MAP[categoryKey];
  if (!path) return null;
  const items = getPath(marketingSettingsService.getSettingsSync() || {}, path) || [];
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const name = typeof item === 'string' ? item : item?.name;
    if (!name) continue;
    const k = normKey(name);
    if (seen.has(k)) continue; // case-insensitive duplicate prevention
    seen.add(k);
    const enabled = typeof item === 'string' ? true : item?.active !== false;
    out.push({ value: name, original: name, enabled });
  }
  return out;
}

/** Effective options across BOTH sources (settings first, overlay fallback). */
export function getEffectiveOptions(categoryKey) {
  if (isSettingsBacked(categoryKey)) {
    const opts = getSettingsOptions(categoryKey);
    if (opts) return opts;
  }
  return getFlatOptions(categoryKey);
}

/** Options a user may newly select (disabled values hidden). */
export function getEffectiveEnabledOptions(categoryKey) {
  return getEffectiveOptions(categoryKey).filter((o) => o.enabled);
}

/**
 * React hook: returns effective enabled options and re-renders when
 * (a) Marketing Settings change, (b) the local dropdown overlay changes,
 * or (c) the initial settings fetch completes.
 */
export function useSettingsOptions(categoryKey) {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    marketingSettingsService
      .getSettings()
      .then(() => { if (!cancelled) setVersion((v) => v + 1); })
      .catch(() => { /* fall back to defaults — service handles errors */ });
    const unsubSettings = marketingSettingsService.subscribe(() => setVersion((v) => v + 1));
    const unsubOverlay = subscribeDropdownChanges(() => setVersion((v) => v + 1));
    return () => {
      cancelled = true;
      unsubSettings();
      unsubOverlay();
    };
  }, []);
  return useMemo(
    () => getEffectiveEnabledOptions(categoryKey),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [categoryKey, version]
  );
}

/**
 * Default value for a category from Marketing Settings (e.g. the
 * administrator-configured default Lead Source). Returns '' when none.
 */
export function getSettingsDefault(categoryKey) {
  const DEFAULT_PATHS = {
    lead_source: 'leadSettings.defaultLeadSource',
    lead_stage: 'leadSettings.defaultLeadStage',
    lead_priority: 'leadSettings.defaultLeadPriority',
    lead_status: 'leadSettings.defaultLeadStatus',
    campaign_type: 'campaignSettings.defaults.defaultType',
    campaign_status: 'campaignSettings.defaults.defaultStatus',
    campaign_objective: 'campaignSettings.defaults.defaultObjective',
    campaign_priority: 'campaignSettings.defaults.defaultPriority',
    campaign_channel: 'campaignSettings.defaults.defaultChannel',
    fu_mode: 'followupSettings.followupTypes.0.name',
    fu_priority: 'followupSettings.followupPriorities.1.name',
    visit_status: 'general.defaultVisitStatus',
    marketer: 'general.defaultMarketer'
  };
  const path = DEFAULT_PATHS[categoryKey];
  if (!path) return '';
  const value = getPath(marketingSettingsService.getSettingsSync() || {}, path);
  return norm(value || '');
}
