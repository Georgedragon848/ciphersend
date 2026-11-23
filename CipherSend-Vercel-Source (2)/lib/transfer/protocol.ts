export const DATA_CHANNEL_LABEL = 'ciphersend-transfer-v1';
export const CHUNK_BYTES = 48 * 1024;
export const PACKET_HEADER_BYTES = 4 + 12;
export const DATA_CHANNEL_HIGH_WATER = 1024 * 1024;
export const DATA_CHANNEL_LOW_WATER = 256 * 1024;

export type EncryptedMetadata = {
  name: string;
  mimeType: string;
  size: number;
  chunks: number;
  chunkBytes: number;
};

export type MetadataMessage = {
  type: 'metadata';
  iv: string;
  ciphertext: string;
};

export type DoneMessage = { type: 'done' };
export type ReceivedMessage = { type: 'received' };
export type ErrorMessage = { type: 'transfer-error'; message: string };
export type ControlMessage = MetadataMessage | DoneMessage | ReceivedMessage | ErrorMessage;

export function makeChunkPacket(index: number, iv: Uint8Array, ciphertext: ArrayBuffer): ArrayBuffer {
  if (index < 0 || index > 0xffffffff) throw new Error('Chunk index is outside the supported range.');
  const packet = new Uint8Array(PACKET_HEADER_BYTES + ciphertext.byteLength);
  new DataView(packet.buffer).setUint32(0, index, false);
  packet.set(iv, 4);
  packet.set(new Uint8Array(ciphertext), PACKET_HEADER_BYTES);
  return packet.buffer;
}

export function readChunkPacket(packet: ArrayBuffer): { index: number; iv: Uint8Array; ciphertext: Uint8Array } {
  if (packet.byteLength <= PACKET_HEADER_BYTES) throw new Error('Received an incomplete encrypted chunk.');
  const view = new DataView(packet);
  return {
    index: view.getUint32(0, false),
    iv: new Uint8Array(packet.slice(4, 16)),
    ciphertext: new Uint8Array(packet.slice(PACKET_HEADER_BYTES))
  };
}

export function isControlMessage(value: unknown): value is ControlMessage {
  if (typeof value !== 'string') return false;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) return false;
    const type = (parsed as { type: unknown }).type;
    if (type === 'done') return true;
    if (type === 'received') return true;
    if (type === 'transfer-error') return typeof (parsed as ErrorMessage).message === 'string';
    return type === 'metadata' && typeof (parsed as MetadataMessage).iv === 'string' && typeof (parsed as MetadataMessage).ciphertext === 'string';
  } catch {
    return false;
  }
}
