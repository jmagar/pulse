# NotebookLM UI Clone - Mobile-First Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** ⏸️ PAUSED at Task 25 (context limit reached)
**Progress:** 24/34 tasks complete (71%)
**Session Log:** See `.docs/sessions/2025-01-14-notebooklm-ui-progress.md` for detailed progress
**Last Commit:** `04db7c6c` - docs: capture NotebookLM UI implementation progress
**Resume At:** Task 25 - Create Chat Panel Component (TDD)

**Goal:** Build a NotebookLM-style interface using mobile-first TDD with small, focused, modular components.

**Architecture:** Mobile-first responsive design with component-driven architecture. Each component is self-contained (max 100 lines), tested first (Red-Green-Refactor), and enhanced progressively for desktop. Three-panel layout collapses to vertical stack on mobile.

**Tech Stack:** Next.js 16, React 19, shadcn/ui (Radix UI), Tailwind CSS 4, Framer Motion, Sonner toasts, TypeScript 5, Jest + React Testing Library

---

## Completion Status

**✅ Completed (Tasks 1-24):**
- Tasks 1-15: Dependencies & shadcn components installed
- Tasks 16-17: Dark theme & design tokens configured
- Task 18: Mobile header component (TDD)
- Tasks 19-21: Source components (card, empty state, panel - TDD)
- Task 21.5: Chat infrastructure (use-stick-to-bottom, chat-container)
- Tasks 22-24: Chat message components (messages, composer, empty state - TDD)

**🔄 Next (Task 25):**
- Create Chat Panel Component (TDD) - **START HERE IN NEW CONVERSATION**

**⏳ Remaining (Tasks 26-34):**
- Tasks 26-27: Studio components (TDD)
- Task 28: Mobile main page (TDD)
- Tasks 29-30: Desktop three-panel layout with resizable
- Tasks 31-34: Integration tests, README, cleanup, verification

---

## Prerequisites Checklist

Before starting, verify:
- [ ] Apps/web has shadcn configured (`components.json` exists)
- [ ] TypeScript paths configured (`@/` alias works)
- [ ] Jest and React Testing Library configured
- [ ] Tailwind CSS 4 configured

---

## Task 1: Install Core Dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add motion and toast libraries**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpm add framer-motion sonner
```

Expected: Dependencies added to package.json

**Step 2: Verify installation**

Run:
```bash
pnpm list framer-motion sonner
```

Expected: Both packages listed with versions

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "chore(web): add framer-motion and sonner dependencies"
```

---

## Task 2: Install shadcn/ui Button Component

**Files:**
- Create: `apps/web/components/ui/button.tsx`

**Step 1: Install button**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add button
```

Expected: Component created in components/ui/button.tsx

**Step 2: Verify**

Run:
```bash
head -20 apps/web/components/ui/button.tsx
```

Expected: File exists with Button export

**Step 3: Commit**

```bash
git add apps/web/components/ui/button.tsx apps/web/package.json
git commit -m "feat(web): add shadcn button component"
```

---

## Task 3: Install shadcn/ui Card Component

**Files:**
- Create: `apps/web/components/ui/card.tsx`

**Step 1: Install card**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add card
```

**Step 2: Verify**

Run:
```bash
head -20 apps/web/components/ui/card.tsx
```

Expected: Card, CardHeader, CardTitle exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/card.tsx
git commit -m "feat(web): add shadcn card component"
```

---

## Task 4: Install shadcn/ui Badge Component

**Files:**
- Create: `apps/web/components/ui/badge.tsx`

**Step 1: Install badge**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add badge
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/badge.tsx
git commit -m "feat(web): add shadcn badge component"
```

---

## Task 5: Install shadcn/ui ScrollArea Component

**Files:**
- Create: `apps/web/components/ui/scroll-area.tsx`

**Step 1: Install scroll-area**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add scroll-area
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/scroll-area.tsx
git commit -m "feat(web): add shadcn scroll-area component"
```

---

## Task 6: Install shadcn/ui Textarea Component

**Files:**
- Create: `apps/web/components/ui/textarea.tsx`

**Step 1: Install textarea**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add textarea
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/textarea.tsx
git commit -m "feat(web): add shadcn textarea component"
```

---

## Task 7: Install shadcn/ui Input Component

**Files:**
- Create: `apps/web/components/ui/input.tsx`

