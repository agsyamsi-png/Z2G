import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Zoho to Google Workspace Migration Platform",
  description: "Enterprise Mailbox Migration, Cryptographic Credential Boundary & Reconciliation Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-slate-950 text-slate-50 min-h-screen">
        <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <a href="/" className="flex items-center space-x-2">
                <div className="h-9 w-9 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                  Z2G
                </div>
                <div>
                  <span className="font-semibold text-lg tracking-tight">Zoho to Google Migration</span>
                  <span className="ml-2 text-xs bg-blue-900/60 text-blue-300 border border-blue-700/50 px-2 py-0.5 rounded-full font-medium">
                    Codex V1
                  </span>
                </div>
              </a>
            </div>
            <nav className="flex items-center space-x-4 text-sm">
              <a
                href="/"
                className="text-slate-300 hover:text-white px-3 py-1.5 rounded-md hover:bg-slate-800 transition"
              >
                Projects
              </a>
              <a
                href="https://www.zoho.com/mail/help/imap-access.html"
                target="_blank"
                rel="noreferrer"
                className="text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-md hover:bg-slate-800/60 text-xs transition"
              >
                Zoho IMAP Help
              </a>
            </nav>
          </div>
        </header>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{children}</main>
      </body>
    </html>
  );
}
