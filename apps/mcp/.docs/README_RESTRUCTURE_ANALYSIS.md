# README.md Restructure Plan - Validation Analysis

**Analysis Date:** November 7, 2025
**Project:** Pulse Fetch MCP Server
**Thoroughness Level:** Medium

---

## Executive Summary

✅ **Plan is VALID and NECESSARY**

Current README.md is **928 lines** (confirmed via `wc -l`), containing mixed content that should be reorganized into focused, topic-specific documents. The restructure will:

1. Reduce main README to ~400-500 lines (focused on overview + quick start)
2. Move detailed configuration to dedicated docs
3. Create better navigation and discoverability
4. Align with existing tool documentation (SCRAPE.md, SEARCH.md, MAP.md, CRAWL.md)

---

## 1. CURRENT README.md STRUCTURE & METRICS

### Line Count Validation

- **Actual:** 928 lines
- **Projected after restructure:** 400-500 lines (~50% reduction)

### Current Sections (by line number)

| Section                      | Lines       | Type                | Status                                         |
| ---------------------------- | ----------- | ------------------- | ---------------------------------------------- |
| Header/TOC                   | 1-30        | Navigation          | Keep (update)                                  |
| Highlights                   | 31-46       | Feature overview    | Keep                                           |
| Capabilities                 | 47-57       | Tool summary        | Keep (simplify table)                          |
| Usage Tips                   | 58-105      | Tool guides         | **Move to GETTING_STARTED.md**                 |
| Examples                     | 106-191     | Use cases           | **Keep (link to detailed docs)**               |
| Why Choose Pulse Fetch       | 192-208     | Marketing           | Keep (optional/move to homepage)               |
| **Setup**                    | **209-344** | **Installation**    | **Reorganize (split)**                         |
| Development                  | 345-442     | Dev info            | **Keep (move setup details elsewhere)**        |
| Tools Reference (scrape)     | 443-473     | Documentation       | **Delete (see SCRAPE.md)**                     |
| Roadmap                      | 474-508     | Future plans        | Keep                                           |
| Troubleshooting              | 509-662     | Error handling      | **Keep (or move to TROUBLESHOOTING.md)**       |
| License                      | 664-666     | Legal               | Keep                                           |
| Auth Health Checks           | 668-689     | Feature             | **Move to CONFIGURATION.md**                   |
| **Scraping Strategy Config** | **690-791** | **Advanced config** | **Move to CONFIGURATION.md + ARCHITECTURE.md** |
| **Resource Storage**         | **793-835** | **Advanced config** | **Move to CONFIGURATION.md**                   |
| **Extract Feature**          | **836-929** | **Feature guide**   | **Move to GETTING_STARTED.md or feature doc**  |

### Content Duplication Issues Found

1. **Tool documentation duplication:**
   - README.md "Usage Tips" (lines 58-105) overlaps with `docs/tools/SCRAPE.md`
   - README.md "Tools Reference" (lines 443-473) also overlaps
   - **Status:** SCRAPE.md is newer and more detailed

2. **Environment variables scattered:**
   - `.env.example` (326 lines) - comprehensive reference
   - README.md lines 217-246 - basic overview
   - **Status:** README covers only essentials; .env.example is authoritative

3. **Setup instructions**
   - Main README lines 209-344
   - `local/README.md` - duplicate startup info
   - `remote/README.md` - separate HTTP server setup
   - **Status:** Should be consolidated

---

## 2. VERIFICATION: CONTENT SHOULD STAY VS MOVE

### ✅ KEEP IN README.md (Main Overview)

| Content                  | Lines   | Reason                     |
| ------------------------ | ------- | -------------------------- |
| Title & TOC              | 1-30    | Navigation entry point     |
| Highlights               | 31-46   | Value proposition          |
| Capabilities table       | 47-57   | Quick reference of 4 tools |
| Examples section         | 106-191 | Concrete use cases         |
| Why Choose Pulse Fetch   | 192-208 | Competitive positioning    |
| Quick setup instructions | 209-250 | Get started in 2 minutes   |
| Development section      | 345-442 | For contributors           |
| Roadmap                  | 474-508 | Future direction           |
| Short troubleshooting    | 509-550 | Critical issues only       |

