/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AuthType,
  TaskTemplateManager,
  type TaskTemplate,
  type TaskTemplateLevel,
} from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import {
  fetchGeminiModels,
  fetchOpenAICompatibleModels,
  getFilteredGeminiModels,
  getOpenAIAvailableModelFromEnv,
  type AvailableModel,
} from "../models/availableModels.js";
import { useKeypress } from "../hooks/useKeypress.js";
import {
  RadioButtonSelect,
  type RadioSelectItem,
} from "./shared/RadioButtonSelect.js";
import { TextInput } from "./shared/TextInput.js";
import type { LoadedSettings } from "../../config/settings.js";

const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const LM_STUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const NEW_TEMPLATE_KEY = "__new__";

type FocusSection = "templates" | "fields" | "editor" | "actions";
type TaskAuthChoice =
  | "inherit"
  | "openrouter"
  | "lmstudio"
  | "openai"
  | "gemini";
type ReturnToSessionChoice = "inherit" | "true" | "false" | "current_session";
type BooleanChoice = "inherit" | "true" | "false";
type DeployMode = "launch" | "schedule";
type EditableField =
  | "id"
  | "name"
  | "description"
  | "tags"
  | "action_type"
  | "action_value"
  | "execution_mode"
  | "auth"
  | "model"
  | "run_return"
  | "run_recursive"
  | "level"
  | "deploy_mode"
  | "schedule"
  | "schedule_job_id";

interface DraftTemplate {
  id: string;
  name: string;
  description: string;
  tags: string;
  actionType: "prompt" | "slash_command";
  actionValue: string;
  executionMode: "default" | "headless" | "zellij_tab" | "in_process";
  authChoice: TaskAuthChoice;
  modelName: string;
  returnToSession: ReturnToSessionChoice;
  allowRecursive: BooleanChoice;
  level: "project" | "user";
  deployMode: DeployMode;
  schedule: string;
  scheduleJobId: string;
}

export interface TaskTemplateDeployRequest {
  templateId: string;
  templateLevel: TaskTemplateLevel;
  deployMode: DeployMode;
  schedule?: string;
  jobId?: string;
}

interface TaskTemplateEditorDialogProps {
  projectRoot: string;
  settings: LoadedSettings;
  currentModel: string;
  onExit: () => void;
  onDeploy: (request: TaskTemplateDeployRequest) => Promise<void>;
}

function templateKeyFor(template: TaskTemplate): string {
  return `${template.id}:${template.level}`;
}

