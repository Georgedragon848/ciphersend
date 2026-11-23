'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, Clipboard, FileLock2, FileText, Link2, LoaderCircle, LockKeyhole, Radio, ShieldCheck, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { createTransferCode, formatTransferCode } from '@/lib/crypto/transfer-code';
import { closeSignal, openSignal, sendSignal, type SignalMessage } from '@/lib/signaling/browser-client';
import { createPeerConnection, createTransferChannel } from '@/lib/transfer/peer';
import { sendEncryptedFile } from '@/lib/transfer/send-file';

const statusCopy: Record<string, string> = {
  idle: 'Ready when you are', preparing: 'Creating a private transfer code…', waiting: 'Waiting for the receiver to connect',
  connecting: 'Establishing peer connection', connected: 'Peer connected · encrypting in this browser', transferring: 'Sending encrypted chunks peer-to-peer', complete: 'Transfer complete', error: 'Transfer needs attention'
};

function formatSize(bytes: number) { return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(bytes >= 10 * 1048576 ? 0 : 1)} MB`; }

export function SenderTransfer() {
  const inputRef = useRef<HTMLInputElement>(null);
  const acceptedFileRef = useRef<File | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RTCDataChannel | null>(null);
  const completedRef = useRef(false);
  const activeRef = useRef(false);
  const failedRef = useRef(false);
  const offerStartedRef = useRef(false);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState('idle');
  const [code, setCode] = useState('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [dragging, setDragging] = useState(false);

  function cleanup() {
    activeRef.current = false;
    closeSignal(socketRef.current); socketRef.current = null;
    channelRef.current?.close(); channelRef.current = null;
    peerRef.current?.close(); peerRef.current = null;
  }

  useEffect(() => () => cleanup(), []);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const handleFileEvent = () => setSelected(input.files?.[0] ?? undefined);
    let focusTimer = 0;
    const handleFocusReturn = () => {
      window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(handleFileEvent, 150);
    };
    const filePoll = window.setInterval(handleFileEvent, 250);
    input.addEventListener('input', handleFileEvent);
    input.addEventListener('change', handleFileEvent);
    window.addEventListener('focus', handleFocusReturn);
    document.addEventListener('visibilitychange', handleFocusReturn);
    return () => {
      input.removeEventListener('input', handleFileEvent);
      input.removeEventListener('change', handleFileEvent);
      window.removeEventListener('focus', handleFocusReturn);
      document.removeEventListener('visibilitychange', handleFocusReturn);
      window.clearTimeout(focusTimer);
      window.clearInterval(filePoll);
    };
  }, []);

  function setSelected(next?: File) {
    if (!next || activeRef.current || next === acceptedFileRef.current) return;
    acceptedFileRef.current = next;
    setFile(next); setError(''); setCode(''); setProgress(0); setStatus('idle');
  }

  async function startTransfer() {
    if (status === 'preparing' || status === 'waiting' || status === 'connecting' || status === 'transferring') return;
    const selectedFile = file ?? inputRef.current?.files?.[0] ?? undefined;
    if (!selectedFile) { setError('Select a file with the Choose File control before creating a transfer code.'); return; }
    acceptedFileRef.current = selectedFile;
    setFile(selectedFile);
    setError(''); setCopied(false); setStatus('preparing'); completedRef.current = false; activeRef.current = true; failedRef.current = false; offerStartedRef.current = false; pendingCandidatesRef.current = [];
    try {
      const transfer = await createTransferCode();
      if (!activeRef.current) return;
      const peer = createPeerConnection(); peerRef.current = peer;
      const channel = createTransferChannel(peer); channelRef.current = channel;

      const onSignal = async (message: SignalMessage) => {
        const currentPeer = peerRef.current;
        const socket = socketRef.current;
        if (message.type === 'peer-joined' && currentPeer && socket && !offerStartedRef.current) {
          offerStartedRef.current = true;
          setStatus('connecting');
          try {
            const offer = await currentPeer.createOffer();
            await currentPeer.setLocalDescription(offer);
            sendSignal(socket, { type: 'offer', sdp: currentPeer.localDescription?.toJSON() });
          } catch (reason) { fail(reason); }
        } else if (message.type === 'answer' && currentPeer) {
          try {
            await currentPeer.setRemoteDescription(message.sdp);
            for (const candidate of pendingCandidatesRef.current.splice(0)) await currentPeer.addIceCandidate(candidate);
          } catch (reason) { fail(reason); }
        } else if (message.type === 'candidate' && currentPeer) {
          if (currentPeer.remoteDescription) void currentPeer.addIceCandidate(message.candidate).catch((reason: unknown) => fail(reason));
          else pendingCandidatesRef.current.push(message.candidate);
        } else if (message.type === 'error') {
          fail(new Error(message.message));
        }
      };

      peer.onicecandidate = (event) => {
        if (event.candidate && socketRef.current?.readyState === WebSocket.OPEN) {
          try { sendSignal(socketRef.current, { type: 'candidate', candidate: event.candidate.toJSON() }); } catch (reason) { fail(reason); }
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'failed' || peer.connectionState === 'closed') {
          if (!completedRef.current) fail(new Error('The peer connection was interrupted. Check both network connections and try again.'));
        }
      };
      channel.onopen = () => {
        if (completedRef.current) return;
        setStatus('transferring');
        void sendEncryptedFile(selectedFile, transfer.key, transfer.roomId, channel, setProgress).then(() => {
          completedRef.current = true; setProgress(1); setStatus('complete');
          cleanup();
        }).catch(fail);
      };
      channel.onerror = () => { if (!completedRef.current) fail(new Error('The encrypted data channel failed.')); };

      const socket = await openSignal(transfer.roomId, 'create', (message) => { void onSignal(message); }, () => {
        if (activeRef.current && !completedRef.current && peerRef.current?.connectionState !== 'connected') fail(new Error('The temporary signaling session closed before the peer connection was ready. Start a new transfer.'));
      });
      socketRef.current = socket;
      setCode(transfer.code); setStatus('waiting');
    } catch (reason) { fail(reason); }
  }

  function fail(reason: unknown) {
    if (!activeRef.current || failedRef.current) return;
    failedRef.current = true;
    const message = reason instanceof Error ? reason.message : 'The transfer could not be completed.';
    setError(message); setStatus('error'); cleanup();
  }

  async function copyCode() {
    try { await navigator.clipboard.writeText(code); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Could not copy the code. Select and copy it manually.'); }
  }

  function cancel() { completedRef.current = false; failedRef.current = false; cleanup(); setStatus('idle'); setCode(''); setProgress(0); setError(''); }

  return <section className="workspace-page shell">
    <Link href="/" className="back-link"><ArrowLeft size={15} /> Back to CipherSend</Link>
    <div className="workspace-heading"><div><div className="eyebrow">DIRECT TRANSFER / SENDER</div><h1>Send a file</h1><p>Encrypt locally, then send the ciphertext over a peer connection.</p></div><div className="workspace-secure"><ShieldCheck size={16} /> NO FILE UPLOAD</div></div>
    <div className="workspace-layout">
      <div className="workspace-main">
        <div className={`dropzone${dragging ? ' dropzone--active' : ''}${file ? ' dropzone--selected' : ''}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); setSelected(event.dataTransfer.files[0]); }}>
          <input ref={inputRef} className={file ? 'visually-hidden' : 'dropzone__native-input'} type="file" onChange={(event) => setSelected(event.currentTarget.files?.[0])} aria-label="Choose a file to send" />
          {file ? <div className="selected-file"><div className="selected-file__icon"><FileText size={20} /></div><div className="selected-file__details"><strong>{file.name}</strong><span>{formatSize(file.size)} · will encrypt locally in chunks</span></div><button className="icon-button" type="button" aria-label="Remove selected file" onClick={() => { if (activeRef.current) return; acceptedFileRef.current = null; setFile(null); setCode(''); setStatus('idle'); if (inputRef.current) inputRef.current.value = ''; }}><X size={16} /></button></div> : <div className="dropzone__content"><span className="dropzone__icon"><Upload size={22} /></span><h2>Drop your file here</h2><p>or use the native file button below, or drop one here</p><span className="dropzone__limit">PDF, images, documents, ZIP, text, and more</span></div>}
        </div>
        {error && <p className="field-error" role="alert">{error}</p>}

        {code && <div className="transfer-code-card"><div className="card-heading"><div><span className="step-kicker">PRIVATE TRANSFER CODE</span><h2>Share this code securely</h2></div><span className="card-heading__icon"><Link2 size={18} /></span></div><div className="transfer-code-value" aria-label="Your full transfer code">{formatTransferCode(code)}</div><button type="button" className="button button--outline button--wide" onClick={copyCode}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy Code'}</button><p className="code-warning"><LockKeyhole size={14} /> The code contains the decryption key. Anyone who has it can receive the file—share it privately.</p></div>}

        <div className="transfer-status-card"><div className="transfer-status-row"><span className={`status-indicator${status === 'error' ? ' status-indicator--error' : status === 'complete' ? ' status-indicator--done' : ''}`}>{status === 'preparing' || status === 'connecting' || status === 'transferring' ? <LoaderCircle size={14} className="spin" /> : status === 'complete' ? <Check size={14} /> : status === 'error' ? <X size={14} /> : <Radio size={14} />}</span><div><strong>{statusCopy[status]}</strong><span>{status === 'waiting' ? 'Keep this page open while the receiver enters the code.' : status === 'transferring' ? 'Only encrypted chunks are sent through the DataChannel.' : status === 'complete' ? 'The temporary signaling room will be removed.' : 'The file remains on your device until transfer begins.'}</span></div><span className={`state-chip state-chip--${status}`}>{status.toUpperCase()}</span></div>
          {(status === 'transferring' || status === 'complete') && <div className="progress-track" role="progressbar" aria-label="Encrypted transfer progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><span style={{ width: `${Math.round(progress * 100)}%` }} /></div>}
        </div>
        {status === 'idle' || status === 'error' || status === 'complete' ? <button className="button button--primary button--wide" type="button" onClick={startTransfer}>{status === 'complete' ? 'Start another transfer' : 'Create transfer code'} <ArrowUpRight size={17} /></button> : <button className="button button--outline button--wide" type="button" onClick={cancel}>Cancel transfer <X size={15} /></button>}
        <p className="form-note"><LockKeyhole size={14} /> Your browser sends only the public session ID and WebRTC negotiation details to signaling. File chunks are encrypted before entering the DataChannel.</p>
      </div>
      <aside className="workspace-aside"><div className="aside-card"><div className="aside-card__mark"><ShieldCheck size={20} /></div><span className="step-kicker">HOW THIS HANDOFF WORKS</span><h3>Your browser keeps control.</h3><ol className="aside-steps"><li><span>1</span><p>A random room ID and separate AES key are created locally.</p></li><li><span>2</span><p>Only the room ID and WebRTC offer/answer/candidates use signaling.</p></li><li><span>3</span><p>Encrypted file chunks travel through the peer DataChannel.</p></li></ol><div className="aside-seal"><Check size={13} /> Signaling stores no permanent room data</div></div><div className="aside-footnote"><span className="aside-footnote__dot" /><p>WebRTC may use network relays in restrictive networks. A relay can carry ciphertext; it does not receive the transfer-code key.</p></div></aside>
    </div>
  </section>;
}
