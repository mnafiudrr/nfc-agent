/**
 * Normalize a card UID to uppercase hexadecimal without spaces or separators.
 *
 * The UID is always represented as a string, never as a JavaScript number.
 *
 * @param value Raw UID from the reader: a Buffer, an array of byte values,
 *              or a string containing hex (optionally with spaces/separators).
 * @returns Normalized UID, e.g. "047A218C916B80".
 */
export function normalizeUid(value: Buffer | Iterable<number> | string): string {
  let bytes: Iterable<number>;

  if (typeof value === 'string') {
    const compact = value.replace(/[^0-9a-fA-F]/g, '');
    const pairs = compact.match(/.{1,2}/g) ?? [];
    bytes = pairs.map((p) => parseInt(p, 16));
  } else if (Buffer.isBuffer(value)) {
    bytes = value;
  } else {
    bytes = value;
  }

  let out = '';
  for (const byte of bytes) {
    out += (byte & 0xff).toString(16).padStart(2, '0');
  }
  return out.toUpperCase();
}