**Estimated total:** ~350-400 lines

---

### ➡️ MOVE TO DEDICATED DOCS

#### 1. **Environment Variables → CONFIGURATION.md** (NEW)

- **Source:** README.md lines 217-246 + .env.example (relevant parts)
- **Additional content:** Full variable reference with examples
- **Link from README:** "See [CONFIGURATION.md](docs/CONFIGURATION.md) for detailed environment setup"

**Variables to include:**

```
Core Config:
- FIRECRAWL_API_KEY
- FIRECRAWL_BASE_URL
- STRATEGY_CONFIG_PATH
- OPTIMIZE_FOR
- MCP_RESOURCE_STORAGE
- MCP_RESOURCE_FILESYSTEM_ROOT

LLM Config (Extract Feature):
- LLM_PROVIDER
- LLM_API_KEY
- LLM_API_BASE_URL
- LLM_MODEL

Remote HTTP Server:
- PORT
- NODE_ENV
- ALLOWED_HOSTS
- ALLOWED_ORIGINS
- ENABLE_RESUMABILITY
```

#### 2. **Scraping Strategy Selection → CONFIGURATION.md + ARCHITECTURE.md**

- **Source:** README.md lines 690-791
- **Split into:**
  - **CONFIGURATION.md:** How to configure and use strategies
  - **ARCHITECTURE.md:** How the system works (conceptual)
- **Reason:** Detailed configuration is implementation-specific; belongs with other config

#### 3. **Resource Storage Architecture → CONFIGURATION.md**

- **Source:** README.md lines 793-835
- **Consolidate with:** Scraping strategy storage info
- **Link from README:** "Scraped content is cached automatically. [Learn more](docs/CONFIGURATION.md#resource-storage)"

#### 4. **Extract Feature Details → GETTING_STARTED.md (NEW)**

- **Source:** README.md lines 836-929
- **Consolidate with:** Usage Tips extraction examples
- **New structure:**

  ```
  # Getting Started with Pulse Fetch

  ## Basic Scraping (10 min)
  - Setup instructions
  - First API call example

  ## Extracting Information with LLM (15 min)
  - Extract feature overview
  - Configuration
  - Examples

  ## Advanced Strategies (30 min)
  - Caching explained
  - Strategy selection
  - Storage options
  ```

#### 5. **Authentication Health Checks → CONFIGURATION.md**

- **Source:** README.md lines 668-689
- **Move with:** Other health-related configuration
- **Reason:** Implementation detail that belongs in config reference

#### 6. **Tool-Specific Documentation → Consolidate**

- **Source:** README.md lines 443-473 (Scrape tool reference)
- **Already exists:** docs/tools/SCRAPE.md (better, more detailed)
- **Action:** Delete from README, link instead
- **Same applies to:** SEARCH.md, MAP.md, CRAWL.md

---

## 3. SEARCH FOR DUPLICATES - FINDINGS

### ✅ Files Analyzed

**Tool Documentation (docs/tools/):**

- ✅ SCRAPE.md (100+ lines) - Comprehensive parameter reference
- ✅ SEARCH.md (100+ lines) - Search-specific guide
- ✅ MAP.md (tool overview)
- ✅ CRAWL.md (tool overview)
- ✅ CLAUDE.md (project context)

**Module READMEs:**

- ✅ local/README.md - Stdio transport info
- ✅ remote/README.md - HTTP server guide
- ✅ .env.example (326 lines) - Environment reference

### Key Overlaps Found

