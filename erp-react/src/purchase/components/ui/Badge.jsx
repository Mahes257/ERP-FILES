/**
 * purchase/components/ui/Badge.jsx
 * ------------------------------------------------------------------
 * Enterprise status pill matching the HTML template's .po-badge
 * system. Accepts a tone (gray/blue/indigo/purple/yellow/green/red/
 * cyan) or a direct className, with an optional leading dot.
 * ------------------------------------------------------------------
 */
// eslint-disable-next-line react-refresh/only-export-components
export const BADGE_TONES = {
  gray: 'po-badge-gray',
  slate: 'po-badge-gray',
  blue: 'po-badge-blue',
  indigo: 'po-badge-indigo',
  purple: 'po-badge-purple',
  yellow: 'po-badge-yellow',
  amber: 'po-badge-yellow',
  green: 'po-badge-green',
  emerald: 'po-badge-green',
  red: 'po-badge-red',
  rose: 'po-badge-red',
  cyan: 'po-badge-cyan'
};

export default function Badge({ children, tone = 'gray', dot = false, className = '' }) {
  const style = BADGE_TONES[tone] || BADGE_TONES.gray;
  return (
    <span className={`po-badge ${style} ${className}`}>
      {dot && <span className="po-badge-dot" aria-hidden="true" />}
      {children}
    </span>
  );
}
