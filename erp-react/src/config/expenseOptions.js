// Central, configurable option lists for Marketing Expense entry.
// Add/rename/remove an entry here and it flows through the whole expense
// module (Add + Edit form) without touching component code.

// Expense categories — the "Category" dropdown. `value` is persisted in the
// backend (expenseType), `label` is what the user sees.
export const EXPENSE_CATEGORIES = [
  { value: 'Travel', label: 'Travel' },
  { value: 'Stay', label: 'Stay / Lodge' },
  { value: 'Food', label: 'Food' },
  { value: 'Other', label: 'Other' }
];

// Category-specific type dropdowns. The last entry of each list is the
// "custom" marker: when selected, an extra "specify" field lets the user
// type a new value (stored in the same field, no code change required).
export const TRAVEL_TYPES = ['Bus', 'Taxi / Cab', 'Train', 'Flight', 'Other Travel'];
export const FOOD_TYPES = ['Breakfast', 'Lunch', 'Dinner', 'Refreshments', 'Other Food'];
export const STAY_TYPES = ['Hotel', 'Lodge', 'Guest House', 'Other'];
export const OTHER_EXPENSE_TYPES = ['Parking', 'Toll', 'Local Conveyance', 'Miscellaneous', 'Other'];

// Custom-marker labels per category (must match the last entry above).
export const CUSTOM_TYPE_MARKER = {
  Travel: 'Other Travel',
  Food: 'Other Food',
  Stay: 'Other',
  Other: 'Other'
};

export const TYPE_OPTIONS = {
  Travel: TRAVEL_TYPES,
  Food: FOOD_TYPES,
  Stay: STAY_TYPES,
  Other: OTHER_EXPENSE_TYPES
};

export const BILL_STATUSES = ['WITH BILL', 'WITHOUT BILL'];
