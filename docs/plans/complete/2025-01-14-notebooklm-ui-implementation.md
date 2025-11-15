# NotebookLM UI Clone Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clone the MOCK_UI.ts NotebookLM-style interface into the apps/web Next.js application with full shadcn/ui components and responsive layout.

**Architecture:** Convert the standalone React component into a Next.js app with proper routing, install all required shadcn/ui components, configure Tailwind with custom design tokens, and maintain the three-panel resizable layout with mobile responsiveness.

**Tech Stack:** Next.js 16, React 19, shadcn/ui (Radix UI primitives), Tailwind CSS 4, Framer Motion, Sonner toasts, TypeScript 5

---

## Prerequisites

**Required shadcn/ui components to install:**
- resizable (panel layout)
- card
- button
- badge
- scroll-area
- textarea
- input
- progress
- tabs
- dialog
- dropdown-menu
- tooltip
- avatar
- separator
- sheet
- skeleton

**Additional dependencies:**
- framer-motion (animations)
- sonner (toast notifications)

---

## Task 1: Install Required Dependencies

**Files:**
- Modify: `apps/web/package.json`

**Step 1: Add framer-motion and sonner**

Run:
```bash
cd /compose/pulse/apps/web
pnpm add framer-motion sonner
```

Expected: Dependencies added to package.json

**Step 2: Verify installation**

Run:
```bash
cd /compose/pulse/apps/web
pnpm list framer-motion sonner
```

Expected: Both packages listed with versions

**Step 3: Commit**

```bash
git add apps/web/package.json apps/web/pnpm-lock.yaml
git commit -m "chore(web): add framer-motion and sonner dependencies"
```

---

## Task 2: Install shadcn/ui Resizable Component

**Files:**
- Create: `apps/web/components/ui/resizable.tsx`

**Step 1: Install resizable component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add resizable
```

Expected: Component created in components/ui/resizable.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/resizable.tsx | head -20
```

Expected: File exists with ResizablePanelGroup export

**Step 3: Commit**

```bash
git add apps/web/components/ui/resizable.tsx apps/web/package.json
git commit -m "feat(web): add shadcn resizable component"
```

---

## Task 3: Install shadcn/ui Card Component

**Files:**
- Create: `apps/web/components/ui/card.tsx`

**Step 1: Install card component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add card
```

Expected: Component created in components/ui/card.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/card.tsx | head -20
```

Expected: File exists with Card, CardHeader, CardTitle exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/card.tsx
git commit -m "feat(web): add shadcn card component"
```

---

## Task 4: Install shadcn/ui Badge Component

**Files:**
- Create: `apps/web/components/ui/badge.tsx`

**Step 1: Install badge component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add badge
```

Expected: Component created in components/ui/badge.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/badge.tsx | head -20
```

Expected: File exists with Badge export

**Step 3: Commit**

```bash
git add apps/web/components/ui/badge.tsx
git commit -m "feat(web): add shadcn badge component"
```

---

## Task 5: Install shadcn/ui ScrollArea Component

**Files:**
- Create: `apps/web/components/ui/scroll-area.tsx`

**Step 1: Install scroll-area component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add scroll-area
```

Expected: Component created in components/ui/scroll-area.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/scroll-area.tsx | head -20
```

Expected: File exists with ScrollArea export

**Step 3: Commit**

```bash
git add apps/web/components/ui/scroll-area.tsx
git commit -m "feat(web): add shadcn scroll-area component"
```

---

## Task 6: Install shadcn/ui Textarea Component

**Files:**
- Create: `apps/web/components/ui/textarea.tsx`

**Step 1: Install textarea component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add textarea
```

Expected: Component created in components/ui/textarea.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/textarea.tsx | head -20
```

Expected: File exists with Textarea export

**Step 3: Commit**

```bash
git add apps/web/components/ui/textarea.tsx
git commit -m "feat(web): add shadcn textarea component"
```

---

## Task 7: Install shadcn/ui Input Component

**Files:**
- Create: `apps/web/components/ui/input.tsx`

**Step 1: Install input component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add input
```

