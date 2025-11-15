# .docs/ Directory

**Purpose:** Internal documentation, temporary artifacts, session logs, and working files.

## Structure

```
.docs/
├── sessions/          # Session logs from Claude Code interactions
├── plans/             # Implementation plans and task breakdowns
├── reports/           # Investigation reports and analysis
│   └── changedetection/  # Feature-specific research
├── fixme-completion-summary.md  # Development tracking
└── CLAUDE.md          # This file
```

## Guidelines

### What Goes Here
- **Session Logs:** Timestamped records of development sessions with reasoning
- **Plans:** Task breakdowns, execution strategies, implementation roadmaps
- **Reports:** Feasibility studies, architecture exploration, research findings
- **Temporary Files:** Work-in-progress documentation, scratch notes
- **Internal Metrics:** Completion summaries, progress tracking

### What Doesn't Go Here
- Public-facing documentation (use `docs/` instead)
- Code examples or tutorials (use `docs/` instead)
- API specifications (use `docs/` instead)
- Architecture decision records (use `docs/` instead)

### Characteristics
- **Audience:** Development team, AI assistants, internal stakeholders
- **Format:** Markdown with flexible structure
- **Lifecycle:** May be temporary, can be deleted when obsolete
- **Git:** Tracked but not emphasized in public docs
- **Tone:** Informal, working notes, thought process

## File Naming

- Session logs: `sessions/YYYY-MM-DD-HH-MM-description.md`
- Plans: `plans/YYYY-MM-DD-feature-name.md`
- Reports: `reports/category/topic-name.md`
- Summaries: `descriptive-name-summary.md`

## Migration Path

When internal documentation matures and becomes relevant to external users:
1. Refactor for public audience
2. Move to `docs/` directory
3. Update references
4. Add to public documentation index

## Relationship to docs/

- `.docs/` = **Internal** (process, exploration, temporary)
- `docs/` = **External** (public, stable, polished)

Think of `.docs/` as the workshop and `docs/` as the showroom.