| Content            | README        | Existing Doc               | Action                                     |
| ------------------ | ------------- | -------------------------- | ------------------------------------------ |
| Scrape parameters  | lines 443-473 | SCRAPE.md                  | Delete from README, link to SCRAPE.md      |
| Search tool info   | lines 77-84   | SEARCH.md                  | Keep brief overview, link for details      |
| Map tool info      | lines 85-93   | MAP.md                     | Keep brief overview, link for details      |
| Environment vars   | lines 217-246 | .env.example               | Move to CONFIGURATION.md                   |
| Strategy selection | lines 690-791 | docs/STRATEGY_SELECTION.md | Move to CONFIGURATION.md + ARCHITECTURE.md |
| Extract examples   | lines 879-905 | Tool docs                  | Consolidate in GETTING_STARTED.md          |

---

## 4. CONTENT INVENTORY BY DESTINATION

### README.md (Post-Restructure: ~400 lines)

```markdown
# Pulse Fetch MCP Server

[INTRO]

# Table of Contents

# Highlights

# Capabilities

- Tool table (simplified - 4 rows)

# Quick Start Guide

- 2-minute setup
- First API call example

# Usage Examples

- Keep current examples section
- Add links to detailed guides

# Why Choose Pulse Fetch?

# Setup

- Local Setup (minimal, 20 lines)
  - Prerequisites
  - 5-step installation
- Remote Setup (minimal, 20 lines)
  - Docker quick start
  - Link to remote/README.md for details
- Claude Desktop config (keep current, ~40 lines)

# Development

- Project structure overview
- Link to CLAUDE.md for detailed context

# Troubleshooting

- Keep ONLY critical issues:
  - Host header validation (Issue 1)
  - Schema validation (Issue 2)
- Move lengthy debugging to TROUBLESHOOTING.md
- Health checks → move to CONFIGURATION.md

# License

# Related Documentation

- [Getting Started Guide](docs/GETTING_STARTED.md)
- [Configuration Reference](docs/CONFIGURATION.md)
- [Architecture & Design](docs/ARCHITECTURE.md)
- [Tool Documentation](docs/tools/)
- [Remote Server Guide](remote/README.md)
```

### docs/CONFIGURATION.md (NEW: ~350-400 lines)

**Contents:**

- Environment variables (organized by category)
- Strategy configuration (how to use + examples)
- Resource storage options
- Authentication/health checks
- Performance tuning parameters

**Structure:**

```markdown
# Configuration Reference

## Environment Variables

### Core Settings

### LLM Configuration

### HTTP Server Settings

### Advanced Parameters

## Strategy Selection

- How to configure custom strategies
- Optimization modes explained

## Resource Storage

- Storage backend options
- Size/TTL configuration

## Authentication & Health Checks
```

### docs/ARCHITECTURE.md (NEW: ~200-300 lines)

**Contents:**

- System design overview
- Strategy selection algorithm
- Resource storage multi-tier design
- Transport implementations (stdio vs HTTP)
- Component interactions

### docs/GETTING_STARTED.md (NEW: ~300-400 lines)

**Contents:**

- Installation & setup (5 min)
- First scrape (5 min)
- Using extraction (15 min)
- Advanced caching & strategies (20 min)
- Common patterns & tips

### docs/TROUBLESHOOTING.md (NEW: ~200 lines)

**Contents:**

- Move from README.md lines 509-662
- Organize by issue type:
  - Connection issues
  - Authentication problems
  - Performance issues
  - Debugging techniques

---

## 5. CURRENT README SECTION ANALYSIS

### Section-by-Section Review

#### ✅ Highlights (lines 31-46)

- **Status:** KEEP
- **Quality:** Good value proposition
- **Changes:** None needed

#### ✅ Capabilities (lines 47-57)

- **Status:** KEEP
- **Quality:** Good 4-tool overview
- **Changes:** Add "See docs/tools/" link for detailed docs

#### ⚠️ Usage Tips (lines 58-105)