Expected: Component created in components/ui/input.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/input.tsx | head -20
```

Expected: File exists with Input export

**Step 3: Commit**

```bash
git add apps/web/components/ui/input.tsx
git commit -m "feat(web): add shadcn input component"
```

---

## Task 8: Install shadcn/ui Progress Component

**Files:**
- Create: `apps/web/components/ui/progress.tsx`

**Step 1: Install progress component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add progress
```

Expected: Component created in components/ui/progress.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/progress.tsx | head -20
```

Expected: File exists with Progress export

**Step 3: Commit**

```bash
git add apps/web/components/ui/progress.tsx
git commit -m "feat(web): add shadcn progress component"
```

---

## Task 9: Install shadcn/ui Tabs Component

**Files:**
- Create: `apps/web/components/ui/tabs.tsx`

**Step 1: Install tabs component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add tabs
```

Expected: Component created in components/ui/tabs.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/tabs.tsx | head -20
```

Expected: File exists with Tabs, TabsList, TabsTrigger exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/tabs.tsx
git commit -m "feat(web): add shadcn tabs component"
```

---

## Task 10: Install shadcn/ui Dialog Component

**Files:**
- Create: `apps/web/components/ui/dialog.tsx`

**Step 1: Install dialog component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add dialog
```

Expected: Component created in components/ui/dialog.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/dialog.tsx | head -20
```

Expected: File exists with Dialog, DialogContent, DialogHeader exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/dialog.tsx
git commit -m "feat(web): add shadcn dialog component"
```

---

## Task 11: Install shadcn/ui DropdownMenu Component

**Files:**
- Create: `apps/web/components/ui/dropdown-menu.tsx`

**Step 1: Install dropdown-menu component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add dropdown-menu
```

Expected: Component created in components/ui/dropdown-menu.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/dropdown-menu.tsx | head -20
```

Expected: File exists with DropdownMenu, DropdownMenuContent exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/dropdown-menu.tsx
git commit -m "feat(web): add shadcn dropdown-menu component"
```

---

## Task 12: Install shadcn/ui Tooltip Component

**Files:**
- Create: `apps/web/components/ui/tooltip.tsx`

**Step 1: Install tooltip component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add tooltip
```

Expected: Component created in components/ui/tooltip.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/tooltip.tsx | head -20
```

Expected: File exists with Tooltip, TooltipProvider exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/tooltip.tsx
git commit -m "feat(web): add shadcn tooltip component"
```

---

## Task 13: Install shadcn/ui Avatar Component

**Files:**
- Create: `apps/web/components/ui/avatar.tsx`

**Step 1: Install avatar component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add avatar
```

Expected: Component created in components/ui/avatar.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/avatar.tsx | head -20
```

Expected: File exists with Avatar, AvatarFallback exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/avatar.tsx
git commit -m "feat(web): add shadcn avatar component"
```

---

## Task 14: Install shadcn/ui Separator Component

**Files:**
- Create: `apps/web/components/ui/separator.tsx`

**Step 1: Install separator component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add separator
```

Expected: Component created in components/ui/separator.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/separator.tsx | head -20
```

Expected: File exists with Separator export

**Step 3: Commit**

```bash
git add apps/web/components/ui/separator.tsx
git commit -m "feat(web): add shadcn separator component"
```

---

## Task 15: Install shadcn/ui Sheet Component

**Files:**
- Create: `apps/web/components/ui/sheet.tsx`

**Step 1: Install sheet component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add sheet
```

Expected: Component created in components/ui/sheet.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/sheet.tsx | head -20
```

Expected: File exists with Sheet, SheetContent exports

**Step 3: Commit**

```bash
git add apps/web/components/ui/sheet.tsx
git commit -m "feat(web): add shadcn sheet component"
```

