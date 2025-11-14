import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Settings } from "lucide-react"

export function Header() {
  return (
    <header
      className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur"
      role="banner"
    >
      <div className="flex h-14 items-center gap-3 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <div className="h-4 w-4 rounded-sm bg-primary" />
          </div>
          <span className="text-sm font-semibold">Pulse</span>
        </div>

        <Separator orientation="vertical" className="mx-2 h-6" />

        <span className="truncate text-sm font-medium">
          Notebook Title
        </span>

        <div className="ml-auto">
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </header>
  )
}
