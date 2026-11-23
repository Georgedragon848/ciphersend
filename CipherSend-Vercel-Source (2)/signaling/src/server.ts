import { createServer } from 'node:http';
import { URL } from 'node:url';
import { WebSocket, WebSocketServer, type RawData } from 'ws';

const PORT = Number(process.env.PORT || 8787);
const PATH = '/ws';
const MAX_ROOMS = 250;
const MAX_SIGNAL_BYTES = 64 * 1024;
const MAX_MESSAGES_PER_MINUTE = 180;
const IDLE_TTL_MS = 10 * 60 * 1000;
const MAX_SESSION_AGE_MS = 60 * 60 * 1000;
const ROOM_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/u;

type Role = 'sender' | 'receiver';
type Client = { socket: WebSocket; role: Role; messageTimes: number[] };
type Room = { id: string; createdAt: number; sender: Client; receiver?: Client; idleTimer: NodeJS.Timeout };
const rooms = new Map<string, Room>();
const socketRooms = new WeakMap<WebSocket, Room>();
const allowedOrigins = new Set((process.env.CIPHERSEND_ALLOWED_ORIGINS || '').split(',').map((value) => value.trim()).filter(Boolean));
if (process.env.NODE_ENV !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

function originAllowed(origin: string): boolean {
  if (allowedOrigins.has(origin)) return true;
  if (process.env.NODE_ENV === 'production') return false;
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:' && /^\d+-[a-z0-9-]+\.sg2\.manus\.computer$/iu.test(parsed.hostname);
  } catch {
    return false;
  }
}

function send(socket: WebSocket, message: Record<string, unknown>): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function resetIdleExpiry(room: Room): void {
  clearTimeout(room.idleTimer);
  const age = Date.now() - room.createdAt;
  const delay = Math.max(0, Math.min(IDLE_TTL_MS, MAX_SESSION_AGE_MS - age));
  room.idleTimer = setTimeout(() => removeRoom(room, 'session_expired'), delay);
  room.idleTimer.unref();
}

function removeRoom(room: Room, reason: string, except?: WebSocket): void {
  if (rooms.get(room.id) !== room) return;
  rooms.delete(room.id);
  clearTimeout(room.idleTimer);
  const clients = [room.sender, room.receiver].filter((item): item is Client => Boolean(item));
  for (const client of clients) {
    socketRooms.delete(client.socket);
    if (client.socket !== except) {
      send(client.socket, { type: 'error', code: reason, message: reason === 'session_expired' ? 'This transfer session expired. Start a new transfer.' : 'The other participant disconnected.' });
      if (client.socket.readyState < WebSocket.CLOSING) client.socket.close(1000, reason);
    }
  }
}

function reject(socket: WebSocket, code: string, message: string): void {
  send(socket, { type: 'error', code, message });
  socket.close(1008, code);
}

function rawText(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function withinMessageRate(client: Client): boolean {
  const now = Date.now();
  client.messageTimes = client.messageTimes.filter((time) => now - time < 60_000);
  if (client.messageTimes.length >= MAX_MESSAGES_PER_MINUTE) return false;
  client.messageTimes.push(now);
  return true;
}

function forward(room: Room, from: Client, message: Record<string, unknown>): void {
  const target = from.role === 'sender' ? room.receiver : room.sender;
  if (!target || target.socket.readyState !== WebSocket.OPEN) {
    reject(from.socket, 'peer_unavailable', 'The other participant is not connected.');
    return;
  }
  resetIdleExpiry(room);
  send(target.socket, message);
}

const httpServer = createServer((request, response) => {
  const path = new URL(request.url || '/', 'http://localhost').pathname;
  if (path === '/healthz' && request.method === 'GET') {
    response.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
    response.end('ok');
    return;
  }
  response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' });
  response.end('not found');
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: MAX_SIGNAL_BYTES, perMessageDeflate: false });
httpServer.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url || '/', 'http://localhost');
  const origin = request.headers.origin;
  if (url.pathname !== PATH || !origin || !originAllowed(origin)) {
    socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, (ws) => webSocketServer.emit('connection', ws, request));
});