---

## Task 16: Install shadcn/ui Skeleton Component

**Files:**
- Create: `apps/web/components/ui/skeleton.tsx`

**Step 1: Install skeleton component**

Run:
```bash
cd /compose/pulse/apps/web
pnpx shadcn@latest add skeleton
```

Expected: Component created in components/ui/skeleton.tsx

**Step 2: Verify component exists**

Run:
```bash
cat apps/web/components/ui/skeleton.tsx | head -20
```

Expected: File exists with Skeleton export

**Step 3: Commit**

```bash
git add apps/web/components/ui/skeleton.tsx
git commit -m "feat(web): add shadcn skeleton component"
```

---

## Task 17: Replace Root Layout with NotebookLM Layout

**Files:**
- Modify: `apps/web/app/layout.tsx`

**Step 1: Write the test for dark mode**

Create: `apps/web/__tests__/notebooklm-layout.test.tsx`

```typescript
import { render } from "@testing-library/react"
import RootLayout from "@/app/layout"

describe("NotebookLM Layout", () => {
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
cd /compose/pulse/apps/web
pnpm test notebooklm-layout
```

Expected: FAIL - dark class not applied

**Step 3: Update layout.tsx with metadata and fonts**

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
cd /compose/pulse/apps/web
pnpm test notebooklm-layout
```

Expected: PASS

**Step 5: Commit**

```bash
git add apps/web/app/layout.tsx apps/web/__tests__/notebooklm-layout.test.tsx
git commit -m "feat(web): update layout for NotebookLM dark theme"
```

---

## Task 18: Create NotebookLM Main Page Component

**Files:**
- Modify: `apps/web/app/page.tsx`

**Step 1: Copy MOCK_UI.ts to page.tsx with Next.js adjustments**

Replace `apps/web/app/page.tsx` content:

```typescript
"use client"

import React from "react"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Toaster, toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import { motion } from "framer-motion"
import {
  Plus,
  MoreHorizontal,
  ArrowUpRight,
  Settings,
  ArrowUp,
  Menu,
  Play,
  FileText,
  Globe,
  Github,
  Music2,
  ListTree,
  User,
  Loader2,
  Link as LinkIcon,
  Download,
  Trash2,
  UploadCloud,
  Sparkles,
  ChevronLeft,
} from "lucide-react"

/**
 * NotebookLM UI Clone — Dark theme w/ Material Light Blue accent
 */

export default function NotebookLM_RefinedPolish() {
  // Force dark mode on root so shadcn tokens resolve
  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("dark")
    }
  }, [])

  // Lightweight runtime checks ("tests") to prevent regression of theme tokens
  React.useEffect(() => {
    const cs = getComputedStyle(document.documentElement)
    console.assert(!!cs.getPropertyValue("--background"), "Token --background should be defined")
    console.assert(document.documentElement.classList.contains("dark"), "html.dark should be present for dark theme")
  }, [])

  return (
    <TooltipProvider>
      <div className="min-h-screen bg-background text-foreground antialiased">
        <DesignTokens />
        <Header />

        {/* Desktop/Tablet */}
        <main className="mx-auto hidden max-w-screen-2xl px-4 md:block">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
            <ResizablePanelGroup direction="horizontal" className="mt-4 rounded-2xl border bg-card">
              <ResizablePanel defaultSize={28} minSize={22} className="min-w-[240px] rounded-l-2xl">
                <SourcePanel />
              </ResizablePanel>
              <FancyHandle />
              <ResizablePanel defaultSize={48} minSize={40}>
                <ChatPanel />
              </ResizablePanel>
              <FancyHandle />
              <ResizablePanel defaultSize={24} minSize={20} className="min-w-[280px] rounded-r-2xl">
                <StudioPanel />
              </ResizablePanel>
            </ResizablePanelGroup>
          </motion.div>
        </main>

        {/* Mobile */}
        <div className="md:hidden">
          <MobilePanels />
        </div>
        <Toaster position="top-right" richColors />
      </div>
    </TooltipProvider>
  )
}

