import Link from 'next/link';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, Clock3, FileLock2, Fingerprint, KeyRound, LockKeyhole, Radio, ShieldCheck } from 'lucide-react';

const safeguards = [
  { icon: LockKeyhole, title: 'Encrypted in your browser', copy: 'AES-256-GCM protects the file in chunks before those bytes are sent over the WebRTC DataChannel.' },
  { icon: KeyRound, title: 'The key stays in your browser', copy: 'Signaling sees the random room ID, WebRTC offer/answer, and ICE candidates—not the AES key.' },
  { icon: Clock3, title: 'Temporary by design', copy: 'Signaling rooms live in memory, expire when inactive, and are removed when the session ends.' }
];

export default function HomePage() {
  return <>
    <section className="hero shell">
      <div className="hero__copy">
        <div className="eyebrow"><span className="pulse-dot" /> DIRECT FILE TRANSFER / NO ACCOUNTS</div>
        <h1>Your Files.<br /><span>Your Privacy.</span><br />Zero Storage.</h1>
        <p className="hero__lede">Encrypt a file in your browser and send it over a peer connection. No account, file upload, or permanent storage.</p>
        <div className="hero__actions">
          <Link href="/send" className="button button--primary">Send File <ArrowUpRight size={17} /></Link>
          <Link href="/receive" className="button button--outline">Receive File <ArrowRight size={16} /></Link>
        </div>
        <div className="hero__proof"><ShieldCheck size={17} /><span>Encrypted before transfer</span><i /> <span>Files do not go to signaling</span></div>
      </div>
      <div className="hero__visual" aria-label="Illustration of an encrypted file moving directly between two peers">
        <div className="orbit orbit--outer" /><div className="orbit orbit--inner" />
        <div className="visual-stamp visual-stamp--top"><span className="stamp-dot" /> PEER CONNECTION</div>
        <div className="file-card">
          <div className="file-card__top"><span className="file-icon"><FileLock2 size={21} /></span><span className="file-card__dots">•••</span></div>
          <div className="file-card__name">private-file.zip</div>
          <div className="file-card__meta">LOCAL ENCRYPTION <span>·</span> AES-256-GCM</div>
          <div className="file-card__rule" />
          <div className="file-card__status"><span><Check size={13} /></span> Ciphertext over DataChannel</div>
        </div>
        <div className="link-chip"><span className="link-chip__symbol"><Radio size={14} /></span><span>Only a temporary room ID is signaled</span><ArrowUpRight size={13} /></div>
        <div className="visual-stamp visual-stamp--bottom"><span className="visual-stamp__lock"><LockKeyhole size={13} /></span> NO PERMANENT FILE STORAGE</div>
        <div className="visual-cross visual-cross--one">+</div><div className="visual-cross visual-cross--two">+</div>
      </div>
      <div className="hero__scroll"><span /> SCROLL TO EXPLORE</div>
    </section>

    <section className="signal-strip" aria-label="Transfer privacy principles"><div className="shell signal-strip__inner">
      <span><Fingerprint size={17} /> Random, non-sequential transfer code</span><span className="signal-separator">/</span>
      <span><LockKeyhole size={17} /> File chunks encrypted before sending</span><span className="signal-separator">/</span>
      <span><Clock3 size={17} /> In-memory signaling with expiry</span>
    </div></section>

    <section id="how-it-works" className="section shell how-section">
      <div className="section-heading"><div><div className="eyebrow">01 / THE HANDOFF</div><h2>Three steps.<br /><span>No file upload.</span></h2></div>
        <p>Your browser encrypts file content before sending it through a WebRTC DataChannel. A small signaling service helps both browsers establish their connection, then forgets the temporary session.</p>
      </div>
      <div className="steps-grid">
        <article className="step-card"><span className="step-number">01</span><div className="step-icon"><FileLock2 size={20} /></div><h3>Choose a file</h3><p>Select a file. Your browser reads it in small pieces so the full file does not need to be loaded at once.</p><div className="step-line"><span /></div></article>
        <article className="step-card"><span className="step-number">02</span><div className="step-icon"><LockKeyhole size={20} /></div><h3>Encrypt on-device</h3><p>A random AES-256 key and unique IVs protect each chunk locally with AES-GCM authentication.</p><div className="step-line"><span /></div></article>
        <article className="step-card"><span className="step-number">03</span><div className="step-icon"><Radio size={20} /></div><h3>Connect peer-to-peer</h3><p>Share the transfer code privately. Its secret stays out of signaling; encrypted chunks use a WebRTC DataChannel.</p><div className="step-line"><span /></div></article>
      </div>
    </section>

    <section id="security" className="security-section"><div className="shell security-inner">
      <div className="security-copy"><div className="eyebrow">02 / BUILT AROUND PRIVACY</div><h2>Encrypted here.<br /><span>Sent peer-to-peer.</span></h2>
        <p>Signaling temporarily forwards a random room ID and WebRTC negotiation data. It never receives the key or file chunks. File content travels through the peer connection; restrictive networks may require a TURN relay, which can relay ciphertext.</p>
        <Link href="/send" className="text-link">Start a secure transfer <ArrowRight size={16} /></Link>
        <p className="security-caveat">The complete transfer code is a bearer secret: anyone who gets it may receive and decrypt the file. This project has not been independently audited. Browsers, network providers, and hosts may process transient connection metadata.</p>
      </div>
      <div className="safeguard-list">{safeguards.map((item, index) => { const Icon = item.icon; return <article className="safeguard" key={item.title}><span className="safeguard__index">0{index + 1}</span><span className="safeguard__icon"><Icon size={19} /></span><div><h3>{item.title}</h3><p>{item.copy}</p></div><ArrowUpRight size={15} className="safeguard__arrow" /></article>; })}</div>
    </div></section>

    <section className="final-cta shell"><div className="final-cta__orb" /><div><div className="eyebrow">NO ACCOUNT. NO STORED FILE.</div><h2>Ready for a direct<br /><span>file handoff?</span></h2></div><Link href="/send" className="button button--primary">Send File <ArrowUpRight size={17} /></Link></section>
  </>;
}
