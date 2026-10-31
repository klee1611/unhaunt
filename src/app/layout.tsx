import './globals.css';

export const metadata = {
  title: 'Unhaunt',
  description: 'Find the forgotten accounts haunting your inbox. Lay them to rest only when your phone says yes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header>
          <a href="/" className="brand">👻 Unhaunt</a>
          <nav>
            <a href="/">Census</a>
            <a href="/auth/logout">Log out</a>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
