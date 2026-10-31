/**
 * marketingSettingsService.js
 * ------------------------------------------------------------------
 * Centralized Marketing Settings. Every Marketing
 * module (Visits, Follow-ups, Expenses, Travel, Q-Forms, Calendar,
 * Map) reads its configurable defaults from here.
 *
 * Architecture:
 *   MarketingSettingsService → /settings/marketing → database
 * ------------------------------------------------------------------
 */

import api from '../api/axiosInstance';

/* ===== DEFAULT VALUES ===== */
function getDefaultSettings() {
  const defaults = {
    // A. General
    general: {
      defaultMarketer: '',
      defaultVisitDuration: 60,
      defaultVisitStatus: 'Scheduled',
      defaultPriority: 'Medium',
      defaultFollowupPeriod: 7,
      defaultLocationType: 'Office',
      defaultCurrency: 'INR',
      workingDaysStart: 'Monday',
      workingDaysEnd: 'Friday'
    },

    // B. Visit & Appointment Settings
    visitSettings: {
      appointmentStatuses: [
        { name: 'Scheduled', active: true, color: '#2563EB' },
        { name: 'Confirmed', active: true, color: '#16A34A' },
        { name: 'Rescheduled', active: true, color: '#D97706' },
        { name: 'Cancelled', active: true, color: '#DC2626' },
        { name: 'Completed', active: true, color: '#059669' },
        { name: 'No Show', active: true, color: '#6B7280' }
      ],
      visitStatuses: [
        { name: 'Planned', active: true, color: '#2563EB' },
        { name: 'In Progress', active: true, color: '#D97706' },
        { name: 'Completed', active: true, color: '#16A34A' },
        { name: 'Cancelled', active: true, color: '#DC2626' },
        { name: 'Rescheduled', active: true, color: '#7C3AED' }
      ],
      priorities: [
        { name: 'High', active: true, color: '#DC2626' },
        { name: 'Medium', active: true, color: '#D97706' },
        { name: 'Low', active: true, color: '#16A34A' }
      ],
      outcomes: [
        { name: 'Interested', active: true },
        { name: 'Follow-up Required', active: true },
        { name: 'Quotation Required', active: true },
        { name: 'Not Interested', active: true },
        { name: 'No Requirement', active: true },
        { name: 'Converted', active: true },
        { name: 'Other', active: true }
      ],
      defaultVisitType: 'Meeting',
      requireCheckIn: false,
      requireCheckOut: false,
      allowReschedule: true,
      maxVisitsPerDay: 8
    },

    // C. Follow-up Settings (single definition — priorities, reminder,
    // escalation and interval configuration are part of the same section)
    followupSettings: {
      followupTypes: [
        { name: 'Call', active: true },
        { name: 'Email', active: true },
        { name: 'Meeting', active: true },
        { name: 'Site Visit', active: true },
        { name: 'Video Call', active: true },
        { name: 'WhatsApp', active: true }
      ],
      followupStatuses: [
        { name: 'Open', active: true },
        { name: 'In Progress', active: true },
        { name: 'Completed', active: true },
        { name: 'Missed', active: true },
        { name: 'Cancelled', active: true },
        { name: 'Rescheduled', active: true }
      ],
      // Follow-up priorities
      followupPriorities: [
        { name: 'High', active: true, color: '#DC2626' },
        { name: 'Medium', active: true, color: '#D97706' },
        { name: 'Low', active: true, color: '#16A34A' }
      ],
      defaultFollowupDays: 3,
      reminderBeforeDue: 1,
      escalationDays: 3,
      autoEscalate: false,
      maxFollowupsPerLead: 20,
      // Default follow-up duration (minutes)
      defaultDurationMinutes: 30,
      // Reminder settings
      reminder: {
        enabled: true,
        defaultReminderDays: 1,
        reminderChannels: ['browser', 'email']
      },
      // Escalation settings
      escalation: {
        enabled: false,
        maxEscalations: 3,
        escalateAfterDays: 3,
        escalateToRole: 'Marketing Manager'
      },
      // Follow-up intervals (for recurring follow-ups)
      intervals: [
        { label: 'Daily', days: 1 },
        { label: 'Every 2 Days', days: 2 },
        { label: 'Weekly', days: 7 },
        { label: 'Fortnightly', days: 14 },
        { label: 'Monthly', days: 30 }
      ]
    },

    // D. Marketing Expenses
    expenseSettings: {
      expenseCategories: [
        { name: 'Travel', active: true },
        { name: 'Stay', active: true },
        { name: 'Food', active: true },
        { name: 'Other', active: true }
      ],
      travelTypes: [
        { name: 'Bus', active: true },
        { name: 'Taxi / Cab', active: true },
        { name: 'Train', active: true },
        { name: 'Flight', active: true },
        { name: 'Other Travel', active: true }
      ],
      foodTypes: [
        { name: 'Breakfast', active: true },
        { name: 'Lunch', active: true },
        { name: 'Dinner', active: true },
        { name: 'Refreshments', active: true },
        { name: 'Other Food', active: true }
      ],
      stayTypes: [
        { name: 'Hotel', active: true },
        { name: 'Lodge', active: true },
        { name: 'Guest House', active: true },
        { name: 'Other', active: true }
      ],
      otherExpenseTypes: [
        { name: 'Parking', active: true },
        { name: 'Toll', active: true },
        { name: 'Local Conveyance', active: true },
        { name: 'Miscellaneous', active: true },
        { name: 'Other', active: true }
      ],
      paymentMethods: [
        { name: 'Cash', active: true },
        { name: 'Card', active: true },
        { name: 'UPI', active: true },
        { name: 'Online Transfer', active: true },
        { name: 'Other', active: true }
      ],
      billStatuses: [
        { name: 'With Bill', active: true },
        { name: 'Without Bill', active: true }
      ],
      defaultCurrency: 'INR',
      maxSingleExpense: 50000,
      requireBillAbove: 5000
    },

    // E. Expense Approval
    expenseApproval: {
      approvalRequired: true,
      approvalThreshold: 5000,
      approvalLevels: [
        { level: 1, role: 'Team Lead', maxAmount: 5000, days: 1, enabled: true },
        { level: 2, role: 'Marketing Manager', maxAmount: 25000, days: 2, enabled: true },
        { level: 3, role: 'Finance Controller', maxAmount: 0, days: 3, enabled: true }
      ],
      billRequirementThreshold: 5000,
      enableAutoApproval: false,
      autoApprovalBelow: 1000
    },

    // F. Travel Settings
    travelSettings: {
      defaultTravelMode: 'Taxi / Cab',
      defaultTripDuration: 3,
      maxStopsPerTrip: 10,
      tripApprovalRequired: true,
      checkInRequired: true,
      checkOutRequired: true,
      allowStopReordering: true,
      advanceBookingDays: 7,
      expenseLimitPerDay: 3000,
      requireDailyReport: false
    },

    // G. Q-Form Settings
    qFormSettings: {
      requiredFields: ['companyName', 'contactPerson', 'phone'],
      questionCategories: [
        { name: 'Product Inquiry', active: true },
        { name: 'Service Request', active: true },
        { name: 'General', active: true },
        { name: 'Technical', active: true },
        { name: 'Pricing', active: true }
      ],
      answerTypes: [
        { name: 'Text', active: true },
        { name: 'Multiple Choice', active: true },
        { name: 'Yes/No', active: true },
        { name: 'Rating (1-5)', active: true },
        { name: 'Number', active: true }
      ],
      mandatoryQuestions: true,
      allowFollowUp: true,
      autoAssignMarketer: false,
      maxQuestionsPerForm: 20
    },

    // H. Calendar Settings
    calendarSettings: {
      workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
      workingHoursStart: '09:00',
      workingHoursEnd: '18:00',
      defaultVisitDurationMinutes: 60,
      bufferBetweenVisitsMinutes: 15,
      reminderBeforeVisitMinutes: 30,
      showWeekends: false,
      defaultView: 'month',
      slotDurationMinutes: 30
    },

    // I. Lead Management Settings
    leadSettings: {
      // Lead sources (database-backed, dynamic)
      leadSources: [
        { name: 'Website', active: true },
        { name: 'Walk-in', active: true },
        { name: 'Referral', active: true },
        { name: 'Advertisement', active: true },
        { name: 'Social Media', active: true },
        { name: 'Email', active: true },
        { name: 'WhatsApp', active: true },
        { name: 'Phone Call', active: true },
        { name: 'Event', active: true },
        { name: 'Partner', active: true },
        { name: 'Other', active: true }
      ],
      // Lead stages
      leadStages: [
        { name: 'New', active: true, color: '#2563EB' },
        { name: 'Contacted', active: true, color: '#7C3AED' },
        { name: 'Qualified', active: true, color: '#16A34A' },
        { name: 'Proposal', active: true, color: '#D97706' },
        { name: 'Negotiation', active: true, color: '#DC2626' },
        { name: 'Converted', active: true, color: '#059669' },
        { name: 'Lost', active: true, color: '#6B7280' }
      ],
      // Lead statuses
      leadStatuses: [
        { name: 'New', active: true },
        { name: 'Contacted', active: true },
        { name: 'Qualified', active: true },
        { name: 'Proposal Sent', active: true },
        { name: 'Negotiation', active: true },
        { name: 'Converted', active: true },
        { name: 'Lost', active: true },
        { name: 'Archived', active: true }
      ],
      // Lead priorities
      leadPriorities: [
        { name: 'High', active: true, color: '#DC2626' },
        { name: 'Medium', active: true, color: '#D97706' },
        { name: 'Low', active: true, color: '#16A34A' }
      ],
      // Lead scoring rules (future-ready architecture)
      scoringRules: [
        { field: 'Annual Revenue', weight: 30, condition: 'greater_than', threshold: 1000000 },
        { field: 'Decision Maker', weight: 25, condition: 'is', threshold: 1 },
        { field: 'Time to Decide', weight: 20, condition: 'less_than', threshold: 30 },
        { field: 'Budget Confirmed', weight: 15, condition: 'is', threshold: 1 },
        { field: 'Engagement Score', weight: 10, condition: 'greater_than', threshold: 50 }
      ],
      // Lead qualification settings
      qualification: {
        requireLeadScore: false,
        minimumScoreForQualification: 50,
        autoAssignOnCreate: false,
        requireContactInfo: true,
        requireCompanyName: true
      },
      // Lead assignment rules
      assignment: {
        autoAssign: false,
        assignmentMethod: 'round_robin', // round_robin, load_balanced, manual
        defaultAssignTo: '',
        notifyOnAssignment: true
      },
      // Lead conversion settings
      conversion: {
        convertTo: 'Lead', // Lead, Customer, Opportunity
        copyFields: ['companyName', 'contactPerson', 'phone', 'email', 'designation'],
        createFollowUpOnConvert: true,
        followUpType: 'Call',
        statusOnConvert: 'Active'
      },
      // Default values
      defaultLeadSource: 'Website',
      defaultLeadStatus: 'New',
      defaultLeadPriority: 'Medium',
      defaultLeadStage: 'New'
    },

    // J. Campaign Settings
    campaignSettings: {
      // Campaign types
      campaignTypes: [
        { name: 'Brand Awareness', active: true },
        { name: 'Lead Generation', active: true },
        { name: 'Product Launch', active: true },
        { name: 'Seasonal', active: true },
        { name: 'Promotion', active: true },
        { name: 'Education', active: true },
        { name: 'Events', active: true },
        { name: 'Retargeting', active: true },
        { name: 'Other', active: true }
      ],
      // Campaign statuses
      campaignStatuses: [
        { name: 'Planning', active: true, color: '#2563EB' },
        { name: 'Draft', active: true, color: '#7C3AED' },
        { name: 'Active', active: true, color: '#16A34A' },
        { name: 'Paused', active: true, color: '#D97706' },
        { name: 'Completed', active: true, color: '#059669' },
        { name: 'Cancelled', active: true, color: '#DC2626' }
      ],
      // Campaign objectives
      campaignObjectives: [
        { name: 'Increase Brand Awareness', active: true },
        { name: 'Generate Leads', active: true },
        { name: 'Drive Sales', active: true },
        { name: 'Customer Retention', active: true },
        { name: 'Product Education', active: true },
        { name: 'Event Promotion', active: true },
        { name: 'Market Expansion', active: true },
        { name: 'Other', active: true }
      ],
      // Campaign channels (synced with marketingChannels)
      campaignChannels: [],
      // Campaign priorities
      campaignPriorities: [
        { name: 'High', active: true, color: '#DC2626' },
        { name: 'Medium', active: true, color: '#D97706' },
        { name: 'Low', active: true, color: '#16A34A' }
      ],
      // Campaign budget settings
      budget: {
        defaultCurrency: 'INR',
        requireBudget: true,
        maxBudgetPerCampaign: 10000000,
        defaultBudgetPeriod: 'monthly' // daily, weekly, monthly, campaign
      },
      // Campaign naming conventions
      naming: {
        prefix: 'CMP',
        useAutoNumbering: true,
        includeDate: false,
        pattern: '{prefix}-{number}'
      },
      // Campaign defaults
      defaults: {
        defaultType: 'Lead Generation',
        defaultStatus: 'Draft',
        defaultObjective: 'Generate Leads',
        defaultPriority: 'Medium',
        defaultBudget: 0,
        defaultStartDate: '',
        defaultEndDate: ''
      }
    },

    // K. Marketing Channels (database-backed, shared across modules)
    marketingChannels: [
      { name: 'Website', active: true, icon: 'globe', color: '#2563EB' },
      { name: 'Email', active: true, icon: 'mail', color: '#16A34A' },
      { name: 'WhatsApp', active: true, icon: 'chat', color: '#25D366' },
      { name: 'Phone', active: true, icon: 'phone', color: '#7C3AED' },
      { name: 'Social Media', active: true, icon: 'share', color: '#DC2626' },
      { name: 'Events', active: true, icon: 'calendar', color: '#D97706' },
      { name: 'Referral', active: true, icon: 'user-plus', color: '#059669' },
      { name: 'Advertisement', active: true, icon: 'megaphone', color: '#0891B2' },
      { name: 'Partner', active: true, icon: 'handshake', color: '#7C3AED' },
      { name: 'Other', active: true, icon: 'ellipsis', color: '#6B7280' }
    ],

    // M. Template Settings
    templateSettings: {
      emailTemplates: [
        { name: 'Welcome Email', subject: 'Welcome to {company}', body: 'Dear {contact},\n\nWelcome to {company}!\n\nWe are excited to have you on board.\n\nBest regards,\nThe Team', active: true },
        { name: 'Follow-up Email', subject: 'Following up on our conversation', body: 'Dear {contact},\n\nJust following up on our recent conversation.\n\nLet me know if you have any questions.\n\nBest regards,\n{marketer}', active: true },
        { name: 'Campaign Announcement', subject: 'New Campaign: {campaign_name}', body: 'Dear {contact},\n\nWe are excited to announce our latest campaign: {campaign_name}.\n\n{campaign_description}\n\nBest regards,\nMarketing Team', active: true }
      ],
      messageTemplates: [
        { name: 'Welcome Message', body: 'Welcome! We are happy to connect with you.', active: true },
        { name: 'Follow-up Message', body: 'Hi, just checking in. How can we help you?', active: true },
        { name: 'Thank You Message', body: 'Thank you for your time and interest!', active: true }
      ],
      campaignTemplates: [
        { name: 'Standard Campaign', description: 'Standard lead generation campaign with email and social media', active: true },
        { name: 'Event Campaign', description: 'Campaign for event promotion with registration', active: true }
      ],
      followupTemplates: [
        { name: 'Standard Follow-up', body: 'Hi {contact},\n\nJust following up on our previous conversation. Is there anything I can help you with?\n\nBest,\n{marketer}', active: true },
        { name: 'Re-engagement', body: 'Hi {contact},\n\nWe noticed you haven\'t responded in a while. Is everything okay?\n\nLooking forward to hearing from you.\n\nBest,\n{marketer}', active: true }
      ],
      notificationTemplates: [
        { name: 'Lead Assigned', subject: 'New Lead Assigned: {lead_name}', body: 'A new lead has been assigned to you:\n\nLead: {lead_name}\nSource: {lead_source}\nPriority: {lead_priority}\n\nPlease follow up at your earliest convenience.', active: true },
        { name: 'Follow-up Reminder', subject: 'Follow-up Reminder: {followup_type}', body: 'You have a follow-up scheduled:\n\nType: {followup_type}\nDate: {followup_date}\nCustomer: {company_name}\n\nPlease prepare accordingly.', active: true }
      ]
    },

    // N. Automation Settings (future-ready — configuration only, no hard-coded rules)
    automationSettings: {
      leadAssignment: {
        enabled: false,
        method: 'round_robin',
        criteria: [],
        notifyAssignee: true
      },
      leadScoring: {
        enabled: false,
        rules: [],
        autoQualifyThreshold: 70,
        recalculateOnUpdate: true
      },
      followupAutomation: {
        enabled: false,
        triggerOnStatusChange: false,
        triggerOnDate: true,
        defaultIntervalDays: 3,
        maxAutoFollowups: 5
      },
      campaignAutomation: {
        enabled: false,
        autoStartOnApproval: false,
        autoPauseOnBudgetExhausted: true,
        autoNotifications: true
      },
      reminderAutomation: {
        enabled: true,
        remindBeforeDue: true,
        remindDaysBefore: 1,
        reminderChannels: ['browser', 'email']
      },
      notificationAutomation: {
        enabled: true,
        events: ['lead_created', 'lead_assigned', 'followup_due', 'campaign_started', 'campaign_completed'],
        channels: ['browser', 'email']
      },
      leadConversionAutomation: {
        enabled: false,
        autoCreateFollowUp: true,
        autoUpdateStatus: false,
        defaultStatus: 'Active'
      }
    },

    // N. Location & Map Settings
    locationSettings: {
      locationCategories: [
        { name: 'Office', active: true },
        { name: 'Factory', active: true },
        { name: 'Warehouse', active: true },
        { name: 'Site', active: true },
        { name: 'Client Location', active: true },
        { name: 'Other', active: true }
      ],
      gpsCheckInRequired: false,
      gpsCheckOutRequired: false,
      locationAccuracyThreshold: 100,
      defaultMapZoom: 12,
      showDistanceOnVisit: true,
      trackRouteHistory: false
    },

    // O. Notifications
    notifications: {
      visitReminder: true,
      followupDue: true,
      followupOverdue: true,
      travelPlanPendingApproval: true,
      travelPlanApproved: true,
      expensePendingApproval: true,
      expenseApproved: true,
      expenseRejected: true,
      qFormPending: true,
      emailNotifications: false,
      browserNotifications: true
    },

    // P. Marketing Masters
    masters: {
      marketers: [
        { name: 'Suresh Reddy', active: true },
        { name: 'Anita Desai', active: true },
        { name: 'Vikram Singh', active: true }
      ],
      visitTypes: [
        { name: 'Meeting', active: true },
        { name: 'Presentation', active: true },
        { name: 'Site Visit', active: true },
        { name: 'Follow-up', active: true },
        { name: 'Demo', active: true },
        { name: 'Training', active: true }
      ],
      locationCategories: [
        { name: 'Office', active: true },
        { name: 'Factory', active: true },
        { name: 'Site', active: true },
        { name: 'Client Location', active: true }
      ]
    },

    // Q. Document Numbering (FY-aware, independent from Sales)
    documentNumbering: {
      Lead: { prefix: 'LEAD', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      Visit: { prefix: 'VIS', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      FollowUp: { prefix: 'FU', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      Expense: { prefix: 'EXP', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      TravelPlan: { prefix: 'TP', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 },
      QForm: { prefix: 'QF', fy: String(new Date().getFullYear()), startNo: 1, currentNo: 0, padding: 4 }
    }
  };

  // The General section must ship with a COMPLETE, usable configuration. The
  // "Default Marketer" is the name used to pre-fill Marketing forms
  // (settingsOptions maps the marketer default to general.defaultMarketer), so
  // it is derived from the Marketers master list — the same list that supplies
  // the marketer option lists — instead of shipping blank. A blank value made
  // the whole General section report "Needs Attention" even though every other
  // General field already had a working default.
  if (!defaults.general.defaultMarketer) {
    const marketers = defaults.masters?.marketers || [];
    const firstActive = marketers.find(
      (m) => m && m.active !== false && String(m.name || '').trim()
    );
    defaults.general.defaultMarketer = firstActive ? firstActive.name : '';
  }

  return defaults;
}

/* ===== PERSISTENCE ===== */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

/* ===== SERVICE API ===== */
let _cache = null;
let _listeners = new Set();
let _inflightGet = null;   // single-flight GET — concurrent callers share one request
let _getPromise = null;    // resolved promise memo (micro-cache for rapid re-mounts)

const marketingSettingsService = {
  /**
   * Synchronous read of the current settings: the last-fetched cache, or the
   * built-in defaults before the first fetch completes. Never triggers a
   * request — pair with getSettings() to populate the cache.
   */
  getSettingsSync() {
    return _cache || getDefaultSettings();
  },
  async getSettings() {
    if (_getPromise) return _getPromise;
    _inflightGet = (async () => {
      try {
        const { data } = await api.get('/settings/marketing');
        _cache = deepMerge(getDefaultSettings(), data?.data || {});
        _listeners.forEach((fn) => fn(_cache));
        return _cache;
      } finally {
        _getPromise = null;
      }
    })();
    _getPromise = _inflightGet;
    return _inflightGet;
  },
  getSection(section) { return (_cache || getDefaultSettings())[section] || {}; },
  get(path) {
    const parts = path.split('.');
    let val = _cache || getDefaultSettings();
    for (const p of parts) val = val?.[p];
    return val;
  },
  async updateSettings(partial) {
    const current = deepMerge(_cache || getDefaultSettings(), partial);
    const { data } = await api.put('/settings/marketing', current);
    const updated = deepMerge(getDefaultSettings(), data?.data || current);
    _cache = updated;
    _listeners.forEach((fn) => fn(updated));
    return updated;
  },
  async resetSettings() {
    const defaults = getDefaultSettings();
    const { data } = await api.put('/settings/marketing', defaults);
    const updated = deepMerge(getDefaultSettings(), data?.data || defaults);
    _cache = updated;
    _listeners.forEach((fn) => fn(updated));
    return updated;
  },
  updateSection(section, data) {
    const current = _cache || getDefaultSettings();
    current[section] = typeof data === 'object' && !Array.isArray(data)
      ? { ...current[section], ...data } : data;
    return this.updateSettings(current);
  },
  updateSetting(path, value) {
    const parts = path.split('.');
    const current = _cache || getDefaultSettings();
    let obj = current;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!obj[parts[i]]) obj[parts[i]] = {};
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;
    return this.updateSettings(current);
  },
  resetSection(section) {
    const defaults = getDefaultSettings();
    const current = _cache || getDefaultSettings();
    current[section] = defaults[section];
    return this.updateSettings(current);
  },
  subscribe(fn) { _listeners.add(fn); return () => _listeners.delete(fn); },
  exportSettings() { return JSON.stringify(_cache || getDefaultSettings(), null, 2); },
  importSettings(jsonString) {
    const imported = JSON.parse(jsonString);
    return this.updateSettings(deepMerge(getDefaultSettings(), imported));
  },
  /**
   * Configuration Health for the Marketing settings.
   *
   * `accessStatus` is optional: pass `{ configured: boolean }` when the caller
   * knows whether Marketing Access Management has at least one saved scope
   * (ADMIN only — the check is omitted for everyone else, who cannot see or
   * change it). Access Management is never counted as configured just because
   * its section exists: the flag comes from the backend. A missing flag is
   * reported as "needs attention", never as configured.
   */
  getConfigHealth(accessStatus) {
    const s = _cache || getDefaultSettings();
    const checks = [
      { key: 'general', label: 'General', configured: !!s.general?.defaultMarketer },
      { key: 'visit', label: 'Visit & Appointments', configured: (s.visitSettings?.visitStatuses?.length || 0) > 0 },
      { key: 'followup', label: 'Follow-up', configured: (s.followupSettings?.followupTypes?.length || 0) > 0 },
      { key: 'lead', label: 'Lead Management', configured: (s.leadSettings?.leadSources?.length || 0) > 0 },
      { key: 'campaign', label: 'Campaign Settings', configured: (s.campaignSettings?.campaignTypes?.length || 0) > 0 },
      { key: 'channels', label: 'Marketing Channels', configured: (s.marketingChannels?.length || 0) > 0 },
      { key: 'templates', label: 'Template Settings', configured: (s.templateSettings?.emailTemplates?.length || 0) > 0 },
      { key: 'automation', label: 'Automation', configured: !!s.automationSettings },
      { key: 'expense', label: 'Marketing Expenses', configured: (s.expenseSettings?.expenseCategories?.length || 0) > 0 },
      { key: 'expenseApproval', label: 'Expense Approval', configured: (s.expenseApproval?.approvalLevels?.length || 0) > 0 },
      { key: 'travel', label: 'Travel Settings', configured: !!s.travelSettings?.defaultTravelMode },
      { key: 'qform', label: 'Q-Form', configured: (s.qFormSettings?.questionCategories?.length || 0) > 0 },
      { key: 'calendar', label: 'Calendar', configured: (s.calendarSettings?.workingDays?.length || 0) > 0 },
      { key: 'location', label: 'Location & Map', configured: (s.locationSettings?.locationCategories?.length || 0) > 0 },
      { key: 'notifications', label: 'Notifications', configured: !!s.notifications?.visitReminder },
      { key: 'masters', label: 'Marketing Masters', configured: (s.masters?.marketers?.length || 0) > 0 },
      { key: 'numbering', label: 'Document Numbering', configured: !!s.documentNumbering?.Lead }
    ];
    if (accessStatus) {
      checks.push({
        key: 'access',
        label: 'Access Management',
        configured: Boolean(accessStatus.configured)
      });
    }
    const configured = checks.filter((c) => c.configured).length;
    const total = checks.length;
    const percentage = total > 0 ? Math.round((configured / total) * 100) : 0;
    const status = percentage === 100 ? 'healthy' : percentage >= 50 ? 'warning' : 'error';
    return { status, percentage, configured, total, checks };
  }
};

export default marketingSettingsService;