function DesignTokens() {
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

function Header() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center gap-3 px-6">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border">
            <div className="h-4 w-4 rounded-sm bg-primary" />
          </div>
          <span className="hidden text-[16px] font-semibold sm:inline">Taboot</span>
        </div>
        <Separator orientation="vertical" className="mx-3 hidden h-6 sm:inline" />
        <EditableTitle />
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Share
          </Button>
          <Button variant="ghost" size="icon" aria-label="Settings">
            <Settings className="h-5 w-5" />
          </Button>
          <MobileSwitch />
        </div>
      </div>
    </header>
  )
}

function EditableTitle() {
  const [editing, setEditing] = React.useState(false)
  const [value, setValue] = React.useState("Notebook Title")
  return (
    <div className="group relative max-w-[320px]">
      {editing ? (
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => setEditing(false)}
          className="h-9"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="truncate rounded-md px-2 py-1 text-[16px] font-medium tracking-[-0.02em] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {value}
        </button>
      )}
    </div>
  )
}

function PanelHeader({
  title,
  action,
  onCollapse,
}: {
  title: string
  action?: React.ReactNode
  onCollapse?: () => void
}) {
  return (
    <div className="sticky top-0 z-10 grid h-14 grid-cols-[auto_1fr_auto] items-center gap-2 border-b bg-background px-3">
      {onCollapse ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label="Collapse panel"
          onClick={onCollapse}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      ) : (
        <span className="w-7" />
      )}
      <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em]">{title}</h2>
      <div className="ml-auto flex items-center gap-1">{action}</div>
    </div>
  )
}

