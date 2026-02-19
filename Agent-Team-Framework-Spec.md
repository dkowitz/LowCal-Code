# Agent Team Framework - Comprehensive Spec

**Version:** 1.0  
**Date:** 2026-02-18  
**Status:** Draft - Ready for Implementation Review  

---

## Executive Summary

This spec defines an **Agent Team Framework** that transforms LowCal's existing Orchestrator into an active team coordinator, enabling multiple AI agents to collaborate on complex tasks through structured communication channels.

> *"The orchestrator doesn't just watch—it leads."*

---

## Core Concepts

| Concept | Description |
|---------|-------------|
| **Team** | A collaborative group of agents working toward a shared objective |
| **Agent** | An individual persistent session with private context, assigned a specific role |
| **Channel** | Named communication space where all team members post/read messages |
| **Orchestrator** | The "team lead" that coordinates turn-taking, delegates tasks, and synthesizes results |
| **Shared Context** | Read/write workspace visible to all agents (files, variables, artifacts) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Team Orchestrator                            │
│  - Manages team lifecycle                                           │
│  - Enforces turn-taking protocol                                    │
│  - Delegates work to specialized agents                             │
│  - Synthesizes final output                                         │
└──────────────────┬──────────────────────────────────────────────────┘
                   │
         ┌─────────┼─────────┐
         ▼         ▼         ▼
    ┌────────┐ ┌────────┐ ┌────────┐
    │Agent A │ │Agent B │ │Agent C │  ← Each is a registered session
    │Session │ │Session │ │Session │     with mode: "team_agent"
    └────┬───┘ └────┬───┘ └────┬───┘
         │          │          │
         └──────────┼──────────┘
                    ▼
        ┌──────────────────────┐
        │   Shared Channel     │  ← Public conversation space
        │   - #general         │     (file-based mailbox)
        │   - #task-coordination│    - JSONL format
        │   - #artifacts       │    - All agents read/write
        └──────────────────────┘

User → Orchestrator → [Agents] → Orchestrator → User
```

### Key Architectural Decisions

1. **Orchestrator as Active Coordinator**  
   The existing orchestrator (`packages/cli/src/orchestrator/daemon.ts`) is enhanced from passive monitor to active team lead.

2. **Agents = Persistent Sessions**  
   Each team member is a registered session with `mode: "team_agent"` and a `team_id` field in its record. The central coordinator remains `mode: "orchestrator"`.

3. **Channel = Shared Mailbox**  
   Communication uses channel-specific JSONL files under `.lowcal/team-channels/` (e.g., `team-<id>-general.jsonl`).

4. **Turn-Taking Protocol**  
   Orchestrator controls agent发言 order via a simple state machine:
   ```
   idle → planning → delegating → waiting → synthesizing → done
   ```

---

## Current Architecture Analysis

### What We Already Have

| Component | Location | Current State |
|-----------|----------|---------------|
| **Session Registry** | `packages/core/src/sessions/session-store.ts` | Full CRUD for sessions with heartbeat, health tracking |
| **Launch Task State** | `packages/core/src/tools/launch-task-state.ts` | Persistent task state with lifecycle management |
| **Mailbox System** | `packages/core/src/tools/read-session-messages.ts` | Inter-session messaging via JSONL files |
| **Orchestrator Daemon** | `packages/cli/src/orchestrator/daemon.ts` | Passive session monitoring, recovery policies |

### What We Need to Add

1. **Team State Store**  
   Add a dedicated `.lowcal/team-state.json` with team metadata:
   ```json
   {
     "version": "1.0",
    "updated_at": "2026-02-18T14:30:00Z",
    "teams": {
       "<team_id>": {
         "name": "research-team",
         "agents": ["agent-a", "agent-b"],
         "channels": ["#general", "#artifacts"],
         "orchestrator_session_id": "orch-123"
       }
    }
   }
   ```

2. **Channel Mailbox Extension**  
   Add channel-aware message routing to the mailbox system.

3. **Orchestrator Protocol**  
   New policies for team coordination (turn-taking, delegation).

---

## Implementation Plan

### Phase 1: Core Types & State Store (Week 1)

#### Files to Create
- `packages/core/src/team/types.ts` - Type definitions
- `packages/core/src/team/state-store.ts` - Team state persistence
- `packages/cli/src/team/manifest.ts` - YAML team definition parser

#### Key Interfaces
```typescript
// packages/core/src/team/types.ts

export interface TeamManifest {
  version: string;
  id: string;
  name: string;
  description?: string;
  agents: AgentSpec[];
  channels: ChannelSpec[];
  shared_context?: SharedContextEntry[];
}

export interface AgentSpec {
  id: string;
  role: string;
  model?: string;
  instructions?: string;
  tools?: string[];  // subset of available tools
}

export interface ChannelSpec {
  name: string;  // e.g., "#general", "#artifacts"
  history: "shared";
}