- **Status:** MOVE to GETTING_STARTED.md
- **Issues:**
  - Duplicates SCRAPE.md content
  - Parameters belong in tool docs
  - Examples are good - consolidate with others
- **Recommendation:** Extract examples, consolidate parameter docs in SCRAPE.md

#### ✅ Examples (lines 106-191)

- **Status:** KEEP
- **Quality:** Good concrete examples
- **Changes:** None, but add links to detailed guides

#### ✅ Development (lines 345-442)

- **Status:** KEEP (core info)
- **Quality:** Good project structure overview
- **Changes:**
  - Remove detailed development instructions
  - Link to local/README.md and remote/README.md

#### 🗑️ Tools Reference - scrape (lines 443-473)

- **Status:** DELETE
- **Reason:** Duplicates SCRAPE.md with less detail
- **Action:** Link to docs/tools/SCRAPE.md instead

#### ⚠️ Roadmap (lines 474-508)

- **Status:** KEEP
- **Quality:** Good future direction
- **Changes:** None needed

#### ⚠️ Troubleshooting (lines 509-662)

- **Status:** SPLIT
- **Keep in README:** Top 2-3 critical issues only
- **Move to TROUBLESHOOTING.md:** Everything else
- **Reason:** Too detailed for main README

#### 🗑️ Auth Health Checks (lines 668-689)

- **Status:** MOVE to CONFIGURATION.md
- **Reason:** Configuration feature, not critical for most users

#### 🗑️ Scraping Strategy Config (lines 690-791)

- **Status:** MOVE to CONFIGURATION.md + ARCHITECTURE.md
- **Split:**
  - Optimization modes → CONFIGURATION.md
  - How strategy selection works → ARCHITECTURE.md
  - Configuration file format → CONFIGURATION.md
- **Reason:** Advanced configuration topic

#### 🗑️ Resource Storage (lines 793-835)

- **Status:** MOVE to CONFIGURATION.md
- **Reason:** Configuration detail, not critical for main README

#### 🗑️ Extract Feature (lines 836-929)

- **Status:** MOVE to GETTING_STARTED.md
- **Reason:** Feature guide belongs with usage examples
- **Consolidate with:** Other extraction examples

---

## 6. INSTALLATION SECTION REVIEW

### Current Installation (lines 209-344)

**What's there:**

1. Prerequisites (lines 211-215)
2. Environment variables table (lines 217-246)
3. Claude Desktop setup (lines 247-300)
4. Remote HTTP setup (lines 301-343)

**Analysis:**

- Prerequisites: Minimal, keep
- Environment variables: Comprehensive but should be in CONFIGURATION.md
- Claude Desktop: Keep, but split into local/remote sections with links
- Remote HTTP: Should link to remote/README.md instead

**Proposed simplification:**

````markdown
# Setup

## Quick Start (Local)

1. Install Node.js
2. Add to Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "pulse": {
         "command": "npx",
         "args": ["-y", "@pulsemcp/pulse"]
       }
     }
   }
   ```
````

3. Restart Claude Desktop
4. Add FIRECRAWL_API_KEY to your Claude Desktop config (optional)

[→ See Local Setup Guide](local/README.md) for detailed instructions

## Remote Setup (HTTP Server)

For hosted deployments, use the HTTP transport:

```bash
cd remote
npm install && npm run build
npm start
```

[→ See Remote Server Documentation](remote/README.md) for Docker, configuration, and deployment

## Configuration

[→ See Configuration Reference](docs/CONFIGURATION.md) for all environment variables

````

**Reduction:** 135 lines → ~30 lines in main README

---

## 7. TOOL OVERVIEW ANALYSIS

### Current Status

| Tool | README Content | Dedicated Doc | Status |
|------|-----------------|--------------|--------|
| scrape | lines 60-76, 443-473 | SCRAPE.md ✅ | Keep brief, link to detailed |
| search | lines 77-84 | SEARCH.md ✅ | Keep brief, link to detailed |
| map | lines 85-93 | MAP.md ✅ | Keep brief, link to detailed |
| crawl | lines 94-105 | CRAWL.md ✅ | Keep brief, link to detailed |

### Recommendation

**Keep brief overview in README's Capabilities section:**
```markdown
| Tool Name | Description |
|-----------|-------------|
| `scrape` | [Scrape a single webpage...](docs/tools/SCRAPE.md) |
| `search` | [Search the web...](docs/tools/SEARCH.md) |
| `map` | [Discover URLs from a website...](docs/tools/MAP.md) |
| `crawl` | [Manage website crawling jobs...](docs/tools/CRAWL.md) |
````

