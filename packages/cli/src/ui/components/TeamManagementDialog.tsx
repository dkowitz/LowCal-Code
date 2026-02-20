/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listTeamStates,
  TaskTemplateManager,
  type TaskTemplate,
  type TaskTemplateLevel,
  type TeamState,
} from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import {
  getOrchestratorStatus,
  type OrchestratorStatus,
} from "../../orchestrator/daemon.js";
import { Colors } from "../colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from "./shared/RadioButtonSelect.js";
import { TextInput } from "./shared/TextInput.js";

type FocusSection = "teams" | "tasks" | "actions" | "input";
type TeamCreateMode = "field_nav" | "edit_text" | "select_agent_tasks";
type AgentStartupMode = "immediate" | "idle";
type TeamCreateField =
  | "team_id"
  | "team_name"
  | "orchestrator_prompt"
  | "agent_tasks"
  | "channels";

type TeamDialogAction =
  | "refresh"
  | "team_create"
  | "team_edit"
  | "team_edit_save"
  | "team_status"
  | "team_dissolve"
  | "team_run"
  | "team_prompt"
  | "orchestrator_status"
  | "orchestrator_start"
  | "orchestrator_stop";

interface TeamManagementDialogProps {
  baseDir: string;
  projectRoot: string;
  onExit: () => void;
  onSubmitCommand: (command: string) => Promise<void>;
}

interface ActionPlan {
  command?: string;
  error?: string;
}

interface TeamCreateDraft {
  team_id: string;
  team_name: string;
  orchestrator_prompt: string;
  channels: string;
}

const TEAM_MEMBER_TAGS = new Set([
  "team_member",
  "team-member",
  "teammember",
]);

const TEAM_CREATE_FIELD_ORDER: TeamCreateField[] = [
  "team_id",
  "team_name",
  "orchestrator_prompt",
  "agent_tasks",
  "channels",
];

const TEAM_CREATE_FIELD_LABELS: Record<TeamCreateField, string> = {
  team_id: "Team ID",
  team_name: "Team Name",
  orchestrator_prompt: "Orchestrator Prompt",
  agent_tasks: "Agent Tasks",
  channels: "Channels",
};

const TEAM_CREATE_PLACEHOLDERS: Record<TeamCreateField, string> = {
  team_id: "Unique team id (e.g., research-team)",
  team_name: "Human-readable team name",
  orchestrator_prompt: "Initial orchestrator instructions for this team",
  agent_tasks: "Select team-member tasks below",
  channels: "#general,#planning",
};

function formatPreview(value: string | undefined, fallback = "(unset)"): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 70) {
    return normalized;
  }
  return `${normalized.slice(0, 70)}...`;
}

function formatTime(value: string | undefined): string {
  if (!value) {
    return "unknown";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "unknown";
  }
  return parsed.toLocaleString();
}

