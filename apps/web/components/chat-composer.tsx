"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ArrowUp } from "lucide-react"

export function ChatComposer() {
  const [value, setValue] = useState("")
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [value])

  const send = () => {
    if (!value.trim()) return
    // TODO: Handle send
    setValue("")
  }

  return (
    <div className="relative">
      <div className="bg-card/60 ring-offset-background focus-within:ring-primary rounded-2xl border shadow-sm focus-within:ring-2 focus-within:ring-offset-2">
        <div className="flex items-end gap-2 p-2">
          <Textarea
            ref={ref}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask anything…"
            className="max-h-[200px] min-h-[44px] w-full resize-none border-0 bg-transparent px-2 py-2 text-sm focus-visible:ring-0"
          />

          <Button
            onClick={send}
            disabled={!value.trim()}
            size="icon"
            className="mb-1 h-9 w-9 shrink-0 rounded-full"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