**Step 1: Install input**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add input
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/input.tsx
git commit -m "feat(web): add shadcn input component"
```

---

## Task 8: Install shadcn/ui Progress Component

**Files:**
- Create: `apps/web/components/ui/progress.tsx`

**Step 1: Install progress**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add progress
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/progress.tsx
git commit -m "feat(web): add shadcn progress component"
```

---

## Task 9: Install shadcn/ui Avatar Component

**Files:**
- Create: `apps/web/components/ui/avatar.tsx`

**Step 1: Install avatar**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add avatar
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/avatar.tsx
git commit -m "feat(web): add shadcn avatar component"
```

---

## Task 10: Install shadcn/ui Separator Component

**Files:**
- Create: `apps/web/components/ui/separator.tsx`

**Step 1: Install separator**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add separator
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/separator.tsx
git commit -m "feat(web): add shadcn separator component"
```

---

## Task 11: Install shadcn/ui Skeleton Component

**Files:**
- Create: `apps/web/components/ui/skeleton.tsx`

**Step 1: Install skeleton**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add skeleton
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/skeleton.tsx
git commit -m "feat(web): add shadcn skeleton component"
```

---

## Task 12: Install shadcn/ui Tooltip Component

**Files:**
- Create: `apps/web/components/ui/tooltip.tsx`

**Step 1: Install tooltip**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add tooltip
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/tooltip.tsx
git commit -m "feat(web): add shadcn tooltip component"
```

---

## Task 13: Install shadcn/ui Dropdown Menu Component

**Files:**
- Create: `apps/web/components/ui/dropdown-menu.tsx`

**Step 1: Install dropdown-menu**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add dropdown-menu
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/dropdown-menu.tsx
git commit -m "feat(web): add shadcn dropdown-menu component"
```

---

## Task 14: Install shadcn/ui Dialog Component

**Files:**
- Create: `apps/web/components/ui/dialog.tsx`

**Step 1: Install dialog**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add dialog
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/dialog.tsx
git commit -m "feat(web): add shadcn dialog component"
```

---

## Task 15: Install shadcn/ui Tabs Component

**Files:**
- Create: `apps/web/components/ui/tabs.tsx`

**Step 1: Install tabs**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add tabs
```

**Step 2: Commit**

```bash
git add apps/web/components/ui/tabs.tsx
git commit -m "feat(web): add shadcn tabs component"
```

---

## Task 16: Configure Dark Theme in Root Layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Step 1: Write test for dark mode**

Create: `apps/web/__tests__/layout.test.tsx`

```typescript
import { render } from "@testing-library/react"
import RootLayout from "@/app/layout"