---

## 8. RECOMMENDED FINAL STRUCTURE

```
README.md (400-450 lines)
├── Header & TOC
├── Highlights
├── Capabilities (table with links to docs/tools/)
├── Quick Start (5-step setup)
├── Examples (keep current)
├── Why Choose Pulse Fetch?
├── Setup (minimal, links to local/ and remote/)
├── Development
├── Critical Troubleshooting (top 2-3 issues only)
├── License
└── See Also (links to all documentation)

docs/
├── GETTING_STARTED.md (NEW)
│   ├── Installation detailed walkthrough
│   ├── First scrape example
│   ├── Extract feature guide
│   └── Common patterns
├── CONFIGURATION.md (NEW)
│   ├── All environment variables
│   ├── Strategy configuration
│   ├── Storage options
│   └── Performance tuning
├── ARCHITECTURE.md (NEW)
│   ├── System design
│   ├── Strategy selection algorithm
│   ├── Storage multi-tier design
│   └── Component interactions
├── TROUBLESHOOTING.md (NEW)
│   ├── Connection issues
│   ├── Authentication problems
│   ├── Performance debugging
│   └── Detailed solutions
├── tools/
│   ├── SCRAPE.md ✅
│   ├── SEARCH.md ✅
│   ├── MAP.md ✅
│   └── CRAWL.md ✅
└── CHANGELOG.md ✅

local/README.md (existing)
remote/README.md (existing)
.env.example (existing, reference for CONFIGURATION.md)
```

---

## 9. CONTENT GAPS & ISSUES IDENTIFIED

### ⚠️ Critical Issues Found

1. **Tool parameter duplication:**
   - README.md lines 443-473 duplicates SCRAPE.md
   - SCRAPE.md is newer and more complete
   - **Action:** Delete from README, always link to SCRAPE.md

2. **Environment variable docs scattered:**
   - .env.example is authoritative (326 lines)
   - README.md has brief summary
   - No centralized reference
   - **Action:** Create CONFIGURATION.md that consolidates and cross-references

3. **Installation instructions not unified:**
   - local/README.md has local-specific setup
   - remote/README.md has HTTP setup
   - Main README tries to cover both
   - **Action:** Keep minimal setup in README, link to specific guides

4. **Strategy configuration is buried:**
   - README.md lines 690-791 is hard to find
   - Should be in CONFIGURATION.md with examples
   - **Action:** Move + improve organization

### 🟡 Usability Issues

1. **README is too long** (928 lines)
   - Users likely skip to "Quick Start" section
   - Advanced topics mixed with basics
   - **Solution:** Organize by complexity level

2. **Cross-references missing:**
   - Docs directory exists but not linked from README
   - Tool-specific docs exist but hard to discover
   - **Solution:** Add "See Also" section with doc structure

3. **Examples are good but incomplete:**
   - Shows usage but not discovery
   - Some examples reference features not documented elsewhere
   - **Solution:** Link to detailed feature guides (like SCRAPE.md)

---

## 10. VALIDATION CHECKLIST

### ✅ Plan Validation Results

