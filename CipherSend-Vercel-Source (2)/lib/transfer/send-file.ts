import { chunkAdditionalData, encryptBytes, IvSequence, metadataAdditionalData, encodeBase64Url } from '@/lib/crypto/aes-gcm';
import { CHUNK_BYTES, DATA_CHANNEL_HIGH_WATER, DATA_CHANNEL_LOW_WATER, makeChunkPacket, type EncryptedMetadata } from '@/lib/transfer/protocol';

function waitForBufferedAmount(channel: RTCDataChannel): Promise<void> {
  if (channel.readyState !== 'open') return Promise.reject(new Error('The peer connection closed during transfer.'));
  if (channel.bufferedAmount <= DATA_CHANNEL_HIGH_WATER) return Promise.resolve();
  channel.bufferedAmountLowThreshold = DATA_CHANNEL_LOW_WATER;

  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      channel.removeEventListener('bufferedamountlow', onLow);
      channel.removeEventListener('close', onClose);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const onLow = () => {
      if (channel.bufferedAmount <= DATA_CHANNEL_HIGH_WATER) finish();
    };
    const onClose = () => finish(new Error('The peer connection closed during transfer.'));

    channel.addEventListener('bufferedamountlow', onLow);
    channel.addEventListener('close', onClose, { once: true });
    // Re-check after listener registration so a threshold event cannot be missed.
    if (channel.readyState !== 'open') onClose();
    else if (channel.bufferedAmount <= DATA_CHANNEL_HIGH_WATER) finish();
  });
}

function waitForReceiverReceipt(channel: RTCDataChannel): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      channel.removeEventListener('message', onMessage);
      channel.removeEventListener('close', onClose);
    };
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      error ? reject(error) : resolve();
    };
    const onMessage = (event: MessageEvent) => {
      if (typeof event.data !== 'string') return;
      try {
        const message: unknown = JSON.parse(event.data);
        if (message && typeof message === 'object' && 'type' in message && message.type === 'received') finish();
      } catch { /* Ignore unrelated peer messages. */ }
    };
    const onClose = () => finish(new Error('The peer disconnected before confirming the received file.'));

    channel.addEventListener('message', onMessage);
    channel.addEventListener('close', onClose, { once: true });
    if (channel.readyState !== 'open') onClose();
  });
}

export async function sendEncryptedFile(file: File, key: CryptoKey, roomId: string, channel: RTCDataChannel, onProgress: (fraction: number) => void): Promise<void> {
  if (channel.readyState !== 'open') throw new Error('The peer connection is not ready.');
  if (file.name.length < 1 || file.name.length > 255 || file.type.length > 255) throw new Error('The file name or content type is too long to transfer safely.');
  const chunks = Math.ceil(file.size / CHUNK_BYTES);
  if (chunks > 0xffffffff) throw new Error('This file is too large for the transfer protocol.');
  const metadata: EncryptedMetadata = { name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, chunks, chunkBytes: CHUNK_BYTES };
  const sequence = new IvSequence();
  const metadataIv = sequence.next();
  const metadataCiphertext = await encryptBytes(key, metadataIv, new TextEncoder().encode(JSON.stringify(metadata)), metadataAdditionalData(roomId));
  await waitForBufferedAmount(channel);
  channel.send(JSON.stringify({ type: 'metadata', iv: encodeBase64Url(metadataIv), ciphertext: encodeBase64Url(new Uint8Array(metadataCiphertext)) }));

  for (let index = 0; index < chunks; index += 1) {
    if (channel.readyState !== 'open') throw new Error('The peer connection closed during transfer.');
    await waitForBufferedAmount(channel);
    const start = index * CHUNK_BYTES;
    const plaintext = await file.slice(start, Math.min(start + CHUNK_BYTES, file.size)).arrayBuffer();
    const iv = sequence.next();
    const ciphertext = await encryptBytes(key, iv, plaintext, chunkAdditionalData(roomId, index));
    channel.send(makeChunkPacket(index, iv, ciphertext));
    onProgress(Math.min(1, (start + plaintext.byteLength) / Math.max(1, file.size)));
  }

  await waitForBufferedAmount(channel);
  const receipt = waitForReceiverReceipt(channel);
  // Consume a close/rejection event even if send() throws synchronously.
  void receipt.catch(() => undefined);
  channel.send(JSON.stringify({ type: 'done' }));
  onProgress(1);
  await receipt;
}
