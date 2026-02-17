# Managing Your Roadmap on GitHub

A guide for how OSS projects typically manage roadmaps using GitHub's built-in tools.

## The Three Tools

### 1. Issues = Individual Tasks
Each roadmap item becomes a GitHub Issue. Tag with labels, assign to milestones, reference in PRs.

### 2. Projects = Kanban Board
GitHub Projects (v2) gives you a board view of your issues.

**Recommended columns:**
| Column | What goes here |
|--------|---------------|
| **Backlog** | All accepted ideas, not yet started |
| **In Progress** | Actively being worked on |
| **In Review** | PR open, awaiting review |
| **Done** | Merged and shipped |

**Setup:** Repo → Projects → New Project → Board → Add issues as cards.

### 3. Milestones = Time-based Releases
Group issues into monthly (or sprint-based) milestones. GitHub shows progress bars.

Example:
- `v0.2 - March 2026` → iteration features, faster deploys
- `v0.3 - April 2026` → multi-channel, dashboard
- `v0.4 - May 2026` → monetization, private repos

## Recommended Labels

```
priority:high        🔴  Must do soon
priority:medium      🟡  Important but not urgent
priority:low         🔵  Nice to have
good-first-issue     🟢  Great for new contributors
help-wanted          🤝  Community contributions welcome
enhancement          ✨  New feature
bug                  🐛  Something broken
docs                 📝  Documentation
infrastructure       🏗️  DevOps / deployment
```

Create them:
```bash
gh label create "priority:high" --color "d73a4a" --repo Metatransformer/singularity-engine
gh label create "priority:medium" --color "fbca04" --repo Metatransformer/singularity-engine
gh label create "priority:low" --color "0075ca" --repo Metatransformer/singularity-engine
gh label create "good-first-issue" --color "7057ff" --repo Metatransformer/singularity-engine
gh label create "help-wanted" --color "008672" --repo Metatransformer/singularity-engine
gh label create "infrastructure" --color "d4c5f9" --repo Metatransformer/singularity-engine
```

## Workflow

1. Ideas come in (tweets, Discord, issues) → triage into **Backlog**
2. Each sprint/week, pull top items into **In Progress**
3. PRs reference issues (`Fixes #12`) → auto-close on merge
4. Monthly: review milestones, update roadmap doc, celebrate wins

## What Other OSS Projects Do

- **Small projects (<50 stars):** Issues + labels is enough. Skip Projects.
- **Medium projects:** Issues + Projects board + monthly milestones.
- **Large projects (1k+ stars):** All of the above + RFCs for big changes + CHANGELOG.md.

**Start simple. Add process only when you need it.**
