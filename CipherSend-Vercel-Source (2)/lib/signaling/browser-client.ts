export type SignalMessage =
  | { type: 'created' | 'joined' | 'peer-joined' }
  | { type: 'offer' | 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit }
  | { type: 'error'; code: string; message: string };

export function signalingUrl(): string {
  const previewHost = window.location.hostname.match(/^\d+-(.+)$/u)?.[1];
  if (window.location.protocol === 'https:' && previewHost?.endsWith('.sg2.manus.computer')) {
    return `wss://8787-${previewHost}/ws`;
  }
  const configured = process.env.NEXT_PUBLIC_SIGNALING_URL?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === 'development') {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'ws://localhost:8787/ws';
  }
  throw new Error('The signaling service is not configured. Set NEXT_PUBLIC_SIGNALING_URL and redeploy the frontend.');
}

export function openSignal(roomId: string, role: 'create' | 'join', onMessage: (message: SignalMessage) => void, onClose: () => void): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = new WebSocket(signalingUrl());
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.close();
      reject(new Error('The signaling service did not respond. Please try again.'));
    }, 10000);

    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: role, roomId }));
    }, { once: true });

    socket.addEventListener('message', (event) => {
      let message: SignalMessage;
      try {
        message = JSON.parse(String(event.data)) as SignalMessage;
      } catch {
        return;
      }
      if (!settled && (message.type === 'created' || message.type === 'joined')) {
        settled = true;
        window.clearTimeout(timeout);
        resolve(socket);
      }
      onMessage(message);
    });

    socket.addEventListener('error', () => {
      if (!settled) {
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error('Could not reach the signaling service. Check your connection and try again.'));
      }
    });

    socket.addEventListener('close', () => {
      window.clearTimeout(timeout);
      if (!settled) {
        settled = true;
        reject(new Error('The signaling service closed before the session was ready.'));
      } else onClose();
    });
  });
}

export function sendSignal(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState !== WebSocket.OPEN) throw new Error('The signaling connection has closed.');
  socket.send(JSON.stringify(message));
}

export function closeSignal(socket?: WebSocket | null): void {
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close(1000, 'transfer-finished');
}