function quoteForShell(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function templateKey(template: TaskTemplate): string {
  return `${template.id}:${template.level}`;
}

function isTeamMemberTemplate(template: TaskTemplate): boolean {
  const tags = template.tags?.map((tag) => tag.toLowerCase().trim()) ?? [];
  return tags.some((tag) => TEAM_MEMBER_TAGS.has(tag));
}

export function TeamManagementDialog({
  baseDir,
  projectRoot,
  onExit,
  onSubmitCommand,
}: TeamManagementDialogProps): React.JSX.Element {
  const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
  const [focusSection, setFocusSection] = useState<FocusSection>("teams");
  const [teamStates, setTeamStates] = useState<TeamState[]>([]);
  const [teamTasks, setTeamTasks] = useState<TaskTemplate[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedTaskKey, setSelectedTaskKey] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] =
    useState<TeamDialogAction>("refresh");
  const [teamCreateMode, setTeamCreateMode] =
    useState<TeamCreateMode>("field_nav");
  const [teamCreateField, setTeamCreateField] =
    useState<TeamCreateField>("team_id");
  const [teamCreateDraft, setTeamCreateDraft] = useState<TeamCreateDraft>({
    team_id: "research-team",
    team_name: "Research Team",
    orchestrator_prompt: "",
    channels: "#general,#planning",
  });
  const [selectedTeamAgentTaskIds, setSelectedTeamAgentTaskIds] = useState<
    string[]
  >([]);
  const [selectedTeamAgentTaskModes, setSelectedTeamAgentTaskModes] = useState<
    Record<string, AgentStartupMode>
  >({});
  const [teamAgentTaskCursor, setTeamAgentTaskCursor] = useState(0);
  const [teamPromptDraft, setTeamPromptDraft] = useState("");
  const [orchestratorStatus, setOrchestratorStatus] =
    useState<OrchestratorStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRunningAction, setIsRunningAction] = useState<boolean>(false);
  const teamEditInitRef = useRef<string | null>(null);

  const manager = useMemo(
    () => new TaskTemplateManager(projectRoot),
    [projectRoot],
  );

  const selectedTeam = useMemo(
    () => teamStates.find((team) => team.team_id === selectedTeamId) ?? null,
    [teamStates, selectedTeamId],
  );

  const selectedTask = useMemo(
    () => teamTasks.find((task) => templateKey(task) === selectedTaskKey) ?? null,
    [teamTasks, selectedTaskKey],
  );

  const uniqueTeamAgentTasks = useMemo(() => {
    const seen = new Set<string>();
    const deduped: TaskTemplate[] = [];
    for (const task of teamTasks) {
      if (seen.has(task.id)) {
        continue;
      }
      seen.add(task.id);
      deduped.push(task);
    }
    return deduped;
  }, [teamTasks]);

  const currentTeamCreateValue =
    teamCreateField === "agent_tasks" ? "" : teamCreateDraft[teamCreateField];
  const wizardFieldOrder = useMemo(
    () =>
      selectedAction === "team_edit"
        ? TEAM_CREATE_FIELD_ORDER.filter((field) => field !== "team_id")
        : TEAM_CREATE_FIELD_ORDER,
    [selectedAction],
  );

  const setCurrentTeamCreateValue = useCallback(
    (value: string) => {
      if (teamCreateField === "agent_tasks") {
        return;
      }
      setTeamCreateDraft((previous) => ({
        ...previous,
        [teamCreateField]: value,
      }));
      setErrorMessage(null);
    },
    [teamCreateField],
  );

  const reloadData = useCallback(
    async (options?: { background?: boolean; status?: string }) => {
      if (!options?.background) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const levels: TaskTemplateLevel[] = ["project", "user", "builtin"];
        await manager.listTemplates({ force: true });
        const templateLists = await Promise.all(
          levels.map((level) => manager.listTemplates({ level })),
        );
        const filteredTemplates = templateLists
          .flat()
          .filter(isTeamMemberTemplate)
          .sort((left, right) => {
            const idCompare = left.id.localeCompare(right.id);
            if (idCompare !== 0) {
              return idCompare;
            }
            return left.level.localeCompare(right.level);
          });

        const teams = await listTeamStates(baseDir, { limit: 100 });
        const orchestrator = await getOrchestratorStatus();

        setTeamStates(teams);
        setTeamTasks(filteredTemplates);
        setOrchestratorStatus(orchestrator);

        setSelectedTeamId((current) => {
          if (current && teams.some((team) => team.team_id === current)) {
            return current;
          }
          return teams[0]?.team_id ?? null;
        });

        setSelectedTaskKey((current) => {
          if (current && filteredTemplates.some((task) => templateKey(task) === current)) {
            return current;
          }
          const first = filteredTemplates[0];
          return first ? templateKey(first) : null;
        });

        if (options?.status) {
          setStatusMessage(options.status);
        }
      } catch (error) {
        setErrorMessage(
          `Failed to load team data: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        if (!options?.background) {
          setIsLoading(false);
        }
      }
    },
    [baseDir, manager],
  );

  useEffect(() => {
    void reloadData();
    const timer = setInterval(() => {
      const isWizardEditing =
        selectedAction === "team_create" || selectedAction === "team_edit";
      if (!isWizardEditing && !isRunningAction) {
        void reloadData({ background: true });
      }
    }, 5000);
    return () => {
      clearInterval(timer);
    };
  }, [isRunningAction, reloadData, selectedAction]);

  useEffect(() => {
    const availableIds = new Set(uniqueTeamAgentTasks.map((task) => task.id));
    setSelectedTeamAgentTaskIds((current) =>
      current.filter((id) => availableIds.has(id)),
    );
    setSelectedTeamAgentTaskModes((current) => {
      const next: Record<string, AgentStartupMode> = {};
      for (const [taskId, mode] of Object.entries(current)) {
        if (availableIds.has(taskId)) {
          next[taskId] = mode;
        }
      }
      return next;
    });
    setTeamAgentTaskCursor((current) => {
      if (uniqueTeamAgentTasks.length === 0) {
        return 0;
      }
      return Math.max(0, Math.min(current, uniqueTeamAgentTasks.length - 1));
    });
  }, [uniqueTeamAgentTasks]);

  useEffect(() => {
    if (selectedAction !== "team_create" && selectedAction !== "team_edit") {
      setTeamCreateMode("field_nav");
    }
  }, [selectedAction]);

  useEffect(() => {
    if (selectedAction !== "team_edit") {
      teamEditInitRef.current = null;
      return;
    }
    if (!selectedTeam) {
      return;
    }
    const seedKey = selectedTeam.team_id;
    if (teamEditInitRef.current === seedKey) {
      return;
    }
    teamEditInitRef.current = seedKey;

    const manifest = selectedTeam.manifest;
    const channelNames = manifest.channels.map((channel) => channel.name).join(",");
    const agentIds = manifest.agents.map((agent) => agent.id);
    const nextModes: Record<string, AgentStartupMode> = {};
    for (const agent of manifest.agents) {
      nextModes[agent.id] = agent.startup === "idle" ? "idle" : "immediate";
    }

    setTeamCreateDraft({
      team_id: selectedTeam.team_id,
      team_name: selectedTeam.name,
      orchestrator_prompt: manifest.orchestrator?.prompt ?? manifest.description ?? "",
      channels: channelNames,
    });
    setSelectedTeamAgentTaskIds(agentIds);
    setSelectedTeamAgentTaskModes(nextModes);
    setTeamCreateField("team_name");
    setTeamCreateMode("field_nav");
  }, [selectedAction, selectedTeam]);

  useEffect(() => {
    if (focusSection !== "input" && teamCreateMode !== "field_nav") {
      setTeamCreateMode("field_nav");
    }
  }, [focusSection, teamCreateMode]);

  const moveTeamCreateField = useCallback((direction: -1 | 1) => {
    const currentIndex = wizardFieldOrder.indexOf(teamCreateField);
    const normalizedIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex =
      (normalizedIndex + direction + wizardFieldOrder.length) %
      wizardFieldOrder.length;
    setTeamCreateField(wizardFieldOrder[nextIndex]!);
    setErrorMessage(null);
  }, [teamCreateField, wizardFieldOrder]);

  const toggleCurrentAgentTaskSelection = useCallback(() => {
    if (uniqueTeamAgentTasks.length === 0) {
      return;
    }
    const task = uniqueTeamAgentTasks[teamAgentTaskCursor];
    if (!task) {
      return;
    }
    setSelectedTeamAgentTaskIds((current) => {
      if (current.includes(task.id)) {
        setSelectedTeamAgentTaskModes((modes) => {
          const next = { ...modes };
          delete next[task.id];
          return next;
        });
        return current.filter((id) => id !== task.id);
      }
      setSelectedTeamAgentTaskModes((modes) => ({
        ...modes,
        [task.id]: modes[task.id] ?? "immediate",
      }));
      return [...current, task.id];
    });
  }, [teamAgentTaskCursor, uniqueTeamAgentTasks]);

  const toggleCurrentAgentTaskStartupMode = useCallback(() => {
    if (uniqueTeamAgentTasks.length === 0) {
      return;
    }
    const task = uniqueTeamAgentTasks[teamAgentTaskCursor];
    if (!task) {
      return;
    }
    setSelectedTeamAgentTaskIds((current) => {
      if (current.includes(task.id)) {
        return current;
      }
      return [...current, task.id];
    });
    setSelectedTeamAgentTaskModes((current) => {
      const currentMode = current[task.id];
      const nextMode: AgentStartupMode =
        currentMode === undefined
          ? "immediate"
          : currentMode === "idle"
            ? "immediate"
            : "idle";
      return {
        ...current,
        [task.id]: nextMode,
      };
    });
  }, [teamAgentTaskCursor, uniqueTeamAgentTasks]);

  useKeypress(
    (key) => {
      const inTeamCreateInput =
        focusSection === "input" &&
        (selectedAction === "team_create" || selectedAction === "team_edit");

      if (inTeamCreateInput) {
        if (key.ctrl && key.name === "s") {
          void executeAction(
            selectedAction === "team_edit" ? "team_edit_save" : "team_create",
          );
          return;
        }

        if (key.name === "escape" && teamCreateMode !== "field_nav") {
          setTeamCreateMode("field_nav");
          return;
        }

        if (teamCreateMode === "field_nav") {
          if (key.name === "up" || key.name === "k") {
            moveTeamCreateField(-1);
            return;
          }
          if (key.name === "down" || key.name === "j") {
            moveTeamCreateField(1);
            return;
          }
          if (key.name === "return") {
            if (teamCreateField === "agent_tasks") {
              setTeamCreateMode("select_agent_tasks");
            } else {
              setTeamCreateMode("edit_text");
            }
            return;
          }
        } else if (teamCreateMode === "select_agent_tasks") {
          if (key.name === "return") {
            toggleCurrentAgentTaskStartupMode();
            return;
          }
          if (key.name === "space") {
            toggleCurrentAgentTaskSelection();
            return;
          }
          if (
            key.name === "m" ||
            key.name === "left" ||
            key.name === "right" ||
            key.name === "h" ||
            key.name === "l"
          ) {
            toggleCurrentAgentTaskStartupMode();
            return;
          }
        }

        if (key.ctrl && (key.name === "n" || key.name === "p")) {
          setTeamCreateMode("field_nav");
          moveTeamCreateField(key.name === "n" ? 1 : -1);
          return;
        }
      }

      if (key.name === "escape") {
        onExit();
        return;
      }

      if (key.name === "tab") {
        const order: FocusSection[] = ["teams", "tasks", "actions", "input"];
        setFocusSection((current) => {
          const currentIndex = order.indexOf(current);
          const nextIndex = key.shift
            ? (currentIndex - 1 + order.length) % order.length
            : (currentIndex + 1) % order.length;
          return order[nextIndex]!;
        });
        return;
      }

      if (key.name === "r" && !key.ctrl && !key.meta) {
        void reloadData({ status: "Reloaded team state and task templates." });
      }
    },
    { isActive: true },
  );

  const actionItems: Array<RadioSelectItem<TeamDialogAction>> = useMemo(
    () => [
      { value: "refresh", label: "Refresh teams + team-member tasks" },
      { value: "team_create", label: "Create team (wizard)" },
      {
        value: "team_edit",
        label: `Edit selected team (wizard): ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      {
        value: "team_edit_save",
        label: `Save edited team changes: ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      {
        value: "team_status",
        label: `Show status: ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      {
        value: "team_dissolve",
        label: `Dissolve team: ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      {
        value: "team_run",
        label: `Run selected team: ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      {
        value: "team_prompt",
        label: `Prompt orchestrator: ${selectedTeam?.team_id ?? "(select a team)"}`,
      },
      { value: "orchestrator_status", label: "Orchestrator status" },
      { value: "orchestrator_start", label: "Start orchestrator daemon" },
      { value: "orchestrator_stop", label: "Stop orchestrator daemon" },
    ],
    [selectedTeam?.team_id],
  );

  const selectedActionIndex = useMemo(() => {
    const index = actionItems.findIndex((item) => item.value === selectedAction);
    return index >= 0 ? index : 0;
  }, [actionItems, selectedAction]);

  const teamItems: Array<RadioSelectItem<string>> = useMemo(
    () =>
      teamStates.map((team) => ({
        value: team.team_id,
        label: `${team.team_id} [${team.status}] phase=${team.coordination?.phase ?? "planning"} agents=${Object.keys(team.agents).length}`,
      })),
    [teamStates],
  );

  const selectedTeamIndex = useMemo(() => {
    if (!selectedTeamId) {
      return 0;
    }
    const index = teamItems.findIndex((item) => item.value === selectedTeamId);
    return index >= 0 ? index : 0;
  }, [selectedTeamId, teamItems]);

  const taskItems: Array<RadioSelectItem<string>> = useMemo(
    () =>
      teamTasks.map((task) => ({
        value: templateKey(task),
        label: `${task.id} [${task.level}] ${task.name ? `- ${task.name}` : ""}`,
      })),
    [teamTasks],
  );

  const selectedTaskIndex = useMemo(() => {
    if (!selectedTaskKey) {
      return 0;
    }
    const index = taskItems.findIndex((item) => item.value === selectedTaskKey);
    return index >= 0 ? index : 0;
  }, [selectedTaskKey, taskItems]);

  const buildActionPlan = useCallback(
    (action: TeamDialogAction): ActionPlan => {
      if (action === "refresh") {
        return {};
      }

      if (
        action === "team_create" ||
        action === "team_edit" ||
        action === "team_edit_save"
      ) {
        const teamId = teamCreateDraft.team_id.trim();
        const teamName = teamCreateDraft.team_name.trim();
        const channels = teamCreateDraft.channels.trim();
        const orchestratorPrompt = teamCreateDraft.orchestrator_prompt.trim();
        const agentTasks = selectedTeamAgentTaskIds;
        const modeEntries = agentTasks.map(
          (taskId) =>
            `${taskId}:${selectedTeamAgentTaskModes[taskId] === "idle" ? "idle" : "immediate"}`,
        );

        if (action === "team_create" && !teamId) {
          return { error: "Wizard field Team ID is required." };
        }
        if (!teamName) {
          return { error: "Wizard field Team Name is required." };
        }
        if (agentTasks.length === 0) {
          return {
            error:
              "Wizard field Agent Tasks needs at least one selected team-member task.",
          };
        }
        if (!channels) {
          return { error: "Wizard field Channels is required." };
        }

        const agentTasksArg = quoteForShell(agentTasks.join(","));
        const agentModesArg = quoteForShell(modeEntries.join(","));
        const descriptionArg = orchestratorPrompt
          ? ` --description ${quoteForShell(orchestratorPrompt)}`
          : "";
        if (action === "team_edit" || action === "team_edit_save") {
          if (!selectedTeam) {
            return { error: "Select a team before editing it." };
          }
          return {
            command:
              `/team update ${quoteForShell(selectedTeam.team_id)}` +
              ` --name ${quoteForShell(teamName)}` +
              ` --agent-tasks ${agentTasksArg}` +
              ` --agent-task-modes ${agentModesArg}` +
              ` --channels ${quoteForShell(channels)}` +
              descriptionArg,
          };
        }
        return {
          command:
            `/team create --id ${quoteForShell(teamId)}` +
            ` --name ${quoteForShell(teamName)}` +
            ` --agent-tasks ${agentTasksArg}` +
            ` --agent-task-modes ${agentModesArg}` +
            ` --channels ${quoteForShell(channels)}` +
            descriptionArg,
        };
      }

      if (action === "team_status") {
        if (!selectedTeam) {
          return { error: "Select a team before requesting status." };
        }
        return { command: `/team status ${quoteForShell(selectedTeam.team_id)}` };
      }

      if (action === "team_dissolve") {
        if (!selectedTeam) {
          return { error: "Select a team before dissolving it." };
        }
        return { command: `/team dissolve ${quoteForShell(selectedTeam.team_id)}` };
      }

      if (action === "team_run") {
        if (!selectedTeam) {
          return { error: "Select a team before running it." };
        }
        return {
          command: `/team run ${quoteForShell(selectedTeam.team_id)}`,
        };
      }

      if (action === "team_prompt") {
        if (!selectedTeam) {
          return { error: "Select a team before prompting the orchestrator." };
        }
        const prompt = teamPromptDraft.trim();
        if (!prompt) {
          return { error: "Orchestrator prompt text is required." };
        }
        return {
          command: `/team prompt ${quoteForShell(selectedTeam.team_id)} ${quoteForShell(prompt)}`,
        };
      }

      if (action === "orchestrator_status") {
        return { command: "/orchestrator status" };
      }
      if (action === "orchestrator_start") {
        return { command: "/orchestrator start" };
      }
      return { command: "/orchestrator stop" };
    },
    [
      selectedTeam,
      selectedTeamAgentTaskIds,
      selectedTeamAgentTaskModes,
      teamCreateDraft,
      teamPromptDraft,
    ],
  );

  const actionPlanPreview = useMemo(
    () => buildActionPlan(selectedAction),
    [buildActionPlan, selectedAction],
  );

  const executeAction = useCallback(
    async (action: TeamDialogAction) => {
      if (isRunningAction) {
        return;
      }

      setErrorMessage(null);

      if (action === "refresh") {
        await reloadData({ status: "Reloaded team state and task templates." });
        return;
      }

      const plan = buildActionPlan(action);
      if (plan.error) {
        setErrorMessage(plan.error);
        return;
      }
      if (!plan.command) {
        return;
      }

      setIsRunningAction(true);
      try {
        await onSubmitCommand(plan.command);
        setStatusMessage(`Submitted: ${plan.command}`);

        if (
          action === "team_create" ||
          action === "team_edit" ||
          action === "team_edit_save" ||
          action === "team_run" ||
          action === "team_prompt" ||
          action === "team_dissolve" ||
          action === "team_status"
        ) {
          await reloadData({ background: true });
        }
      } catch (error) {
        setErrorMessage(
          `Failed to execute action: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        setIsRunningAction(false);
      }
    },
    [buildActionPlan, isRunningAction, onSubmitCommand, reloadData],
  );

  const teamDetails = useMemo(() => {
    if (!selectedTeam) {
      return [
        "No team selected.",
        "Create one with the wizard or pick an existing team.",
      ];
    }
    const delegationCount = Object.keys(
      selectedTeam.coordination?.delegations ?? {},
    ).length;
    const immediateCount = selectedTeam.manifest.agents.filter(
      (agent) => (agent.startup ?? "immediate") !== "idle",
    ).length;
    const idleCount = selectedTeam.manifest.agents.length - immediateCount;
    return [
      `Team: ${selectedTeam.team_id} (${selectedTeam.status})`,
      `Name: ${selectedTeam.name}`,
      `Objective: ${formatPreview(selectedTeam.manifest.description, "(unset)")}`,
      `Orchestrator Prompt: ${formatPreview(selectedTeam.manifest.orchestrator?.prompt ?? selectedTeam.manifest.description, "(unset)")}`,
      `Phase: ${selectedTeam.coordination?.phase ?? "planning"} | Turn: ${
        selectedTeam.coordination?.turn_number ?? 0
      }`,
      `Agents: ${Object.keys(selectedTeam.agents).length} | Channels: ${Object.keys(selectedTeam.channels).length} | Delegations: ${delegationCount}`,
      `Startup Modes: immediate=${immediateCount}, idle=${idleCount}`,
      `Created: ${formatTime(selectedTeam.created_at)}`,
      `Orchestrator Session: ${selectedTeam.orchestrator_session_id}`,
      `Decision Mode: ${orchestratorStatus?.decision_mode ?? "unknown"} (${orchestratorStatus?.decision_mode_source ?? "unknown"}) | Planner Source: ${orchestratorStatus?.planner_source ?? "n/a"} | Hint Teams: ${orchestratorStatus?.planner_last_hint_teams ?? 0}`,
      `Planner Confidence: ${
        typeof orchestratorStatus?.planner_last_confidence === "number"
          ? orchestratorStatus.planner_last_confidence.toFixed(2)
          : "n/a"
      }`,
      `Planner Summary: ${formatPreview(orchestratorStatus?.planner_last_summary, "n/a")}`,
      `Planner Fallback: ${formatPreview(orchestratorStatus?.planner_last_fallback_reason, "none")}`,
    ];
  }, [orchestratorStatus, selectedTeam]);

  const taskDetails = useMemo(() => {
    if (!selectedTask) {
      return [
        "No team agent-task selected.",
        "Tag templates with team_member to surface them here.",
      ];
    }
    return [
      `Task: ${selectedTask.id} [${selectedTask.level}]`,
      `Name: ${formatPreview(selectedTask.name, "(unnamed)")}`,
      `Description: ${formatPreview(selectedTask.description)}`,
      `Tags: ${selectedTask.tags?.join(", ") ?? "(none)"}`,
      `Action: ${selectedTask.action?.type ?? "prompt"} -> ${formatPreview(selectedTask.action?.value ?? selectedTask.prompt, "(empty)")}`,
    ];
  }, [selectedTask]);

  const listMaxItems = Math.max(5, Math.min(10, Math.floor(terminalRows * 0.24)));
  const actionMaxItems = Math.max(
    6,
    Math.min(11, Math.floor(terminalRows * 0.28)),
  );
  const actionInputWidth = Math.max(30, Math.floor(terminalColumns * 0.55));

  const columnGap = 2;
  const totalWidth = Math.max(78, terminalColumns - 2);
  const columnWidth = Math.max(
    24,
    Math.floor((totalWidth - columnGap * 2) / 3),
  );
  const teamCreateFieldIndex = wizardFieldOrder.indexOf(teamCreateField);
  const teamCreateInputHeight =
    teamCreateField === "orchestrator_prompt"
      ? 3
      : teamCreateField === "agent_tasks" || teamCreateField === "channels"
        ? 4
        : 1;
  const selectedAgentTaskSummary =
    selectedTeamAgentTaskIds.length === 0
      ? "(none)"
      : selectedTeamAgentTaskIds
          .map(
            (taskId) =>
              `${taskId}:${selectedTeamAgentTaskModes[taskId] === "idle" ? "idle" : "immediate"}`,
          )
          .join(", ");
  const wizardFieldPreview = useMemo(
    () => ({
      team_id: teamCreateDraft.team_id,
      team_name: teamCreateDraft.team_name,
      orchestrator_prompt: teamCreateDraft.orchestrator_prompt,
      channels: teamCreateDraft.channels,
      agent_tasks: selectedAgentTaskSummary,
    }),
    [selectedAgentTaskSummary, teamCreateDraft],
  );
  const agentPickerItems: Array<RadioSelectItem<string>> = useMemo(
    () =>
      uniqueTeamAgentTasks.map((task) => {
        const isSelected = selectedTeamAgentTaskIds.includes(task.id);
        const startupMode = selectedTeamAgentTaskModes[task.id] ?? "immediate";
        const marker = isSelected ? "[x]" : "[ ]";
        return {
          value: task.id,
          label: `${marker} ${task.id}${task.name ? ` - ${task.name}` : ""}${isSelected ? ` (${startupMode})` : ""}`,
        };
      }),
    [selectedTeamAgentTaskIds, selectedTeamAgentTaskModes, uniqueTeamAgentTasks],
  );
  const agentPickerIndex = useMemo(() => {
    if (agentPickerItems.length === 0) {
      return 0;
    }
    return Math.max(0, Math.min(teamAgentTaskCursor, agentPickerItems.length - 1));
  }, [agentPickerItems.length, teamAgentTaskCursor]);

  const handleTeamCreateInputSubmit = useCallback(() => {
    const isFinalField = teamCreateFieldIndex === wizardFieldOrder.length - 1;
    if (isFinalField) {
      setTeamCreateMode("field_nav");
      void executeAction(
        selectedAction === "team_edit" ? "team_edit_save" : "team_create",
      );
      return;
    }
    setTeamCreateField(wizardFieldOrder[teamCreateFieldIndex + 1]!);
    setTeamCreateMode("field_nav");
  }, [executeAction, selectedAction, teamCreateFieldIndex, wizardFieldOrder]);

  return (
    <Box flexDirection="column">
      <Text color={Colors.AccentCyan}>Team Management</Text>
      <Text color={Colors.Gray}>
        Team members are persistent sessions. Routing is strict
        orchestrator-mediated and channels are shared-only in v1.
      </Text>
      <Text color={Colors.Gray}>
        Team creation is wizard-driven here; no YAML file is required.
      </Text>
      <Text color={Colors.Gray}>
        Tab/Shift+Tab switch focus. Enter executes selected action. Press r to
        refresh.
      </Text>

      <Box marginTop={1}>
        <Text color={Colors.Gray}>Focus: {focusSection}</Text>
      </Box>

      <Box marginTop={1}>
        <Box flexDirection="column" width={columnWidth} marginRight={columnGap}>
          <Text
            color={
              focusSection === "teams" ? Colors.AccentGreen : Colors.AccentBlue
            }
          >
            Teams
          </Text>
          {isLoading ? (
            <Text color={Colors.Gray}>Loading teams...</Text>
          ) : teamItems.length === 0 ? (
            <Text color={Colors.Gray}>No teams found.</Text>
          ) : (
            <RadioButtonSelect
              items={teamItems}
              initialIndex={selectedTeamIndex}
              isFocused={focusSection === "teams"}
              maxItemsToShow={listMaxItems}
              onHighlight={(value) => setSelectedTeamId(value)}
              onSelect={(value) => setSelectedTeamId(value)}
            />
          )}
        </Box>

        <Box flexDirection="column" width={columnWidth} marginRight={columnGap}>
          <Text
            color={
              focusSection === "tasks" ? Colors.AccentGreen : Colors.AccentBlue
            }
          >
            Team Agent-Tasks
          </Text>
          {isLoading ? (
            <Text color={Colors.Gray}>Loading task templates...</Text>
          ) : taskItems.length === 0 ? (
            <Text color={Colors.Gray}>
              No templates tagged with team_member.
            </Text>
          ) : (
            <RadioButtonSelect
              items={taskItems}
              initialIndex={selectedTaskIndex}
              isFocused={focusSection === "tasks"}
              maxItemsToShow={listMaxItems}
              onHighlight={(value) => setSelectedTaskKey(value)}
              onSelect={(value) => setSelectedTaskKey(value)}
            />
          )}
        </Box>

        <Box flexDirection="column" width={columnWidth}>
          <Text
            color={
              focusSection === "actions"
                ? Colors.AccentGreen
                : Colors.AccentBlue
            }
          >
            Actions
          </Text>
          <RadioButtonSelect
            items={actionItems}
            initialIndex={selectedActionIndex}
            isFocused={focusSection === "actions"}
            maxItemsToShow={actionMaxItems}
            onHighlight={(value) => {
              if (value === "team_edit_save" && selectedAction === "team_edit") {
                return;
              }
              setSelectedAction(value);
            }}
            onSelect={(value) => {
              if (value === "team_create" || value === "team_edit") {
                setSelectedAction(value);
                setFocusSection("input");
                setTeamCreateMode("field_nav");
                return;
              }
              if (value === "team_prompt") {
                setSelectedAction(value);
                setFocusSection("input");
                return;
              }
              if (value === "team_edit_save") {
                void executeAction("team_edit_save");
                return;
              }
              setSelectedAction(value);
              void executeAction(value);
            }}
          />
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text color={Colors.AccentBlue}>Selection</Text>
        {teamDetails.map((line, index) => (
          <Text key={`team-line-${index}`} wrap="truncate">
            {line}
          </Text>
        ))}
        {taskDetails.map((line, index) => (
          <Text key={`task-line-${index}`} color={Colors.Gray} wrap="truncate">
            {line}
          </Text>
        ))}
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text
          color={
            focusSection === "input" ? Colors.AccentGreen : Colors.AccentBlue
          }
        >
          Action Input
        </Text>
        {selectedAction === "team_create" || selectedAction === "team_edit" ? (
          <Box flexDirection="column">
            <Text color={Colors.Gray}>
              Wizard: use Up/Down to pick a field, Enter to edit, Esc to leave
              edit mode, Ctrl+S to {selectedAction === "team_edit" ? "save team changes" : "create team"}.
            </Text>
            {wizardFieldOrder.map((field) => {
              const isActiveField = field === teamCreateField;
              const marker = isActiveField ? ">" : " ";
              const value = wizardFieldPreview[field];
              return (
                <Text
                  key={field}
                  color={
                    isActiveField && teamCreateMode === "field_nav"
                      ? Colors.AccentGreen
                      : Colors.Gray
                  }
                  wrap="truncate"
                >
                  {marker} {TEAM_CREATE_FIELD_LABELS[field]}:{" "}
                  {formatPreview(value, "(empty)")}
                </Text>
              );
            })}
            {teamCreateField === "agent_tasks" ? (
              <>
                {teamCreateMode === "select_agent_tasks" ? (
                  agentPickerItems.length === 0 ? (
                    <Text color={Colors.Gray}>
                      No team-member tasks available. Tag task templates with
                      team_member.
                    </Text>
                  ) : (
                    <RadioButtonSelect
                      items={agentPickerItems}
                      initialIndex={agentPickerIndex}
                      isFocused={
                        focusSection === "input" &&
                        teamCreateMode === "select_agent_tasks"
                      }
                      maxItemsToShow={Math.max(4, Math.min(8, listMaxItems))}
                      onHighlight={(value) => {
                        const nextIndex = uniqueTeamAgentTasks.findIndex(
                          (task) => task.id === value,
                        );
                        if (nextIndex >= 0) {
                          setTeamAgentTaskCursor(nextIndex);
                        }
                      }}
                      onSelect={(value) => {
                        setTeamAgentTaskCursor(
                          Math.max(
                            0,
                            uniqueTeamAgentTasks.findIndex(
                              (task) => task.id === value,
                            ),
                          ),
                        );
                        setSelectedTeamAgentTaskIds((current) =>
                          current.includes(value) ? current : [...current, value],
                        );
                        setSelectedTeamAgentTaskModes((current) => {
                          const currentMode = current[value];
                          const nextMode: AgentStartupMode =
                            currentMode === undefined
                              ? "immediate"
                              : currentMode === "idle"
                                ? "immediate"
                                : "idle";
                          return {
                            ...current,
                            [value]: nextMode,
                          };
                        });
                      }}
                    />
                  )
                ) : (
                  <Text color={Colors.Gray}>
                    Press Space to select/deselect team-member tasks. Press Enter, Left/Right, or m to toggle startup mode (immediate/idle) for the highlighted selected task.
                  </Text>
                )}
              </>
            ) : (
              <TextInput
                value={currentTeamCreateValue}
                onChange={setCurrentTeamCreateValue}
                onSubmit={handleTeamCreateInputSubmit}
                placeholder={TEAM_CREATE_PLACEHOLDERS[teamCreateField]}
                inputWidth={actionInputWidth}
                height={teamCreateInputHeight}
                isActive={
                  focusSection === "input" && teamCreateMode === "edit_text"
                }
              />
            )}
          </Box>
        ) : selectedAction === "team_prompt" ? (
          <TextInput
            value={teamPromptDraft}
            onChange={(value) => {
              setTeamPromptDraft(value);
              setErrorMessage(null);
            }}
            onSubmit={() => {
              void executeAction("team_prompt");
            }}
            placeholder="Instruction for orchestrator (e.g., Re-plan and delegate bug triage)"
            inputWidth={actionInputWidth}
            height={Math.max(2, teamCreateInputHeight)}
            isActive={focusSection === "input"}
          />
        ) : (
          <Text color={Colors.Gray} wrap="truncate">
            {actionPlanPreview.error
              ? actionPlanPreview.error
              : actionPlanPreview.command
                ? `Command preview: ${actionPlanPreview.command}`
                : "Selected action does not require input."}
          </Text>
        )}
      </Box>

      {statusMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentGreen}>{statusMessage}</Text>
        </Box>
      )}
      {errorMessage && (
        <Box marginTop={1}>
          <Text color={Colors.AccentRed}>{errorMessage}</Text>
        </Box>
      )}
      {isRunningAction && (
        <Box marginTop={1}>
          <Text color={Colors.Gray}>Executing action...</Text>
        </Box>
      )}
    </Box>
  );
}
