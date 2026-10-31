module.exports = {
  run: async ({ cdp, sleep, helpers }) => {
    const { evalJs, navigate } = helpers;
    const EXTRACT = `(() => {
      const norm = (t) => t.replace(/\\s+/g, ' ').trim();
      const btns = Array.from(document.querySelectorAll('button')).map((b) => norm(b.textContent)).filter(Boolean);
      const labels = Array.from(document.querySelectorAll('label')).map((l) => norm(l.textContent)).filter(Boolean);
      const h1 = document.querySelector('h1');
      const accordions = Array.from(document.querySelectorAll('h2, h3, legend, [class*="card-header"]')).map((h) => norm(h.textContent)).filter(Boolean);
      const addBtn = btns.find((b) => b.includes('Add Client') || b.includes('Add Lead') || b.includes('Add Follow-up') || b.includes('New Follow-up'));
      const tables = document.querySelectorAll('table').length;
      const kpiLabels = Array.from(document.querySelectorAll('[class*="kpi"]')).map((s) => norm(s.textContent)).filter((t) => t && t.length < 60).slice(0, 8);
      return {
        h1: h1 ? norm(h1.textContent) : null,
        addBtn: addBtn || null,
        accordions: Array.from(new Set(accordions)).slice(0, 14),
        tables,
        kpiLabels,
        labels: Array.from(new Set(labels)).slice(0, 16)
      };
    })()`;
    const ROUTES = [
      ['CLIENTS_LIST', '/clients'],
      ['LEADS_LIST', '/leads'],
      ['FOLLOWUPS_LIST', '/followups'],
      ['CLIENT_CREATE', '/clients/new'],
      ['FOLLOWUP_CREATE', '/followups/new']
    ];
    for (const [tag, route] of ROUTES) {
      try {
        await navigate('http://localhost:5173' + route);
        await sleep(4200);
        const d = await evalJs(EXTRACT);
        console.log(tag + ': ' + JSON.stringify(d));
      } catch (e) {
        console.log(tag + '_ERR: ' + e.message);
      }
    }
  }
};