/* ------------------------ SOURCES ------------------------ */
function SourcePanel() {
  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-l-2xl">
      <PanelHeader
        title="Sources"
        action={
          <Dialog>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="rounded-full"
                    aria-label="Add source"
                  >
                    <Plus className="h-5 w-5" />
                  </Button>
                </DialogTrigger>
              </TooltipTrigger>
              <TooltipContent>Add source</TooltipContent>
            </Tooltip>
            <AddSourceDialog />
          </Dialog>
        }
      />
      <ScrollArea className="h-[calc(100%-3.5rem)] p-4">
        <EmptySources />
        <div className="mt-4 grid gap-2">
          <SourceCard type="pdf" title="document-name.pdf" meta="125 pages • 45,231 words" />
          <SourceCard type="web" title="https://example.com/guide" meta="Updated 2 days ago" processing={70} />
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

function SourceCard({
  title,
  meta,
  type,
  processing,
  error,
}: {
  title: string
  meta: string
  type: "pdf" | "web" | "youtube" | "text" | "github" | "audio"
  processing?: number
  error?: string
}) {
  const icon = { pdf: FileText, web: Globe, youtube: Play, text: FileText, github: Github, audio: Music2 }[type]
  const Icon = icon
  return (
    <Card className="group transition-colors hover:bg-muted">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[14px] font-medium">{title}</p>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Source menu">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuItem>
                    <Sparkles className="mr-2 h-4 w-4" />
                    View
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <LinkIcon className="mr-2 h-4 w-4" />
                    Copy link
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Download className="mr-2 h-4 w-4" />
                    Download
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-red-600">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Remove
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <p className="truncate text-[12px] text-muted-foreground">{meta}</p>
            {typeof processing === "number" && (
              <div className="mt-2">
                <Progress value={processing} />
              </div>
            )}
            {error && <p className="mt-2 text-[12px] text-red-500">{error}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function EmptySources() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-3 p-10 text-center">
        <FileText className="h-10 w-10 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">No sources yet</p>
          <p className="text-xs text-muted-foreground">Add sources to get started</p>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button className="bg-primary text-primary-foreground hover:bg-[hsl(199_90%_45%)]">+ Add source</Button>
          </DialogTrigger>
          <AddSourceDialog />
        </Dialog>
      </CardContent>
    </Card>
  )
}

function AddSourceDialog() {
  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>Add source</DialogTitle>
      </DialogHeader>
      <Tabs defaultValue="upload">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="upload">Upload</TabsTrigger>
          <TabsTrigger value="website">Website</TabsTrigger>
          <TabsTrigger value="paste">Paste</TabsTrigger>
          <TabsTrigger value="google">Google</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-4">
          <motion.div whileHover={{ scale: 1.01 }} className="rounded-lg border-2 border-dashed p-8">
            <div className="flex flex-col items-center gap-2 text-center">
              <UploadCloud className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drop files here or click to browse</p>
              <p className="text-xs text-muted-foreground">PDF, Text, Markdown, Audio • Max 200MB • 500K words</p>
            </div>
          </motion.div>
        </TabsContent>
        <TabsContent value="website" className="mt-4">
          <div className="space-y-3">
            <Input placeholder="https://" />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4" />Include subpages (max 10)
            </label>
          </div>
        </TabsContent>
        <TabsContent value="paste" className="mt-4">
          <Textarea placeholder="Paste text or markdown" className="min-h-[160px]" />
          <p className="mt-1 text-xs text-muted-foreground">0 / 500,000 words</p>
        </TabsContent>
        <TabsContent value="google" className="mt-4">
          <div className="space-y-3">
            <Button variant="outline">Browse Drive…</Button>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-2/3" />
          </div>
        </TabsContent>
      </Tabs>
      <DialogFooter>
        <Button variant="ghost">Cancel</Button>
        <Button
          className="bg-primary text-primary-foreground hover:bg-[hsl(199_90%_45%)]"
          onClick={() => toast.success("Source added successfully")}
        >
          Add
        </Button>
      </DialogFooter>
    </DialogContent>
  )
}

/* ------------------------ CHAT ------------------------ */
function ChatPanel() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [atBottom, setAtBottom] = React.useState(true)
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setAtBottom(nearBottom)
  }

  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden">
      <PanelHeader title="Chat" />
      <ScrollArea
        className="h-[calc(100%-9.75rem)] px-4 md:px-6 py-4 md:py-6"
        viewportRef={scrollRef}
        onScrollCapture={onScroll}
      >
        <EmptyChat />
        <div className="mt-6 md:mt-8 space-y-3 md:space-y-4" aria-live="polite">
          <AssistantBubble>
            Based on the sources, the key findings are: 1) Finding one 2) Finding two 3) Finding three
            <div className="mt-2 flex gap-2">
              <Citation>1</Citation>
              <Citation>2</Citation>
              <Citation>3</Citation>
            </div>
          </AssistantBubble>
          <UserBubble>What are the key findings in the research?</UserBubble>
          <StreamingBubble />
        </div>
      </ScrollArea>
      {!atBottom && (
        <div className="pointer-events-auto absolute bottom-28 left-1/2 z-20 -translate-x-1/2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          >
            Scroll to bottom
          </Button>
        </div>
      )}
      <div className="sticky bottom-0 border-t bg-background/95 backdrop-blur px-4 md:px-6 py-3 md:py-4">
        <ChatComposer />
      </div>
    </div>
  )
}

function Citation({ children }: { children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant="secondary"
          className="cursor-pointer border border-primary/60 bg-primary/10 px-2 py-1 text-[12px] leading-none text-primary"
        >
          {children}
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">
        research-paper.pdf (p. 12) — "…relevant excerpt from the source that supports this claim…"
      </TooltipContent>
    </Tooltip>
  )
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full items-start gap-3">
      <Avatar className="mt-0.5 h-7 w-7 shrink-0">
        <AvatarFallback>🤖</AvatarFallback>
      </Avatar>
      <div className="max-w-[92%] sm:max-w-[88%] md:max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm shadow-sm">
        <div className="text-xs text-muted-foreground">Assistant</div>
        <div className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{children}</div>
      </div>
    </div>
  )
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[95%] sm:max-w-[80%] md:max-w-[70%] rounded-2xl rounded-br-sm bg-primary px-3 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words leading-relaxed shadow">
        {children}
      </div>
    </div>
  )
}

