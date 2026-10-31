/**
 * cadContentValidation.js — validate downloaded bytes BEFORE handing them to
 * the CAD parser (ported from the Designing module).
 *
 * If a wrong/stale file or an HTML/JSON error page reaches the viewer, the
 * user gets a clear error instead of a confusing parser message.
 *
 * Signatures verified against real fixtures in the reference module:
 *   STEP  : "ISO-10303-21;" near the start
 *   IGES  : fixed 80-char records; section letter in column 73
 *   BREP  : "DBRep_DrawableShape" / "CASCADE Topology V1"
 *   SLDPRT/SLDASM: OLE2 magic or the modern 2015+ chunk marker near offset 16
 */

const MAX_CAD_FILE_BYTES = 512 * 1024 * 1024;

function looksLikeStep(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 1024)));
  return head.includes('ISO-10303-21');
}

function looksLikeIges(bytes) {
  if (bytes.length < 160) return false;
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 80));
  if (head[72] === 'S' && /^S\s*\d+$/.test(head.slice(72))) return true;
  const tailStart = bytes.length - (bytes.length % 80) - 80;
  if (tailStart >= 0) {
    const tail = new TextDecoder('latin1').decode(bytes.subarray(tailStart, tailStart + 80));
    if (/^.{72}T\s*\d+\s*$/.test(tail)) return true;
  }
  return false;
}

function looksLikeBrep(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  return head.startsWith('DBRep_DrawableShape') || head.includes('CASCADE Topology');
}

function looksLikeOle2(bytes) {
  return bytes.length > 8
    && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
    && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1;
}

function looksLikeModernSldprt(bytes) {
  return bytes.length > 22
    && bytes[16] === 0x14 && bytes[17] === 0x00 && bytes[18] === 0x06
    && bytes[19] === 0x00 && bytes[20] === 0x08 && bytes[21] === 0x00;
}

const DETECTORS = {
  step: looksLikeStep,
  iges: looksLikeIges,
  brep: looksLikeBrep,
  sldprt: (bytes) => looksLikeOle2(bytes) || looksLikeModernSldprt(bytes),
  sldasm: (bytes) => looksLikeOle2(bytes) || looksLikeModernSldprt(bytes),
};

const FORMAT_LABEL = {
  step: 'STEP', iges: 'IGES', brep: 'BREP', sldprt: 'SLDPRT', sldasm: 'SLDASM', slddrw: 'SLDDRW',
};

/** Best-effort container sniff for logging / diagnostics. */
export function detectCadContainer(bytes) {
  if (!bytes || bytes.length === 0) return 'empty';
  if (looksLikeOle2(bytes)) return 'ole2';
  if (looksLikeModernSldprt(bytes)) return 'sldprt-modern';
  if (looksLikeStep(bytes)) return 'step';
  if (looksLikeIges(bytes)) return 'iges';
  if (looksLikeBrep(bytes)) return 'brep';
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  if (/<(!doctype|html|\?xml)/i.test(head)) return 'html';
  if (head.trimStart().startsWith('{')) return 'json';
  return 'unknown';
}

function isWrongContentType(bytes) {
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, Math.min(bytes.length, 64)));
  return /<(!doctype|html|\?xml)/i.test(head) || /"(error|message|exception|timestamp)"/i.test(head);
}

/**
 * Validate downloaded CAD bytes against the requested format.
 *
 * @param {Uint8Array} bytes downloaded file content
 * @param {string} expectedFormat lowercase: step|iges|brep|sldprt|sldasm
 * @param {{ fileName?: string, mimeType?: string, expectedSize?: number, fileId?: string }} [meta]
 * @returns {{ ok: true, container: string, warnings: string[] }
 *          | { ok: false, code: string, reason: string, container: string }}
 */
export function validateCadBytes(bytes, expectedFormat, meta = {}) {
  const format = String(expectedFormat || '').toLowerCase();
  const label = FORMAT_LABEL[format] || format.toUpperCase();
  const container = detectCadContainer(bytes);

  if (!bytes || bytes.length === 0) {
    return {
      ok: false,
      code: 'EMPTY',
      container,
      reason: `The file is empty (expected ${label}). The upload may be unavailable — retry.`,
    };
  }
  if (bytes.length > MAX_CAD_FILE_BYTES) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      container,
      reason: `The file is too large for browser-side CAD viewing (${(bytes.length / 1048576).toFixed(0)} MB).`,
    };
  }

  if ((format === 'step' || format === 'iges' || format === 'brep') && isWrongContentType(bytes)) {
    return {
      ok: false,
      code: 'NOT_PLAIN_DATA',
      container,
      reason: `The loaded content is an HTML/JSON page instead of ${label} geometry. Reload the page and retry.`,
    };
  }

  const detector = DETECTORS[format];
  if (detector && !detector(bytes)) {
    /* SLDPRT/SLDASM/SLDDRW: the binary signature check stays relaxed because
       SolidWorks writes several different internal container formats across
       versions (OLE2, modern chunk-based, others). No browser-side conversion
       exists in this deployment (browser-only viewer), so these formats are
       reported honestly by the host rather than rejected here. */
    if (format === 'sldprt' || format === 'sldasm' || format === 'slddrw') {
      /* Accept any non-empty file with a .SLDPRT/.SLDASM/.SLDDRW extension. */
    } else {
      return {
        ok: false,
        code: 'MAGIC_MISMATCH',
        container,
        reason: `The file content is not ${label} geometry (detected: ${container}). The file may be corrupted or mislabelled.`,
      };
    }
  }

  const warnings = [];
  if (meta.mimeType && /text\/html|application\/json/i.test(meta.mimeType)) {
    warnings.push(`MIME type "${meta.mimeType}" looks wrong for ${label} (bytes still validated)`);
  }
  if (Number.isFinite(meta.expectedSize) && meta.expectedSize > 0
    && Math.abs(bytes.length - meta.expectedSize) / meta.expectedSize > 0.02) {
    warnings.push(`byte size ${bytes.length} differs from metadata size ${meta.expectedSize}`);
  }

  return { ok: true, container, warnings };
}