webSocketServer.on('connection', (socket) => {
  let client: Client | undefined;
  socket.on('message', (raw) => {
    const rawLength = Array.isArray(raw) ? Buffer.concat(raw).byteLength : raw instanceof ArrayBuffer ? raw.byteLength : raw.byteLength;
    if (rawLength > MAX_SIGNAL_BYTES) {
      const room = socketRooms.get(socket);
      if (room) removeRoom(room, 'message_too_large', socket);
      else reject(socket, 'message_too_large', 'Signaling message is too large.');
      return;
    }
    let message: unknown;
    try { message = JSON.parse(rawText(raw)) as unknown; } catch { reject(socket, 'invalid_json', 'Invalid signaling message.'); return; }
    if (!isRecord(message) || typeof message.type !== 'string') { reject(socket, 'invalid_message', 'Invalid signaling message.'); return; }

    if (!client) {
      if (typeof message.roomId !== 'string' || !ROOM_ID_PATTERN.test(message.roomId)) { reject(socket, 'invalid_room_id', 'The transfer code is not valid.'); return; }
      const roomId = message.roomId;
      if (message.type === 'create') {
        if (rooms.has(roomId)) { reject(socket, 'room_unavailable', 'That transfer session is unavailable. Create a new transfer code.'); return; }
        if (rooms.size >= MAX_ROOMS) { reject(socket, 'service_busy', 'The signaling service is busy. Please try again shortly.'); return; }
        const sender: Client = { socket, role: 'sender', messageTimes: [] };
        const room: Room = { id: roomId, createdAt: Date.now(), sender, idleTimer: setTimeout(() => undefined, IDLE_TTL_MS) };
        rooms.set(roomId, room);
        client = sender;
        socketRooms.set(socket, room);
        resetIdleExpiry(room);
        send(socket, { type: 'created' });
        return;
      }
      if (message.type === 'join') {
        const room = rooms.get(roomId);
        if (!room || Date.now() - room.createdAt > MAX_SESSION_AGE_MS) { reject(socket, 'sender_offline', 'The sender is offline or this transfer code has expired.'); return; }
        if (room.receiver) { reject(socket, 'room_full', 'This transfer already has a receiver.'); return; }
        const receiver: Client = { socket, role: 'receiver', messageTimes: [] };
        room.receiver = receiver;
        client = receiver;
        socketRooms.set(socket, room);
        resetIdleExpiry(room);
        send(socket, { type: 'joined' });
        send(room.sender.socket, { type: 'peer-joined' });
        return;
      }
      reject(socket, 'must_join_room', 'Start or join a transfer session first.');
      return;
    }

    const room = socketRooms.get(socket);
    if (!room || rooms.get(room.id) !== room) { reject(socket, 'session_expired', 'This transfer session has expired.'); return; }
    if (!withinMessageRate(client)) { removeRoom(room, 'rate_limited', socket); return; }

    if (message.type === 'offer' || message.type === 'answer') {
      const expectedRole = message.type === 'offer' ? 'sender' : 'receiver';
      const sdp = isRecord(message.sdp) ? message.sdp : null;
      if (client.role !== expectedRole || !sdp || sdp.type !== message.type || typeof sdp.sdp !== 'string' || sdp.sdp.length > MAX_SIGNAL_BYTES / 2) {
        reject(socket, 'invalid_description', 'Invalid WebRTC description.');
        return;
      }
      forward(room, client, { type: message.type, sdp: { type: sdp.type, sdp: sdp.sdp } });
      return;
    }

    if (message.type === 'candidate') {
      const candidate = isRecord(message.candidate) ? message.candidate : null;
      if (!candidate || (candidate.candidate !== null && typeof candidate.candidate !== 'string') || (typeof candidate.candidate === 'string' && candidate.candidate.length > 4096)) {
        reject(socket, 'invalid_candidate', 'Invalid ICE candidate.');
        return;
      }
      forward(room, client, { type: 'candidate', candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex, usernameFragment: candidate.usernameFragment } });
      return;
    }

    reject(socket, 'invalid_message', 'Only WebRTC offers, answers, and ICE candidates are accepted after joining.');
  });

  socket.on('close', () => { const room = socketRooms.get(socket); if (room) removeRoom(room, 'peer_disconnected', socket); });
  socket.on('error', () => { const room = socketRooms.get(socket); if (room) removeRoom(room, 'peer_disconnected', socket); });
});

const heartbeat = setInterval(() => {
  for (const socket of webSocketServer.clients) if (socket.readyState === WebSocket.OPEN) socket.ping();
}, 25_000);
heartbeat.unref();

httpServer.listen(PORT, '0.0.0.0', () => {
  // Deliberately omit room IDs, candidates, IPs, and transfer data from logs.
  console.log(`CipherSend signaling service listening on port ${PORT}`);
});

function shutdown(): void {
  clearInterval(heartbeat);
  for (const room of rooms.values()) removeRoom(room, 'service_restarting');
  webSocketServer.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 25_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
