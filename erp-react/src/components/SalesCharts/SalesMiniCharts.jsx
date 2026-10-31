/* Lightweight SVG charts replicating the ERP dashboard charts exactly
   (quotation-dashboard.html used Chart.js v4): line trend, doughnut
   distribution, bar monthly value and horizontal conversion funnel.
   Same colors as ERP: #0B4A3D accent, status palette below. */

const ACCENT = '#0B4A3D';

export function LineTrendChart({ labels, data, height = 220 }) {
  const w = 600;
  const h = height;
  const padL = 30;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const max = Math.max(1, ...data);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const stepX = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((v, i) => [
    padL + (data.length > 1 ? i * stepX : innerW / 2),
    padT + innerH - (v / max) * innerH
  ]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]},${p[1]}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0]},${padT + innerH} L${pts[0][0]},${padT + innerH} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Quotation trend">
      {[0, 0.5, 1].map((f) => {
        const y = padT + innerH - f * innerH;
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">
              {Math.round(max * f)}
            </text>
          </g>
        );
      })}
      <path d={area} fill="rgba(11, 74, 61,0.08)" />
      <path d={line} fill="none" stroke={ACCENT} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={ACCENT} />
      ))}
      {labels.map((lb, i) => {
        const x = pts[Math.min(i, pts.length - 1)][0];
        return (
          <text key={lb + i} x={x} y={h - 8} textAnchor="middle" fontSize="9" fill="#9CA3AF">
            {lb}
          </text>
        );
      })}
    </svg>
  );
}

const STATUS_COLORS = ['#6B7280', '#D97706', '#16A34A', '#2563EB', '#0284C7', '#059669', '#DC2626', '#9CA3AF', '#7C3AED'];

export function DoughnutChart({ labels, data, size = 200 }) {
  const total = data.reduce((a, b) => a + b, 0);
  let acc = 0;
  const R = 42;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox={`0 0 100 100`} width={size} height={size} role="img" aria-label="Status distribution">
        <circle cx="50" cy="50" r={R} fill="none" stroke="#F3F4F6" strokeWidth="14" />
        {total > 0 &&
          labels.map((lb, i) => {
            const frac = data[i] / total;
            const dash = frac * C;
            const offset = -(acc / total) * C;
            acc += data[i];
            return (
              <circle
                key={lb + i}
                cx="50"
                cy="50"
                r={R}
                fill="none"
                stroke={STATUS_COLORS[i % STATUS_COLORS.length]}
                strokeWidth="14"
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={offset}
                transform="rotate(-90 50 50)"
              />
            );
          })}
        <text x="50" y="47" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0f172a">
          {total}
        </text>
        <text x="50" y="60" textAnchor="middle" fontSize="7" fill="#9CA3AF">
          Total
        </text>
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1">
        {labels.map((lb, i) => (
          <div key={lb + i} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLORS[i % STATUS_COLORS.length] }} />
            <span className="text-[11px] text-slate-600">{lb} ({data[i]})</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function BarChart({ labels, data, height = 220 }) {
  const w = 600;
  const h = height;
  const padL = 46;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const max = Math.max(1, ...data);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const slot = innerW / Math.max(1, labels.length);
  const bw = Math.min(34, slot * 0.55);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Monthly value">
      {[0, 0.5, 1].map((f) => {
        const y = padT + innerH - f * innerH;
        return (
          <g key={f}>
            <line x1={padL} y1={y} x2={w - padR} y2={y} stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3" />
            <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="9" fill="#9CA3AF">
              {Math.round(max * f)}
            </text>
          </g>
        );
      })}
      {data.map((v, i) => {
        const hh = (v / max) * innerH;
        const x = padL + i * slot + (slot - bw) / 2;
        return (
          <g key={i}>
            <rect x={x} y={padT + innerH - hh} width={bw} height={Math.max(hh, v > 0 ? 1 : 0)} rx="4" fill="rgba(11, 74, 61,0.7)" stroke={ACCENT} strokeWidth="1" />
            <text x={padL + i * slot + slot / 2} y={h - 8} textAnchor="middle" fontSize="9" fill="#9CA3AF">
              {labels[i]}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function FunnelChart({ labels, data, height = 200 }) {
  const w = 600;
  const h = height;
  const padL = 56;
  const padR = 10;
  const padT = 14;
  const padB = 20;
  const max = Math.max(1, ...data);
  const innerW = w - padL - padR;
  const innerH = h - padT - padB;
  const slot = innerH / Math.max(1, labels.length);
  const bh = Math.min(28, slot * 0.6);
  const colors = ['rgba(11, 74, 61,0.4)', 'rgba(11, 74, 61,0.5)', 'rgba(2,132,199,0.6)', 'rgba(5,150,105,0.7)'];
  const borders = ['#0B4A3D', '#2563EB', '#0284C7', '#059669'];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="Conversion funnel">
      {data.map((v, i) => {
        const bw = (v / max) * innerW;
        const y = padT + i * slot + (slot - bh) / 2;
        return (
          <g key={i}>
            <rect x={padL + (innerW - bw) / 2} y={y} width={bw} height={bh} rx="4" fill={colors[i % colors.length]} stroke={borders[i % borders.length]} strokeWidth="2" />
            <text x={padL - 8} y={y + bh / 2 + 3} textAnchor="end" fontSize="10" fontWeight="600" fill="#475569">
              {labels[i]}
            </text>
            <text x={padL + (innerW - bw) / 2 + bw - 6} y={y + bh / 2 + 3} textAnchor="end" fontSize="10" fontWeight="700" fill="#0f172a">
              {v}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