export type SharedContextEntry = 
  | { type: "file"; path: string; read_only: boolean }
  | { type: "variable"; name: string; value: string };

export interface TeamState {
  team_id: string;
  status: "creating" | "active" | "paused" | "completed" | "failed";
  created_at: string;
  started_at?: string;
  finished_at?: string;
  agents: Record<string, AgentState>;
  channels: Record<string, ChannelState>;
  orchestrator_session_id: string;
}

export interface AgentState {
  agent_id: string;
  session_id: string;
  role: string;
  status: "idle" | "working" | "waiting" | "completed" | "failed";
  last_turn?: string;
  result?: string;
}
```

---

### Phase 2: Team Orchestrator (Week 1-2)

#### Files to Create/Modify
- `packages/cli/src/orchestrator/policies/team-coordinator.ts` - New policy module
- `packages/core/src/tools/team-management.ts` - Tool for team operations

#### Key Responsibilities

**1. Turn-Taking Protocol**
```typescript
// Simplified state machine
type OrchestratorState = 
  | { phase: "idle" }
  | { phase: "planning"; task: string }
  | { phase: "delegating"; current_agent: string; next_agents: string[] }
  | { phase: "waiting"; waiting_on: string[] }
  | { phase: "synthesizing"; inputs: Record<string, string> }
  | { phase: "done"; result: string };
```

**2. Delegation Logic**
- Orchestrator analyzes task and assigns subtasks to agents
- Each agent receives:
  - Clear objective
  - Output format specification
  - Tool/source guidance
  - Explicit boundaries (to prevent duplication)

**3. Channel Management**
- Write messages to channel-specific JSONL files
- Include metadata: `from_agent`, `timestamp`, `turn_number`
- Support message threading for context

---

### Phase 3: CLI Integration (Week 2-3)

#### Files to Create/Modify
- `packages/cli/src/ui/commands/teamCommand.ts` - `/team` slash command
- `packages/cli/src/team/manifest-loader.ts` - Load team definitions
- `packages/core/src/tools/team-management.ts` - Team management tools

#### CLI Commands
```bash
# Define and run a team from YAML
/team create --file .lowcal/teams/research-team.yaml

# List active teams
/team list

# Show team status
/team status <team_id>

# Add agent to existing team
/team add-agent <team_id> --agent-id new-agent --role researcher

# Remove agent from team
/team remove-agent <team_id> <agent_id>

# Dissolve team and cleanup
/team dissolve <team_id>
```

#### Team Definition Example (YAML)
```yaml
# .lowcal/teams/research-team.yaml
version: "1.0"
id: research-team-2026
name: Research & Analysis Team
description: Collaborative research for Rebel Alliance comms security

agents:
  - id: researcher-alpha
    role: primary-researcher
    model: gemini-2.0-flash-exp
    instructions: |
      You are a primary researcher focused on finding open-source 
      security tools and documentation.
    tools: [web_search, web_fetch, rss]
  
  - id: analyst-beta
    role: data-analyst
    model: gemini-1.5-pro
    instructions: |
      You analyze research findings and create structured summaries.
    tools: [read_file, write_file, run_shell_command]
  
  - id: writer-gamma
    role: technical-writer
    model: gemini-1.5-flash
    instructions: |
      You synthesize research into clear technical documentation.
    tools: [read_file, write_file]

channels:
  - name: "#general"
    visibility: all
    history: shared
  
  - name: "#artifacts"
    visibility: all
    history: shared

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

### Phase 4: Tooling (Week 3)

#### New Tools for Orchestrator

**1. Team Management (for Orchestrator)**
```typescript
{
  name: "team_management",
  tools: [
    {
      name: "delegate_task",
      description: "Assign a subtask to another agent in the team",
      params: {
        agent_id: string,
        task_description: string,
        expected_output_format: string,
        constraints?: string[]
      }
    },
    {
      name: "post_to_channel",
      description: "Post a message to a shared channel",
      params: {
        channel_name: string,
        content: string,
        thread_id?: string
      }
    },
    {
      name: "read_channel",
      description: "Read messages from a channel",
      params: {
        channel_name: string,
        after_turn?: number,
        limit?: number
      }
    },
    {
      name: "synthesize_results",
      description: "Synthesize results from all agents into final output",
      params: {
        input_sources: string[],  // agent IDs or channel names
        format: string
      }
    }
  ]
}
```

**Agent Channel Access (v1 policy)**
- Agents do **not** post/read channels directly in v1.
- All communication is mediated by orchestrator tools and delegation protocol.

---

## Communication Protocol

### Message Format (JSONL)
```json
{
  "channel": "#general",
  "from_agent": "researcher-alpha",
  "turn_number": 3,
  "timestamp": "2026-02-18T14:30:00Z",
  "message_type": "task_update" | "result" | "question" | "clarification",
  "content": {
    "summary": "Found 3 potential tools...",
    "details": {...},
    "next_steps": ["Analyze tool A", "Test tool B"]
  },
  "metadata": {
    "parent_message_id": "msg-123",
    "attachments": []
  }
}
```

