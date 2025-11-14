import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { FileText } from "lucide-react"

export function EmptySources() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No sources yet</p>
          <p className="text-xs text-muted-foreground mt-1">
            Add sources to get started
          </p>
        </div>
        <Button className="mt-2">
          Add source
        </Button>
      </CardContent>
    </Card>
  )
}
