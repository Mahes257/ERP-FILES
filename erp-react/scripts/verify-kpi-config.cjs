const fs = require('fs');
const src = fs.readFileSync('src/config/salesPageConfigs.jsx', 'utf8');

const configs = [
  'salesOrderListConfig',
  'deliveryChallanListConfig',
  'proformaInvoiceListConfig',
  'invoiceListConfig',
  'creditNoteListConfig',
  'paymentReceiptListConfig'
];

for (const name of configs) {
  const start = src.indexOf('export const ' + name);
  const kpiStart = src.indexOf('kpis:', start);
  const kpiEnd = src.indexOf('filters:', kpiStart);
  const block = src.slice(kpiStart, kpiEnd);
  const labels = [];
  const re = /(?:label:\s*'([^']+)'|statusKpi\('([^']+)',\s*'([^']+)')/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    labels.push(m[1] || m[3]);
  }
  // grid flag presence
  const gridIdx = src.indexOf('kpiGridClassName:', start);
  const gridEnd = gridIdx === -1 ? -1 : src.indexOf('\n', gridIdx);
  const gridLine = gridIdx === -1 ? 'NO GRID FLAG' : src.slice(gridIdx, gridEnd).trim();
  console.log(`== ${name} == ${labels.length} cards`);
  console.log('   ' + labels.join(' | '));
  console.log('   ' + gridLine);
}
