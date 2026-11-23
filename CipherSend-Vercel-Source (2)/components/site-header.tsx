import Link from 'next/link';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <span className={`brand-mark${compact ? ' brand-mark--compact' : ''}`} aria-hidden="true"><ShieldCheck size={compact ? 19 : 22} strokeWidth={1.7} /><span className="brand-mark__spark" /></span>;
}

export function SiteHeader() {
  return <header className="site-header"><div className="shell site-header__inner">
    <Link href="/" className="wordmark" aria-label="CipherSend home"><BrandMark /><span>Cipher<span>Send</span></span></Link>
    <nav className="site-nav" aria-label="Main navigation"><a href="/#how-it-works">How it works</a><a href="/#security">Security</a><Link href="/receive">Receive</Link><Link className="nav-cta" href="/send">Send a file <ArrowUpRight size={15} /></Link></nav>
  </div></header>;
}
