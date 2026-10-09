import './globals.css';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Providers } from './providers';
import NavBar from '@/components/nav-bar';
import AssistantWidget from '@/components/assistant-widget';

const jakartaSans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-jakarta',
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

export const metadata = {
  title: 'Campus Pulse',
  description: 'Discover events, volunteer for tasks, and manage your campus community.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className={jakartaSans.variable}>
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>
          <NavBar />
          {/* pt = navbar h-12 + py-2.5 top + py-2.5 bottom = 48+10+10 = 68px */}
          <main className="pt-[68px]">{children}</main>
          <AssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
