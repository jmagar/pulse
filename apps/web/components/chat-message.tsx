import { Avatar, AvatarFallback } from "@/components/ui/avatar"

interface MessageProps {
  children: React.ReactNode
}

export function AssistantMessage({ children }: MessageProps) {
  return (
    <div className="flex w-full items-start gap-3">
      <Avatar className="mt-0.5 h-7 w-7 shrink-0">
        <AvatarFallback className="text-xs">🤖</AvatarFallback>
      </Avatar>

      <div className="bg-muted max-w-[85%] flex-1 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm sm:max-w-[80%]">
        <div className="text-muted-foreground mb-1 text-xs">Assistant</div>
        <div className="text-sm leading-relaxed break-words whitespace-pre-wrap">
          {children}
        </div>
      </div>
    </div>
  )
}

export function UserMessage({ children }: MessageProps) {
  return (
    <div className="flex w-full justify-end">
      <div className="bg-primary text-primary-foreground max-w-[90%] rounded-2xl rounded-br-sm px-3 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap shadow sm:max-w-[75%]">
        {children}
      </div>
    </div>
  )
}