function StreamingBubble() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground pl-10">
      <Loader2 className="h-4 w-4 animate-spin" />
      Thinking…
    </div>
  )
}

function EmptyChat() {
  return (
    <div className="mx-auto max-w-md text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border">
        <User className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-[20px] font-semibold tracking-[-0.02em]">Ask me anything</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        I can help you understand your sources, answer questions, and generate insights.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Button variant="secondary" size="sm">
          What are the main themes?
        </Button>
        <Button variant="secondary" size="sm">Summarize key findings</Button>
        <Button variant="secondary" size="sm">Compare different sources</Button>
      </div>
    </div>
  )
}

/* ------------------------ STUDIO ------------------------ */
function StudioPanel() {
  return (
    <div className="h-[calc(100vh-6rem)] overflow-hidden rounded-r-2xl">
      <PanelHeader title="Studio" />
      <ScrollArea className="h-[calc(100%-3.5rem)] p-4">
        <div className="grid gap-3">
          <StudioTile
            icon={<Music2 className="h-6 w-6" />}
            title="Audio Overview"
            desc="Generate a podcast-style discussion"
            cta="Generate"
            badge="Ready"
          />
          <StudioTile icon={<Play className="h-6 w-6" />} title="Video Overview" desc="Create a summary video" cta="Generate" />
          <StudioTile icon={<ListTree className="h-6 w-6" />} title="Mind Map" desc="Visualize connections between topics" cta="Generate" />
          <ReportsCard />
        </div>
      </ScrollArea>
    </div>
  )
}

