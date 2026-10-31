import { VH_LOGO_URI, VH_LOGO_PLATE_URI, VH_EMBLEM_URI } from '../../constants/companyBrand';

const VARIANTS = {
  // Official Vishak Tech lockup (transparent background) — dark surfaces only.
  full: VH_LOGO_URI,
  // Same lockup on its original #083D34 plate — light/white surfaces (docs).
  plate: VH_LOGO_PLATE_URI,
  // Official emblem only (transparent) — collapsed rails & favicons.
  emblem: VH_EMBLEM_URI
};

/**
 * Single source of truth for the official Vishak Tech logo in the UI.
 *
 * variant:
 *   full    -> emblem + wordmark, transparent background
 *   plate   -> emblem + wordmark on the original dark-green plate
 *   emblem  -> emblem only, transparent background
 */
export default function CompanyLogo({ variant = 'full', alt = 'Vishak Tech', className, ...rest }) {
  return (
    <img
      src={VARIANTS[variant] || VH_LOGO_URI}
      alt={alt}
      className={className}
      draggable={false}
      {...rest}
    />
  );
}