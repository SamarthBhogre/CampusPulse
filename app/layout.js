import './globals.css';
import { Providers } from './providers';
import NavBar from '@/components/nav-bar';

export const metadata = {
  title: 'Campus Pulse',
  description: 'Discover events, volunteer for tasks, and manage your campus community.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <Providers>
          <NavBar />
          <main className="pt-16">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
