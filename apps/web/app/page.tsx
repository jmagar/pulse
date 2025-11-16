"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable"
import { Toaster } from "sonner"
import { DesignTokens } from "@/components/design-tokens"
import { Header } from "@/components/header"
import { SourcePanel } from "@/components/source-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"

export default function Home() {
  return (
    <TooltipProvider>
      <div className="bg-background text-foreground min-h-screen">
        <DesignTokens />
        <Header />

        {/* Desktop: Three-panel resizable layout */}
        <main className="mx-auto hidden max-w-screen-2xl px-4 md:block">
          <ResizablePanelGroup
            direction="horizontal"
            className="bg-card mt-4 h-[calc(100vh-6rem)] rounded-2xl border"
          >
            <ResizablePanel
              defaultSize={28}
              minSize={22}
              className="min-w-[240px]"
            >
              <SourcePanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={48} minSize={40}>
              <ChatPanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              defaultSize={24}
              minSize={20}
              className="min-w-[280px]"
            >
              <StudioPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>

        {/* Mobile: Vertical stack */}
        <main className="mx-auto max-w-screen-2xl space-y-4 px-4 py-4 md:hidden">
          <section className="bg-card h-[600px] rounded-2xl border">
            <SourcePanel />
          </section>

          <section className="bg-card h-[600px] rounded-2xl border">
            <ChatPanel />
          </section>

          <section className="bg-card h-[600px] rounded-2xl border">
            <StudioPanel />
          </section>
        </main>

        <Toaster position="top-right" richColors />
      </div>
    </TooltipProvider>
  )
}
