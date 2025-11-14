import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Taboot - NotebookLM Clone",
  description: "AI-powered research and knowledge management",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
