import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

interface StudioTileProps {
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
}

export function StudioTile({ icon, title, desc, cta }: StudioTileProps) {
  return (
    <Card className="hover:bg-muted transition-colors">
      <CardContent className="flex items-center gap-3 p-4">
        <div className="rounded-md bg-muted p-2 text-muted-foreground shrink-0">
          {icon}
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{title}</p>
          <p className="truncate text-xs text-muted-foreground">{desc}</p>
        </div>

        <Button variant="outline" size="sm" className="shrink-0">
          {cta}
        </Button>
      </CardContent>
    </Card>
  )
}
