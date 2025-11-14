import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { FileText, Globe, Github, Play, Music2, MoreHorizontal } from "lucide-react"

type SourceType = "pdf" | "web" | "youtube" | "text" | "github" | "audio"

interface SourceCardProps {
  title: string
  meta: string
  type: SourceType
  processing?: number
  error?: string
}

export function SourceCard({ title, meta, type, processing, error }: SourceCardProps) {
  const icons = {
    pdf: FileText,
    web: Globe,
    youtube: Play,
    text: FileText,
    github: Github,
    audio: Music2,
  }

  const Icon = icons[type]

  return (
    <Card className="hover:bg-muted transition-colors">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary shrink-0">
            <Icon className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-medium">{title}</p>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    aria-label="Source menu"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem>View</DropdownMenuItem>
                  <DropdownMenuItem>Copy link</DropdownMenuItem>
                  <DropdownMenuItem className="text-red-600">
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <p className="truncate text-xs text-muted-foreground mt-0.5">
              {meta}
            </p>

            {typeof processing === "number" && (
              <div className="mt-2">
                <Progress value={processing} />
              </div>
            )}

            {error && (
              <p className="mt-2 text-xs text-red-500">{error}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