| Aspect                           | Status | Notes                                                 |
| -------------------------------- | ------ | ----------------------------------------------------- |
| **Current length confirmed**     | ✅     | 928 lines verified                                    |
| **Features section identified**  | ✅     | Lines 31-57 (comprehensive)                           |
| **Installation section exists**  | ✅     | Lines 209-344 (can be simplified 75%)                 |
| **Tool overview present**        | ✅     | Lines 51-105 (good, but has duplicates in tools docs) |
| **Content duplication verified** | ✅     | SCRAPE.md, env vars, strategy config                  |
| **All target sections found**    | ✅     | Env vars, strategy, extraction, storage               |
| **Existing tool docs confirmed** | ✅     | SCRAPE.md, SEARCH.md, MAP.md, CRAWL.md exist          |
| **Local/remote split needed**    | ✅     | Remote guide is in remote/README.md already           |

### ✅ Feasibility Assessment

| Task                          | Difficulty | Time      | Priority |
| ----------------------------- | ---------- | --------- | -------- |
| Create CONFIGURATION.md       | Easy       | 1-2 hours | High     |
| Create GETTING_STARTED.md     | Easy       | 1-2 hours | High     |
| Create ARCHITECTURE.md        | Medium     | 2-3 hours | Medium   |
| Create TROUBLESHOOTING.md     | Easy       | 1 hour    | Medium   |
| Simplify main README          | Medium     | 2-3 hours | High     |
| Update TOC & cross-references | Easy       | 30 min    | High     |

---

## 11. RECOMMENDED MOVES (Section → Target Document)

### Priority 1 (High): Core Content Moves

| From (README lines) | To                                    | Size       | Reason                       |
| ------------------- | ------------------------------------- | ---------- | ---------------------------- |
| 217-246             | CONFIGURATION.md                      | ~30 lines  | Core config reference needed |
| 690-791             | CONFIGURATION.md + ARCHITECTURE.md    | ~100 lines | Advanced config + design     |
| 793-835             | CONFIGURATION.md                      | ~40 lines  | Storage configuration        |
| 443-473             | docs/tools/SCRAPE.md (already exists) | DELETE     | Duplicate, less detailed     |
| 668-689             | CONFIGURATION.md                      | ~20 lines  | Health check configuration   |

### Priority 2 (Medium): Feature Guides

| From (README lines)     | To                 | Size      | Reason                |
| ----------------------- | ------------------ | --------- | --------------------- |
| 836-929                 | GETTING_STARTED.md | ~90 lines | Extract feature guide |
| 58-76, extract examples | GETTING_STARTED.md | ~20 lines | Usage patterns        |

### Priority 3 (Low): Quality Improvements

| From (README lines) | To                        | Size       | Reason                 |
| ------------------- | ------------------------- | ---------- | ---------------------- |
| 509-662             | TROUBLESHOOTING.md        | ~150 lines | Detailed debugging     |
| Add                 | README "See Also" section | ~20 lines  | Better discoverability |

---

## 12. SUGGESTED FINAL README OUTLINE

```markdown
# Pulse Fetch MCP Server

[Intro + Newsletter link]

# Table of Contents

# Highlights

# Capabilities

[4-tool table with links]

# Quick Start

[Get running in 5 minutes]

# Examples

[Current examples section - keep]

# Why Choose Pulse Fetch?

[Current comparison - keep]

# Setup

## Local Setup (Claude Desktop)

[Minimal instructions + link to local/README.md]

## Remote Setup (HTTP)

[Docker example + link to remote/README.md]

# Development

[Keep project structure overview]
[Remove detailed dev instructions - link to CLAUDE.md]

# Troubleshooting

[Keep 2-3 critical issues only]
[Link to docs/TROUBLESHOOTING.md for more]

# License

# Documentation

[New section with links to:]

- Getting Started Guide
- Configuration Reference
- Architecture & Design
- Tool Documentation
- Remote Server Guide
- Troubleshooting Guide
```

---

## 13. IMPLEMENTATION SUMMARY

### What Should Stay in README (450 lines)

