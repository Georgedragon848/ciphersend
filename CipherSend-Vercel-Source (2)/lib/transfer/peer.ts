import { DATA_CHANNEL_LABEL } from '@/lib/transfer/protocol';

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({
    iceServers: [
      { urls: ['stun:stun.l.google.com:19302'] },
      { urls: ['stun:stun1.l.google.com:19302'] }
    ],
    bundlePolicy: 'max-bundle'
  });
}

export function createTransferChannel(peer: RTCPeerConnection): RTCDataChannel {
  const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
  channel.binaryType = 'arraybuffer';
  channel.bufferedAmountLowThreshold = 256 * 1024;
  return channel;
}
