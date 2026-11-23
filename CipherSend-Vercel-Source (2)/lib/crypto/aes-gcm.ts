const IV_PREFIX_BYTES = 4;
const IV_BYTES = 12;
const TAG_BITS = 128;
const encoder = new TextEncoder();
type OwnedBytes = Uint8Array<ArrayBuffer>;

function ownedBytes(length: number): OwnedBytes { return new Uint8Array(new ArrayBuffer(length)); }

function asArrayBuffer(value: ArrayBuffer | ArrayBufferView<ArrayBufferLike>): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  if (!(value.buffer instanceof ArrayBuffer)) throw new Error('A detached or shared buffer cannot be used for encryption.');
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}

/** A transfer-local nonce sequence: random prefix plus a monotonic 64-bit counter. */
export class IvSequence {
  private readonly prefix: OwnedBytes = ownedBytes(IV_PREFIX_BYTES);
  private counter = 0n;
  constructor() { crypto.getRandomValues(this.prefix); }
  next(): OwnedBytes {
    if (this.counter > 0xffffffffffffffffn) throw new Error('Transfer contains too many encrypted chunks.');
    const iv = ownedBytes(IV_BYTES);
    iv.set(this.prefix, 0);
    new DataView(iv.buffer).setBigUint64(IV_PREFIX_BYTES, this.counter, false);
    this.counter += 1n;
    return iv;
  }
}

export function chunkAdditionalData(roomId: string, index: number): ArrayBuffer { return encoder.encode(`ciphersend:v1:${roomId}:chunk:${index}`).buffer as ArrayBuffer; }
export function metadataAdditionalData(roomId: string): ArrayBuffer { return encoder.encode(`ciphersend:v1:${roomId}:metadata`).buffer as ArrayBuffer; }

export async function encryptBytes(key: CryptoKey, iv: Uint8Array<ArrayBufferLike>, plaintext: ArrayBuffer | ArrayBufferView<ArrayBufferLike>, additionalData: ArrayBuffer | ArrayBufferView<ArrayBufferLike>): Promise<ArrayBuffer> {
  return crypto.subtle.encrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: asArrayBuffer(additionalData), tagLength: TAG_BITS }, key, asArrayBuffer(plaintext));
}

export async function decryptBytes(key: CryptoKey, iv: Uint8Array<ArrayBufferLike>, ciphertext: ArrayBuffer | ArrayBufferView<ArrayBufferLike>, additionalData: ArrayBuffer | ArrayBufferView<ArrayBufferLike>): Promise<ArrayBuffer> {
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: asArrayBuffer(iv), additionalData: asArrayBuffer(additionalData), tagLength: TAG_BITS }, key, asArrayBuffer(ciphertext));
}

export function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const binary = atob(normalized + '='.repeat((4 - (normalized.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
