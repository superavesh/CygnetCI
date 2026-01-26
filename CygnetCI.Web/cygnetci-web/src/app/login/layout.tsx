'use client';

import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Login page renders directly without auth checking
  return children;
}
