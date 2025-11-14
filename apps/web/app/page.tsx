"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { DesignTokens } from "@/components/design-tokens"
import { Header } from "@/components/header"
import { SourcePanel } from "@/components/source-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"

export default function Home() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <DesignTokens />
        <Header />

        <main className="mx-auto max-w-screen-2xl px-4 py-4 space-y-4">
          <section className="rounded-2xl border bg-card h-[600px]">
            <SourcePanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <ChatPanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <StudioPanel />
          </section>
        </main>

        <Toaster position="top-right" richColors />
      </div>
    </TooltipProvider>
  )
}
