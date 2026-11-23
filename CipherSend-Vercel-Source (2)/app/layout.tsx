import type { Metadata, Viewport } from 'next';
import './globals.css';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';

export const metadata: Metadata = {
  title: { default: 'CipherSend — Zero-storage file transfer', template: '%s · CipherSend' },
  description: 'Encrypt files in your browser and transfer them over a peer connection without permanent file storage.',
  applicationName: 'CipherSend',
  icons: { icon: '/ciphersend-mark.svg' },
  referrer: 'no-referrer',
  robots: { index: false, follow: false }
};

export const viewport: Viewport = { themeColor: '#071014', colorScheme: 'dark' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><div className="site-frame"><SiteHeader /><main>{children}</main><SiteFooter /></div></body></html>;
}
