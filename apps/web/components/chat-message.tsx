import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface MessageProps {
  children: React.ReactNode
}

export function AssistantMessage({ children }: MessageProps) {
  return (
    <div className="flex w-full items-start gap-3">
      <Avatar className="h-7 w-7 shrink-0 mt-0.5">
        <AvatarFallback className="text-xs">🤖</AvatarFallback>
      </Avatar>

      <div className="flex-1 max-w-[85%] sm:max-w-[80%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 shadow-sm">
        <div className="text-xs text-muted-foreground mb-1">Assistant</div>
        <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {children}
        </div>
      </div>
    </div>
  )
}

export function UserMessage({ children }: MessageProps) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[90%] sm:max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-3 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words leading-relaxed shadow">
        {children}
      </div>
    </div>
  )
}
