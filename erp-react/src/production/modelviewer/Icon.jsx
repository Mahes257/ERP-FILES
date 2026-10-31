/* Tiny inline icon set (stroke style, professional PLM look) */
import React from 'react';

const I = ({ children, size = 16, className = '' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    {children}
  </svg>
);

export const Icon = {
  gauge: (p) => <I {...p}><path d="M12 13 8 9" /><path d="M20.5 13a8.5 8.5 0 1 0-17 0" /><path d="M12 21a9 9 0 0 0 8.5-6" /></I>,
  folder: (p) => <I {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" /></I>,
  target: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /></I>,
  flask: (p) => <I {...p}><path d="M9 3h6" /><path d="M10 3v5L4.6 17a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8V3" /><path d="M7 14h10" /></I>,
  bulb: (p) => <I {...p}><path d="M9 18h6" /><path d="M10 21h4" /><path d="M12 3a6 6 0 0 0-4 10.5c.7.6 1 1.5 1 2.5h6c0-1 .3-1.9 1-2.5A6 6 0 0 0 12 3Z" /></I>,
  cube: (p) => <I {...p}><path d="m12 2 8 4.5v9L12 20l-8-4.5v-9Z" /><path d="M12 22V20" /><path d="m4 6.5 8 4.5 8-4.5" /><path d="M12 11v9" /></I>,
  sigma: (p) => <I {...p}><path d="M18 5H7l6 7-6 7h11" /></I>,
  wave: (p) => <I {...p}><path d="M2 12c2.5-6 5-6 7.5 0s5 6 7.5 0 3.5-4 5-2" /></I>,
  layers: (p) => <I {...p}><path d="m12 2 9 5-9 5-9-5Z" /><path d="m3 12 9 5 9-5" /><path d="m3 17 9 5 9-5" /></I>,
  wrench: (p) => <I {...p}><path d="M14.7 6.3a4.5 4.5 0 0 0-6 6L3 18l3 3 5.7-5.7a4.5 4.5 0 0 0 6-6L14 13l-3-3Z" /></I>,
  beaker: (p) => <I {...p}><path d="M6 3h12" /><path d="M8 3v7l-4 8a2 2 0 0 0 1.8 3h12.4A2 2 0 0 0 20 18l-4-8V3" /><path d="M6.5 14h11" /></I>,
  alert: (p) => <I {...p}><path d="M12 3 2.5 20h19Z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></I>,
  git: (p) => <I {...p}><circle cx="6" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="12" r="2.5" /><path d="M6 8.5v7" /><path d="M8.5 6H13a2.5 2.5 0 0 1 2.5 2.5v1" /></I>,
  grid: (p) => <I {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></I>,
  wallet: (p) => <I {...p}><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14.5" r="1" fill="currentColor" /></I>,
  file: (p) => <I {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /></I>,
  check: (p) => <I {...p}><path d="m5 12 5 5L20 7" /></I>,
  x: (p) => <I {...p}><path d="M6 6l12 12" /><path d="M18 6 6 18" /></I>,
  search: (p) => <I {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></I>,
  bell: (p) => <I {...p}><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6" /><path d="M10 20a2 2 0 0 0 4 0" /></I>,
  moon: (p) => <I {...p}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" /></I>,
  sun: (p) => <I {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></I>,
  logout: (p) => <I {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></I>,
  plus: (p) => <I {...p}><path d="M12 5v14" /><path d="M5 12h14" /></I>,
  edit: (p) => <I {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></I>,
  trash: (p) => <I {...p}><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M6 6l1 14h10l1-14" /></I>,
  chevronR: (p) => <I {...p}><path d="m9 6 6 6-6 6" /></I>,
  chevronD: (p) => <I {...p}><path d="m6 9 6 6 6-6" /></I>,
  chevronL: (p) => <I {...p}><path d="m15 6-6 6 6 6" /></I>,
  arrowL: (p) => <I {...p}><path d="M19 12H5" /><path d="m11 18-6-6 6-6" /></I>,
  download: (p) => <I {...p}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></I>,
  clock: (p) => <I {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></I>,
  user: (p) => <I {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 5-5 8-5s6.5 1 8 5" /></I>,
  link: (p) => <I {...p}><path d="M9 15 15 9" /><path d="M10.5 6.5 12 5a4 4 0 0 1 6 6l-1.5 1.5" /><path d="M13.5 17.5 12 19a4 4 0 0 1-6-6l1.5-1.5" /></I>,
  activity: (p) => <I {...p}><path d="M3 12h4l2.5-7 5 14 2.5-7h4" /></I>,
  settings: (p) => <I {...p}><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2-1.2L14 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.5 2 1.5a7 7 0 0 0 0 2.4l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2 1.2L10 21h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.5-2-1.5c.1-.4.2-.8.2-1.2Z" /></I>,
  menu: (p) => <I {...p}><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></I>,
  paperclip: (p) => <I {...p}><path d="m21 11.5-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3L16 6.5" /></I>,
  send: (p) => <I {...p}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></I>,
  shield: (p) => <I {...p}><path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6Z" /><path d="m9 12 2 2 4-4" /></I>,
  dollar: (p) => <I {...p}><path d="M12 2v20" /><path d="M17 6.5c-.8-1.4-2.6-2-4.7-2C9.7 4.5 8 6 8 8.2c0 4.6 8 2.6 8 7.3 0 2.3-1.9 3.9-4.8 3.9-2.3 0-4-.8-4.7-2.3" /></I>,
};

export default Icon;
