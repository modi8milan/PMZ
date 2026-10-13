import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ZENOVEL | Technical Foundation',
  description: 'Local Stage 1 foundation for ZENOVEL Pharma Services.',
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
