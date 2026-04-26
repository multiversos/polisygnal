import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PolySignal",
  description: "Analista explicable para mercados de Polymarket",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var storedTheme = localStorage.getItem("polysignal-theme");
                var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
                var theme = storedTheme === "dark" || storedTheme === "light"
                  ? storedTheme
                  : prefersDark
                    ? "dark"
                    : "light";
                document.documentElement.dataset.theme = theme;
                document.documentElement.style.colorScheme = theme;
              } catch (error) {}
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
