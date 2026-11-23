const PUBLIC_ID_BYTES = 16;
const AES_KEY_BYTES = 32;

type OwnedBytes = Uint8Array<ArrayBuffer>;

function randomBytes(length: number): OwnedBytes {
  const bytes = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(bytes);
  return bytes;
}

function copyArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): OwnedBytes {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type TransferCode = { roomId: string; code: string; key: CryptoKey };

/** Generate a public rendezvous identifier and private AES key entirely in this browser. */
export async function createTransferCode(): Promise<TransferCode> {
  const roomBytes = randomBytes(PUBLIC_ID_BYTES);
  const keyBytes = randomBytes(AES_KEY_BYTES);
  const roomId = toBase64Url(roomBytes);
  const encodedKey = toBase64Url(keyBytes);
  const key = await crypto.subtle.importKey('raw', copyArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  keyBytes.fill(0);
  return { roomId, code: `${roomId}.${encodedKey}`, key };
}

export function hasValidTransferCodeShape(input: string): boolean {
  const parts = input.trim().replace(/\s/gu, '').split('.');
  return parts.length === 2 && /^[A-Za-z0-9_-]{22}$/u.test(parts[0]) && /^[A-Za-z0-9_-]{43}$/u.test(parts[1]);
}

/** Parse the full code locally; callers must send only roomId to signaling. */
export async function parseTransferCode(input: string): Promise<{ roomId: string; key: CryptoKey }> {
  const normalized = input.trim().replace(/\s/gu, '');
  const parts = normalized.split('.');
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]{22}$/u.test(parts[0]) || !/^[A-Za-z0-9_-]{43}$/u.test(parts[1])) {
    throw new Error('That transfer code is not valid. Check that you copied the complete code.');
  }
  try {
    const roomBytes = fromBase64Url(parts[0]);
    const keyBytes = fromBase64Url(parts[1]);
    if (roomBytes.byteLength !== PUBLIC_ID_BYTES || keyBytes.byteLength !== AES_KEY_BYTES) throw new Error('invalid length');
    const key = await crypto.subtle.importKey('raw', copyArrayBuffer(keyBytes), { name: 'AES-GCM' }, false, ['decrypt']);
    keyBytes.fill(0);
    return { roomId: parts[0], key };
  } catch {
    throw new Error('That transfer code is not valid. Check that you copied the complete code.');
  }
}

export function formatTransferCode(code: string): string {
  return code.replace('.', ' . ');
}
