import { chunkAdditionalData, decodeBase64Url, decryptBytes, metadataAdditionalData } from '@/lib/crypto/aes-gcm';
import { isControlMessage, readChunkPacket, type EncryptedMetadata, type MetadataMessage } from '@/lib/transfer/protocol';

export type SaveHandle = { getFile(): Promise<File> };
export type SaveWriter = { write(data: BufferSource): Promise<void>; close(): Promise<void>; abort?(): Promise<void> };
export type SaveTarget = { handle?: SaveHandle; writer?: SaveWriter };
export type ReceiveResult = { metadata: EncryptedMetadata; blob?: Blob; handle?: SaveHandle };
type PickerWindow = Window & { showSaveFilePicker?: (options?: { suggestedName?: string }) => Promise<SaveHandle & { createWritable(): Promise<SaveWriter> }> };

/** Invoke from a user click before connecting so the browser picker retains user activation. */
export async function chooseSaveTarget(): Promise<SaveTarget> {
  const pickerWindow = window as PickerWindow;
  const picker = pickerWindow.showSaveFilePicker;
  if (!picker) return {};
  try {
    const handle = await pickerWindow.showSaveFilePicker!({ suggestedName: 'ciphersend-file' });
    const writer = await (handle as SaveHandle & { createWritable(): Promise<SaveWriter> }).createWritable();
    return { handle, writer };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return {};
    return {};
  }
}

function validateMetadata(value: unknown): EncryptedMetadata {
  if (!value || typeof value !== 'object') throw new Error('The received file information is invalid.');
  const data = value as Partial<EncryptedMetadata>;
  if (typeof data.name !== 'string' || data.name.length < 1 || data.name.length > 255 || typeof data.mimeType !== 'string' || data.mimeType.length > 255 || !Number.isSafeInteger(data.size) || (data.size ?? -1) < 0 || !Number.isInteger(data.chunks) || (data.chunks ?? -1) < 0 || data.chunks! > 0xffffffff || data.chunkBytes !== 48 * 1024 || data.chunks !== Math.ceil((data.size ?? -1) / data.chunkBytes)) {
    throw new Error('The received file information is invalid.');
  }
  return data as EncryptedMetadata;
}

export function receiveEncryptedFile(channel: RTCDataChannel, key: CryptoKey, roomId: string, target: SaveTarget, onMetadata: (metadata: EncryptedMetadata) => void, onProgress: (fraction: number) => void): Promise<ReceiveResult> {
  channel.binaryType = 'arraybuffer';
  return new Promise((resolve, reject) => {
    let metadata: EncryptedMetadata | undefined;
    let nextIndex = 0;
    let receivedBytes = 0;
    const parts: BlobPart[] = [];
    let queue = Promise.resolve();
    let settled = false;

    const fail = async (error: Error) => {
      if (settled) return;
      settled = true;
      try { await target.writer?.abort?.(); } catch { /* best-effort cleanup of a partial local file */ }
      reject(error);
    };

    const process = async (data: string | ArrayBuffer | Blob) => {
      if (typeof data === 'string') {
        if (!isControlMessage(data)) throw new Error('Received an unrecognized transfer message.');
        const message = JSON.parse(data) as MetadataMessage | { type: 'done' } | { type: 'transfer-error'; message: string };
        if (message.type === 'transfer-error') throw new Error(message.message || 'The sender stopped the transfer.');
        if (message.type === 'metadata') {
          if (metadata) throw new Error('Duplicate file information received.');
          const plaintext = await decryptBytes(key, decodeBase64Url(message.iv), decodeBase64Url(message.ciphertext), metadataAdditionalData(roomId));
          metadata = validateMetadata(JSON.parse(new TextDecoder().decode(plaintext)) as unknown);
          onMetadata(metadata);
          if (metadata.chunks === 0 && metadata.size === 0) onProgress(1);
          return;
        }
        if (message.type === 'done') {
          if (!metadata || nextIndex !== metadata.chunks || receivedBytes !== metadata.size) throw new Error('The transfer ended before all file chunks arrived.');
          await target.writer?.close();
          if (channel.readyState !== 'open') throw new Error('The peer connection closed before the receiver could confirm the file.');
          channel.send(JSON.stringify({ type: 'received' }));
          settled = true;
          resolve({ metadata, blob: target.writer ? undefined : new Blob(parts, { type: metadata.mimeType }), handle: target.handle });
        }
        return;
      }

      if (!metadata) throw new Error('File data arrived before its encrypted file information.');
      const buffer = data instanceof Blob ? await data.arrayBuffer() : data;
      const packet = readChunkPacket(buffer);
      if (packet.index !== nextIndex || packet.index >= metadata.chunks) throw new Error('The encrypted file chunks arrived out of order.');
      const plaintext = await decryptBytes(key, packet.iv, packet.ciphertext, chunkAdditionalData(roomId, packet.index));
      const bytes = new Uint8Array(plaintext);
      if (target.writer) await target.writer.write(bytes);
      else parts.push(bytes);
      receivedBytes += bytes.byteLength;
      nextIndex += 1;
      if (receivedBytes > metadata.size) throw new Error('The received file is larger than its declared size.');
      onProgress(metadata.size === 0 ? 1 : Math.min(1, receivedBytes / metadata.size));
    };

    channel.onmessage = (event) => {
      queue = queue.then(() => process(event.data as string | ArrayBuffer | Blob)).catch((error: unknown) => fail(error instanceof Error ? error : new Error('Could not decrypt the file.')));
    };
    channel.onerror = () => { void fail(new Error('The peer connection failed while receiving the file.')); };
    channel.onclose = () => { if (!settled) void fail(new Error('The sender disconnected before the file was complete.')); };
  });
}
