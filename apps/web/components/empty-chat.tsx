import { Button } from "@/components/ui/button"
import { User } from "lucide-react"

export function EmptyChat() {
  return (
    <div className="mx-auto max-w-md text-center py-8">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border">
        <User className="h-6 w-6 text-muted-foreground" />
      </div>

      <h3 className="text-lg font-semibold">Ask me anything</h3>

      <p className="mt-2 text-sm text-muted-foreground">
        I can help you understand your sources, answer questions, and generate insights.
      </p>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm">
          What are the main themes?
        </Button>
        <Button variant="secondary" size="sm">
          Summarize key findings
        </Button>
        <Button variant="secondary" size="sm">
          Compare different sources
        </Button>
      </div>
    </div>
  )
}
