import {
  toBase64,
  fromBase64ToUint8Array,
  fromBase64ToUtf8,
} from '../../src/utils/base64';

describe('base64 helpers', () => {
  it('round-trips ASCII strings via UTF-8', () => {
    const b64 = toBase64('hello');
    expect(b64).toBe('aGVsbG8=');
    expect(fromBase64ToUtf8(b64)).toBe('hello');
  });

  it('round-trips non-ASCII UTF-8 strings losslessly', () => {
    const original = 'hello — 🚀';
    const b64 = toBase64(original);
    expect(fromBase64ToUtf8(b64)).toBe(original);
  });

  it('round-trips Uint8Array bytes losslessly', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef, 0x00, 0xff, 0x80]);
    const b64 = toBase64(bytes);
    const out = fromBase64ToUint8Array(b64);
    expect(out).toEqual(bytes);
  });

  it('encodes empty inputs to empty base64', () => {
    expect(toBase64('')).toBe('');
    expect(toBase64(new Uint8Array())).toBe('');
    expect(fromBase64ToUtf8('')).toBe('');
    expect(fromBase64ToUint8Array('')).toEqual(new Uint8Array());
  });
});
