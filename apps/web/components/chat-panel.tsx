import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyChat } from "@/components/empty-chat"
import { ChatComposer } from "@/components/chat-composer"
import { AssistantMessage, UserMessage } from "@/components/chat-message"

export function ChatPanel() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Chat</h2>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        <EmptyChat />

        <div className="mt-8 space-y-4">
          <AssistantMessage>
            Based on the sources, the key findings are: 1) Finding one 2)
            Finding two 3) Finding three
          </AssistantMessage>
          <UserMessage>What are the key findings in the research?</UserMessage>
        </div>
      </ScrollArea>

      <div className="bg-background/95 border-t px-4 py-3 backdrop-blur">
        <ChatComposer />
      </div>
    </div>
  )
}
