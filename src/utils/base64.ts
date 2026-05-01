/**
 * Base64 helpers — Node.js (Buffer) with browser fallback (btoa/atob).
 */

const hasBuffer = typeof Buffer !== 'undefined';

/**
 * Encodes a UTF-8 string or raw bytes to a base64 string.
 */
export function toBase64(input: string | Uint8Array): string {
  if (typeof input === 'string') {
    if (hasBuffer) return Buffer.from(input, 'utf-8').toString('base64');
    const utf8 = new TextEncoder().encode(input);
    return uint8ArrayToBase64Browser(utf8);
  }
  if (hasBuffer) return Buffer.from(input).toString('base64');
  return uint8ArrayToBase64Browser(input);
}

/**
 * Decodes a base64 string to a Uint8Array.
 */
export function fromBase64ToUint8Array(b64: string): Uint8Array {
  if (hasBuffer) return new Uint8Array(Buffer.from(b64, 'base64'));
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Decodes a base64 string interpreted as UTF-8 text.
 */
export function fromBase64ToUtf8(b64: string): string {
  if (hasBuffer) return Buffer.from(b64, 'base64').toString('utf-8');
  return new TextDecoder('utf-8').decode(fromBase64ToUint8Array(b64));
}

function uint8ArrayToBase64Browser(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