### Turn-Taking Flow
```
Turn 1: Orchestrator posts planning message to #general
        → "Task: Research comms security tools. Delegating to researcher-alpha."

Turn 2: researcher-alpha works, posts result to #artifacts
        → [File reference: ./artifacts/tool-research-001.md]

Turn 3: Orchestrator reads results, delegates analysis
        → "analyst-beta, analyze the findings in tool-research-001.md"

Turn 4: analyst-beta works, posts summary to #general
        → "Analysis complete. Top 3 tools: A (85%), B (72%), C (68%)"

Turn 5: Orchestrator synthesizes final output
        → Posts comprehensive report to #artifacts
```

---

## Error Handling & Recovery

### Failure Modes

| Scenario | Response |
|----------|----------|
| Agent crashes mid-turn | Orchestrator detects via heartbeat failure, restarts agent with same task |
| Agent produces invalid output | Orchestrator requests clarification, may reassign |
| Channel write fails | Retry with exponential backoff, escalate after 3 failures |
| Turn timeout exceeded | Orchestrator checks agent health, may replace agent |

### Health Monitoring
- Each agent's session health is tracked by orchestrator
- Stalled agents (no heartbeat) are flagged
- Failed agents trigger recovery protocol

---

## Observability & Debugging

### Status Dashboard
```bash
/team status research-team-2026

Team: research-team-2026
Status: active
Orchestrator: orch-789

Agents:
  researcher-alpha  [working]   Turn 3/5
  analyst-beta      [waiting]
  writer-gamma      [idle]

Channels:
  #general         12 messages
  #artifacts       3 files

Metrics:
  Total turns: 15
  Tokens used: 45,230
  Elapsed time: 8m 23s
```

### Logs
- All team actions logged to `.lowcal/team-orchestrator/logs/`
- Each turn creates a traceable audit trail

---

## Performance Considerations

| Metric | Estimate |
|--------|----------|
| Token overhead per agent | ~15× base chat (Anthropic data) |
| Channel message latency | <100ms (file I/O) |
| Turn-switching delay | ~2-3s (orchestrator processing) |
| Max agents per team | 10-15 (practical limit) |

**Economic viability:** Multi-agent teams burn significant tokens. Only use for high-value tasks where research output justifies cost.

---

## Migration Path

### Phase 0: Pre-Implementation Checklist
- [ ] Verify existing session registry supports `team_id` field
- [ ] Confirm mailbox system can handle channel-specific files
- [ ] Document current orchestrator policy structure
- [ ] Create test fixtures for team definitions

### Phase 1: Prototype (2 weeks)
1. Implement core types and state store
2. Add basic YAML team definition parsing
3. Extend orchestrator with team-coordinator policy
4. Test with 2-agent "hello world" team

### Phase 2: CLI Integration (1 week)
1. Implement `/team` slash commands
2. Add team status dashboard
3. Create team management tools for agents

### Phase 3: Testing & Docs (1 week)
1. Write integration tests
2. Document agent patterns and best practices
3. Create example teams (research, coding, writing)

---

## Open Questions & Design Decisions

### Q1: Channel Privacy
**Question:** Should we support truly private channels (restricted visibility)?

**Decision:** No for v1. Shared channels only.

### Q2: Agent-to-Agent Communication
**Question:** Can agents message each other directly, or only through orchestrator?

**Decision:** Strict orchestrator-mediated communication in v1.

### Q3: Shared Context Management
**Question:** How do we handle concurrent writes to shared files?

**Decision:** Use file locking (already implemented in launch-task-state.ts). For complex scenarios, require agents to write to separate artifacts and merge at synthesis stage.

### Q4: Model Selection Per Agent
**Question:** Can different agents use different models?

**Decision:** Yes. Each agent can specify its own model in the manifest. Orchestrator handles routing to appropriate API endpoints.

### Q5: Team State Location
**Question:** Should team metadata live in launch-task state?

**Decision:** No. Use a dedicated `.lowcal/team-state.json`.

### Q6: Team Entry Point
**Question:** Should team operations be slash commands or top-level CLI commands?

**Decision:** Slash command only in v1 (`/team ...`).

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Team creation time (YAML → running) | <5 seconds |
| Turn-switching latency | <3 seconds |
| Task completion accuracy vs single agent | +20% improvement |
| User satisfaction (NPS) | +15 points |

---

## References

- [Anthropic Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [LangGraph Hierarchical Teams](https://langchain-ai.github.io/langgraph/tutorials/agent_supervisor/)
- [AutoGen Conversational Frameworks](https://microsoft.github.io/autogen/)
- [CAMEL Role-Playing Framework](https://github.com/camel-ai/camel)

---

*End of Spec*
