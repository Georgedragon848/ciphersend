import Link from 'next/link';
import { BrandMark } from '@/components/site-header';

export function SiteFooter() {
  return <footer className="site-footer"><div className="shell site-footer__inner">
    <Link href="/" className="wordmark wordmark--footer" aria-label="CipherSend home"><BrandMark compact /><span>Cipher<span>Send</span></span></Link>
    <p>Encrypted in your browser. Shared peer-to-peer.</p>
    <span className="footer-note">Student cybersecurity project · Not independently audited</span>
  </div></footer>;
}
