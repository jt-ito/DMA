import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Docker Manager',
  description: 'Manage Docker containers locally and remotely',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
