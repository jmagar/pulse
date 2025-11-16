"use client"

import { cn } from "@/lib/utils"
import { StickToBottom } from "use-stick-to-bottom"

export type ChatContainerRootProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerContentProps = {
  children: React.ReactNode
  className?: string
} & React.HTMLAttributes<HTMLDivElement>

export type ChatContainerScrollAnchorProps = {
  className?: string
  ref?: React.RefObject<HTMLDivElement>
} & React.HTMLAttributes<HTMLDivElement>

function ChatContainerRoot({
  children,
  className,
  ...props
}: ChatContainerRootProps) {
  return (
    <StickToBottom className={cn("relative h-full", className)} {...props}>
      {children}
    </StickToBottom>
  )
}

function ChatContainerContent({
  children,
  className,
  ...props
}: ChatContainerContentProps) {
  return (
    <div className={cn("flex flex-col gap-4 p-4", className)} {...props}>
      {children}
    </div>
  )
}

function ChatContainerScrollAnchor({
  className,
  ...props
}: ChatContainerScrollAnchorProps) {
  return <div className={cn("h-px w-full", className)} {...props} />
}

export { ChatContainerRoot, ChatContainerContent, ChatContainerScrollAnchor }
