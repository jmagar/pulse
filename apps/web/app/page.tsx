"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
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

        {/* Desktop: Three-panel resizable layout */}
        <main className="mx-auto max-w-screen-2xl px-4 hidden md:block">
          <ResizablePanelGroup
            direction="horizontal"
            className="mt-4 rounded-2xl border bg-card h-[calc(100vh-6rem)]"
          >
            <ResizablePanel defaultSize={28} minSize={22} className="min-w-[240px]">
              <SourcePanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={48} minSize={40}>
              <ChatPanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={24} minSize={20} className="min-w-[280px]">
              <StudioPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>

        {/* Mobile: Vertical stack */}
        <main className="mx-auto max-w-screen-2xl px-4 py-4 space-y-4 md:hidden">
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
