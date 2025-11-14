import React from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster, toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
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
} from "lucide-react";

/**
 * NotebookLM UI Clone — Dark theme w/ Material Light Blue accent
 *
 * This file previously threw a SyntaxError due to stray closing braces/parentheses.
 * The structure below is now balanced and lint-clean.
 */

export default function NotebookLM_RefinedPolish() {
  // Force dark mode on root so shadcn tokens resolve
  React.useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.classList.add("dark");
    }
  }, []);

  // Lightweight runtime checks ("tests") to prevent regression of theme tokens
  React.useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    console.assert(!!cs.getPropertyValue("--background"), "Token --background should be defined");
    console.assert(document.documentElement.classList.contains("dark"), "html.dark should be present for dark theme");
  }, []);

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
  );
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
  );
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
  );
}

function EditableTitle() {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("Notebook Title");
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
  );
}

function PanelHeader({
  title,
  action,
  onCollapse,
}: {
  title: string;
  action?: React.ReactNode;
  onCollapse?: () => void;
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
  );
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
  );
}

function SourceCard({
  title,
  meta,
  type,
  processing,
  error,
}: {
  title: string;
  meta: string;
  type: "pdf" | "web" | "youtube" | "text" | "github" | "audio";
  processing?: number;
  error?: string;
}) {
  const icon = { pdf: FileText, web: Globe, youtube: Play, text: FileText, github: Github, audio: Music2 }[type];
  const Icon = icon;
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
  );
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
  );
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
  );
}

/* ------------------------ CHAT ------------------------ */
function ChatPanel() {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = React.useState(true);
  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    setAtBottom(nearBottom);
  };

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
  );
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
  );
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
  );
}

function UserBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full justify-end">
      <div className="max-w-[95%] sm:max-w-[80%] md:max-w-[70%] rounded-2xl rounded-br-sm bg-primary px-3 py-2.5 text-sm text-primary-foreground whitespace-pre-wrap break-words leading-relaxed shadow">
        {children}
      </div>
    </div>
  );
}

function StreamingBubble() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground pl-10">
      <Loader2 className="h-4 w-4 animate-spin" />
      Thinking…
    </div>
  );
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
  );
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
  );
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
  );
}

function StudioTile({
  icon,
  title,
  desc,
  cta,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  cta: string;
  badge?: string;
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
  );
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
  );
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
  );
}

/* ------------------------ COMPOSER ------------------------ */
function ChatComposer() {
  const [value, setValue] = React.useState("");
  const ref = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [value]);

  const send = () => {
    if (!value.trim()) return;
    toast.message("Sent", { description: value.slice(0, 80) + (value.length > 80 ? "…" : "") });
    setValue("");
  };

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
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything…  ⌘K to focus"
            className="min-h-[44px] max-h-[200px] w	full resize-none border-0 bg-transparent px-2 py-2 focus-visible:ring-0"
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
  );
}

/* ------------------------ RESIZER HANDLE ------------------------ */
function FancyHandle() {
  return (
    <ResizableHandle withHandle className="relative w-2">
      <span className="sr-only">Resize</span>
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-data-[resize-handle-active]:bg-primary" />
    </ResizableHandle>
  );
}
