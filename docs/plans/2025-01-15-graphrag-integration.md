# GraphRAG Integration into Pulse Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate GraphRAG's AI backend capabilities (API routes, state management, UI components) into Pulse's clean, production-ready foundation while preserving Pulse's superior code quality practices (Vitest, Prettier, Docker, TDD).

**Architecture:** Selective feature porting approach - use Pulse as base, port GraphRAG's backend logic + advanced UI components, write new Vitest tests for all ported features, maintain TDD discipline throughout.

**Tech Stack:**
- Frontend: Next.js 16 + React 19 + Vitest (existing Pulse)
- State: Zustand (new, from GraphRAG)
- AI: @anthropic-ai/claude-agent-sdk (new)
- Markdown: react-markdown + remark-gfm (new)
- Code: Shiki syntax highlighting (new)

**Migration Strategy:** Selective porting (NOT full replacement)
- Keep: Pulse's testing framework (Vitest), Docker setup, code quality tools
- Port: GraphRAG's API routes, state management, advanced UI components
- Rewrite: All tests to Vitest patterns
- Preserve: Pulse's TDD methodology, Prettier formatting

**Estimated Timeline:** 3-4 weeks (20 bite-sized tasks)

---

## Phase 1: Dependencies & Foundation (Days 1-3)

### Task 1: Install Core Dependencies

**Files:**
- Modify: `/compose/pulse/apps/web/package.json`
- Create: `/compose/pulse/apps/web/.env.local.example`

**Step 1: Write dependency installation test**

```typescript
// __tests__/dependencies.test.ts
import { describe, it, expect } from 'vitest'

describe('GraphRAG Dependencies', () => {
  it('should have zustand installed', async () => {
    const zustand = await import('zustand')
    expect(zustand.create).toBeDefined()
  })

  it('should have Claude SDK installed', async () => {
    const sdk = await import('@anthropic-ai/claude-agent-sdk')
    expect(sdk.query).toBeDefined()
  })

  it('should have react-markdown installed', async () => {
    const md = await import('react-markdown')
    expect(md.default).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/dependencies.test.ts`
Expected: FAIL with "Cannot find module 'zustand'"

**Step 3: Install dependencies**

```bash
cd /compose/pulse/apps/web

pnpm add zustand \
  @anthropic-ai/claude-agent-sdk \
  @qdrant/js-client-rest \
  axios \
  react-markdown \
  remark-gfm \
  remark-breaks \
  rehype-katex \
  remark-math \
  shiki \
  katex \
  marked \
  isomorphic-dompurify
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/dependencies.test.ts`
Expected: PASS

**Step 5: Create environment template**

```bash
# .env.local.example
NEXT_PUBLIC_API_URL=http://localhost:50102
NEXT_PUBLIC_MCP_URL=http://localhost:50107
NEXT_PUBLIC_WEBHOOK_URL=http://localhost:50108
NEXT_PUBLIC_CRAWL_MAX_DEPTH=3
NEXT_PUBLIC_CRAWL_MAX_PAGES=100
```

**Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local.example __tests__/dependencies.test.ts
git commit -m "feat: add GraphRAG dependencies (zustand, claude-sdk, markdown)"
```

---

### Task 2: Create Shared Types

**Files:**
- Create: `/compose/pulse/apps/web/types/chat.ts`
- Create: `/compose/pulse/apps/web/types/conversation.ts`
- Test: `/compose/pulse/apps/web/__tests__/types.test.ts`

**Step 1: Write type validation test**

```typescript
// __tests__/types.test.ts
import { describe, it, expect } from 'vitest'
import type { ChatMessage, Conversation } from '@/types'