- Project intro & highlights
- 4-tool capability table with links
- 5-minute quick start setup
- Concrete usage examples
- Competitive advantages
- Development contributor info
- Top 2-3 troubleshooting issues

### What Should Move Out (content to delete or relocate)

- Detailed environment variable reference → CONFIGURATION.md
- Strategy selection system → CONFIGURATION.md + ARCHITECTURE.md
- Resource storage architecture → CONFIGURATION.md
- Extract feature detailed guide → GETTING_STARTED.md
- Scrape tool parameter reference → Keep in SCRAPE.md (delete duplicate)
- All troubleshooting beyond top 3 → TROUBLESHOOTING.md
- Health checks configuration → CONFIGURATION.md

### New Documents Needed

1. **docs/CONFIGURATION.md** - Complete environment & config reference
2. **docs/GETTING_STARTED.md** - Installation & feature walkthroughs
3. **docs/ARCHITECTURE.md** - System design & internals
4. **docs/TROUBLESHOOTING.md** - Detailed error solutions

---

## 14. SUCCESS METRICS

After restructure, README.md should meet these criteria:

| Metric                     | Target        | Current                  | Status                   |
| -------------------------- | ------------- | ------------------------ | ------------------------ |
| Length                     | 400-450 lines | 928 lines                | ✅ ~50% reduction        |
| Time to first run          | 5 min         | Unclear in wall of text  | ✅ Clear quick start     |
| Find installation          | First screen  | Buried after 209 lines   | ✅ Clear section         |
| Find tools docs            | 2 clicks      | Not linked               | ✅ Links in capabilities |
| Find configuration         | 1-2 clicks    | No centralized reference | ✅ CONFIGURATION.md      |
| Find troubleshooting       | 1-2 clicks    | ~500 lines deep          | ✅ Dedicated doc         |
| Table of contents accuracy | 100%          | Good but incomplete      | ✅ Updated TOC           |

---

## 15. FINAL RECOMMENDATIONS

### 🎯 Action Items (Priority Order)

1. **CREATE docs/CONFIGURATION.md** (1-2 hours)
   - Consolidate all env vars from .env.example
   - Add strategy configuration guide
   - Add storage backend options
   - Include health check configuration

2. **CREATE docs/GETTING_STARTED.md** (1-2 hours)
   - Move installation steps from README
   - Add "first scrape" walkthrough
   - Add extract feature guide
   - Include common patterns & recipes

3. **SIMPLIFY main README.md** (2-3 hours)
   - Delete lines 217-246 (move to CONFIGURATION.md)
   - Delete lines 443-473 (duplicate of SCRAPE.md)
   - Delete lines 668-689 (move to CONFIGURATION.md)
   - Delete lines 690-791 (move to CONFIGURATION.md + ARCHITECTURE.md)
   - Delete lines 793-835 (move to CONFIGURATION.md)
   - Delete lines 836-929 (move to GETTING_STARTED.md)
   - Add "See Also" section with doc links
   - Update TOC

4. **CREATE docs/TROUBLESHOOTING.md** (1 hour)
   - Move detailed troubleshooting from README
   - Organize by issue category
   - Keep critical issues in main README with links

5. **CREATE docs/ARCHITECTURE.md** (2-3 hours)
   - Document system design
   - Explain strategy selection algorithm
   - Cover storage multi-tier design
   - Show component interactions

6. **Update cross-references** (30 min)
   - Add links in README to new docs
   - Update tool links to point to docs/tools/
   - Verify all internal links work

### 📏 Expected Outcome

**Before:**

```
README.md: 928 lines
├── Everything mixed together
├── Hard to find quick start
├── Duplicate tool documentation
├── Advanced topics mixed with basics
└── No clear documentation map
```

**After:**