function trimOrUndefined(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseTags(value: string): string[] | undefined {
  const tags = value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  return tags.length > 0 ? tags : undefined;
}

function toAuthChoice(auth: TaskTemplate["auth"]): TaskAuthChoice {
  if (!auth) return "inherit";
  if (auth.providerId === "openrouter") return "openrouter";
  if (auth.providerId === "lmstudio") return "lmstudio";
  if (auth.providerId === "openai") return "openai";
  if (auth.selectedType === AuthType.USE_GEMINI) return "gemini";
  if (auth.selectedType === AuthType.USE_OPENAI && !auth.providerId)
    return "openai";
  return "inherit";
}

function authChoiceFromSettings(settings: LoadedSettings): TaskAuthChoice {
  const providerId = settings.merged.security?.auth?.providerId;
  const selectedType = settings.merged.security?.auth?.selectedType;
  if (providerId === "openrouter") return "openrouter";
  if (providerId === "lmstudio") return "lmstudio";
  if (providerId === "openai") return "openai";
  if (selectedType === AuthType.USE_GEMINI) return "gemini";
  if (selectedType === AuthType.USE_OPENAI) return "openai";
  return "inherit";
}

function formatPreview(
  value: string | undefined,
  fallback = "(unset)",
): string {
  if (!value || value.trim().length === 0) {
    return fallback;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= 40) return normalized;
  return `${normalized.slice(0, 40)}...`;
}

function buildEmptyDraft(
  settings: LoadedSettings,
  currentModel: string,
): DraftTemplate {
  return {
    id: "",
    name: "",
    description: "",
    tags: "",
    actionType: "prompt",
    actionValue: "",
    executionMode: "default",
    authChoice: authChoiceFromSettings(settings),
    modelName: currentModel,
    returnToSession: "inherit",
    allowRecursive: "inherit",
    level: "user",
    deployMode: "launch",
    schedule: "0 * * * *",
    scheduleJobId: "",
  };
}

function buildDraftFromTemplate(
  template: TaskTemplate,
  settings: LoadedSettings,
  currentModel: string,
): DraftTemplate {
  const returnToSession = template.run?.returnToSession;
  const returnChoice: ReturnToSessionChoice =
    returnToSession === true
      ? "true"
      : returnToSession === false
        ? "false"
        : typeof returnToSession === "string"
          ? "current_session"
          : "inherit";

  const allowRecursive = template.run?.allowRecursive;
  const recursiveChoice: BooleanChoice =
    allowRecursive === true
      ? "true"
      : allowRecursive === false
        ? "false"
        : "inherit";

  return {
    id: template.id,
    name: template.name ?? "",
    description: template.description ?? "",
    tags: template.tags?.join(", ") ?? "",
    actionType: template.action?.type ?? "prompt",
    actionValue: template.action?.value ?? template.prompt ?? "",
    executionMode: template.execution?.mode ?? "default",
    authChoice: toAuthChoice(template.auth),
    modelName: template.model?.name ?? currentModel,
    returnToSession: returnChoice,
    allowRecursive: recursiveChoice,
    level:
      template.level === "project" || template.level === "user"
        ? template.level
        : "user",
    deployMode: "launch",
    schedule: "0 * * * *",
    scheduleJobId: `${template.id}-schedule`,
  };
}

function buildAuthProfile(
  choice: TaskAuthChoice,
  settings: LoadedSettings,
): TaskTemplate["auth"] {
  const providers =
    (settings.merged.security?.auth?.providers as
      | Record<string, { baseUrl?: string; apiKey?: string }>
      | undefined) ?? {};

  if (choice === "inherit") {
    return undefined;
  }

  if (choice === "gemini") {
    return {
      selectedType: AuthType.USE_GEMINI,
      apiKeyEnvVar: "GEMINI_API_KEY",
    };
  }

  if (choice === "openrouter") {
    return {
      selectedType: AuthType.USE_OPENAI,
      providerId: "openrouter",
      baseUrl:
        providers["openrouter"]?.baseUrl ||
        process.env["OPENAI_BASE_URL"] ||
        OPENROUTER_DEFAULT_BASE_URL,
      apiKeyEnvVar: "OPENAI_API_KEY",
    };
  }

  if (choice === "lmstudio") {
    return {
      selectedType: AuthType.USE_OPENAI,
      providerId: "lmstudio",
      baseUrl: providers["lmstudio"]?.baseUrl || LM_STUDIO_DEFAULT_BASE_URL,
      apiKeyEnvVar: "OPENAI_API_KEY",
    };
  }

  return {
    selectedType: AuthType.USE_OPENAI,
    providerId: "openai",
    baseUrl:
      providers["openai"]?.baseUrl ||
      process.env["OPENAI_BASE_URL"] ||
      OPENAI_DEFAULT_BASE_URL,
    apiKeyEnvVar: "OPENAI_API_KEY",
  };
}

async function fetchModelsForAuthChoice(
  choice: TaskAuthChoice,
  settings: LoadedSettings,
  currentModel: string,
): Promise<AvailableModel[]> {
  const providers =
    (settings.merged.security?.auth?.providers as
      | Record<string, { baseUrl?: string; apiKey?: string }>
      | undefined) ?? {};

  let resolvedChoice = choice;
  if (choice === "inherit") {
    resolvedChoice = authChoiceFromSettings(settings);
  }

  if (resolvedChoice === "gemini") {
    const apiKey =
      process.env["GEMINI_API_KEY"]?.trim() ||
      providers["gemini"]?.apiKey?.trim() ||
      "";
    const fetched = apiKey ? await fetchGeminiModels(apiKey) : [];
    const fallback = getFilteredGeminiModels(currentModel);
    return fetched.length > 0 ? fetched : fallback;
  }

  if (
    resolvedChoice === "openrouter" ||
    resolvedChoice === "lmstudio" ||
    resolvedChoice === "openai"
  ) {
    const providerSettings = providers[resolvedChoice] || {};
    const baseUrl =
      providerSettings.baseUrl?.trim() ||
      process.env["OPENAI_BASE_URL"]?.trim() ||
      (resolvedChoice === "openrouter"
        ? OPENROUTER_DEFAULT_BASE_URL
        : resolvedChoice === "lmstudio"
          ? LM_STUDIO_DEFAULT_BASE_URL
          : OPENAI_DEFAULT_BASE_URL);
    const apiKey =
      providerSettings.apiKey?.trim() || process.env["OPENAI_API_KEY"]?.trim();

    const fetched = await fetchOpenAICompatibleModels(baseUrl, apiKey, {
      forceLmStudio: resolvedChoice === "lmstudio",
    });
    const envModel = getOpenAIAvailableModelFromEnv();
    const merged = [...fetched];
    if (envModel && !merged.some((model) => model.id === envModel.id)) {
      merged.push(envModel);
    }
    return merged;
  }

  return [];
}

function toTemplateLevelValue(level: string): "project" | "user" {
  if (level === "project") {
    return "project";
  }
  return "user";
}

export function TaskTemplateEditorDialog({
  projectRoot,
  settings,
  currentModel,
  onExit,
  onDeploy,
}: TaskTemplateEditorDialogProps): React.JSX.Element {
  const [focusSection, setFocusSection] = useState<FocusSection>("templates");
  const [selectedField, setSelectedField] = useState<EditableField>("id");
  const [selectedTemplateKey, setSelectedTemplateKey] =
    useState<string>(NEW_TEMPLATE_KEY);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [draft, setDraft] = useState<DraftTemplate>(() =>
    buildEmptyDraft(settings, currentModel),
  );
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);

  const manager = useMemo(
    () => new TaskTemplateManager(projectRoot),
    [projectRoot],
  );

  const templatesByKey = useMemo(() => {
    const map = new Map<string, TaskTemplate>();
    for (const template of templates) {
      map.set(templateKeyFor(template), template);
    }
    return map;
  }, [templates]);

  const selectedTemplate =
    selectedTemplateKey === NEW_TEMPLATE_KEY
      ? null
      : (templatesByKey.get(selectedTemplateKey) ?? null);

  const isBuiltinTemplate = selectedTemplate?.level === "builtin";
  const isExistingEditableTemplate =
    selectedTemplate !== null && selectedTemplate.level !== "builtin";

  const reloadTemplates = useCallback(
    async (preferred?: { id?: string; level?: TaskTemplateLevel }) => {
      setIsLoadingTemplates(true);
      setErrorMessage(null);
      try {
        const levels: TaskTemplateLevel[] = ["project", "user", "builtin"];
        // Force a cache refresh first, then list by level so we can edit each scope.
        await manager.listTemplates({ force: true });
        const byLevel = await Promise.all(
          levels.map((level) => manager.listTemplates({ level })),
        );

        const all = byLevel.flat().sort((a, b) => {
          const idComparison = a.id.localeCompare(b.id);
          if (idComparison !== 0) {
            return idComparison;
          }
          return a.level.localeCompare(b.level);
        });

        setTemplates(all);

        let nextSelected = NEW_TEMPLATE_KEY;
        if (preferred?.id) {
          const exact = all.find(
            (template) =>
              template.id === preferred.id &&
              (!preferred.level || template.level === preferred.level),
          );
          if (exact) {
            nextSelected = templateKeyFor(exact);
          }
        }

        if (nextSelected === NEW_TEMPLATE_KEY && all.length > 0) {
          nextSelected = templateKeyFor(all[0]!);
        }

        setSelectedTemplateKey(nextSelected);
      } catch (error) {
        setErrorMessage(
          `Failed to load task templates: ${error instanceof Error ? error.message : String(error)}`,
        );
        setTemplates([]);
        setSelectedTemplateKey(NEW_TEMPLATE_KEY);
      } finally {
        setIsLoadingTemplates(false);
      }
    },
    [manager],
  );

  useEffect(() => {
    void reloadTemplates();
  }, [reloadTemplates]);

  useEffect(() => {
    if (!selectedTemplate) {
      setDraft(buildEmptyDraft(settings, currentModel));
      return;
    }

    setDraft(buildDraftFromTemplate(selectedTemplate, settings, currentModel));
  }, [selectedTemplate, settings, currentModel]);

  useEffect(() => {
    let cancelled = false;
    setIsFetchingModels(true);

    void (async () => {
      try {
        const fetched = await fetchModelsForAuthChoice(
          draft.authChoice,
          settings,
          currentModel,
        );

        const deduped: AvailableModel[] = [];
        const seen = new Set<string>();
        for (const model of fetched) {
          if (!model.id || seen.has(model.id)) {
            continue;
          }
          seen.add(model.id);
          deduped.push(model);
        }

        if (!cancelled) {
          setModels(deduped);
        }
      } catch {
        if (!cancelled) {
          setModels([]);
        }
      } finally {
        if (!cancelled) {
          setIsFetchingModels(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [draft.authChoice, settings, currentModel]);

  useKeypress(
    (key) => {
      if (key.name === "escape") {
        onExit();
        return;
      }

      if (key.name === "tab") {
        const order: FocusSection[] = [
          "templates",
          "fields",
          "editor",
          "actions",
        ];
        const currentIndex = order.indexOf(focusSection);
        const nextIndex = key.shift
          ? (currentIndex - 1 + order.length) % order.length
          : (currentIndex + 1) % order.length;
        setFocusSection(order[nextIndex]!);
      }
    },
    { isActive: true },
  );

  const templateOptions: Array<RadioSelectItem<string>> = useMemo(() => {
    const items: Array<RadioSelectItem<string>> = [
      {
        label: "+ New Template",
        value: NEW_TEMPLATE_KEY,
      },
    ];

    for (const template of templates) {
      const title = template.name ? ` - ${template.name}` : "";
      items.push({
        label: `${template.id} [${template.level}]${title}`,
        value: templateKeyFor(template),
      });
    }

    return items;
  }, [templates]);

  const selectedTemplateIndex = useMemo(() => {
    const index = templateOptions.findIndex(
      (item) => item.value === selectedTemplateKey,
    );
    return index >= 0 ? index : 0;
  }, [templateOptions, selectedTemplateKey]);

  const updateDraft = useCallback(
    (updates: Partial<DraftTemplate>) => {
      setDraft((previous) => ({
        ...previous,
        ...updates,
      }));
      setErrorMessage(null);
    },
    [setDraft],
  );

  const modelItems = useMemo(() => {
    const items: Array<RadioSelectItem<string>> = [
      {
        label: "Inherit session model",
        value: "",
      },
    ];

    for (const model of models) {
      const maxCtx = model.maxContextLength ?? model.contextLength;
      const ctxLabel = maxCtx ? ` (${maxCtx.toLocaleString()} ctx)` : "";
      items.push({
        label: `${model.label}${ctxLabel}`,
        value: model.id,
      });
    }

    const selectedModel = draft.modelName.trim();
    if (selectedModel && !items.some((item) => item.value === selectedModel)) {
      items.push({
        label: selectedModel,
        value: selectedModel,
      });
    }

    return items;
  }, [models, draft.modelName]);

  const selectedModelIndex = useMemo(() => {
    const targetModel = draft.modelName.trim();
    if (!targetModel) return 0;
    const index = modelItems.findIndex((item) => item.value === targetModel);
    return index >= 0 ? index : 0;
  }, [modelItems, draft.modelName]);

  const fieldItems: Array<RadioSelectItem<EditableField>> = useMemo(
    () => [
      {
        label: `ID: ${formatPreview(draft.id)}`,
        value: "id",
      },
      {
        label: `Name: ${formatPreview(draft.name)}`,
        value: "name",
      },
      {
        label: `Description: ${formatPreview(draft.description)}`,
        value: "description",
      },
      {
        label: `Tags: ${formatPreview(draft.tags)}`,
        value: "tags",
      },
      {
        label: `Action Type: ${draft.actionType}`,
        value: "action_type",
      },
      {
        label: `${draft.actionType === "prompt" ? "Prompt" : "Action Value"}: ${formatPreview(draft.actionValue)}`,
        value: "action_value",
      },
      {
        label: `Execution Mode: ${draft.executionMode}`,
        value: "execution_mode",
      },
      {
        label: `Auth: ${draft.authChoice}`,
        value: "auth",
      },
      {
        label: `Model: ${formatPreview(draft.modelName, "inherit")}`,
        value: "model",
      },
      {
        label: `Return Session: ${draft.returnToSession}`,
        value: "run_return",
      },
      {
        label: `Allow Recursive: ${draft.allowRecursive}`,
        value: "run_recursive",
      },
      {
        label: `Save Level: ${draft.level}`,
        value: "level",
      },
      {
        label: `Deploy Mode: ${draft.deployMode}`,
        value: "deploy_mode",
      },
      {
        label: `Schedule: ${draft.schedule}`,
        value: "schedule",
      },
      {
        label: `Schedule Job ID: ${formatPreview(draft.scheduleJobId, "auto")}`,
        value: "schedule_job_id",
      },
    ],
    [draft],
  );

  const selectedFieldIndex = useMemo(() => {
    const index = fieldItems.findIndex((item) => item.value === selectedField);
    return index >= 0 ? index : 0;
  }, [fieldItems, selectedField]);

  const saveTemplate = useCallback(async (): Promise<{
    id: string;
    level: TaskTemplateLevel;
  } | null> => {
    const canEditExisting = isExistingEditableTemplate;
    const id = canEditExisting ? (selectedTemplate?.id ?? "") : draft.id.trim();

    if (!id) {
      setErrorMessage("Template id is required.");
      return null;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      setErrorMessage(
        "Template id must use only letters, numbers, hyphens, and underscores.",
      );
      return null;
    }

    const level: TaskTemplateLevel = canEditExisting
      ? (selectedTemplate?.level ?? "user")
      : toTemplateLevelValue(draft.level);

    const actionValue = trimOrUndefined(draft.actionValue);
    const auth = buildAuthProfile(draft.authChoice, settings);
    const runReturnToSession =
      draft.returnToSession === "inherit"
        ? undefined
        : draft.returnToSession === "true"
          ? true
          : draft.returnToSession === "false"
            ? false
            : "current_session";
    const runAllowRecursive =
      draft.allowRecursive === "inherit"
        ? undefined
        : draft.allowRecursive === "true";

    const finalTemplate: TaskTemplate = {
      id,
      name: trimOrUndefined(draft.name),
      description: trimOrUndefined(draft.description),
      tags: parseTags(draft.tags),
      prompt: actionValue,
      action: {
        type: draft.actionType,
        value: actionValue,
      },
      execution: {
        mode: draft.executionMode,
      },
      auth,
      model: trimOrUndefined(draft.modelName)
        ? { name: draft.modelName.trim() }
        : undefined,
      run:
        runReturnToSession === undefined && runAllowRecursive === undefined
          ? undefined
          : {
              returnToSession: runReturnToSession,
              allowRecursive: runAllowRecursive,
            },
      level,
      filePath: "",
      isBuiltin: undefined,
    };

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await manager.createTemplate(finalTemplate, {
        level,
        overwrite: true,
      });

      setStatusMessage(`Saved task template "${id}" (${level}).`);
      await reloadTemplates({ id, level });
      return { id, level };
    } catch (error) {
      setErrorMessage(
        `Failed to save template: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    } finally {
      setIsBusy(false);
    }
  }, [
    isExistingEditableTemplate,
    selectedTemplate,
    draft,
    settings,
    manager,
    reloadTemplates,
  ]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!selectedTemplate || selectedTemplate.level === "builtin") {
      setErrorMessage("Select a non-builtin template to delete.");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      await manager.deleteTemplate(selectedTemplate.id, selectedTemplate.level);
      setStatusMessage(
        `Deleted task template "${selectedTemplate.id}" (${selectedTemplate.level}).`,
      );
      await reloadTemplates();
    } catch (error) {
      setErrorMessage(
        `Failed to delete template: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsBusy(false);
    }
  }, [selectedTemplate, manager, reloadTemplates]);

  const handleDeployTemplate = useCallback(async () => {
    const saved = await saveTemplate();
    if (!saved) {
      return;
    }

    if (draft.deployMode === "schedule" && draft.schedule.trim().length === 0) {
      setErrorMessage(
        "Schedule cron expression is required for scheduled deploys.",
      );
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);
    try {
      await onDeploy({
        templateId: saved.id,
        templateLevel: saved.level,
        deployMode: draft.deployMode,
        schedule:
          draft.deployMode === "schedule" ? draft.schedule.trim() : undefined,
        jobId: trimOrUndefined(draft.scheduleJobId),
      });
      setStatusMessage(
        draft.deployMode === "schedule"
          ? `Scheduled template "${saved.id}".`
          : `Launched template "${saved.id}".`,
      );
    } catch (error) {
      setErrorMessage(
        `Failed to deploy template: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsBusy(false);
    }
  }, [saveTemplate, draft, onDeploy]);

  const actionItems: Array<RadioSelectItem<string>> = [
    { label: "Save Template", value: "save" },
    { label: "Deploy", value: "deploy" },
    { label: "Delete Template", value: "delete" },
    { label: "New Template", value: "new" },
    { label: "Reload", value: "reload" },
    { label: "Close", value: "close" },
  ];

  const handleActionSelect = useCallback(
    (action: string) => {
      if (isBusy) {
        return;
      }

      if (action === "save") {
        void saveTemplate();
        return;
      }

      if (action === "deploy") {
        void handleDeployTemplate();
        return;
      }

      if (action === "delete") {
        void handleDeleteTemplate();
        return;
      }

      if (action === "new") {
        setSelectedTemplateKey(NEW_TEMPLATE_KEY);
        setDraft(buildEmptyDraft(settings, currentModel));
        setStatusMessage("Switched to new template draft.");
        return;
      }

      if (action === "reload") {
        void reloadTemplates();
        return;
      }

      onExit();
    },
    [
      isBusy,
      saveTemplate,
      handleDeployTemplate,
      handleDeleteTemplate,
      settings,
      currentModel,
      reloadTemplates,
      onExit,
    ],
  );

  const renderFieldEditor = () => {
    if (selectedField === "id") {
      const readOnly = isExistingEditableTemplate;
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Colors.Gray}>
            {readOnly
              ? "ID is fixed for existing project/user templates."
              : "Unique id used by launch_task/schedule_task and task_template tools."}
          </Text>
          <TextInput
            value={readOnly ? (selectedTemplate?.id ?? draft.id) : draft.id}
            onChange={(value) => updateDraft({ id: value })}
            placeholder="vision-ocr"
            isActive={!readOnly && focusSection === "editor"}
          />
        </Box>
      );
    }

    if (selectedField === "name") {
      return (
        <TextInput
          value={draft.name}
          onChange={(value) => updateDraft({ name: value })}
          placeholder="Human-friendly display name"
          isActive={focusSection === "editor"}
        />
      );
    }

    if (selectedField === "description") {
      return (
        <TextInput
          value={draft.description}
          onChange={(value) => updateDraft({ description: value })}
          placeholder="What this template is for"
          isActive={focusSection === "editor"}
        />
      );
    }

    if (selectedField === "tags") {
      return (
        <TextInput
          value={draft.tags}
          onChange={(value) => updateDraft({ tags: value })}
          placeholder="vision, ocr, docs"
          isActive={focusSection === "editor"}
        />
      );
    }

    if (selectedField === "action_type") {
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Colors.Gray}>
            prompt uses the Prompt field. slash_command runs in in_process mode
            only.
          </Text>
          <RadioButtonSelect
            items={[
              { label: "prompt", value: "prompt" },
              { label: "slash_command", value: "slash_command" },
            ]}
            initialIndex={draft.actionType === "slash_command" ? 1 : 0}
            onSelect={(value) =>
              updateDraft({ actionType: value as DraftTemplate["actionType"] })
            }
            isFocused={focusSection === "editor"}
            key={`action-type-${draft.actionType}`}
          />
        </Box>
      );
    }

    if (selectedField === "action_value") {
      const isPrompt = draft.actionType === "prompt";
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Colors.Gray}>
            {isPrompt
              ? "Enter the task prompt. Use Shift+Enter for new lines."
              : "Enter the slash command payload. Use Shift+Enter for new lines."}
          </Text>
          <TextInput
            value={draft.actionValue}
            onChange={(value) => updateDraft({ actionValue: value })}
            placeholder={
              isPrompt
                ? "Prompt for this task"
                : "Slash command payload (for example: /compress)"
            }
            height={5}
            isActive={focusSection === "editor"}
          />
        </Box>
      );
    }

    if (selectedField === "execution_mode") {
      const items: Array<RadioSelectItem<DraftTemplate["executionMode"]>> = [
        { label: "default", value: "default" },
        { label: "headless", value: "headless" },
        { label: "zellij_tab", value: "zellij_tab" },
        { label: "in_process", value: "in_process" },
      ];
      const initialIndex = Math.max(
        0,
        items.findIndex((item) => item.value === draft.executionMode),
      );
      return (
        <RadioButtonSelect
          items={items}
          initialIndex={initialIndex}
          onSelect={(value) => updateDraft({ executionMode: value })}
          isFocused={focusSection === "editor"}
          key={`execution-${draft.executionMode}`}
        />
      );
    }

    if (selectedField === "auth") {
      const items: Array<RadioSelectItem<TaskAuthChoice>> = [
        { label: "inherit (session auth)", value: "inherit" },
        { label: "openrouter", value: "openrouter" },
        { label: "lmstudio", value: "lmstudio" },
        { label: "openai", value: "openai" },
        { label: "gemini", value: "gemini" },
      ];
      const initialIndex = Math.max(
        0,
        items.findIndex((item) => item.value === draft.authChoice),
      );
      return (
        <RadioButtonSelect
          items={items}
          initialIndex={initialIndex}
          onSelect={(value) => updateDraft({ authChoice: value })}
          isFocused={focusSection === "editor"}
          key={`auth-${draft.authChoice}`}
        />
      );
    }

    if (selectedField === "model") {
      return (
        <Box flexDirection="column" marginTop={1}>
          <Text color={Colors.Gray}>
            {isFetchingModels
              ? "Loading models for selected auth..."
              : "Model list mirrors /model behavior for the selected auth/provider."}
          </Text>
          <RadioButtonSelect
            items={modelItems}
            initialIndex={selectedModelIndex}
            onSelect={(value) => updateDraft({ modelName: value })}
            isFocused={focusSection === "editor"}
            key={`model-${draft.authChoice}-${selectedModelIndex}-${modelItems.length}`}
            maxItemsToShow={7}
          />
        </Box>
      );
    }

    if (selectedField === "run_return") {
      const items: Array<RadioSelectItem<ReturnToSessionChoice>> = [
        { label: "inherit", value: "inherit" },
        { label: "true", value: "true" },
        { label: "false", value: "false" },
        { label: "current_session", value: "current_session" },
      ];
      const initialIndex = Math.max(
        0,
        items.findIndex((item) => item.value === draft.returnToSession),
      );
      return (
        <RadioButtonSelect
          items={items}
          initialIndex={initialIndex}
          onSelect={(value) => updateDraft({ returnToSession: value })}
          isFocused={focusSection === "editor"}
          key={`return-${draft.returnToSession}`}
        />
      );
    }

    if (selectedField === "run_recursive") {
      const items: Array<RadioSelectItem<BooleanChoice>> = [
        { label: "inherit", value: "inherit" },
        { label: "true", value: "true" },
        { label: "false", value: "false" },
      ];
      const initialIndex = Math.max(
        0,
        items.findIndex((item) => item.value === draft.allowRecursive),
      );
      return (
        <RadioButtonSelect
          items={items}
          initialIndex={initialIndex}
          onSelect={(value) => updateDraft({ allowRecursive: value })}
          isFocused={focusSection === "editor"}
          key={`recursive-${draft.allowRecursive}`}
        />
      );
    }

    if (selectedField === "level") {
      const readOnly = isExistingEditableTemplate;
      const items: Array<RadioSelectItem<"project" | "user">> = [
        { label: "project", value: "project" },
        { label: "user", value: "user" },
      ];
      const initialIndex = draft.level === "project" ? 0 : 1;
      return (
        <Box flexDirection="column">
          <Text color={Colors.Gray}>
            {readOnly
              ? "Save level is fixed for existing project/user templates."
              : "Choose where this template is saved."}
          </Text>
          <RadioButtonSelect
            items={items}
            initialIndex={initialIndex}
            onSelect={(value) => {
              if (!readOnly) {
                updateDraft({ level: value });
              }
            }}
            isFocused={focusSection === "editor" && !readOnly}
            key={`level-${draft.level}-${readOnly ? "ro" : "rw"}`}
          />
        </Box>
      );
    }

    if (selectedField === "deploy_mode") {
      const items: Array<RadioSelectItem<DeployMode>> = [
        { label: "launch", value: "launch" },
        { label: "schedule", value: "schedule" },
      ];
      return (
        <RadioButtonSelect
          items={items}
          initialIndex={draft.deployMode === "schedule" ? 1 : 0}
          onSelect={(value) => updateDraft({ deployMode: value })}
          isFocused={focusSection === "editor"}
          key={`deploy-${draft.deployMode}`}
        />
      );
    }

    if (selectedField === "schedule") {
      return (
        <TextInput
          value={draft.schedule}
          onChange={(value) => updateDraft({ schedule: value })}
          placeholder="0 * * * *"
          isActive={focusSection === "editor"}
        />
      );
    }

    return (
      <TextInput
        value={draft.scheduleJobId}
        onChange={(value) => updateDraft({ scheduleJobId: value })}
        placeholder="Optional; defaults to <template>-schedule"
        isActive={focusSection === "editor"}
      />
    );
  };

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.AccentBlue}
      flexDirection="row"
      width="100%"
      padding={1}
      gap={1}
    >
      <Box flexDirection="column" width="40%" paddingRight={1}>
        <Text bold={focusSection === "templates"}>
          {focusSection === "templates" ? "> " : "  "}Templates
        </Text>
        {isLoadingTemplates ? (
          <Text color={Colors.Gray}>Loading templates...</Text>
        ) : (
          <RadioButtonSelect
            items={templateOptions}
            initialIndex={selectedTemplateIndex}
            onSelect={(value) => {
              setSelectedTemplateKey(value);
              setFocusSection("fields");
            }}
            isFocused={focusSection === "templates"}
            maxItemsToShow={14}
            key={`templates-${selectedTemplateIndex}-${templateOptions.length}`}
          />
        )}
      </Box>

      <Box flexDirection="column" width="60%" paddingLeft={1}>
        <Text bold={focusSection === "fields"}>
          {focusSection === "fields" ? "> " : "  "}Fields
        </Text>
        <RadioButtonSelect
          items={fieldItems}
          initialIndex={selectedFieldIndex}
          onSelect={(value) => {
            setSelectedField(value);
            setFocusSection("editor");
          }}
          isFocused={focusSection === "fields"}
          maxItemsToShow={7}
          key={`fields-${selectedFieldIndex}`}
        />

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusSection === "editor"}>
            {focusSection === "editor" ? "> " : "  "}Editor ({selectedField})
          </Text>
          {renderFieldEditor()}
        </Box>

        <Box marginTop={1} flexDirection="column">
          <Text bold={focusSection === "actions"}>
            {focusSection === "actions" ? "> " : "  "}Actions
          </Text>
          <RadioButtonSelect
            items={actionItems}
            initialIndex={0}
            onSelect={handleActionSelect}
            isFocused={focusSection === "actions"}
            key={`actions-${isBusy ? "busy" : "idle"}`}
            maxItemsToShow={6}
          />
        </Box>

        <Box marginTop={1} flexDirection="column">
          {isBuiltinTemplate && (
            <Text color={Colors.AccentYellow}>
              Builtin templates are read-only. Saving creates a project/user
              copy.
            </Text>
          )}
          {statusMessage && (
            <Text color={Colors.AccentGreen}>{statusMessage}</Text>
          )}
          {errorMessage && <Text color={Colors.AccentRed}>{errorMessage}</Text>}
          <Text color={Colors.Gray}>
            Tab cycles panels. Enter selects. Esc closes.
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
