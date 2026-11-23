'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Download, FileLock2, LoaderCircle, LockKeyhole, Radio, ShieldCheck, X } from 'lucide-react';
import { hasValidTransferCodeShape, parseTransferCode } from '@/lib/crypto/transfer-code';
import { closeSignal, openSignal, sendSignal, type SignalMessage } from '@/lib/signaling/browser-client';
import { createPeerConnection } from '@/lib/transfer/peer';
import { chooseSaveTarget, receiveEncryptedFile, type ReceiveResult, type SaveTarget } from '@/lib/transfer/receive-file';
import type { EncryptedMetadata } from '@/lib/transfer/protocol';

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB`; }

export function ReceiverTransfer() {
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const targetRef = useRef<SaveTarget>({});
  const completedRef = useRef(false);
  const activeRef = useRef(false);
  const failedRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'waiting' | 'receiving' | 'complete' | 'error'>('idle');
  const [progress, setProgress] = useState(0);
  const [metadata, setMetadata] = useState<EncryptedMetadata | null>(null);
  const [result, setResult] = useState<ReceiveResult | null>(null);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);

  function cleanup() {
    activeRef.current = false;
    closeSignal(socketRef.current); socketRef.current = null;
    peerRef.current?.close(); peerRef.current = null;
    if (!completedRef.current) {
      void targetRef.current.writer?.abort?.().catch(() => undefined);
      targetRef.current = {};
    }
  }

  useEffect(() => () => cleanup(), []);

  async function connect() {
    if (connecting || status === 'connecting' || status === 'waiting' || status === 'receiving') return;
    setError(''); setMetadata(null); setResult(null); setProgress(0); setStatus('connecting'); setConnecting(true); completedRef.current = false; activeRef.current = true; failedRef.current = false; pendingCandidatesRef.current = [];
    try {
      // The whole code is parsed locally; only the public roomId is sent over WebSocket.
      if (!hasValidTransferCodeShape(code)) await parseTransferCode(code);
      if (!activeRef.current) return;
      const saveTargetPromise = chooseSaveTarget();
      const transferPromise = parseTransferCode(code);
      const [transfer, saveTarget] = await Promise.all([transferPromise, saveTargetPromise]);
      if (!activeRef.current) {
        await saveTarget.writer?.abort?.().catch(() => undefined);
        return;
      }
      targetRef.current = saveTarget;
      const peer = createPeerConnection(); peerRef.current = peer;
      peer.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          try { sendSignal(socketRef.current, { type: 'candidate', candidate: event.candidate.toJSON() }); } catch (reason) { fail(reason); }
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          if (!completedRef.current) fail(new Error('The peer connection failed. The sender may have gone offline or this network may block direct connections.'));
        }
      };
      peer.ondatachannel = (event) => {
        const channel = event.channel;
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => {
          setStatus('receiving');
          void receiveEncryptedFile(channel, transfer.key, transfer.roomId, targetRef.current, setMetadata, setProgress).then((fileResult) => {
            completedRef.current = true; setProgress(1); setResult(fileResult); setStatus('complete');
            cleanup();
          }).catch(fail);
        };
      };

      const socket = await openSignal(transfer.roomId, 'join', (message) => { void handleSignal(message, peer); }, () => {
        if (activeRef.current && !completedRef.current && peerRef.current?.connectionState !== 'connected') fail(new Error('The temporary signaling session closed before the peer connection was ready. Start a new transfer with the sender.'));
      });
      socketRef.current = socket; setStatus('waiting');
    } catch (reason) { fail(reason); }
    finally { setConnecting(false); }
  }

  async function handleSignal(message: SignalMessage, peer: RTCPeerConnection) {
    if (!activeRef.current) return;
    try {
      if (message.type === 'offer') {
        await peer.setRemoteDescription(message.sdp);
        if (!activeRef.current) return;
        for (const candidate of pendingCandidatesRef.current.splice(0)) await peer.addIceCandidate(candidate);
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        if (socketRef.current) sendSignal(socketRef.current, { type: 'answer', sdp: peer.localDescription?.toJSON() });
      } else if (message.type === 'candidate') {
        if (peer.remoteDescription) await peer.addIceCandidate(message.candidate);
        else pendingCandidatesRef.current.push(message.candidate);
      } else if (message.type === 'error') {
        fail(new Error(message.message));
      } else if (message.type === 'peer-joined' || message.type === 'answer') {
        // These messages are used by the sender role.
      }
    } catch (reason) { fail(reason); }
  }

  function fail(reason: unknown) {
    if (!activeRef.current || failedRef.current) return;
    failedRef.current = true;
    const message = reason instanceof Error ? reason.message : 'The file could not be received or decrypted.';
    setError(message); setStatus('error'); cleanup();
  }

  async function downloadFile() {
    if (!result) return;
    try {
      const file = result.blob ?? await result.handle?.getFile();
      if (!file) throw new Error('The browser could not access the saved file.');
      const url = URL.createObjectURL(file);
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = result.metadata.name; anchor.rel = 'noopener'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch { setError('The decrypted file is saved locally, but the browser could not start the download.'); }
  }

  function reset() { completedRef.current = false; failedRef.current = false; cleanup(); setStatus('idle'); setError(''); setMetadata(null); setResult(null); setProgress(0); setCode(''); }

  return <section className="workspace-page shell receiver-workspace">
    <Link href="/" className="back-link"><ArrowLeft size={15} /> Back to CipherSend</Link>
    <div className="workspace-heading"><div><div className="eyebrow">DIRECT TRANSFER / RECEIVER</div><h1>Receive a file</h1><p>Enter the complete transfer code. The key is parsed locally in your browser.</p></div><div className="workspace-secure"><ShieldCheck size={16} /> NO ACCOUNT NEEDED</div></div>
    <div className="receiver-panel">
      <div className="receiver-panel__icon"><FileLock2 size={22} /></div>
      <span className="step-kicker">PRIVATE TRANSFER CODE</span>
      <label className="receiver-code-label" htmlFor="transfer-code">Enter the code shared by the sender</label>
      <textarea id="transfer-code" className="receiver-code-input" placeholder="random-room-id.secret-key" value={code} onChange={(event) => setCode(event.target.value)} rows={3} spellCheck={false} autoCapitalize="off" autoComplete="off" autoCorrect="off" disabled={status === 'connecting' || status === 'waiting' || status === 'receiving'} />
      <p className="receiver-hint"><LockKeyhole size={14} /> Only the public session ID is sent to signaling. The secret part stays in this browser.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      {metadata && <div className="receive-metadata"><div><span>FILE</span><strong>{metadata.name}</strong></div><div><span>SIZE</span><strong>{formatSize(metadata.size)}</strong></div><div><span>ENCRYPTION</span><strong>AES-256-GCM · verified</strong></div></div>}
      <div className="receiver-status"><span className={`status-indicator${status === 'error' ? ' status-indicator--error' : status === 'complete' ? ' status-indicator--done' : ''}`}>{status === 'connecting' || status === 'receiving' ? <LoaderCircle size={14} className="spin" /> : status === 'complete' ? <Check size={14} /> : status === 'error' ? <X size={14} /> : <Radio size={14} />}</span><span>{status === 'idle' ? 'Waiting for transfer code' : status === 'connecting' ? 'Connecting to the sender…' : status === 'waiting' ? 'Connected to signaling · negotiating peer link' : status === 'receiving' ? 'Receiving and decrypting chunks locally' : status === 'complete' ? 'File received and authenticated' : 'Transfer could not be completed'}</span></div>
      {(status === 'receiving' || status === 'complete') && <div className="progress-track" role="progressbar" aria-label="File receive and decryption progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
      {status === 'complete' ? <button className="button button--primary button--wide" type="button" onClick={downloadFile}><Download size={16} /> Download file</button> : status === 'connecting' || status === 'waiting' || status === 'receiving' ? <button className="button button--outline button--wide" type="button" onClick={reset}>Cancel connection <X size={15} /></button> : <button className="button button--primary button--wide" type="button" onClick={connect} disabled={!code.trim() || connecting}>Connect to sender <ArrowLeft size={16} className="connect-arrow" /></button>}
      {status === 'complete' && <button className="button button--outline button--wide" type="button" onClick={reset}>Receive another file</button>}
    </div>
    <div className="receive-bottom-note"><ShieldCheck size={14} /> Files are decrypted in your browser. The signaling server does not receive file contents or the key.</div>
  </section>;
}
