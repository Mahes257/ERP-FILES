/**
 * purchase/components/ui/Card.jsx
 * ------------------------------------------------------------------
 * Enterprise surface card (HTML template .po-dash-card) with an
 * optional header (title / subtitle / action) and a padded body.
 * ------------------------------------------------------------------
 */
export default function Card({ title, subtitle, action, children, className = '', bodyClassName = '', headerIcon: HeaderIcon }) {
  return (
    <section className={`po-dash-card ${className}`}>
      {title && (
        <div className="po-dash-card-header">
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
      <div className={`po-dash-card-body ${bodyClassName}`}>{children}</div>
    </section>
  );
}