describe("RootLayout", () => {
  it("should apply dark class to html element", () => {
    render(
      <RootLayout>
        <div>Test</div>
      </RootLayout>
    )

    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("should render children", () => {
    const { getByText } = render(
      <RootLayout>
        <div>Test Content</div>
      </RootLayout>
    )

    expect(getByText("Test Content")).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpm test layout
```

Expected: FAIL - dark class not applied

**Step 3: Update layout.tsx**

```typescript
import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Taboot - NotebookLM Clone",
  description: "AI-powered research and knowledge management",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        {children}
      </body>
    </html>
  )
}
```

**Step 4: Run test to verify it passes**

Run:
```bash
pnpm test layout
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/__tests__/layout.test.tsx
git commit -m "feat(web): configure dark theme in root layout"
```

---

## Task 17: Create Design Tokens Component

**Files:**
- Create: `apps/web/components/design-tokens.tsx`

**Step 1: Write design tokens component**

```typescript
export function DesignTokens() {
  return (
    <style>{`
      /* shadcn expects HSL triplets */
      :root {
        --background: 0 0% 100%;
        --foreground: 224 71% 4%;
        --card: 0 0% 100%;
        --card-foreground: 224 71% 4%;
        --muted: 220 14% 96%;
        --muted-foreground: 220 9% 46%;
        --popover: 0 0% 100%;
        --popover-foreground: 224 71% 4%;
        --border: 220 13% 91%;
        --input: 220 13% 91%;
        --primary: 199 98% 49%; /* light blue 500 */
        --primary-foreground: 210 40% 98%;
        --ring: 199 98% 49%;
      }
      :root.dark {
        color-scheme: dark;
        --background: 220 18% 9%;      /* ~#141820 */
        --foreground: 210 20% 96%;
        --card: 220 18% 11%;
        --card-foreground: 210 20% 96%;
        --muted: 220 14% 15%;
        --muted-foreground: 215 16% 72%;
        --popover: 220 18% 11%;
        --popover-foreground: 210 20% 96%;
        --border: 220 14% 22%;
        --input: 220 14% 22%;
        --primary: 199 98% 49%;        /* #03A9F4 */
        --primary-foreground: 210 40% 98%;
        --ring: 199 98% 49%;
      }
    `}</style>
  )
}
```

**Step 2: Commit**

```bash
git add apps/web/components/design-tokens.tsx
git commit -m "feat(web): add design tokens for NotebookLM theme"
```

---

## Task 18: Create Mobile Header Component (TDD)

**Files:**
- Create: `apps/web/components/header.tsx`
- Create: `apps/web/__tests__/header.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/header.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { Header } from "@/components/header"

describe("Header", () => {
  it("should render Taboot branding", () => {
    render(<Header />)
    expect(screen.getByText("Taboot")).toBeInTheDocument()
  })

  it("should render on mobile viewport", () => {
    global.innerWidth = 375
    render(<Header />)

    const header = screen.getByRole("banner")
    expect(header).toBeInTheDocument()
  })

  it("should have sticky positioning", () => {
    render(<Header />)

    const header = screen.getByRole("banner")
    expect(header).toHaveClass("sticky")
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test header
```

Expected: FAIL - Header component doesn't exist

**Step 3: Write minimal implementation**

Create: `apps/web/components/header.tsx`

```typescript
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
          <span className="text-sm font-semibold">Taboot</span>
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test header
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/header.tsx apps/web/__tests__/header.test.tsx
git commit -m "feat(web): add mobile header component with TDD"
```

---

## Task 19: Create Source Card Component (TDD)

**Files:**
- Create: `apps/web/components/source-card.tsx`
- Create: `apps/web/__tests__/source-card.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/source-card.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { SourceCard } from "@/components/source-card"

describe("SourceCard", () => {
  it("should render source title", () => {
    render(
      <SourceCard
        type="pdf"
        title="document.pdf"
        meta="125 pages"
      />
    )

    expect(screen.getByText("document.pdf")).toBeInTheDocument()
  })

  it("should render metadata", () => {
    render(
      <SourceCard
        type="pdf"
        title="document.pdf"
        meta="125 pages"
      />
    )

    expect(screen.getByText("125 pages")).toBeInTheDocument()
  })

  it("should render progress bar when processing", () => {
    render(
      <SourceCard
        type="web"
        title="example.com"
        meta="Crawling"
        processing={70}
      />
    )

    const progress = screen.getByRole("progressbar")
    expect(progress).toBeInTheDocument()
  })

  it("should render error message when provided", () => {
    render(
      <SourceCard
        type="github"
        title="org/repo"
        meta="Failed"
        error="Rate limited"
      />
    )

    expect(screen.getByText("Rate limited")).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test source-card
```

Expected: FAIL - SourceCard doesn't exist

**Step 3: Write minimal implementation**

Create: `apps/web/components/source-card.tsx`

```typescript
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test source-card
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/source-card.tsx apps/web/__tests__/source-card.test.tsx
git commit -m "feat(web): add source card component with TDD"
```

---

## Task 20: Create Empty Sources State Component (TDD)

**Files:**
- Create: `apps/web/components/empty-sources.tsx`
- Create: `apps/web/__tests__/empty-sources.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/empty-sources.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { EmptySources } from "@/components/empty-sources"

describe("EmptySources", () => {
  it("should render empty state message", () => {
    render(<EmptySources />)
    expect(screen.getByText("No sources yet")).toBeInTheDocument()
  })

  it("should render add source button", () => {
    render(<EmptySources />)
    expect(screen.getByRole("button", { name: /add source/i })).toBeInTheDocument()
  })

  it("should render icon", () => {
    render(<EmptySources />)
    const card = screen.getByText("No sources yet").closest("div")
    expect(card).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test empty-sources
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/empty-sources.tsx`

```typescript
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test empty-sources
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/empty-sources.tsx apps/web/__tests__/empty-sources.test.tsx
git commit -m "feat(web): add empty sources state with TDD"
```

---

## Task 21: Create Source Panel Component (TDD)

**Files:**
- Create: `apps/web/components/source-panel.tsx`
- Create: `apps/web/__tests__/source-panel.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/source-panel.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { SourcePanel } from "@/components/source-panel"

describe("SourcePanel", () => {
  it("should render Sources header", () => {
    render(<SourcePanel />)
    expect(screen.getByText("Sources")).toBeInTheDocument()
  })

  it("should render add button", () => {
    render(<SourcePanel />)
    const addButton = screen.getByLabelText("Add source")
    expect(addButton).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<SourcePanel />)
    const panel = screen.getByText("Sources").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test source-panel
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/source-panel.tsx`

```typescript
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { Plus } from "lucide-react"
import { EmptySources } from "@/components/empty-sources"
import { SourceCard } from "@/components/source-card"

export function SourcePanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Sources</h2>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="rounded-full h-8 w-8"
              aria-label="Add source"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Add source</TooltipContent>
        </Tooltip>
      </div>

      <ScrollArea className="flex-1 p-4">
        <EmptySources />

        <div className="mt-4 space-y-2">
          <SourceCard
            type="pdf"
            title="document-name.pdf"
            meta="125 pages • 45,231 words"
          />
          <SourceCard
            type="web"
            title="https://example.com/guide"
            meta="Updated 2 days ago"
            processing={70}
          />
          <SourceCard
            type="github"
            title="org/notebooklm-clone"
            meta="Updated 1 hour ago"
            error="Rate limited. Retry."
          />
        </div>
      </ScrollArea>
    </div>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test source-panel
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/source-panel.tsx apps/web/__tests__/source-panel.test.tsx
git commit -m "feat(web): add source panel component with TDD"
```

---

## Task 22: Create Chat Message Components (TDD)

**Files:**
- Create: `apps/web/components/chat-message.tsx`
- Create: `apps/web/__tests__/chat-message.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/chat-message.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { AssistantMessage, UserMessage } from "@/components/chat-message"

describe("Chat Messages", () => {
  describe("AssistantMessage", () => {
    it("should render assistant label", () => {
      render(<AssistantMessage>Hello</AssistantMessage>)
      expect(screen.getByText("Assistant")).toBeInTheDocument()
    })

    it("should render message content", () => {
      render(<AssistantMessage>Test message</AssistantMessage>)
      expect(screen.getByText("Test message")).toBeInTheDocument()
    })
  })

  describe("UserMessage", () => {
    it("should render user message", () => {
      render(<UserMessage>User question</UserMessage>)
      expect(screen.getByText("User question")).toBeInTheDocument()
    })

    it("should align to right on mobile", () => {
      render(<UserMessage>Test</UserMessage>)
      const message = screen.getByText("Test")
      const container = message.closest("div")?.parentElement
      expect(container).toHaveClass("justify-end")
    })
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test chat-message
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/chat-message.tsx`

```typescript
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test chat-message
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/chat-message.tsx apps/web/__tests__/chat-message.test.tsx
git commit -m "feat(web): add chat message components with TDD"
```

---

## Task 23: Create Chat Composer Component (TDD)

**Files:**
- Create: `apps/web/components/chat-composer.tsx`
- Create: `apps/web/__tests__/chat-composer.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/chat-composer.test.tsx`

```typescript
import { render, screen, fireEvent } from "@testing-library/react"
import { ChatComposer } from "@/components/chat-composer"

describe("ChatComposer", () => {
  it("should render textarea", () => {
    render(<ChatComposer />)
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument()
  })

  it("should render send button", () => {
    render(<ChatComposer />)
    expect(screen.getByLabelText("Send")).toBeInTheDocument()
  })

  it("should disable send button when empty", () => {
    render(<ChatComposer />)
    const button = screen.getByLabelText("Send")
    expect(button).toBeDisabled()
  })

  it("should enable send button with text", () => {
    render(<ChatComposer />)
    const textarea = screen.getByPlaceholderText(/ask anything/i)
    const button = screen.getByLabelText("Send")

    fireEvent.change(textarea, { target: { value: "Hello" } })
    expect(button).not.toBeDisabled()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test chat-composer
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/chat-composer.tsx`

```typescript
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
      <div className="rounded-2xl border bg-card/60 shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
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
            className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent px-2 py-2 text-sm focus-visible:ring-0"
          />

          <Button
            onClick={send}
            disabled={!value.trim()}
            size="icon"
            className="h-9 w-9 shrink-0 rounded-full mb-1"
            aria-label="Send"
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test chat-composer
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/chat-composer.tsx apps/web/__tests__/chat-composer.test.tsx
git commit -m "feat(web): add chat composer component with TDD"
```

---

## Task 24: Create Empty Chat State Component (TDD)

**Files:**
- Create: `apps/web/components/empty-chat.tsx`
- Create: `apps/web/__tests__/empty-chat.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/empty-chat.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { EmptyChat } from "@/components/empty-chat"

describe("EmptyChat", () => {
  it("should render heading", () => {
    render(<EmptyChat />)
    expect(screen.getByText("Ask me anything")).toBeInTheDocument()
  })

  it("should render description", () => {
    render(<EmptyChat />)
    expect(screen.getByText(/help you understand/i)).toBeInTheDocument()
  })

  it("should render suggestion buttons", () => {
    render(<EmptyChat />)
    expect(screen.getByText("What are the main themes?")).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test empty-chat
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/empty-chat.tsx`

```typescript
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test empty-chat
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/empty-chat.tsx apps/web/__tests__/empty-chat.test.tsx
git commit -m "feat(web): add empty chat state with TDD"
```

---

## Task 25: Create Chat Panel Component (TDD)

**Files:**
- Create: `apps/web/components/chat-panel.tsx`
- Create: `apps/web/__tests__/chat-panel.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/chat-panel.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { ChatPanel } from "@/components/chat-panel"

describe("ChatPanel", () => {
  it("should render Chat header", () => {
    render(<ChatPanel />)
    expect(screen.getByText("Chat")).toBeInTheDocument()
  })

  it("should render chat composer", () => {
    render(<ChatPanel />)
    expect(screen.getByPlaceholderText(/ask anything/i)).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<ChatPanel />)
    const panel = screen.getByText("Chat").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test chat-panel
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/chat-panel.tsx`

```typescript
import { ScrollArea } from "@/components/ui/scroll-area"
import { EmptyChat } from "@/components/empty-chat"
import { ChatComposer } from "@/components/chat-composer"
import { AssistantMessage, UserMessage } from "@/components/chat-message"

export function ChatPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Chat</h2>
      </div>

      <ScrollArea className="flex-1 px-4 py-6">
        <EmptyChat />

        <div className="mt-8 space-y-4">
          <AssistantMessage>
            Based on the sources, the key findings are: 1) Finding one 2) Finding two 3) Finding three
          </AssistantMessage>
          <UserMessage>What are the key findings in the research?</UserMessage>
        </div>
      </ScrollArea>

      <div className="border-t bg-background/95 backdrop-blur px-4 py-3">
        <ChatComposer />
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test chat-panel
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/chat-panel.tsx apps/web/__tests__/chat-panel.test.tsx
git commit -m "feat(web): add chat panel component with TDD"
```

---

## Task 26: Create Studio Tile Component (TDD)

**Files:**
- Create: `apps/web/components/studio-tile.tsx`
- Create: `apps/web/__tests__/studio-tile.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/studio-tile.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { StudioTile } from "@/components/studio-tile"
import { Music2 } from "lucide-react"

describe("StudioTile", () => {
  it("should render title", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByText("Audio Overview")).toBeInTheDocument()
  })

  it("should render description", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByText("Generate a podcast")).toBeInTheDocument()
  })

  it("should render CTA button", () => {
    render(
      <StudioTile
        icon={<Music2 />}
        title="Audio Overview"
        desc="Generate a podcast"
        cta="Generate"
      />
    )

    expect(screen.getByRole("button", { name: "Generate" })).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test studio-tile
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/studio-tile.tsx`

```typescript
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
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test studio-tile
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/studio-tile.tsx apps/web/__tests__/studio-tile.test.tsx
git commit -m "feat(web): add studio tile component with TDD"
```

---

## Task 27: Create Studio Panel Component (TDD)

**Files:**
- Create: `apps/web/components/studio-panel.tsx`
- Create: `apps/web/__tests__/studio-panel.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/studio-panel.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import { StudioPanel } from "@/components/studio-panel"

describe("StudioPanel", () => {
  it("should render Studio header", () => {
    render(<StudioPanel />)
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should render studio features", () => {
    render(<StudioPanel />)
    expect(screen.getByText("Audio Overview")).toBeInTheDocument()
    expect(screen.getByText("Video Overview")).toBeInTheDocument()
    expect(screen.getByText("Mind Map")).toBeInTheDocument()
  })

  it("should render scrollable area", () => {
    render(<StudioPanel />)
    const panel = screen.getByText("Studio").closest("div")
    expect(panel).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test studio-panel
```

Expected: FAIL

**Step 3: Write minimal implementation**

Create: `apps/web/components/studio-panel.tsx`

```typescript
import { ScrollArea } from "@/components/ui/scroll-area"
import { StudioTile } from "@/components/studio-tile"
import { Music2, Play, ListTree } from "lucide-react"

export function StudioPanel() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex h-14 items-center border-b px-4">
        <h2 className="text-sm font-semibold">Studio</h2>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-3">
          <StudioTile
            icon={<Music2 className="h-6 w-6" />}
            title="Audio Overview"
            desc="Generate a podcast-style discussion"
            cta="Generate"
          />
          <StudioTile
            icon={<Play className="h-6 w-6" />}
            title="Video Overview"
            desc="Create a summary video"
            cta="Generate"
          />
          <StudioTile
            icon={<ListTree className="h-6 w-6" />}
            title="Mind Map"
            desc="Visualize connections between topics"
            cta="Generate"
          />
        </div>
      </ScrollArea>
    </div>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test studio-panel
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/components/studio-panel.tsx apps/web/__tests__/studio-panel.test.tsx
git commit -m "feat(web): add studio panel component with TDD"
```

---

## Task 28: Create Mobile Main Page (TDD)

**Files:**
- Modify: `apps/web/app/page.tsx`
- Create: `apps/web/__tests__/page.test.tsx`

**Step 1: Write failing test**

Create: `apps/web/__tests__/page.test.tsx`

```typescript
import { render, screen } from "@testing-library/react"
import Home from "@/app/page"

describe("Home Page", () => {
  it("should render header", () => {
    render(<Home />)
    expect(screen.getByText("Taboot")).toBeInTheDocument()
  })

  it("should render all three sections on mobile", () => {
    render(<Home />)
    expect(screen.getByText("Sources")).toBeInTheDocument()
    expect(screen.getByText("Chat")).toBeInTheDocument()
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should stack panels vertically on mobile", () => {
    render(<Home />)
    const main = screen.getByRole("main")
    expect(main).toHaveClass("space-y-4")
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test page
```

Expected: FAIL

**Step 3: Write minimal implementation**

Replace `apps/web/app/page.tsx`:

```typescript
"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "sonner"
import { DesignTokens } from "@/components/design-tokens"
import { Header } from "@/components/header"
import { SourcePanel } from "@/components/source-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"

export default function Home() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <DesignTokens />
        <Header />

        <main className="mx-auto max-w-screen-2xl px-4 py-4 space-y-4">
          <section className="rounded-2xl border bg-card h-[600px]">
            <SourcePanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <ChatPanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <StudioPanel />
          </section>
        </main>

        <Toaster position="top-right" richColors />
      </div>
    </TooltipProvider>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test page
```

Expected: PASS

**Step 5: Verify mobile layout**

Run:
```bash
pnpm dev
```

Open http://localhost:3000 and verify:
- Panels stack vertically
- Layout works on 320px viewport
- All components render

**Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/__tests__/page.test.tsx
git commit -m "feat(web): create mobile-first main page with TDD"
```

---

## Task 29: Install Desktop Enhancement Dependencies

**Files:**
- Create: `apps/web/components/ui/resizable.tsx`

**Step 1: Install resizable component**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpx shadcn@latest add resizable
```

Expected: Resizable component installed

**Step 2: Verify**

Run:
```bash
head -20 apps/web/components/ui/resizable.tsx
```

Expected: ResizablePanelGroup export

**Step 3: Commit**

```bash
git add apps/web/components/ui/resizable.tsx apps/web/package.json
git commit -m "feat(web): add resizable component for desktop layout"
```

---

## Task 30: Add Desktop Three-Panel Layout (TDD)

**Files:**
- Modify: `apps/web/app/page.tsx`
- Modify: `apps/web/__tests__/page.test.tsx`

**Step 1: Write failing test for desktop**

Update: `apps/web/__tests__/page.test.tsx`

Add test:
```typescript
describe("Desktop Layout", () => {
  beforeEach(() => {
    global.innerWidth = 1024
  })

  it("should render three-panel resizable layout on desktop", () => {
    render(<Home />)

    // All panels should be visible
    expect(screen.getByText("Sources")).toBeInTheDocument()
    expect(screen.getByText("Chat")).toBeInTheDocument()
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should hide mobile layout on desktop", () => {
    render(<Home />)
    const main = screen.getByRole("main")

    // Desktop uses different structure
    expect(main.querySelector(".md\\:hidden")).not.toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify failure**

Run:
```bash
pnpm test page
```

Expected: FAIL - desktop layout doesn't exist

**Step 3: Update page.tsx with responsive layout**

Update `apps/web/app/page.tsx`:

```typescript
"use client"

import { TooltipProvider } from "@/components/ui/tooltip"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Toaster } from "sonner"
import { DesignTokens } from "@/components/design-tokens"
import { Header } from "@/components/header"
import { SourcePanel } from "@/components/source-panel"
import { ChatPanel } from "@/components/chat-panel"
import { StudioPanel } from "@/components/studio-panel"

export default function Home() {
  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground">
        <DesignTokens />
        <Header />

        {/* Desktop: Three-panel resizable layout */}
        <main className="mx-auto max-w-screen-2xl px-4 hidden md:block">
          <ResizablePanelGroup
            direction="horizontal"
            className="mt-4 rounded-2xl border bg-card h-[calc(100vh-6rem)]"
          >
            <ResizablePanel defaultSize={28} minSize={22} className="min-w-[240px]">
              <SourcePanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={48} minSize={40}>
              <ChatPanel />
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel defaultSize={24} minSize={20} className="min-w-[280px]">
              <StudioPanel />
            </ResizablePanel>
          </ResizablePanelGroup>
        </main>

        {/* Mobile: Vertical stack */}
        <main className="mx-auto max-w-screen-2xl px-4 py-4 space-y-4 md:hidden">
          <section className="rounded-2xl border bg-card h-[600px]">
            <SourcePanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <ChatPanel />
          </section>

          <section className="rounded-2xl border bg-card h-[600px]">
            <StudioPanel />
          </section>
        </main>

        <Toaster position="top-right" richColors />
      </div>
    </TooltipProvider>
  )
}
```

**Step 4: Run test to verify pass**

Run:
```bash
pnpm test page
```

Expected: PASS

**Step 5: Test responsive layout manually**

Run:
```bash
pnpm dev
```

Verify:
- Mobile (< 768px): Vertical stack
- Desktop (≥ 768px): Three-panel resizable
- Resizable handles work

**Step 6: Commit**

```bash
git add apps/web/app/page.tsx apps/web/__tests__/page.test.tsx
git commit -m "feat(web): add desktop three-panel resizable layout"
```

---

## Task 31: Write Integration Tests

**Files:**
- Create: `apps/web/__tests__/integration.test.tsx`

**Step 1: Write integration tests**

Create: `apps/web/__tests__/integration.test.tsx`

```typescript
import { render, screen, fireEvent } from "@testing-library/react"
import Home from "@/app/page"

describe("NotebookLM Integration", () => {
  it("should render complete application", () => {
    render(<Home />)

    // Header
    expect(screen.getByText("Taboot")).toBeInTheDocument()

    // Panels
    expect(screen.getByText("Sources")).toBeInTheDocument()
    expect(screen.getByText("Chat")).toBeInTheDocument()
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should enable send button when typing", () => {
    render(<Home />)

    const textarea = screen.getByPlaceholderText(/ask anything/i)
    const button = screen.getByLabelText("Send")

    expect(button).toBeDisabled()

    fireEvent.change(textarea, { target: { value: "Test question" } })

    expect(button).not.toBeDisabled()
  })

  it("should render source cards", () => {
    render(<Home />)

    expect(screen.getByText("document-name.pdf")).toBeInTheDocument()
    expect(screen.getByText(/125 pages/)).toBeInTheDocument()
  })

  it("should render studio features", () => {
    render(<Home />)

    expect(screen.getByText("Audio Overview")).toBeInTheDocument()
    expect(screen.getByText("Video Overview")).toBeInTheDocument()
    expect(screen.getByText("Mind Map")).toBeInTheDocument()
  })
})
```

**Step 2: Run integration tests**

Run:
```bash
pnpm test integration
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/web/__tests__/integration.test.tsx
git commit -m "test(web): add integration tests for NotebookLM UI"
```

---

## Task 32: Update README with Documentation

**Files:**
- Modify: `apps/web/README.md`

**Step 1: Add NotebookLM section**

Append to `apps/web/README.md`:

```markdown
## NotebookLM UI Clone

Mobile-first, component-driven NotebookLM interface built with TDD.

### Features

- **Mobile-First Design**: Optimized for 320px+ viewports
- **Responsive Layout**: Vertical stack (mobile) → Three-panel resizable (desktop)
- **Dark Theme**: Material Design Light Blue accent (#03A9F4)
- **Modular Components**: Small, focused, testable components (max 100 lines)
- **TDD Approach**: All components built with Red-Green-Refactor

### Architecture

**Component Structure:**
```
components/
├── design-tokens.tsx        # HSL color tokens
├── header.tsx              # App header with branding
├── source-panel.tsx        # Source management panel
├── source-card.tsx         # Individual source card
├── empty-sources.tsx       # Empty state for sources
├── chat-panel.tsx          # Chat interface panel
├── chat-message.tsx        # Message bubbles (assistant/user)
├── chat-composer.tsx       # Message input area
├── empty-chat.tsx          # Empty state for chat
├── studio-panel.tsx        # Studio features panel
└── studio-tile.tsx         # Studio feature card
```

**Responsive Strategy:**
- Mobile (< 768px): Vertical stack, full-width panels
- Desktop (≥ 768px): Three-panel resizable layout
- Touch targets: 44px minimum for mobile

### Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 4
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner
- **Testing**: Jest + React Testing Library

### Development

```bash
pnpm dev        # Start dev server (http://localhost:3000)
pnpm build      # Production build
pnpm test       # Run all tests
pnpm test:watch # Watch mode
```

### Design Tokens

Custom HSL values in `:root.dark`:
- Background: `220 18% 9%` (~#141820)
- Primary: `199 98% 49%` (#03A9F4)
- Card: `220 18% 11%`
- Border: `220 14% 22%`

### Testing

All components built with TDD (Red-Green-Refactor):
1. Write failing test
2. Run to verify failure
3. Write minimal implementation
4. Run to verify pass
5. Commit

Test coverage: Unit tests for all components + integration tests.
```

**Step 2: Verify documentation**

Run:
```bash
cat apps/web/README.md | tail -60
```

Expected: Documentation visible

**Step 3: Commit**

```bash
git add apps/web/README.md
git commit -m "docs(web): document NotebookLM mobile-first implementation"
```

---

## Task 33: Remove MOCK_UI.ts

**Files:**
- Delete: `apps/web/MOCK_UI.ts`

**Step 1: Remove mock file**

Run:
```bash
rm /mnt/cache/compose/pulse/apps/web/MOCK_UI.ts
```

Expected: File deleted

**Step 2: Verify removal**

Run:
```bash
ls -la /mnt/cache/compose/pulse/apps/web/MOCK_UI.ts 2>&1
```

Expected: "No such file or directory"

**Step 3: Commit**

```bash
git add -A
git commit -m "chore(web): remove MOCK_UI.ts after implementation"
```

---

## Task 34: Final Verification

**Files:**
- All files

**Step 1: Run full test suite**

Run:
```bash
cd /mnt/cache/compose/pulse/apps/web
pnpm test
```

Expected: All tests pass

**Step 2: Build production bundle**

Run:
```bash
pnpm build
```

Expected: Build succeeds without errors

**Step 3: Test production build**

Run:
```bash
pnpm start
```

Expected: App runs on http://localhost:3000

**Step 4: Manual verification checklist**

Open http://localhost:3000 and verify:
- [ ] Mobile layout (320px): Vertical stack, scrollable
- [ ] Tablet layout (768px): Three panels visible
- [ ] Desktop layout (1024px+): Resizable panels work
- [ ] Dark theme applied correctly
- [ ] All interactive elements functional
- [ ] No console errors

**Step 5: Final commit**

```bash
git add .
git commit -m "feat(web): complete NotebookLM UI mobile-first implementation

- Built all components with TDD (Red-Green-Refactor)
- Mobile-first responsive design (320px → desktop)
- Modular components (max 100 lines each)
- Three-panel resizable desktop layout
- Dark theme with Material Blue accent
- Comprehensive test coverage
- Full documentation"
```

---

## Summary

**Total Tasks**: 34
**Estimated Time**: 3-4 hours
**Approach**: Mobile-first, TDD, modular components

**Key Deliverables**:
1. ✅ Mobile-first responsive layout
2. ✅ TDD for all components (Red-Green-Refactor)
3. ✅ Small, focused components (max 100 lines)
4. ✅ Desktop three-panel resizable enhancement
5. ✅ Dark theme with custom tokens
6. ✅ Comprehensive test coverage
7. ✅ Complete documentation

**Component Breakdown**:
- 11 shadcn/ui components installed
- 11 custom components created (all < 100 lines)
- 12 test files with unit + integration tests
- 1 main page orchestrating components
- 1 design tokens component

**Testing Strategy**:
- Every component: Red-Green-Refactor
- Unit tests: Individual component behavior
- Integration tests: Full application flow
- Manual tests: Responsive breakpoints

**Mobile-First Benefits**:
- Simpler base implementation
- Progressive enhancement for desktop
- Better performance on mobile
- Easier to maintain and test
