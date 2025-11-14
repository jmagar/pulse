import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Pulse - A beautiful self-hosted SHADCN NotebookLM Alternative",
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
