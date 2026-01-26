// src/app/layout.tsx

import { Inter } from 'next/font/google';
import './globals.css';
import '../styles/color-fixes.css';
import { AuthWrapper } from '@/components/auth/AuthWrapper';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <script src="/system.config.js" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className={inter.className}>
        <AuthWrapper>{children}</AuthWrapper>
      </body>
    </html>
  );
}
