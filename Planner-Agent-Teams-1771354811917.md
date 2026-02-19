I'll analyze the current session/task/orchestrator architecture to understand how to build an agent team framework on top of it.

Now I have a good understanding of the architecture. Let me create a comprehensive plan for building an agent team framework.

Based on my analysis of the current architecture, here's a comprehensive plan for building an **Agent Team Framework**:
---
## 🎯 Agent Team Framework Design
### Core Concepts
| Concept | Description |
---------|-------------|
**Team** | A group of agents that can communicate with each other while maintaining private contexts |
**Agent** | An individual task/session within a team, with its own context/history |
**Channel** | Named communication pathways (e.g., `#general`, `#private-strategy`) |
**Shared Context** | Information visible to all team members (read-only or collaborative) |
**Private Context** | Session-specific history not visible to other agents |
### Architecture Overview
```
┌────────┐
│                    Team Orchestrator                         │
│ - Manages team lifecycle                                    │
│ - Routes inter-agent messages                               │
│ - Enforces privacy boundaries                               │
└────────┬────────┘
│
┌────────┼────────┐
▼           ▼           ▼
┌────────┐ ┌────────┐ ┌────────┐
│ Agent││ Agent││ Agent│
│ Session│ │ Session│ │ Session│
│ (private│ │ (private│ │ (private│
│ context)│ context)│ context)│
└────┬──┘ └────┬──┘ └────┬──┘
│           │           │
└────────┼────────┘
▼
┌────────┐
│ Shared Channel     │
│ - #general         │
│ - #task-coordination│
│ - #results         │
└────────┘
```
### Key Design Decisions
1. **Leverage existing session system** - Each agent is a registered session with `mode: "orchestrator"`
2. **Extend mailbox for team comms** - Add channel-based routing to `SessionMailboxMessage`
3. **Team state in launch-task-state.json** - Use existing task store with `team_id` field
4. **YAML team definitions** - Human-readable team configuration files
---
## 📋 Implementation Plan
### Phase1: Core Types & Schema (Week 1)
- Create `packages/core/src/team/types.ts`
- Define `Team`, `Agent`, `Channel`, `TeamState` interfaces
- Create YAML schema for team definitions
### Phase2: Team Orchestrator (Week 1-2)
- Implement `packages/core/src/team/orchestrator.ts`
- Add team lifecycle methods: create, join, leave, dissolve
- Build message routing with privacy controls
### Phase3: Agent Session Manager (Week 2)
- Extend `sessionManager.ts` for agent-specific sessions
- Add private context isolation
- Implement shared context synchronization
### Phase4: Communication Layer (Week 2-3)
- Enhance mailbox with channel support
- Create `/team chat` slash command
- Build team status dashboard
### Phase5: CLI Integration (Week 3)
- Add `/team` commands to CLI
- Team task templates
- Team state persistence
---
## 🚀 Quick Start Example
```yaml
# .lowcal/teams/research-team.yaml
version: "1.0"
name: research-team
description: Collaborative research and analysis team
agents:
- id: researcher-alpha
role: primary-researcher
model: gemini-2.0-flash-exp
- id: analyst-beta
role: data-analyst
model: gemini-1.5-pro
- id: writer-gamma
role: technical-writer
model: gemini-1.5-flash
channels:
- name: #general
visibility: all
history: shared
- name: #private-strategy
visibility: restricted
members: [researcher-alpha, analyst-beta]
- name: #drafts
visibility: writer-only
members: [writer-gamma]
shared_context:
- type: file
path: ./research-notes.md
read_only: false
- type: variable
name: research_topic
value: "Rebel Alliance comms security"
execution:
mode: headless
timeout_minutes: 60
```
---
## 📦 Files to Create/Modify
| Action | Path |
--------|------|
New | `packages/core/src/team/types.ts` |
New | `packages/core/src/team/orchestrator.ts` |
New | `packages/core/src/team/state-store.ts` |
New | `packages/cli/src/uicommands/teamCommand.ts` |
Modify | `packages/cli/src/sessionManager.ts` (agent support) |
Modify | `packages/cli/src/ui/utils/mailbox.ts` (channel routing) |
---
Would you like me to proceed with implementation? I can start with:
1. **Phase 1** - Create the core type definitions and team schema
2. **Phase 2** - Build the orchestrator first (if you prefer working bottom-up)
3. **Documentation** - Create architecture docs before code
Which approach would you like me to take, Darrin?