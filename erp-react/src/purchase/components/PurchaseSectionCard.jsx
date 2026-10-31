/**
 * purchase/components/PurchaseSectionCard.jsx
 * ------------------------------------------------------------------
 * Enterprise section card (HTML template .prm-card): header row
 * with optional icon + title + subtitle + action slot, padded body.
 * ------------------------------------------------------------------
 */
export default function PurchaseSectionCard({
  title,
  subtitle,
  action,
  icon: HeaderIcon,
  children,
  className = '',
  bodyClassName = ''
}) {
  return (
    <section className={`prm-card ${className}`}>
      {(title || action) && (
        <div className="prm-card-header">
          <div className="min-w-0">
            <h3>
              {HeaderIcon && <HeaderIcon aria-hidden="true" />}
              {title}
            </h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={`prm-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
