/**
 * purchase/utils/attachmentFile.js
 * ------------------------------------------------------------------
 * Shared helpers for Purchase attachment uploads, previews and
 * downloads (AttachmentPreview, AttachmentList, AttachmentManager,
 * VendorDocuments, PurchaseDocuments).
 *
 * Kept in a plain module so the component files that consume them stay
 * Fast-Refresh friendly (a component file should only export components).
 * ------------------------------------------------------------------
 */

/* ─── Allowed file types ─── */

/** Map of extension → MIME type for validation. */
export const ALLOWED_EXTENSIONS = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
  txt: 'text/plain'
};

export const ALLOWED_EXT_KEYS = Object.keys(ALLOWED_EXTENSIONS);

/** File input accept string for common business files. */
export const ACCEPT_STRING = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.csv,.txt';

/** Returns true when the file's extension (or MIME) is in the allowed set. */
export function isAllowedFileType(file) {
  if (!file) return false;
  const ext = String(file.name || '').split('.').pop()?.toLowerCase();
  if (ext && ALLOWED_EXTENSIONS[ext]) return true;
  /* MIME fallback — accept if the MIME matches any allowed type. */
  const mime = (file.type || '').toLowerCase();
  if (mime && Object.values(ALLOWED_EXTENSIONS).includes(mime)) return true;
  return false;
}

/** Returns a human-readable rejection reason, or null if allowed. */
export function fileRejectionReason(file, maxSizeMb = 5) {
  if (!file) return 'No file selected';
  if (!isAllowedFileType(file)) {
    const ext = String(file.name || '').split('.').pop()?.toLowerCase();
    return `Unsupported file type${ext ? ` (.${ext})` : ''}. Allowed: ${ALLOWED_EXT_KEYS.map((e) => e.toUpperCase()).join(', ')}`;
  }
  if (file.size > maxSizeMb * 1024 * 1024) {
    return `File too large (${formatSize(file.size)}). Maximum: ${maxSizeMb} MB`;
  }
  if (file.size === 0) {
    return 'File is empty (0 bytes)';
  }
  return null;
}

/** Check if a filename already exists in the current attachments list. */
export function findDuplicateName(name, attachments) {
  if (!name || !attachments) return false;
  const lower = name.toLowerCase();
  return attachments.some((att) => (att.name || '').toLowerCase() === lower);
}
import {
  File, FileArchive, FileAudio, FileCode, FileImage,
  FileSpreadsheet, FileText, FileType2, FileVideo
} from 'lucide-react';

/* ------------------------------ type helpers ------------------------------ */

/** File kind → icon + soft chip tones (same palette as the module). */
export const TYPE_TONES = {
  pdf:          { Icon: FileText,        bg: '#FEF2F2', color: '#DC2626' },
  image:        { Icon: FileImage,       bg: '#EFF6FF', color: '#2563EB' },
  excel:        { Icon: FileSpreadsheet, bg: '#F0FDF4', color: '#16A34A' },
  word:         { Icon: FileType2,       bg: '#EEF2FF', color: '#4F46E5' },
  zip:          { Icon: FileArchive,     bg: '#FFFBEB', color: '#D97706' },
  audio:        { Icon: FileAudio,       bg: '#FDF2F8', color: '#DB2777' },
  video:        { Icon: FileVideo,       bg: '#F5F3FF', color: '#7C3AED' },
  presentation: { Icon: FileCode,        bg: '#FFF7ED', color: '#EA580C' },
  text:         { Icon: FileCode,        bg: '#F1F5F9', color: '#475569' },
  other:        { Icon: File,            bg: '#F1F5F9', color: '#64748B' }
};

/** Extension → short uppercase type label shown in meta rows. */
export const EXT_LABELS = {
  pdf: 'PDF',
  png: 'PNG', jpg: 'JPG', jpeg: 'JPEG', webp: 'WEBP', gif: 'GIF', svg: 'SVG', bmp: 'BMP',
  xls: 'XLS', xlsx: 'XLSX', csv: 'CSV',
  doc: 'DOC', docx: 'DOCX', rtf: 'RTF', txt: 'TXT', md: 'MD', log: 'LOG',
  zip: 'ZIP', rar: 'RAR', '7z': '7Z', tar: 'TAR', gz: 'GZ',
  ppt: 'PPT', pptx: 'PPTX',
  json: 'JSON', xml: 'XML',
  mp4: 'MP4', webm: 'WEBM', mov: 'MOV', avi: 'AVI', mkv: 'MKV', m4v: 'M4V',
  mp3: 'MP3', wav: 'WAV', ogg: 'OGG', m4a: 'M4A', flac: 'FLAC', aac: 'AAC'
};

