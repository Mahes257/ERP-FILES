/* eslint-disable no-undef */
/**
 * browserBadgeValidation.js
 * ------------------------------------------------------------------
 * Automated browser validation of sidebar badge counts.
 * Run with: node browserBadgeValidation.js
 * Requires: app running on localhost:5173
 * ------------------------------------------------------------------
 */
const { chromium } = require('playwright');

const BASE = 'http://localhost:5173';

const MODULES = [
  { name: 'Purchase Requisition', path: '/purchase/requisition', sidebarText: 'Requisition' },
  { name: 'RFQ & Quotations', path: '/purchase/rfq', sidebarText: 'RFQ' },
  { name: 'Purchase Orders', path: '/purchase/orders', sidebarText: 'Orders' },
  { name: 'Logistics', path: '/purchase/logistics', sidebarText: 'Logistics' },
  { name: 'Purchase Invoice', path: '/purchase/invoices', sidebarText: 'Invoice' },
  { name: 'Documents', path: '/purchase/documents', sidebarText: 'Documents' },
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Navigate to home first
  console.log('Navigating to application...');
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Take screenshot of home
  await page.screenshot({ path: '/tmp/badge-validation-home.png', fullPage: false });
  console.log('Home screenshot saved');

  // Check sidebar structure
  console.log('\n=== SIDEBAR STRUCTURE ===');
  const sidebarItems = await page.evaluate(() => {
    // Look for sidebar navigation items with badges
    const items = [];
    const allLinks = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a, [class*="Sidebar"] a');
    allLinks.forEach(link => {
      const text = link.textContent.trim();
      const badge = link.querySelector('[class*="badge"], [class*="count"], [class*="pill"], span[class*="bg-"]');
      const badgeText = badge ? badge.textContent.trim() : null;
      if (text && text.length > 0 && text.length < 50) {
        items.push({ text: text.substring(0, 40), badge: badgeText, href: link.getAttribute('href') });
      }
    });
    return items;
  });

  console.log(`Found ${sidebarItems.length} sidebar links:`);
  sidebarItems.forEach(item => {
    const badge = item.badge ? ` [badge: ${item.badge}]` : '';
    const href = item.href ? ` → ${item.href}` : '';
    console.log(`  ${item.text}${badge}${href}`);
  });

  // Navigate to each module and check data counts
  for (const mod of MODULES) {
    console.log(`\n=== ${mod.name} ===`);
    try {
      await page.goto(`${BASE}${mod.path}`, { waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(2000);

      // Take screenshot
      await page.screenshot({ path: `/tmp/badge-validation-${mod.name.toLowerCase().replace(/[^a-z]/g, '-')}.png`, fullPage: false });

      // Count data rows in tables
      const pageData = await page.evaluate(() => {
        const tables = document.querySelectorAll('table');
        let totalRows = 0;
        let headers = [];
        tables.forEach(table => {
          const ths = table.querySelectorAll('thead th');
          ths.forEach(th => headers.push(th.textContent.trim()));
          const rows = table.querySelectorAll('tbody tr');
          totalRows += rows.length;
        });

        // Look for status badges/text
        const statusElements = document.querySelectorAll('[class*="badge"], [class*="status"], [class*="pill"]');
        const statuses = [];
        statusElements.forEach(el => {
          const text = el.textContent.trim();
          if (text && text.length < 30) statuses.push(text);
        });

        // Count tab badges
        const tabBadges = document.querySelectorAll('[class*="tab"] [class*="count"], [class*="tab"] [class*="badge"]');
        const tabBadgeTexts = [];
        tabBadges.forEach(el => {
          const text = el.textContent.trim();
          if (text) tabBadgeTexts.push(text);
        });

        // Look for KPI cards
        const kpiCards = document.querySelectorAll('[class*="kpi"], [class*="stat"]');
        const kpis = [];
        kpiCards.forEach(card => {
          const label = card.querySelector('[class*="label"]');
          const value = card.querySelector('[class*="count"], [class*="value"], [class*="stat"]');
          if (label && value) {
            kpis.push({ label: label.textContent.trim(), value: value.textContent.trim() });
          }
        });

        return { totalRows, headers: headers.slice(0, 10), statuses: [...new Set(statuses)].slice(0, 15), tabBadges: tabBadgeTexts, kpis };
      });

      console.log(`  Table rows: ${pageData.totalRows}`);
      if (pageData.headers.length > 0) console.log(`  Headers: ${pageData.headers.join(', ')}`);
      if (pageData.statuses.length > 0) console.log(`  Statuses: ${pageData.statuses.join(', ')}`);
      if (pageData.tabBadges.length > 0) console.log(`  Tab badges: ${pageData.tabBadges.join(', ')}`);
      if (pageData.kpis.length > 0) {
        pageData.kpis.forEach(kpi => console.log(`  KPI: ${kpi.label} = ${kpi.value}`));
      }

      // Check sidebar badge for this module
      const sidebarBadge = await page.evaluate((moduleText) => {
        const links = document.querySelectorAll('nav a, aside a, [class*="sidebar"] a');
        for (const link of links) {
          if (link.textContent.includes(moduleText)) {
            const badge = link.querySelector('[class*="badge"], [class*="count"], span[class*="bg-"]');
            return badge ? badge.textContent.trim() : 'no badge';
          }
        }
        return 'module link not found';
      }, mod.sidebarText);

      console.log(`  Sidebar badge for "${mod.sidebarText}": ${sidebarBadge}`);

    } catch (err) {
      console.log(`  ERROR: ${err.message}`);
    }
  }

  // Check navigation away and back
  console.log('\n=== NAVIGATION TEST ===');
  await page.goto(`${BASE}/purchase/requisition`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const badge1 = await page.evaluate(() => {
    const links = document.querySelectorAll('nav a, aside a');
    for (const link of links) {
      if (link.textContent.includes('Requisition')) {
        const badge = link.querySelector('[class*="badge"], [class*="count"], span[class*="bg-"]');
        return badge ? badge.textContent.trim() : 'no badge';
      }
    }
    return 'not found';
  });

  // Navigate away
  await page.goto(`${BASE}/purchase/rfq`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);

  // Navigate back
  await page.goto(`${BASE}/purchase/requisition`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const badge2 = await page.evaluate(() => {
    const links = document.querySelectorAll('nav a, aside a');
    for (const link of links) {
      if (link.textContent.includes('Requisition')) {
        const badge = link.querySelector('[class*="badge"], [class*="count"], span[class*="bg-"]');
        return badge ? badge.textContent.trim() : 'no badge';
      }
    }
    return 'not found';
  });

  console.log(`  Badge before navigation: ${badge1}`);
  console.log(`  Badge after navigate-away-and-back: ${badge2}`);
  console.log(`  Consistent: ${badge1 === badge2 ? 'YES' : 'NO'}`);

  // Browser refresh test
  console.log('\n=== BROWSER REFRESH TEST ===');
  await page.goto(`${BASE}/purchase/requisition`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(1000);
  const preRefresh = await page.evaluate(() => {
    const links = document.querySelectorAll('nav a, aside a');
    for (const link of links) {
      if (link.textContent.includes('Requisition')) {
        const badge = link.querySelector('[class*="badge"], [class*="count"], span[class*="bg-"]');
        return badge ? badge.textContent.trim() : 'no badge';
      }
    }
    return 'not found';
  });

  await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForTimeout(2000);
  const postRefresh = await page.evaluate(() => {
    const links = document.querySelectorAll('nav a, aside a');
    for (const link of links) {
      if (link.textContent.includes('Requisition')) {
        const badge = link.querySelector('[class*="badge"], [class*="count"], span[class*="bg-"]');
        return badge ? badge.textContent.trim() : 'no badge';
      }
    }
    return 'not found';
  });

  console.log(`  Before refresh: ${preRefresh}`);
  console.log(`  After refresh: ${postRefresh}`);
  console.log(`  Consistent: ${preRefresh === postRefresh ? 'YES' : 'NO'}`);

  await browser.close();
  console.log('\n=== VALIDATION COMPLETE ===');
})().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
