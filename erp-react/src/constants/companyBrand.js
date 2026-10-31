// Official Vishak Tech brand assets.
//
// These used to be three base64 data URIs in this module (~712 KB of text), and
// because CompanyLogo is part of the application shell every page downloaded
// them before it could render. They now live as PNG files in public/brand, so
// the browser fetches them as images (cached, streamed) and the JavaScript
// bundle carries only three URLs.
//
// URLs are absolute (origin + Vite base) because the print/PDF helpers write
// them into a new window's HTML, where a root-relative path would resolve
// against about:blank. A sub-path deployment (ERP_BASE_URL) still works.
//
// Regenerate the files from the original artwork — do not inline base64 here
// again: scripts/cdp-gen-brand-assets.cjs produces the source images.

const BASE = (import.meta.env?.BASE_URL) || '/';
const ORIGIN = typeof window !== 'undefined' ? window.location.origin : '';
const brandAsset = (file) => `${ORIGIN}${BASE}brand/${file}`;

/** Full logo on transparent background. */
export const VH_LOGO_URI = brandAsset('vishak-tech-logo.png');

/** Logo on its plate/background — used by documents and print layouts. */
export const VH_LOGO_PLATE_URI = brandAsset('vishak-tech-logo-plate.png');

/** Compact emblem — used where the full wordmark is too wide. */
export const VH_EMBLEM_URI = brandAsset('vishak-tech-emblem.png');
