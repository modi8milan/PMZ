import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ZENOVEL | Secure Access',
  description: 'Authentication and access control for ZENOVEL Pharma Services.',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