describe('Type Definitions', () => {
  it('should accept valid ChatMessage', () => {
    const message: ChatMessage = {
      id: '1',
      role: 'user',
      content: 'Hello',
      timestamp: new Date().toISOString()
    }
    expect(message.role).toBe('user')
  })

  it('should accept valid Conversation', () => {
    const conv: Conversation = {
      id: '1',
      title: 'Test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    }
    expect(conv.title).toBe('Test')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/types.test.ts`
Expected: FAIL with "Cannot find module '@/types'"

**Step 3: Create type definitions**

```typescript
// types/chat.ts
export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string | string[] | ContentSegment[]
  timestamp: string
  isStreaming?: boolean
  citations?: Citation[]
  artifact?: Artifact
  toolCalls?: ToolCall[]
  metadata?: Record<string, unknown>
}

export interface ContentSegment {
  type: 'text' | 'tool'
  text?: string
  command?: string
  args?: string
  status?: 'running' | 'complete' | 'error'
}

export interface Citation {
  number: number
  title: string
  url?: string
}

export interface Artifact {
  type: 'markdown' | 'code' | 'text' | 'json' | 'html'
  content: string
  language?: string
  title?: string
  url?: string
}

export interface ToolCall {
  command: string
  args?: string
}

// types/conversation.ts
export interface Conversation {
  id: string
  title: string
  space?: string
  created_at: string
  updated_at: string
  tags?: string[]
  messages: ChatMessage[]
}

export interface ConversationListItem {
  id: string
  title: string
  space?: string
  created_at: string
  updated_at: string
  message_count: number
  last_message_preview?: string
}

// types/index.ts
export * from './chat'
export * from './conversation'
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/types.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add types/ __tests__/types.test.ts
git commit -m "feat: add TypeScript type definitions for chat and conversations"
```

---

### Task 3: Setup Zustand Store

**Files:**
- Create: `/compose/pulse/apps/web/stores/conversation-store.ts`
- Test: `/compose/pulse/apps/web/__tests__/conversation-store.test.ts`

**Step 1: Write store initialization test**

```typescript
// __tests__/conversation-store.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { useConversationStore } from '@/stores/conversation-store'

describe('ConversationStore', () => {
  beforeEach(() => {
    useConversationStore.setState({
      conversations: [],
      currentConversation: null,
      isLoading: false,
      error: null
    })
  })

  it('should initialize with empty state', () => {
    const state = useConversationStore.getState()
    expect(state.conversations).toEqual([])
    expect(state.currentConversation).toBeNull()
    expect(state.isLoading).toBe(false)
  })

  it('should set current conversation', () => {
    const conv = {
      id: '1',
      title: 'Test',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    }

    useConversationStore.getState().setCurrentConversation(conv)

    const state = useConversationStore.getState()
    expect(state.currentConversation).toEqual(conv)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/conversation-store.test.ts`
Expected: FAIL with "Cannot find module '@/stores/conversation-store'"

**Step 3: Create minimal store**

```typescript
// stores/conversation-store.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Conversation } from '@/types'

interface ConversationState {
  // State
  conversations: Conversation[]
  currentConversation: Conversation | null
  isLoading: boolean
  error: string | null

  // Actions
  setCurrentConversation: (conversation: Conversation | null) => void
  clearError: () => void
}

export const useConversationStore = create<ConversationState>()(
  persist(
    (set) => ({
      conversations: [],
      currentConversation: null,
      isLoading: false,
      error: null,

      setCurrentConversation: (conversation) =>
        set({ currentConversation: conversation }),

      clearError: () =>
        set({ error: null })
    }),
    {
      name: 'conversation-storage',
      partialize: (state) => ({
        currentConversationId: state.currentConversation?.id
      })
    }
  )
)
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/conversation-store.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add stores/conversation-store.ts __tests__/conversation-store.test.ts
git commit -m "feat: add Zustand conversation store with persistence"
```

---

## Phase 2: API Routes (Days 4-8)

### Task 4: Health Check API

**Files:**
- Modify: `/compose/pulse/apps/web/app/api/health/route.ts`
- Test: `/compose/pulse/apps/web/__tests__/health.test.ts` (already exists, update)

**Step 1: Update health check test**

```typescript
// __tests__/health.test.ts
import { describe, it, expect } from 'vitest'
import { GET } from '@/app/api/health/route'

describe('GET /api/health', () => {
  it('should return healthy status', async () => {
    const response = await GET()
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.status).toBe('healthy')
  })

  it('should include service URLs', async () => {
    const response = await GET()
    const data = await response.json()

    expect(data.services).toBeDefined()
    expect(data.services.mcp).toBeDefined()
    expect(data.services.webhook).toBeDefined()
  })
})
```

**Step 2: Run test to verify expected behavior**

Run: `pnpm test __tests__/health.test.ts`
Expected: FAIL with missing service URLs

**Step 3: Update implementation**

```typescript
// app/api/health/route.ts
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      mcp: process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:50107',
      webhook: process.env.NEXT_PUBLIC_WEBHOOK_URL || 'http://localhost:50108',
      firecrawl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:50102'
    }
  })
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/health.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/api/health/route.ts __tests__/health.test.ts
git commit -m "feat(api): enhance health check with service URLs"
```

---

### Task 5: Scrape API Route

**Files:**
- Create: `/compose/pulse/apps/web/app/api/scrape/route.ts`
- Test: `/compose/pulse/apps/web/__tests__/api/scrape.test.ts`

**Step 1: Write scrape API test**

```typescript
// __tests__/api/scrape.test.ts
import { describe, it, expect, vi } from 'vitest'
import { POST } from '@/app/api/scrape/route'
import { NextRequest } from 'next/server'

// Mock axios
vi.mock('axios')

describe('POST /api/scrape', () => {
  it('should return 400 for missing URL', async () => {
    const request = new NextRequest('http://localhost:3000/api/scrape', {
      method: 'POST',
      body: JSON.stringify({})
    })

    const response = await POST(request)
    expect(response.status).toBe(400)

    const data = await response.json()
    expect(data.error).toContain('URL is required')
  })

  it('should call MCP scrape tool with valid URL', async () => {
    const axios = await import('axios')
    vi.mocked(axios.post).mockResolvedValue({
      data: { content: 'Scraped content', url: 'https://example.com' }
    })

    const request = new NextRequest('http://localhost:3000/api/scrape', {
      method: 'POST',
      body: JSON.stringify({ url: 'https://example.com' })
    })

    const response = await POST(request)
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data.content).toBeDefined()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/api/scrape.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/scrape/route'"

**Step 3: Create scrape route**

```typescript
// app/api/scrape/route.ts
import { NextRequest, NextResponse } from 'next/server'
import axios from 'axios'

const MCP_URL = process.env.NEXT_PUBLIC_MCP_URL || 'http://localhost:50107'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      )
    }

    // Call MCP server scrape tool
    const response = await axios.post(
      `${MCP_URL}/tools/scrape`,
      {
        url: body.url,
        formats: body.formats || ['markdown', 'html']
      },
      { timeout: 60000 }
    )

    return NextResponse.json(response.data)
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      return NextResponse.json(
        { error: error.response?.data?.detail || 'Failed to scrape URL' },
        { status: error.response?.status || 500 }
      )
    }
    return NextResponse.json(
      { error: 'Failed to scrape URL' },
      { status: 500 }
    )
  }
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/api/scrape.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/api/scrape/route.ts __tests__/api/scrape.test.ts
git commit -m "feat(api): add scrape endpoint with MCP integration"
```

---

### Task 6-13: Additional API Routes (Similar Pattern)

**Repeat TDD pattern for:**
- Task 6: `/api/crawl` - Start crawl job
- Task 7: `/api/crawl/status/[jobId]` - Poll crawl status
- Task 8: `/api/crawl/[jobId]` - Get/cancel crawl
- Task 9: `/api/map` - Website mapping
- Task 10: `/api/search` - Vector search
- Task 11: `/api/conversations` - List/create conversations
- Task 12: `/api/conversations/[id]` - CRUD single conversation
- Task 13: `/api/conversations/[id]/messages` - Message operations

**Each task follows same structure:**
1. Write failing test
2. Run test (verify fail)
3. Implement minimal code
4. Run test (verify pass)
5. Commit with descriptive message

---

## Phase 3: UI Components (Days 9-14)

### Task 14: Markdown Renderer Component

**Files:**
- Create: `/compose/pulse/apps/web/components/ui/markdown.tsx`
- Test: `/compose/pulse/apps/web/__tests__/markdown.test.tsx`

**Step 1: Write markdown rendering test**

```typescript
// __tests__/markdown.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Markdown } from '@/components/ui/markdown'

describe('Markdown', () => {
  it('should render basic markdown', () => {
    render(<Markdown content="# Hello World" />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello World')
  })

  it('should render code blocks with syntax highlighting', () => {
    const code = '```python\nprint("hello")\n```'
    render(<Markdown content={code} />)
    expect(screen.getByText('print("hello")')).toBeInTheDocument()
  })

  it('should render math equations', () => {
    const math = 'Inline $E=mc^2$ equation'
    render(<Markdown content={math} />)
    expect(screen.getByText(/E=mc/)).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/markdown.test.tsx`
Expected: FAIL with "Cannot find module '@/components/ui/markdown'"

**Step 3: Create markdown component**

```typescript
// components/ui/markdown.tsx
'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'

interface MarkdownProps {
  content: string
  className?: string
}

export function Markdown({ content, className }: MarkdownProps) {
  return (
    <ReactMarkdown
      className={className}
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ node, inline, className, children, ...props }) {
          return inline ? (
            <code className={className} {...props}>
              {children}
            </code>
          ) : (
            <pre className="rounded-lg bg-muted p-4 overflow-x-auto">
              <code className={className} {...props}>
                {children}
              </code>
            </pre>
          )
        }
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/markdown.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/ui/markdown.tsx __tests__/markdown.test.tsx
git commit -m "feat(ui): add markdown renderer with math and code support"
```

---

### Task 15: Code Block with Syntax Highlighting

**Files:**
- Create: `/compose/pulse/apps/web/components/ui/code-block.tsx`
- Test: `/compose/pulse/apps/web/__tests__/code-block.test.tsx`

**Step 1: Write code block test**

```typescript
// __tests__/code-block.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CodeBlock } from '@/components/ui/code-block'

describe('CodeBlock', () => {
  it('should render code with language label', () => {
    render(<CodeBlock code="console.log('hi')" language="javascript" />)
    expect(screen.getByText('javascript')).toBeInTheDocument()
  })

  it('should have copy button', () => {
    render(<CodeBlock code="test code" language="python" />)
    expect(screen.getByRole('button', { name: /copy/i })).toBeInTheDocument()
  })

  it('should apply syntax highlighting', () => {
    render(<CodeBlock code="def hello():\n    pass" language="python" />)
    const codeEl = screen.getByText(/def hello/)
    expect(codeEl).toBeInTheDocument()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test __tests__/code-block.test.tsx`
Expected: FAIL

**Step 3: Implement code block component**

```typescript
// components/ui/code-block.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Copy } from 'lucide-react'
import { codeToHtml } from 'shiki'

interface CodeBlockProps {
  code: string
  language: string
  title?: string
}

export function CodeBlock({ code, language, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  const [html, setHtml] = useState('')

  // Highlight on mount
  useState(() => {
    codeToHtml(code, {
      lang: language,
      theme: 'github-dark'
    }).then(setHtml)
  })

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <span className="text-xs font-mono text-muted-foreground">
          {title || language}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleCopy}
          aria-label="Copy code"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <div
        className="p-4 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm test __tests__/code-block.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add components/ui/code-block.tsx __tests__/code-block.test.tsx
git commit -m "feat(ui): add code block with shiki syntax highlighting"
```

---

### Task 16-19: Additional UI Components

**Repeat TDD for:**
- Task 16: `AIMessage` - AI response display with streaming
- Task 17: `Citation` - Source citation component
- Task 18: `ToolCall` - Tool execution display
- Task 19: `CrawlProgress` - Real-time crawl monitoring

---

## Phase 4: Integration & Polish (Days 15-20)

### Task 20: Wire Up Chat Panel with Store

**Files:**
- Modify: `/compose/pulse/apps/web/components/chat-panel.tsx`
- Test: `/compose/pulse/apps/web/__tests__/chat-panel.test.tsx` (update existing)

**Step 1: Write store integration test**

```typescript
// __tests__/chat-panel.test.tsx
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatPanel } from '@/components/chat-panel'
import { useConversationStore } from '@/stores/conversation-store'

describe('ChatPanel - Store Integration', () => {
  beforeEach(() => {
    useConversationStore.setState({
      currentConversation: {
        id: '1',
        title: 'Test Chat',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [
          { id: '1', role: 'user', content: 'Hello', timestamp: new Date().toISOString() }
        ]
      }
    })
  })

  it('should display messages from store', () => {
    render(<ChatPanel />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('should send message to store on submit', async () => {
    render(<ChatPanel />)
    const input = screen.getByRole('textbox')
    const send = screen.getByRole('button', { name: /send/i })

    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(send)

    const state = useConversationStore.getState()
    expect(state.currentConversation?.messages).toHaveLength(2)
  })
})
```

**Step 2-5: Implement, test, commit (same pattern)**

---

## Verification & Testing

After all tasks complete:

```bash
# Run all tests
pnpm test

# Check code coverage
pnpm test --coverage

# Lint check
pnpm lint

# Format check
pnpm format:check

# Build production
pnpm build

# Docker build test
docker build -f apps/web/Dockerfile .
```

**Success Criteria:**
- ✅ All tests passing (100% of new code)
- ✅ No linting errors
- ✅ Code formatted with Prettier
- ✅ Production build succeeds
- ✅ Docker image builds
- ✅ Bundle size <500KB gzipped

---

## Notes for Engineer

**TDD Discipline:**
- ALWAYS write test first (RED)
- Run test to see it fail
- Write minimal code (GREEN)
- Run test to see it pass
- Commit immediately

**Code Quality:**
- Run `pnpm format` before each commit
- Keep components <100 LOC
- Use TypeScript strict mode
- No `any` types allowed

**Testing Patterns:**
- Mock external APIs (axios, fetch)
- Test user interactions
- Test edge cases (empty state, errors)
- Aim for 85%+ coverage

**Commit Messages:**
- Format: `<type>(<scope>): <description>`
- Types: feat, fix, test, refactor, docs
- Examples:
  - `feat(api): add scrape endpoint`
  - `test(store): add conversation persistence tests`
  - `refactor(ui): simplify markdown renderer`

**Resources:**
- Vitest docs: https://vitest.dev
- Testing Library: https://testing-library.com/react
- Zustand: https://zustand.docs.pmnd.rs
- Claude SDK: https://github.com/anthropics/claude-agent-sdk

**When Stuck:**
- Check GraphRAG reference: `/code/graphrag/apps/web`
- Read existing Pulse tests for patterns
- Ask for help with specific error messages
