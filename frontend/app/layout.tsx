import type { Metadata } from 'next';
import { ReactNode } from 'react';
import { Nav } from '@/components/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'E-commerce Product Research',
  description: 'Data-driven product opportunity ranking for Indian marketplaces',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
