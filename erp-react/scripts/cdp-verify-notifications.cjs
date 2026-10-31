/* Verify the premium redesigned Notifications page in the browser.
 * - Page opens from the sidebar bell and the /notifications route
 * - Real pending-approval feed renders as premium rounded cards
 * - Perfectly circular icon containers, unread dot, and count badge
 * - Clicking a card marks it read + navigates to the document
 * - Mark all as read clears unread client-side + shows success toast
 * - Unread filter empty state, no horizontal overflow, zero console errors
 */
module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { navigate, waitFor, evalJs, shot } = helpers;
    const errors = [];
    cdp.on('Runtime.exceptionThrown', (p) =>
      errors.push('EXC: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
    await cdp.send('Runtime.enable');
    await cdp.send('Log.enable');
    cdp.on('Log.entryAdded', (p) => {
      if (p.entry && p.entry.level === 'error') errors.push('LOG: ' + p.entry.text);
    });

    const base = 'http://localhost:5173';

    // Circular helper: accepts 50% or Tailwind's rounded-full (9999px).
    const IS_CIRCLE = `(el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const rad = parseFloat(cs.borderRadius);
      const minSide = Math.min(r.width, r.height);
      return Math.abs(r.width - r.height) < 1 && (cs.borderRadius.includes('50%') || rad >= minSide / 2 - 0.5);
    }`;

    // Reset persisted read state so the page starts fully unread.
    await evalJs(`localStorage.removeItem('erp:notifications:read')`);

    // ---- 1. Sidebar bell navigates to the page ----
    await navigate(base + '/dashboard');
    await sleep(2500);
    const bellClicked = await evalJs(`(() => {
      const bell = Array.from(document.querySelectorAll('.sb-nav-item')).find((b) => b.textContent.includes('Notifications'));
      if (!bell) return 'no-bell';
      bell.click();
      return 'clicked';
    })()`);
    await waitFor(`location.pathname === '/notifications'`, 15000);
    await sleep(2500);

    // ---- 2. Initial page state ----
    const initial = await evalJs(`(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const isCircle = ${IS_CIRCLE};
      for (let i = 0; i < 25; i++) {
        if (!document.querySelector('.animate-spin')) break;
        await sleep(200);
      }
      await sleep(400);
      const out = { url: location.pathname };
      out.title = document.querySelector('h1')?.innerText?.replace(/\\s+/g, ' ').trim() || '';
      const badge = Array.from(document.querySelectorAll('h1 span')).find((s) => /^\\d+$|^99\\+$/.test(s.textContent.trim()));
      out.countBadge = badge ? { text: badge.textContent.trim(), circular: isCircle(badge) } : null;

      const cards = Array.from(document.querySelectorAll('ul.space-y-3 > li > button'));
      out.cardCount = cards.length;
      out.cards = cards.slice(0, 5).map((c) => {
        const icon = c.querySelector('.h-10.w-10');
        const badgeEl = Array.from(c.querySelectorAll('span')).find((s) => s.style && s.style.background);
        const leaves = Array.from(c.querySelectorAll('span')).filter((s) => s.childElementCount === 0).map((s) => s.textContent.trim()).filter(Boolean);
        const docNo = leaves.find((t) => /^(CPR|CW|PW|QTN|SC|CPO|SO|CN)-\\d/.test(t)) || null;
        const status = leaves.find((t) => /^(Pending Approval|Pending Review|Submitted|Under Review)$/.test(t)) || null;
        const timeEl = c.querySelector('span') && leaves.find((t) => /^(Just now|\\d+ min ago|\\d+ hours? ago|Today|Yesterday|\\d{1,2} \\w{3}|\\w{3} \\d{1,2})$/.test(t)) || null;
        return {
          iconCircular: isCircle(icon),
          docNo,
          status,
          badgeBg: badgeEl ? badgeEl.style.background : null,
          timestamp: timeEl,
          hasChevron: !!c.querySelector('svg')
        };
      });
      out.unreadDots = document.querySelectorAll('button span.w-2.h-2.rounded-full').length;
      out.markAllButton = Array.from(document.querySelectorAll('button')).some((b) => b.textContent.includes('Mark all as read'));
      out.tabs = Array.from(document.querySelectorAll('div.inline-flex button[aria-pressed]')).map((b) => b.textContent.trim());
      out.horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth + 1;
      return out;
    })()`);
    await shot('notifications-page');

    // ---- 3. Click first card -> navigate to document, mark that one read ----
    await evalJs(`(() => {
      const card = document.querySelector('ul.space-y-3 > li > button');
      if (card) card.click();
    })()`);
    await sleep(1800);
    const cardNavUrl = await evalJs('location.href');

    await navigate(base + '/notifications');
    await sleep(2200);
    const afterSingleRead = await evalJs(`(() => ({
      unreadDots: document.querySelectorAll('button span.w-2.h-2.rounded-full').length,
      badgeText: Array.from(document.querySelectorAll('h1 span')).find((s) => /^\\d+$|^99\\+$/.test(s.textContent.trim()))?.textContent.trim() || null
    }))()`);

    // ---- 4. Mark all as read ----
    const markAllRes = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) => b.textContent.includes('Mark all as read'));
      if (!btn) return 'no-button';
      btn.click();
      await new Promise((r) => setTimeout(r, 900));
      return {
        toast: Array.from(document.querySelectorAll('div.fixed.top-4.right-4 p')).map((p) => p.textContent.trim()),
        unreadDots: document.querySelectorAll('button span.w-2.h-2.rounded-full').length,
        badgeGone: !Array.from(document.querySelectorAll('h1 span')).some((s) => /^\\d+$|^99\\+$/.test(s.textContent.trim()))
      };
    })()`);
    await shot('notifications-mark-all-read');

    // ---- 5. Unread tab -> empty state ----
    const unreadTab = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('div.inline-flex button[aria-pressed]')).find((b) => b.textContent.trim().startsWith('Unread'));
      if (!btn) return 'no-tab';
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      return Array.from(document.querySelectorAll('p')).map((p) => p.textContent.trim()).filter((t) => /caught up|unread|read everything|No new/.test(t));
    })()`);
    await shot('notifications-unread-empty');

    // ---- 6. All tab still lists the notifications ----
    const allTab = await evalJs(`(async () => {
      const btn = Array.from(document.querySelectorAll('div.inline-flex button[aria-pressed]')).find((b) => b.textContent.trim().startsWith('All'));
      if (!btn) return 'no-tab';
      btn.click();
      await new Promise((r) => setTimeout(r, 500));
      return document.querySelectorAll('ul.space-y-3 > li > button').length;
    })()`);

    const summary = {
      bellClicked,
      cardNavUrl,
      afterSingleRead,
      initial,
      markAllRes,
      unreadTab,
      allTabCardCount: allTab,
      errors
    };
    console.log(JSON.stringify(summary, null, 2));
  }
};