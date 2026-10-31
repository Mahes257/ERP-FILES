import React from 'react';
import { Icon } from './Icon.jsx';
import { formatBytes } from './fileUtils.js';

/* SolidWorks family labels — detection is by EXTENSION, case-insensitive
   (karthi.SLDPRT / KARTHI.sldprt / assembly.SLDASM / drawing.SLDDRW). */
export const SOLIDWORKS_LABELS = {
  sldprt: 'SolidWorks Part',
  sldasm: 'SolidWorks Assembly',
  slddrw: 'SolidWorks Drawing',
};

export function solidWorksLabel(ext) {
  return SOLIDWORKS_LABELS[String(ext || '').toLowerCase()] || null;
}

function Row({ label, value, mono = false }) {
  /* Omit fields with no real data instead of printing undefined/null/—. */
  if (value == null || value === '') return null;
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-[#EDF2F0] py-[7px] last:border-0">
      <dt className="shrink-0 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-[12.5px] font-medium text-slate-700 ${mono ? 'font-mono' : ''}`} title={String(value)}>
        {value}
      </dd>
    </div>
  );
}

/**
 * SolidWorksFallback — professional status panel for .SLDPRT / .SLDASM /
 * .SLDDRW records. Never renders a fake model; explains the browser
 * limitation, shows the REAL file details, provides a working
 * "Download Original File" action (original bytes, name and extension
 * preserved) and guides the user to open the downloaded file in SolidWorks.
 *
 * No fake "Open in SolidWorks" action: this app has no custom protocol,
 * Electron/Tauri bridge or other supported desktop-launch mechanism, so a
 * direct-launch button would be misleading (browsers cannot start desktop
 * apps like SolidWorks).
 */
export default function SolidWorksFallback({
  file,            // attachment { name, url, size?, uploadedAt? }
  drawingNumber,
  revision,
  designName,
  projectName,
  onDownload,
  downloadState = 'idle', // idle | busy | done | error
  onClose,
  errorDetail,     // optional: detailed error message from conversion (SLDASM assembly diagnostics)
}) {
  const name = file?.name || '';
  const ext = (name.split('.').pop() || '').toLowerCase();
  const label = solidWorksLabel(ext) || 'SolidWorks File';

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto" style={{ background: '#F4F8F7' }}>
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-10">
        {/* Icon block — same emerald visual language as the CAD fallback */}
        <div className="grid h-16 w-16 place-items-center rounded-2xl" style={{ background: '#EAF7F4', color: '#0B7A68' }}>
          <Icon.cube size={30} />
        </div>

        <h3
          className="mt-4 text-center text-[15px] font-bold"
          style={{ fontFamily: "'Inter','Segoe UI',system-ui,sans-serif", color: '#102A2A' }}
        >
          SolidWorks preview unavailable
        </h3>
        <p className="mt-1.5 max-w-md text-center text-[12.5px] leading-relaxed text-slate-500">
          {ext === 'slddrw' ? (
            <>
              This is a SolidWorks Drawing (.SLDDRW) file. Browsers cannot render SolidWorks
              drawings directly. To preview the 3D model referenced by this drawing, upload
              the related .SLDPRT, .SLDASM, STEP, or GLB file.
            </>
          ) : errorDetail ? (
            <>
              <span className="whitespace-pre-line">{errorDetail}</span>
              {/* SLDASM: no "export a STEP instead" instruction — the assembly is
                  read natively from its own component tree, and the note above
                  states the exact technical reason when a component's geometry
                  is not available to the app. */}
              {ext === 'sldasm' && (
                <span className="mt-3 block rounded-xl border border-[#DCE8E4] bg-[#FAFCFB] p-3 text-left text-[11.5px] leading-relaxed text-slate-500">
                  The original .SLDASM file is unchanged and stays downloadable. This app reads the assembly's own
                  component structure and places every component whose part file is available to it — it never
                  substitutes placeholder geometry for components it cannot resolve.
                </span>
              )}
            </>
          ) : (
            <>
              SolidWorks native part files cannot be rendered directly in this browser.
              The original file is available for download and can be opened in the
              installed SolidWorks application.
            </>
          )}
        </p>

        {/* File details — only real, available metadata (no undefined/null). */}
        <div className="mt-5 w-full rounded-xl border border-[#DCE8E4] bg-white p-4 shadow-sm">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">File Details</div>
          <dl className="m-0">
            <Row label="File Name" value={name} mono />
            <Row label="File Type" value={label} />
            <Row label="Extension" value={ext ? `.${ext.toUpperCase()}` : null} mono />
            <Row label="File Size" value={file?.size != null && file.size > 0 ? formatBytes(file.size) : null} />
            <Row label="Uploaded Date" value={file?.uploadedAt || null} />
            <Row label="Design / Part Name" value={designName || null} />
            <Row label="Project" value={projectName || null} />
            <Row label="Revision" value={revision ? `Rev ${revision}` : null} mono />
          </dl>
        </div>

        {/* Guidance — appears after the original file has been downloaded. */}
        {downloadState === 'done' ? (
          <div
            role="status"
            className="mt-4 w-full rounded-xl border px-4 py-3 text-[12px] leading-relaxed"
            style={{ borderColor: '#B7E4DB', background: '#EFFAF7', color: '#0B5E52' }}
          >
            {ext === 'slddrw'
              ? 'The original SolidWorks drawing has been downloaded. Open it in SolidWorks, or upload the related 3D model (.SLDPRT, .SLDASM, STEP, GLB) to the same design for browser 3D preview.'
              : 'The original SolidWorks file has been downloaded. Open the downloaded file in SolidWorks to view the 3D model.'}
          </div>
        ) : (
          <p className="mt-3 max-w-md text-center text-[11.5px] leading-relaxed text-slate-400">
            {ext === 'slddrw'
              ? 'Download the original drawing file. To preview the 3D model in the browser, upload the related .SLDPRT, .SLDASM, STEP, or GLB file to the same design.'
              : 'Download the original file, then open it in the installed SolidWorks application to view the 3D model.'}
          </p>
        )}

        {/* Actions — Download (real) + Close. No fake desktop-launch button. */}
        <div className="mt-5 flex items-center gap-2">
          <button
            type="button"
            className="erp-btn-primary"
            style={{ height: 38, padding: '0 18px' }}
            disabled={downloadState === 'busy'}
            aria-label={`Download Original File ${name}`}
            onClick={() => onDownload?.()}
          >
            <Icon.download size={15} />
            <span>{downloadState === 'busy' ? 'Downloading…' : 'Download Original File'}</span>
          </button>
          {onClose && (
            <button type="button" className="erp-btn" style={{ height: 38 }} onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <p className="mt-2 text-[11px] text-slate-400">
          Downloads the original {ext ? `.${ext.toUpperCase()}` : ''} file — never a converted copy. The file is not modified.
        </p>
      </div>
    </div>
  );
}
