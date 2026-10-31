import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_SIZE,
  getAttachmentSelectionError,
  getAttachmentTypeError
} from './attachmentStorage';

const file = (name, size = 1024) => ({ name, size });

describe('getAttachmentSelectionError — one policy for every picker', () => {
  it('rejects an unsupported type such as .exe', () => {
    const err = getAttachmentSelectionError(file('setup.exe'));
    expect(err?.name).toBe('AttachmentTypeError');
    expect(err?.message).toMatch(/\.exe/);
  });

  it('rejects an empty file', () => {
    const err = getAttachmentSelectionError(file('scan.pdf', 0));
    expect(err?.name).toBe('AttachmentEmptyFileError');
  });

  it('accepts every allow-listed extension', () => {
    ALLOWED_ATTACHMENT_EXTENSIONS.forEach((ext) => {
      expect(getAttachmentSelectionError(file(`doc.${ext}`))).toBeNull();
    });
  });

  it('rejects a file bigger than the shared per-file limit', () => {
    const err = getAttachmentSelectionError(file('drawing.step', MAX_ATTACHMENT_SIZE + 1));
    expect(err?.name).toBe('AttachmentSizeLimitError');
    expect(err?.message).toMatch(/2 GB/);
  });

  it('reports the type before the size, like the server', () => {
    const oversizedExe = file('setup.exe', MAX_ATTACHMENT_SIZE + 1);
    expect(getAttachmentTypeError(oversizedExe)).not.toBeNull();
    expect(getAttachmentSelectionError(oversizedExe)?.name).toBe('AttachmentTypeError');
  });
});

/**
 * Regression: every file picker that stages attachments must run the shared
 * selection policy. Pickers that only checked the size staged an `.exe` and the
 * rejection only surfaced after the parent document had already been created.
 */
describe('attachment pickers use the shared selection policy', () => {
  const SRC = join(import.meta.dirname, '..');
  // Components that stay on getAttachmentTypeError + getAttachmentSizeError are
  // the two that already enforced both checks explicitly.
  // attachmentStorage.js defines the checks; the other two already ran both.
  const EXPLICIT_CHECKERS = new Set([
    'attachmentStorage.js',
    'PendingAttachments.jsx',
    'SalesAttachments.jsx'
  ]);

  const walk = (dir) =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return walk(path);
      return /\.(jsx?|tsx?)$/.test(name) ? [path] : [];
    });

  it('never checks only the size before staging a file', () => {
    const offenders = walk(SRC)
      .filter((path) => !path.endsWith('.test.js'))
      .filter((path) => {
        const base = path.split(/[\\/]/).pop();
        if (EXPLICIT_CHECKERS.has(base)) return false;
        return /getAttachmentSizeError\(/.test(readFileSync(path, 'utf8'));
      })
      .map((path) => path.slice(SRC.length + 1));

    expect(offenders).toEqual([]);
  });

  it('keeps the type check ahead of the size check for explicit checkers', () => {
    ['components/SalesForm/PendingAttachments.jsx', 'components/SalesDetail/SalesAttachments.jsx'].forEach((rel) => {
      const source = readFileSync(join(SRC, rel), 'utf8');
      const typeAt = source.indexOf('getAttachmentTypeError(file)');
      const sizeAt = source.indexOf('getAttachmentSizeError(file)');
      expect(typeAt, `${rel} must check the type`).toBeGreaterThan(-1);
      expect(sizeAt, `${rel} must check the size`).toBeGreaterThan(typeAt);
    });
  });
});