function ReportsCard() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-base">Reports</CardTitle>
      </CardHeader>
      <CardContent className="pb-4 pt-0 text-sm">
        <ul className="space-y-2">
          {["Briefing doc", "Study guide", "FAQ", "Timeline"].map((label) => (
            <li key={label} className="flex items-center justify-between">
              <span>{label}</span>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  toast.message(`${label} will generate soon`, {
                    icon: <Sparkles className="h-4 w-4" />,
                  })
                }
              >
                Generate
              </Button>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function StudioTile({
  icon,
  title,
  desc,
  cta,
  badge,
}: {
  icon: React.ReactNode
  title: string
  desc: string
  cta: string
  badge?: string
}) {
  return (
    <motion.div whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}>
      <Card className="transition-colors hover:bg-muted">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="truncate text-xs text-muted-foreground">{desc}</p>
          </div>
          {badge ? (
            <Badge variant="secondary" className="mr-2 bg-emerald-400/10 text-emerald-300">
              {badge}
            </Badge>
          ) : null}
          <Button variant="outline" size="sm">
            {cta}
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ------------------------ MOBILE ------------------------ */
function MobileSwitch() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open mobile tabs">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="h-24 p-0">
        <SheetHeader className="sr-only">
          <SheetTitle>Navigate</SheetTitle>
        </SheetHeader>
        <div className="grid h-full grid-cols-3 text-center text-xs">
          <a className="flex items-center justify-center gap-1 border-r" href="#sources">
            Sources
          </a>
          <a className="flex items-center justify-center gap-1 border-r" href="#chat">
            Chat
          </a>
          <a className="flex items-center justify-center gap-1" href="#studio">
            Studio
          </a>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function MobilePanels() {
  return (
    <div className="space-y-4 px-3 py-4">
      <section id="sources">
        <SourcePanel />
      </section>
      <section id="chat">
        <ChatPanel />
      </section>
      <section id="studio">
        <StudioPanel />
      </section>
    </div>
  )
}

/* ------------------------ COMPOSER ------------------------ */
function ChatComposer() {
  const [value, setValue] = React.useState("")
  const ref = React.useRef<HTMLTextAreaElement | null>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = Math.min(el.scrollHeight, 200) + "px"
  }, [value])

  const send = () => {
    if (!value.trim()) return
    toast.message("Sent", { description: value.slice(0, 80) + (value.length > 80 ? "…" : "") })
    setValue("")
  }

  return (
    <div className="relative">
      <div className="rounded-2xl border bg-card/60 shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2">
        <div className="flex items-end gap-2 p-2">
          <Button variant="ghost" size="icon" className="shrink-0" aria-label="Attach">
            <UploadCloud className="h-5 w-5 text-muted-foreground" />
          </Button>
          <Textarea
            ref={ref}
            id="chat-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask anything…  ⌘K to focus"
            className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
          />
          <div className="flex items-center gap-2 pr-2 pb-2">
            <span className="hidden text-xs text-muted-foreground sm:inline">{value.length}/2000</span>
            <Button
              onClick={send}
              disabled={!value.trim()}
              size="icon"
              className="h-9 w-9 rounded-full bg-primary text-primary-foreground hover:bg-[hsl(199_90%_45%)]"
              aria-label="Send"
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute -bottom-5 left-4 hidden text-xs text-muted-foreground sm:block">
        Enter to send • Shift+Enter for newline
      </div>
    </div>
  )
}

/* ------------------------ RESIZER HANDLE ------------------------ */
function FancyHandle() {
  return (
    <ResizableHandle withHandle className="relative w-2">
      <span className="sr-only">Resize</span>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-data-[resize-handle-active]:bg-primary" />
    </ResizableHandle>
  )
}
```

**Step 2: Verify compilation**

Run:
```bash
cd /compose/pulse/apps/web
pnpm build
```

Expected: Build succeeds without errors

**Step 3: Test in dev mode**

Run:
```bash
cd /compose/pulse/apps/web
pnpm dev
```

Expected: App runs on http://localhost:3000 with NotebookLM UI

**Step 4: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "feat(web): implement NotebookLM UI clone with three-panel layout"
```

---

## Task 19: Write Integration Tests

**Files:**
- Create: `apps/web/__tests__/notebooklm-ui.test.tsx`

**Step 1: Write component rendering tests**

```typescript
import { render, screen } from "@testing-library/react"
import NotebookLM from "@/app/page"

describe("NotebookLM UI", () => {
  it("should render header with Taboot branding", () => {
    render(<NotebookLM />)
    expect(screen.getByText("Taboot")).toBeInTheDocument()
  })

  it("should render Sources panel", () => {
    render(<NotebookLM />)
    expect(screen.getByText("Sources")).toBeInTheDocument()
  })

  it("should render Chat panel", () => {
    render(<NotebookLM />)
    expect(screen.getByText("Chat")).toBeInTheDocument()
  })

  it("should render Studio panel", () => {
    render(<NotebookLM />)
    expect(screen.getByText("Studio")).toBeInTheDocument()
  })

  it("should render empty state in Sources", () => {
    render(<NotebookLM />)
    expect(screen.getByText("No sources yet")).toBeInTheDocument()
  })

  it("should render empty state in Chat", () => {
    render(<NotebookLM />)
    expect(screen.getByText("Ask me anything")).toBeInTheDocument()
  })
})
```

**Step 2: Run tests**

Run:
```bash
cd /compose/pulse/apps/web
pnpm test notebooklm-ui
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add apps/web/__tests__/notebooklm-ui.test.tsx
git commit -m "test(web): add integration tests for NotebookLM UI"
```

---

## Task 20: Update README with UI Documentation

**Files:**
- Modify: `apps/web/README.md`

**Step 1: Add UI documentation section**

Append to `apps/web/README.md`:

```markdown
## NotebookLM UI Clone

This application implements a NotebookLM-style interface with:

### Features

- **Three-Panel Layout**: Resizable sources, chat, and studio panels
- **Dark Theme**: Material Design Light Blue accent color (#03A9F4)
- **Responsive Design**: Mobile-optimized with collapsible panels
- **Interactive Components**:
  - Source management (PDF, web, GitHub, audio)
  - AI chat interface with citations
  - Studio features (audio overview, video, mind map, reports)

### Architecture

- **Framework**: Next.js 16 with App Router
- **UI Library**: shadcn/ui (Radix UI primitives)
- **Styling**: Tailwind CSS 4 with custom design tokens
- **Animations**: Framer Motion
- **Icons**: Lucide React
- **Notifications**: Sonner

### Design Tokens

Custom HSL color values in `:root.dark`:
- Background: `220 18% 9%` (~#141820)
- Primary: `199 98% 49%` (Material Light Blue #03A9F4)
- Card: `220 18% 11%`
- Border: `220 14% 22%`

### Development

```bash
pnpm dev        # Start dev server
pnpm build      # Production build
pnpm test       # Run tests
```

### Components

All UI components are in `components/ui/`:
- Layout: resizable, card, separator, sheet
- Input: button, input, textarea
- Feedback: progress, skeleton, tooltip, badge
- Overlay: dialog, dropdown-menu
- Navigation: tabs, scroll-area
```

**Step 2: Verify documentation renders**

Run:
```bash
cat apps/web/README.md | tail -50
```

Expected: New documentation visible

**Step 3: Commit**

```bash
git add apps/web/README.md
git commit -m "docs(web): document NotebookLM UI implementation"
```

---

## Task 21: Remove MOCK_UI.ts File

**Files:**
- Delete: `apps/web/MOCK_UI.ts`

**Step 1: Remove the mock file**

Run:
```bash
rm /compose/pulse/apps/web/MOCK_UI.ts
```

Expected: File deleted

**Step 2: Verify file is gone**

Run:
```bash
ls -la /compose/pulse/apps/web/MOCK_UI.ts
```

Expected: "No such file or directory"

**Step 3: Commit**

```bash
git add apps/web/MOCK_UI.ts
git commit -m "chore(web): remove MOCK_UI.ts after implementation"
```

---

## Task 22: Final Verification

**Files:**
- All modified files

**Step 1: Run full test suite**

Run:
```bash
cd /compose/pulse/apps/web
pnpm test
```

Expected: All tests pass

**Step 2: Build production bundle**

Run:
```bash
cd /compose/pulse/apps/web
pnpm build
```

Expected: Build succeeds

**Step 3: Start production server**

Run:
```bash
cd /compose/pulse/apps/web
pnpm start
```

Expected: App runs successfully

**Step 4: Verify responsive design**

- Open http://localhost:3000
- Test desktop layout (three panels visible)
- Test mobile layout (panels stack vertically)
- Test resizable handles work
- Verify dark theme applied
- Check all interactive elements function

**Step 5: Final commit**

```bash
git add .
git commit -m "feat(web): complete NotebookLM UI clone implementation

- Installed all required shadcn/ui components
- Implemented three-panel resizable layout
- Added mobile-responsive design
- Configured dark theme with Material Blue accent
- Added comprehensive tests
- Updated documentation"
```

---

## Summary

**Total Tasks**: 22
**Estimated Time**: 2-3 hours
**Files Created**: 16 shadcn/ui components, 2 test files
**Files Modified**: page.tsx, layout.tsx, package.json, README.md
**Files Deleted**: MOCK_UI.ts

**Key Deliverables**:
1. Fully functional NotebookLM UI clone
2. All shadcn/ui components installed
3. Responsive three-panel layout
4. Dark theme with custom design tokens
5. Comprehensive test coverage
6. Updated documentation