/** Kind fallback label when the extension is unknown / missing. */
export const KIND_LABELS = {
  pdf: 'PDF', image: 'Image', excel: 'Excel', word: 'Word', zip: 'Archive',
  audio: 'Audio', video: 'Video', presentation: 'Presentation',
  text: 'Text', other: 'File'
};

/** Human-readable file type from name extension / MIME kind. */
export function fileTypeLabel(name = '', kind = 'other') {
  const ext = String(name || '').split('.').pop()?.toLowerCase();
  if (ext && EXT_LABELS[ext]) return EXT_LABELS[ext];
  return KIND_LABELS[kind] || 'File';
}

/** Human-readable file size. */
export function formatSize(bytes = 0) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Classify a file into a preview/icon kind — MIME type first, then
 * extension as fallback (e.g. a .txt served as application/octet-stream
 * still resolves to text via its extension).
 */
export function detectType(name = '', type = '') {
  const n = String(name || '').toLowerCase();
  const t = String(type || '').toLowerCase();
  const ext = n.includes('.') ? n.split('.').pop() : '';
  /* MIME first */
  if (t.startsWith('image/')) return 'image';
  if (t === 'application/pdf') return 'pdf';
  if (t.startsWith('video/')) return 'video';
  if (t.startsWith('audio/')) return 'audio';
  if (t.includes('presentation')) return 'presentation';
  if (t.includes('spreadsheet') || t.includes('excel')) return 'excel';
  if (t.includes('word') || t.includes('officedocument.wordprocessing')) return 'word';
  if (t.includes('zip') || t.includes('compressed') || t.includes('archive')) return 'zip';
  if (t.startsWith('text/') || t.includes('json') || t.includes('xml') || t.includes('csv')) return 'text';
  /* extension fallback */
  if (ext === 'pdf') return 'pdf';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac'].includes(ext)) return 'audio';
  if (['ppt', 'pptx'].includes(ext)) return 'presentation';
  if (['xls', 'xlsx'].includes(ext)) return 'excel';
  if (['doc', 'docx', 'rtf'].includes(ext)) return 'word';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'zip';
  if (['txt', 'md', 'log', 'json', 'xml', 'csv'].includes(ext)) return 'text';
  return 'other';
}

/** True when the browser can render this file kind inline. */
export function canPreview(kind) {
  return ['pdf', 'image', 'text', 'video', 'audio'].includes(kind);
}

/** Attachments may be objects or legacy plain strings. */
export function normalizeAttachment(attachment) {
  if (!attachment) return null;
  return typeof attachment === 'string' ? { name: attachment } : attachment;
}

/** Resolves the renderable/downloadable URL for an attachment record. */
export function resolveUrl(att) {
  if (!att) return '';
  return att.dataUrl || att.downloadUrl || att.fileUrl || att.storagePath || '';
}

/** True when the attachment record carries any file content reference. */
export function hasContent(att) {
  return Boolean(att && resolveUrl(att));
}

/**
 * Downloads an attachment. Returns true on success, false when there is
 * no content reference (or it cannot be fetched) so callers can surface
 * a graceful "file unavailable" message instead of failing silently.
 */
export async function downloadAttachment(att) {
  const href = resolveUrl(att);
  if (!href) return false;
  try {
    /* For URL-based attachments, verify the file actually exists before
       clicking, so a moved/deleted file shows feedback rather than a
       silent failed download or an empty tab. */
    if (!href.startsWith('data:')) {
      const response = await fetch(href, { method: 'GET', cache: 'no-store' });
      if (!response.ok) return false;
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = att.name || 'attachment';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
      return true;
    }
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = att.name || 'attachment';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return true;
  } catch {
    return false;
  }
}