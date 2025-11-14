import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip"
import { Plus } from "lucide-react"
import { EmptySources } from "@/components/empty-sources"
import { SourceCard } from "@/components/source-card"

export function SourcePanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Sources</h2>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full h-8 w-8"
                aria-label="Add source"
              >
                <Plus className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add source</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <ScrollArea className="flex-1 p-4">
        <EmptySources />

        <div className="mt-4 space-y-2">
          <SourceCard
            type="pdf"
            title="document-name.pdf"
            meta="125 pages • 45,231 words"
          />
          <SourceCard
            type="web"
            title="https://example.com/guide"
            meta="Updated 2 days ago"
            processing={70}
          />
          <SourceCard
            type="github"
            title="org/notebooklm-clone"
            meta="Updated 1 hour ago"
            error="Rate limited. Retry."
          />
        </div>
      </ScrollArea>
    </div>
  )
}
