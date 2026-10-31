/**
 * Shared helpers for the 13-module end-to-end create audit.
 * Every helper drives the REAL React UI (native setters + events) and the REAL
 * fetch API from the app context (authToken), then we verify via direct MySQL.
 */
module.exports = {
  // ---- Native React-compatible field setters ----
  setInputValue: (el, value) => {
    if (!el) return false;
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : el.type === 'date' || el.type === 'number' || el.type === 'email' ? window.HTMLInputElement.prototype
        : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  },
  setSelectValue: (el, value) => {
    if (!el) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  },
  // Find an input/textarea by its label text (label htmlFor or wrapping).
  findInputByLabel: (labelText) => {
    const labels = Array.from(document.querySelectorAll('label'));
    const label = labels.find((l) => l.textContent.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(labelText.toLowerCase()));
    if (!label) return null;
    if (label.htmlFor) {
      const el = document.getElementById(label.htmlFor);
      if (el) return el;
    }
    const wrap = label.closest('div');
    if (wrap) {
      const input = wrap.querySelector('input, textarea, select');
      if (input) return input;
    }
    return label.nextElementSibling && (label.nextElementSibling.matches('input, textarea, select') ? label.nextElementSibling : null);
  },
  clickButtonByText: (text) => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.find((b) => b.textContent.replace(/\s+/g, ' ').trim().toLowerCase().includes(text.toLowerCase()));
  },
  // Read the current toast text if any.
  getToast: () => {
    const t = document.querySelector('[class*="toast"]');
    return t ? t.textContent.trim() : '';
  },
  // Generic API fetch with the app authToken.
  apiFetch: async (path, options = {}) => {
    const token = localStorage.getItem('authToken') || '';
    const res = await fetch('/v1' + path, {
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      ...options
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty */ }
    return { status: res.status, body };
  }
};
