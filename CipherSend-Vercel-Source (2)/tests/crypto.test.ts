import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chunkAdditionalData, decryptBytes, encryptBytes, IvSequence } from '../lib/crypto/aes-gcm';
import { createTransferCode, formatTransferCode, hasValidTransferCodeShape, parseTransferCode } from '../lib/crypto/transfer-code';
import { makeChunkPacket, readChunkPacket } from '../lib/transfer/protocol';

const encoder = new TextEncoder();

test('transfer codes contain an independent random locator and a 256-bit non-extractable key', async () => {
  const first = await createTransferCode();
  const second = await createTransferCode();
  assert.match(first.roomId, /^[A-Za-z0-9_-]{22}$/u);
  assert.match(first.code, /^[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/u);
  assert.equal(first.key.extractable, false);
  assert.notEqual(first.code, second.code);
  assert.equal(hasValidTransferCodeShape(first.code), true);
  assert.equal(hasValidTransferCodeShape(`${first.code}.extra`), false);

  const parsed = await parseTransferCode(first.code.replace('.', ' \n. \n'));
  assert.equal(parsed.roomId, first.roomId);
  assert.equal(parsed.key.extractable, false);
});

test('human-readable transfer codes keep a parser-compatible delimiter', async () => {
  const transfer = await createTransferCode();
  const displayed = formatTransferCode(transfer.code);
  assert.equal(displayed, transfer.code.replace('.', ' . '));
  assert.equal(hasValidTransferCodeShape(displayed), true);
  assert.equal((await parseTransferCode(displayed)).roomId, transfer.roomId);
});

test('IV sequence is 96-bit, unique, and monotonically numbered within a transfer', () => {
  const sequence = new IvSequence();
  const values = Array.from({ length: 128 }, () => sequence.next());
  assert.ok(values.every((iv) => iv.byteLength === 12));
  assert.equal(new Set(values.map((iv) => Buffer.from(iv).toString('hex'))).size, values.length);
  assert.deepEqual(values[0].slice(0, 4), values[127].slice(0, 4));
  assert.equal(new DataView(values[0].buffer).getBigUint64(4, false), 0n);
  assert.equal(new DataView(values[127].buffer).getBigUint64(4, false), 127n);
});

test('AES-GCM decrypts the original bytes and rejects tampered ciphertext or context', async () => {
  const transfer = await createTransferCode();
  const room = transfer.roomId;
  const iv = new IvSequence().next();
  const aad = chunkAdditionalData(room, 3);
  const plaintext = encoder.encode('ciphertext stays unreadable until the right key and context are used');
  const ciphertext = await encryptBytes(transfer.key, iv, plaintext, aad);
  const recovered = await decryptBytes(transfer.key, iv, ciphertext, aad);
  assert.deepEqual(new Uint8Array(recovered), plaintext);

  const changed = new Uint8Array(ciphertext);
  changed[0] ^= 1;
  await assert.rejects(() => decryptBytes(transfer.key, iv, changed, aad));
  await assert.rejects(() => decryptBytes(transfer.key, iv, ciphertext, chunkAdditionalData(room, 4)));
});

test('chunk framing round-trips encrypted bytes without changing the authenticated chunk index', async () => {
  const transfer = await createTransferCode();
  const index = 7;
  const data = new Uint8Array(48 * 1024);
  crypto.getRandomValues(data);
  const iv = new IvSequence().next();
  const ciphertext = await encryptBytes(transfer.key, iv, data, chunkAdditionalData(transfer.roomId, index));
  const packet = makeChunkPacket(index, iv, ciphertext);
  const decoded = readChunkPacket(packet);
  assert.equal(decoded.index, index);
  const recovered = await decryptBytes(transfer.key, decoded.iv, decoded.ciphertext, chunkAdditionalData(transfer.roomId, decoded.index));
  assert.deepEqual(new Uint8Array(recovered), data);
});