```
README.md: 450 lines (focused overview)
docs/CONFIGURATION.md: 350 lines (all env vars + config)
docs/GETTING_STARTED.md: 300 lines (walkthroughs)
docs/ARCHITECTURE.md: 250 lines (system design)
docs/TROUBLESHOOTING.md: 200 lines (error solutions)
docs/tools/*.md: 400 lines (tool-specific docs)
─────────────────────────
Total: ~1,950 lines (more content, better organized)

Navigation:
├── README.md → overview + quick start
├── → docs/GETTING_STARTED.md (for setup)
├── → docs/CONFIGURATION.md (for config)
├── → docs/ARCHITECTURE.md (for design)
├── → docs/TROUBLESHOOTING.md (for errors)
└── → docs/tools/*.md (for tool details)
```

---

## Appendix A: Files Impacted

### To Create/Update

- [ ] `docs/CONFIGURATION.md` (NEW)
- [ ] `docs/GETTING_STARTED.md` (NEW)
- [ ] `docs/ARCHITECTURE.md` (NEW)
- [ ] `docs/TROUBLESHOOTING.md` (NEW)
- [ ] `README.md` (SIMPLIFY)
- [ ] `.docs/sessions/README-restructure.md` (session log)

### To Keep Unchanged

- ✅ docs/tools/SCRAPE.md
- ✅ docs/tools/SEARCH.md
- ✅ docs/tools/MAP.md
- ✅ docs/tools/CRAWL.md
- ✅ local/README.md
- ✅ remote/README.md
- ✅ .env.example

### To Review

- ⚠️ docs/CLAUDE.md (update if needed)
- ⚠️ Monorepo /README.md (if exists)

---

## Appendix B: Detailed Content Mapping

### Environment Variables (245 lines in .env.example)

**To include in CONFIGURATION.md:**

```
HTTP SERVER (17 lines in .env.example)
├── PORT
├── NODE_ENV
├── CORS_ORIGINS
└── ALLOWED_HOSTS

SERVICES (8 lines)
├── FIRECRAWL_API_KEY
└── FIRECRAWL_BASE_URL

SCRAPING STRATEGY (10 lines)
├── STRATEGY_CONFIG_PATH
├── OPTIMIZE_FOR

STORAGE (21 lines)
├── MCP_RESOURCE_STORAGE
├── MCP_RESOURCE_FILESYSTEM_ROOT
├── MCP_RESOURCE_TTL
├── MCP_RESOURCE_MAX_SIZE
└── MCP_RESOURCE_MAX_ITEMS

MAP TOOL (17 lines)
├── MAP_DEFAULT_COUNTRY
├── MAP_DEFAULT_LANGUAGES
└── MAP_MAX_RESULTS_PER_PAGE

LLM EXTRACTION (30 lines)
├── ANTHROPIC_API_KEY
├── OPENAI_API_KEY
├── LLM_PROVIDER
├── LLM_API_KEY
├── LLM_API_BASE_URL
└── LLM_MODEL

DEBUGGING (20 lines)
├── DEBUG
├── LOG_FORMAT
├── SKIP_HEALTH_CHECKS
└── NO_COLOR / FORCE_COLOR
```

---

## Appendix C: Links to Create in New Docs

| Link Type    | Source             | Target                     | Anchor                   |
| ------------ | ------------------ | -------------------------- | ------------------------ |
| Internal     | README             | CONFIGURATION.md           | `#environment-variables` |
| Internal     | README             | GETTING_STARTED.md         | `#installation`          |
| Internal     | README             | docs/tools/                | individual tools         |
| Internal     | CONFIGURATION.md   | .env.example               | external reference       |
| Internal     | GETTING_STARTED.md | docs/tools/SCRAPE.md       | `#parameters`            |
| Internal     | ARCHITECTURE.md    | docs/STRATEGY_SELECTION.md | external reference       |
| Cross-module | local/README.md    | CONFIGURATION.md           | shared config vars       |
| Cross-module | remote/README.md   | CONFIGURATION.md           | HTTP-specific config     |

---

**END OF ANALYSIS**
