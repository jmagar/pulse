import { ScrollArea } from "@/components/ui/scroll-area"
import { StudioTile } from "@/components/studio-tile"
import { Music2, Play, ListTree } from "lucide-react"

export function StudioPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Studio</h2>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          <StudioTile
            icon={<Music2 className="h-6 w-6" />}
            title="Audio Overview"
            desc="Generate a podcast-style discussion"
            cta="Generate"
          />
          <StudioTile
            icon={<Play className="h-6 w-6" />}
            title="Video Overview"
            desc="Create a summary video"
            cta="Generate"
          />
          <StudioTile
            icon={<ListTree className="h-6 w-6" />}
            title="Mind Map"
            desc="Visualize connections between topics"
            cta="Generate"
          />
        </div>
      </ScrollArea>
    </div>
  )
}
