import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApprovalMode, AuthType, TaskTemplateManager, listJobs, sanitizeRuntimeProfile, updateJob, validateCronExpression, } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { fetchGeminiModels, fetchOpenAICompatibleModels, getFilteredGeminiModels, getOpenAIAvailableModelFromEnv, } from "../models/availableModels.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { useTerminalSize } from "../hooks/useTerminalSize.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { TextInput } from "./shared/TextInput.js";
const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const LM_STUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const NEW_TEMPLATE_KEY = "__new__";
const JOB_TEMPLATE_KEY_PREFIX = "__job__:";
let lastTaskEditorSelectionKey;
const templateDeployPrefsByKey = new Map();
function templateKeyFor(template) {
    return `${template.id}:${template.level}`;
}
function jobKeyFor(jobId) {
    return `${JOB_TEMPLATE_KEY_PREFIX}${jobId}`;
}
function isJobKey(key) {
    return key.startsWith(JOB_TEMPLATE_KEY_PREFIX);
}
function jobIdFromKey(key) {
    if (!isJobKey(key))
        return undefined;
    const id = key.slice(JOB_TEMPLATE_KEY_PREFIX.length).trim();
    return id.length > 0 ? id : undefined;
}
function trimOrUndefined(value) {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}
function parseTags(value) {
    const tags = value
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
    return tags.length > 0 ? tags : undefined;
}
function toAuthChoice(auth) {
    if (!auth)
        return "inherit";
    if (auth.providerId === "openrouter")
        return "openrouter";
    if (auth.providerId === "lmstudio")
        return "lmstudio";
    if (auth.providerId === "openai")
        return "openai";
    if (auth.selectedType === AuthType.USE_GEMINI)
        return "gemini";
    if (auth.selectedType === AuthType.USE_OPENAI && !auth.providerId)
        return "openai";
    return "inherit";
}
function authChoiceFromSettings(settings) {
    const providerId = settings.merged.security?.auth?.providerId;
    const selectedType = settings.merged.security?.auth?.selectedType;
    if (providerId === "openrouter")
        return "openrouter";
    if (providerId === "lmstudio")
        return "lmstudio";
    if (providerId === "openai")
        return "openai";
    if (selectedType === AuthType.USE_GEMINI)
        return "gemini";
    if (selectedType === AuthType.USE_OPENAI)
        return "openai";
    return "inherit";
}
function formatPreview(value, fallback = "(unset)") {
    if (!value || value.trim().length === 0) {
        return fallback;
    }
    const normalized = value.replace(/\s+/g, " ").trim();
    if (normalized.length <= 40)
        return normalized;
    return `${normalized.slice(0, 40)}...`;
}
function toApprovalModeChoice(value) {
    if (value === ApprovalMode.PLAN)
        return ApprovalMode.PLAN;
    if (value === ApprovalMode.DEFAULT)
        return ApprovalMode.DEFAULT;
    if (value === ApprovalMode.AUTO_EDIT)
        return ApprovalMode.AUTO_EDIT;
    if (value === ApprovalMode.YOLO)
        return ApprovalMode.YOLO;
    return "inherit";
}
function formatSystemPromptSpec(profile) {
    if (!profile) {
        return "";
    }
    if (profile.disable === true) {
        return "disable";
    }
    const names = Array.isArray(profile.names)
        ? profile.names
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : [];
    if (names.length === 0) {
        return "";
    }
    const namesCsv = names.join(",");
    return profile.exclusive === true ? `${namesCsv} --exclusive` : namesCsv;
}
function parseSystemPromptSpec(value) {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toLowerCase() === "inherit") {
        return {};
    }
    let working = trimmed;
    if (working.startsWith("/")) {
        working = working.slice(1).trim();
    }
    const lower = working.toLowerCase();
    if (lower === "prompt disable" || lower === "disable") {
        return {
            profile: { disable: true },
        };
    }
    if (lower.startsWith("prompt ")) {
        working = working.slice("prompt ".length).trim();
    }
    if (working.toLowerCase().startsWith("activate ")) {
        working = working.slice("activate ".length).trim();
    }
    else if (working.toLowerCase().startsWith("use ")) {
        working = working.slice("use ".length).trim();
    }
    else if (working.toLowerCase().startsWith("set ")) {
        working = working.slice("set ".length).trim();
    }
    const hasExclusive = /\s--exclusive(\s|$)/.test(` ${working} `);
    working = working.replace(/\s*--exclusive(\s|$)/g, " ").trim();
    if (!working) {
        return {
            error: "System prompt value must include prompt names, or use 'disable' or 'inherit'.",
        };
    }
    const tokens = working.split(/\s+/);
    if (tokens.length > 1) {
        return {
            error: "System prompt format must match /prompt activate: name1,name2 [--exclusive].",
        };
    }
    const names = tokens[0]
        .split(",")
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
    if (names.length === 0) {
        return {
            error: "System prompt value must include at least one prompt name (for example: reviewer,security).",
        };
    }
    const invalid = names.find((name) => !/^[a-zA-Z0-9_-]+$/.test(name));
    if (invalid) {
        return {
            error: `Invalid prompt name "${invalid}". Use alphanumeric, hyphen, or underscore names only.`,
        };
    }
    return {
        profile: {
            names,
            exclusive: hasExclusive,
        },
    };
}
function buildEmptyDraft(settings, currentModel) {
    return {
        id: "",
        name: "",
        description: "",
        tags: "",
        actionType: "prompt",
        actionValue: "",
        executionMode: "default",
        approvalMode: "inherit",
        authChoice: authChoiceFromSettings(settings),
        modelName: currentModel,
        returnToSession: "inherit",
        allowRecursive: "inherit",
        systemPromptSpec: "",
        level: "user",
        deployMode: "launch",
        schedule: "0 * * * *",
        scheduleJobId: "",
    };
}
function buildDraftFromTemplate(template, settings, currentModel) {
    const approvalMode = toApprovalModeChoice(template.approvalMode);
    const returnToSession = template.run?.returnToSession;
    const returnChoice = returnToSession === true
        ? "true"
        : returnToSession === false
            ? "false"
            : typeof returnToSession === "string"
                ? "current_session"
                : "inherit";
    const allowRecursive = template.run?.allowRecursive;
    const recursiveChoice = allowRecursive === true
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
        approvalMode,
        authChoice: toAuthChoice(template.auth),
        modelName: template.model?.name ?? currentModel,
        returnToSession: returnChoice,
        allowRecursive: recursiveChoice,
        systemPromptSpec: formatSystemPromptSpec(template.systemPrompt),
        level: template.level === "project" || template.level === "user"
            ? template.level
            : "user",
        deployMode: "launch",
        schedule: "0 * * * *",
        scheduleJobId: `${template.id}-schedule`,
    };
}
function buildRuntimeProfileFromJob(job) {
    return (sanitizeRuntimeProfile(job.runtime_profile ?? {
        template_id: job.template_id,
        template_level: job.template_level,
        action_type: job.action_type,
        action_value: job.action_value ?? job.prompt,
        execution_mode: job.execution_mode,
        run: job.return_to_session_id
            ? { returnToSession: job.return_to_session_id }
            : undefined,
    }) ?? { action_type: "prompt", action_value: job.prompt });
}
function buildDraftFromJob(job, currentModel) {
    const runtimeProfile = buildRuntimeProfileFromJob(job);
    const approvalMode = toApprovalModeChoice(runtimeProfile.approval_mode);
    const returnToSession = runtimeProfile.run?.returnToSession ?? job.return_to_session_id;
    const returnChoice = returnToSession === true
        ? "true"
        : returnToSession === false
            ? "false"
            : typeof returnToSession === "string"
                ? "current_session"
                : "inherit";
    const allowRecursive = runtimeProfile.run?.allowRecursive;
    const recursiveChoice = allowRecursive === true
        ? "true"
        : allowRecursive === false
            ? "false"
            : "inherit";
    return {
        id: job.id,
        name: "",
        description: job.description ?? "",
        tags: "",
        actionType: runtimeProfile.action_type ?? job.action_type ?? "prompt",
        actionValue: runtimeProfile.action_value ?? job.action_value ?? job.prompt ?? "",
        executionMode: runtimeProfile.execution_mode ?? job.execution_mode ?? "default",
        approvalMode,
        authChoice: toAuthChoice(runtimeProfile.auth),
        modelName: runtimeProfile.model?.name ?? currentModel,
        returnToSession: returnChoice,
        allowRecursive: recursiveChoice,
        systemPromptSpec: formatSystemPromptSpec(runtimeProfile.system_prompt),
        level: "user",
        deployMode: "schedule",
        schedule: job.schedule,
        scheduleJobId: job.id,
    };
}
function buildAuthProfile(choice, settings) {
    const providers = settings.merged.security?.auth?.providers ?? {};
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
            baseUrl: providers["openrouter"]?.baseUrl ||
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
        baseUrl: providers["openai"]?.baseUrl ||
            process.env["OPENAI_BASE_URL"] ||
            OPENAI_DEFAULT_BASE_URL,
        apiKeyEnvVar: "OPENAI_API_KEY",
    };
}
async function fetchModelsForAuthChoice(choice, settings, currentModel) {
    const providers = settings.merged.security?.auth?.providers ?? {};
    let resolvedChoice = choice;
    if (choice === "inherit") {
        resolvedChoice = authChoiceFromSettings(settings);
    }
    if (resolvedChoice === "gemini") {
        const apiKey = process.env["GEMINI_API_KEY"]?.trim() ||
            providers["gemini"]?.apiKey?.trim() ||
            "";
        const fetched = apiKey ? await fetchGeminiModels(apiKey) : [];
        const fallback = getFilteredGeminiModels(currentModel);
        return fetched.length > 0 ? fetched : fallback;
    }
    if (resolvedChoice === "openrouter" ||
        resolvedChoice === "lmstudio" ||
        resolvedChoice === "openai") {
        const providerSettings = providers[resolvedChoice] || {};
        const baseUrl = providerSettings.baseUrl?.trim() ||
            process.env["OPENAI_BASE_URL"]?.trim() ||
            (resolvedChoice === "openrouter"
                ? OPENROUTER_DEFAULT_BASE_URL
                : resolvedChoice === "lmstudio"
                    ? LM_STUDIO_DEFAULT_BASE_URL
                    : OPENAI_DEFAULT_BASE_URL);
        const apiKey = providerSettings.apiKey?.trim() || process.env["OPENAI_API_KEY"]?.trim();
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
function toTemplateLevelValue(level) {
    if (level === "project") {
        return "project";
    }
    return "user";
}
function buildDuplicateTemplateId(sourceId, level, templates) {
    const baseId = sourceId.trim() || "template";
    const existingIds = new Set(templates
        .filter((template) => template.level === level)
        .map((template) => template.id));
    const candidate = `${baseId}-copy`;
    if (!existingIds.has(candidate)) {
        return candidate;
    }
    let suffix = 2;
    while (existingIds.has(`${candidate}-${suffix}`)) {
        suffix += 1;
    }
    return `${candidate}-${suffix}`;
}
export function TaskTemplateEditorDialog({ projectRoot, settings, currentModel, onExit, onDeploy, }) {
    const { columns: terminalColumns, rows: terminalRows } = useTerminalSize();
    const [focusSection, setFocusSection] = useState("templates");
    const [selectedField, setSelectedField] = useState("id");
    const [selectedTemplateKey, setSelectedTemplateKey] = useState(lastTaskEditorSelectionKey ?? NEW_TEMPLATE_KEY);
    const [templates, setTemplates] = useState([]);
    const [jobs, setJobs] = useState([]);
    const [draft, setDraft] = useState(() => buildEmptyDraft(settings, currentModel));
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [models, setModels] = useState([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [editorResetToken, setEditorResetToken] = useState(0);
    const pendingNewDraftRef = useRef(null);
    const manager = useMemo(() => new TaskTemplateManager(projectRoot), [projectRoot]);
    const templatesByKey = useMemo(() => {
        const map = new Map();
        for (const template of templates) {
            map.set(templateKeyFor(template), template);
        }
        return map;
    }, [templates]);
    const selectedTemplate = selectedTemplateKey === NEW_TEMPLATE_KEY
        ? null
        : (templatesByKey.get(selectedTemplateKey) ?? null);
    const jobsById = useMemo(() => {
        const map = new Map();
        for (const job of jobs) {
            map.set(job.id, job);
        }
        return map;
    }, [jobs]);
    const selectedJob = useMemo(() => {
        const jobId = jobIdFromKey(selectedTemplateKey);
        if (!jobId)
            return null;
        return jobsById.get(jobId) ?? null;
    }, [selectedTemplateKey, jobsById]);
    const selectedJobId = useMemo(() => jobIdFromKey(selectedTemplateKey), [selectedTemplateKey]);
    const isBuiltinTemplate = selectedTemplate?.level === "builtin";
    const isSelectedScheduledJob = selectedJobId !== undefined;
    const isExistingEditableTemplate = selectedTemplate !== null && selectedTemplate.level !== "builtin";
    const reloadTemplates = useCallback(async (preferred) => {
        setIsLoadingTemplates(true);
        setErrorMessage(null);
        try {
            const levels = ["project", "user", "builtin"];
            // Force a cache refresh first, then list by level so we can edit each scope.
            await manager.listTemplates({ force: true });
            const [byLevel, scheduledJobs] = await Promise.all([
                Promise.all(levels.map((level) => manager.listTemplates({ level }))),
                listJobs(),
            ]);
            const sortedJobs = [...scheduledJobs].sort((a, b) => a.id.localeCompare(b.id));
            const all = byLevel.flat().sort((a, b) => {
                const idComparison = a.id.localeCompare(b.id);
                if (idComparison !== 0) {
                    return idComparison;
                }
                return a.level.localeCompare(b.level);
            });
            setTemplates(all);
            setJobs(sortedJobs);
            let nextSelected = preferred?.key ?? lastTaskEditorSelectionKey ?? NEW_TEMPLATE_KEY;
            if (preferred?.jobId) {
                nextSelected = jobKeyFor(preferred.jobId);
            }
            else if (preferred?.id) {
                const exact = all.find((template) => template.id === preferred.id &&
                    (!preferred.level || template.level === preferred.level));
                if (exact) {
                    nextSelected = templateKeyFor(exact);
                }
            }
            const nextSelectedExists = nextSelected === NEW_TEMPLATE_KEY ||
                all.some((template) => templateKeyFor(template) === nextSelected) ||
                sortedJobs.some((job) => jobKeyFor(job.id) === nextSelected);
            if (!nextSelectedExists) {
                nextSelected = NEW_TEMPLATE_KEY;
            }
            if (nextSelected === NEW_TEMPLATE_KEY && sortedJobs.length > 0) {
                nextSelected = jobKeyFor(sortedJobs[0].id);
            }
            else if (nextSelected === NEW_TEMPLATE_KEY && all.length > 0) {
                nextSelected = templateKeyFor(all[0]);
            }
            setSelectedTemplateKey(nextSelected);
            lastTaskEditorSelectionKey = nextSelected;
        }
        catch (error) {
            setErrorMessage(`Failed to load task templates: ${error instanceof Error ? error.message : String(error)}`);
            setTemplates([]);
            setJobs([]);
            setSelectedTemplateKey(NEW_TEMPLATE_KEY);
            lastTaskEditorSelectionKey = NEW_TEMPLATE_KEY;
        }
        finally {
            setIsLoadingTemplates(false);
        }
    }, [manager]);
    useEffect(() => {
        void reloadTemplates();
    }, [reloadTemplates]);
    useEffect(() => {
        if (selectedJob) {
            setDraft(buildDraftFromJob(selectedJob, currentModel));
            setEditorResetToken((value) => value + 1);
            pendingNewDraftRef.current = null;
            return;
        }
        if (!selectedTemplate) {
            if (selectedTemplateKey !== NEW_TEMPLATE_KEY) {
                return;
            }
            if (pendingNewDraftRef.current) {
                setDraft(pendingNewDraftRef.current);
                pendingNewDraftRef.current = null;
            }
            else {
                setDraft(buildEmptyDraft(settings, currentModel));
            }
            setEditorResetToken((value) => value + 1);
            return;
        }
        const templateDraft = buildDraftFromTemplate(selectedTemplate, settings, currentModel);
        const savedDeployPrefs = templateDeployPrefsByKey.get(templateKeyFor(selectedTemplate));
        setDraft(savedDeployPrefs
            ? {
                ...templateDraft,
                deployMode: savedDeployPrefs.deployMode,
                schedule: savedDeployPrefs.schedule,
                scheduleJobId: savedDeployPrefs.scheduleJobId,
            }
            : templateDraft);
        setEditorResetToken((value) => value + 1);
        pendingNewDraftRef.current = null;
    }, [
        selectedJob,
        selectedTemplate,
        selectedTemplateKey,
        settings,
        currentModel,
    ]);
    useEffect(() => {
        let cancelled = false;
        setIsFetchingModels(true);
        void (async () => {
            try {
                const fetched = await fetchModelsForAuthChoice(draft.authChoice, settings, currentModel);
                const deduped = [];
                const seen = new Set();
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
            }
            catch {
                if (!cancelled) {
                    setModels([]);
                }
            }
            finally {
                if (!cancelled) {
                    setIsFetchingModels(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [draft.authChoice, settings, currentModel]);
    useKeypress((key) => {
        if (key.name === "escape") {
            onExit();
            return;
        }
        if (key.name === "tab") {
            const order = [
                "templates",
                "fields",
                "actions",
                "editor",
            ];
            setFocusSection((current) => {
                const currentIndex = order.indexOf(current);
                const nextIndex = key.shift
                    ? (currentIndex - 1 + order.length) % order.length
                    : (currentIndex + 1) % order.length;
                return order[nextIndex];
            });
        }
    }, { isActive: true });
    const templateOptions = useMemo(() => {
        const jobIds = new Set(jobs.map((job) => job.id));
        const items = [
            {
                label: "+ New Template",
                value: NEW_TEMPLATE_KEY,
            },
        ];
        for (const job of jobs) {
            const title = job.description ? ` - ${job.description}` : "";
            items.push({
                label: `@job ${job.id} [scheduled]${title}`,
                value: jobKeyFor(job.id),
            });
        }
        for (const template of templates) {
            const title = template.name ? ` - ${template.name}` : "";
            const conflictSuffix = jobIds.has(template.id) ? " [id also used by @job]" : "";
            items.push({
                label: `template ${template.id} [${template.level}]${conflictSuffix}${title}`,
                value: templateKeyFor(template),
            });
        }
        return items;
    }, [templates, jobs]);
    const selectedTemplateIndex = useMemo(() => {
        const index = templateOptions.findIndex((item) => item.value === selectedTemplateKey);
        return index >= 0 ? index : 0;
    }, [templateOptions, selectedTemplateKey]);
    const updateDraft = useCallback((updates) => {
        setDraft((previous) => ({
            ...previous,
            ...updates,
        }));
        if (!isSelectedScheduledJob && selectedTemplateKey !== NEW_TEMPLATE_KEY) {
            const current = templateDeployPrefsByKey.get(selectedTemplateKey) ?? {
                deployMode: draft.deployMode,
                schedule: draft.schedule,
                scheduleJobId: draft.scheduleJobId,
            };
            templateDeployPrefsByKey.set(selectedTemplateKey, {
                deployMode: (updates.deployMode ?? current.deployMode),
                schedule: updates.schedule ?? current.schedule,
                scheduleJobId: updates.scheduleJobId ?? current.scheduleJobId,
            });
        }
        setErrorMessage(null);
    }, [
        isSelectedScheduledJob,
        selectedTemplateKey,
        draft.deployMode,
        draft.schedule,
        draft.scheduleJobId,
        setDraft,
    ]);
    const modelItems = useMemo(() => {
        const items = [
            {
                label: "Inherit session model",
                value: "",
            },
        ];
        for (const model of models) {
            // Vision indicator
            const visionIndicator = model.isVision ? " [Vision]" : "";
            // Format pricing: convert from per-token to per-million-tokens (primarily for OpenRouter)
            let priceInfo = "";
            if (model.inputPrice || model.outputPrice) {
                const formatPrice = (priceStr) => {
                    if (!priceStr)
                        return "?";
                    const pricePerToken = parseFloat(priceStr);
                    const pricePerMillion = pricePerToken * 1_000_000;
                    return pricePerMillion.toFixed(2);
                };
                const inputFormatted = formatPrice(model.inputPrice);
                const outputFormatted = formatPrice(model.outputPrice);
                priceInfo = ` ${inputFormatted}/${outputFormatted} per 1M tokens`;
            }
            // Format context length with comma separators when available
            const maxCtx = model.maxContextLength ?? model.contextLength;
            const ctxInfo = maxCtx ? ` (${maxCtx.toLocaleString()} ctx)` : "";
            // Quantization (primarily for LM Studio models)
            const quantInfo = model.quantization ? ` [${model.quantization}]` : "";
            // Model type (e.g., "llm", "vlm")
            const typeInfo = model.modelType ? ` {${model.modelType}}` : "";
            // Capabilities (e.g., "tool_use")
            const capsInfo = model.capabilities && model.capabilities.length > 0
                ? ` <${model.capabilities.join(", ")}>`
                : "";
            items.push({
                label: `${model.label}${visionIndicator}${typeInfo}${quantInfo}${capsInfo}${priceInfo}${ctxInfo}`,
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
        if (!targetModel)
            return 0;
        const index = modelItems.findIndex((item) => item.value === targetModel);
        return index >= 0 ? index : 0;
    }, [modelItems, draft.modelName]);
    const fieldItems = useMemo(() => {
        const items = [
            {
                label: `ID: ${formatPreview(draft.id)}`,
                value: "id",
            },
        ];
        if (!isSelectedScheduledJob) {
            items.push({
                label: `Name: ${formatPreview(draft.name)}`,
                value: "name",
            });
        }
        items.push({
            label: `Description: ${formatPreview(draft.description)}`,
            value: "description",
        });
        if (!isSelectedScheduledJob) {
            items.push({
                label: `Tags: ${formatPreview(draft.tags)}`,
                value: "tags",
            });
        }
        items.push({
            label: `Action Type: ${draft.actionType}`,
            value: "action_type",
        }, {
            label: `${draft.actionType === "prompt" ? "Prompt" : "Action Value"}: ${formatPreview(draft.actionValue)}`,
            value: "action_value",
        }, {
            label: `Execution Mode: ${draft.executionMode}`,
            value: "execution_mode",
        }, {
            label: `Approval Mode: ${draft.approvalMode}`,
            value: "approval_mode",
        }, {
            label: `Auth: ${draft.authChoice}`,
            value: "auth",
        }, {
            label: `Model: ${formatPreview(draft.modelName, "inherit")}`,
            value: "model",
        }, {
            label: `Return Session: ${draft.returnToSession}`,
            value: "run_return",
        }, {
            label: `Allow Recursive: ${draft.allowRecursive}`,
            value: "run_recursive",
        }, {
            label: `System Prompt: ${formatPreview(draft.systemPromptSpec, "inherit")}`,
            value: "system_prompt",
        }, {
            label: `Schedule: ${draft.schedule}`,
            value: "schedule",
        });
        if (!isSelectedScheduledJob) {
            items.push({
                label: `Save Level: ${draft.level}`,
                value: "level",
            }, {
                label: `Deploy Mode: ${draft.deployMode}`,
                value: "deploy_mode",
            }, {
                label: `Schedule Job ID: ${formatPreview(draft.scheduleJobId, "auto")}`,
                value: "schedule_job_id",
            });
        }
        return items;
    }, [draft, isSelectedScheduledJob]);
    useEffect(() => {
        if (!fieldItems.some((item) => item.value === selectedField)) {
            setSelectedField(fieldItems[0]?.value ?? "id");
        }
    }, [fieldItems, selectedField]);
    const selectedFieldIndex = useMemo(() => {
        const index = fieldItems.findIndex((item) => item.value === selectedField);
        return index >= 0 ? index : 0;
    }, [fieldItems, selectedField]);
    const templateListMaxItems = Math.max(6, Math.min(12, Math.floor(terminalRows * 0.28)));
    const fieldListMaxItems = Math.max(6, Math.min(12, Math.floor(terminalRows * 0.28)));
    const actionListMaxItems = Math.max(5, Math.min(9, Math.floor(terminalRows * 0.2)));
    const editorInputWidth = Math.max(26, Math.floor(terminalColumns * 0.42));
    const editorLargeHeight = Math.max(7, Math.min(14, Math.floor(terminalRows * 0.34)));
    const editorMediumHeight = Math.max(4, Math.min(8, Math.floor(editorLargeHeight * 0.6)));
    const saveTemplate = useCallback(async () => {
        const canEditExisting = isExistingEditableTemplate;
        const id = canEditExisting ? (selectedTemplate?.id ?? "") : draft.id.trim();
        if (!id) {
            setErrorMessage("Template id is required.");
            return null;
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
            setErrorMessage("Template id must use only letters, numbers, hyphens, and underscores.");
            return null;
        }
        const level = canEditExisting
            ? (selectedTemplate?.level ?? "user")
            : toTemplateLevelValue(draft.level);
        const actionValue = trimOrUndefined(draft.actionValue);
        const auth = buildAuthProfile(draft.authChoice, settings);
        const runReturnToSession = draft.returnToSession === "inherit"
            ? undefined
            : draft.returnToSession === "true"
                ? true
                : draft.returnToSession === "false"
                    ? false
                    : "current_session";
        const runAllowRecursive = draft.allowRecursive === "inherit"
            ? undefined
            : draft.allowRecursive === "true";
        const systemPromptResult = parseSystemPromptSpec(draft.systemPromptSpec);
        if (systemPromptResult.error) {
            setErrorMessage(systemPromptResult.error);
            return null;
        }
        const systemPrompt = systemPromptResult.profile;
        const finalTemplate = {
            id,
            name: trimOrUndefined(draft.name),
            description: trimOrUndefined(draft.description),
            tags: parseTags(draft.tags),
            approvalMode: draft.approvalMode === "inherit" ? undefined : draft.approvalMode,
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
            run: runReturnToSession === undefined && runAllowRecursive === undefined
                ? undefined
                : {
                    returnToSession: runReturnToSession,
                    allowRecursive: runAllowRecursive,
                },
            systemPrompt,
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
            templateDeployPrefsByKey.set(templateKeyFor(finalTemplate), {
                deployMode: draft.deployMode,
                schedule: draft.schedule,
                scheduleJobId: draft.scheduleJobId,
            });
            setStatusMessage(`Saved task template "${id}" (${level}).`);
            await reloadTemplates({ id, level });
            return { id, level };
        }
        catch (error) {
            setErrorMessage(`Failed to save template: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
        finally {
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
    const saveScheduledJob = useCallback(async () => {
        let job = selectedJob;
        if (!job && selectedJobId) {
            const allJobs = await listJobs();
            job = allJobs.find((entry) => entry.id === selectedJobId) ?? null;
        }
        if (!job) {
            setErrorMessage("Select a scheduled job to update.");
            return null;
        }
        const schedule = draft.schedule.trim();
        if (!schedule) {
            setErrorMessage("Schedule cron expression is required.");
            return null;
        }
        if (!validateCronExpression(schedule)) {
            setErrorMessage(`Invalid cron expression "${schedule}". Use 5-field format (minute hour day month day_of_week).`);
            return null;
        }
        const actionValue = draft.actionValue;
        if (actionValue.trim().length === 0) {
            setErrorMessage("Action value is required.");
            return null;
        }
        if (actionValue.length > 10000) {
            setErrorMessage(`Action value is too long (${actionValue.length} characters). Maximum is 10000.`);
            return null;
        }
        if (draft.actionType === "slash_command" &&
            draft.executionMode !== "in_process") {
            setErrorMessage("slash_command action type requires execution mode in_process.");
            return null;
        }
        const systemPromptResult = parseSystemPromptSpec(draft.systemPromptSpec);
        if (systemPromptResult.error) {
            setErrorMessage(systemPromptResult.error);
            return null;
        }
        const existingRuntime = buildRuntimeProfileFromJob(job);
        const existingStringTarget = typeof job.return_to_session_id === "string" &&
            job.return_to_session_id.trim().length > 0
            ? job.return_to_session_id.trim()
            : typeof existingRuntime.run?.returnToSession === "string"
                ? existingRuntime.run.returnToSession
                : undefined;
        const returnToSession = draft.returnToSession === "true"
            ? true
            : draft.returnToSession === "false"
                ? false
                : draft.returnToSession === "current_session"
                    ? existingStringTarget
                    : undefined;
        const allowRecursive = draft.allowRecursive === "inherit"
            ? undefined
            : draft.allowRecursive === "true";
        const runtimeRun = returnToSession === undefined && allowRecursive === undefined
            ? undefined
            : {
                returnToSession,
                allowRecursive,
            };
        const executionMode = draft.executionMode === "default" ? undefined : draft.executionMode;
        const auth = buildAuthProfile(draft.authChoice, settings);
        const model = trimOrUndefined(draft.modelName)
            ? { name: draft.modelName.trim() }
            : undefined;
        const runtimeProfile = sanitizeRuntimeProfile({
            ...existingRuntime,
            action_type: draft.actionType,
            action_value: actionValue,
            approval_mode: draft.approvalMode === "inherit" ? undefined : draft.approvalMode,
            execution_mode: executionMode,
            auth,
            model,
            run: runtimeRun,
            system_prompt: systemPromptResult.profile,
        });
        const returnToSessionIdUpdate = draft.returnToSession === "false" || draft.returnToSession === "inherit"
            ? null
            : typeof returnToSession === "string"
                ? returnToSession
                : job.return_to_session_id;
        const effectiveSessionTarget = (typeof returnToSessionIdUpdate === "string" &&
            returnToSessionIdUpdate.trim().length > 0
            ? returnToSessionIdUpdate.trim()
            : undefined) ??
            (typeof runtimeProfile?.run?.returnToSession === "string" &&
                runtimeProfile.run.returnToSession.trim().length > 0
                ? runtimeProfile.run.returnToSession.trim()
                : undefined);
        if (executionMode === "in_process" && !effectiveSessionTarget) {
            setErrorMessage("in_process execution requires a target session (return_to_session_id or run.returnToSession).");
            return null;
        }
        setIsBusy(true);
        setErrorMessage(null);
        try {
            const updated = await updateJob({
                id: job.id,
                schedule,
                prompt: actionValue,
                description: draft.description.trim(),
                action_type: draft.actionType,
                action_value: actionValue,
                execution_mode: executionMode ?? null,
                return_to_session_id: returnToSessionIdUpdate,
                runtime_profile: runtimeProfile ?? null,
            });
            setStatusMessage(`Updated scheduled job "${updated.id}".`);
            await reloadTemplates({ jobId: updated.id });
            return { id: updated.id };
        }
        catch (error) {
            setErrorMessage(`Failed to update scheduled job: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        }
        finally {
            setIsBusy(false);
        }
    }, [draft, reloadTemplates, selectedJob, selectedJobId, settings]);
    const handleDeleteTemplate = useCallback(async () => {
        if (!selectedTemplate || selectedTemplate.level === "builtin") {
            setErrorMessage("Select a non-builtin template to delete.");
            return;
        }
        setIsBusy(true);
        setErrorMessage(null);
        try {
            await manager.deleteTemplate(selectedTemplate.id, selectedTemplate.level);
            setStatusMessage(`Deleted task template "${selectedTemplate.id}" (${selectedTemplate.level}).`);
            await reloadTemplates();
        }
        catch (error) {
            setErrorMessage(`Failed to delete template: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsBusy(false);
        }
    }, [selectedTemplate, manager, reloadTemplates]);
    const handleDeployTemplate = useCallback(async () => {
        const saved = await saveTemplate();
        if (!saved) {
            return;
        }
        if (draft.deployMode === "schedule" && draft.schedule.trim().length === 0) {
            setErrorMessage("Schedule cron expression is required for scheduled deploys.");
            return;
        }
        setIsBusy(true);
        setErrorMessage(null);
        try {
            await onDeploy({
                templateId: saved.id,
                templateLevel: saved.level,
                deployMode: draft.deployMode,
                schedule: draft.deployMode === "schedule" ? draft.schedule.trim() : undefined,
                jobId: trimOrUndefined(draft.scheduleJobId),
            });
            setStatusMessage(draft.deployMode === "schedule"
                ? `Scheduled template "${saved.id}". Jobs are stored under ${projectRoot}/.qwen; run "lowcal scheduler start" from that directory.`
                : `Launched template "${saved.id}".`);
        }
        catch (error) {
            setErrorMessage(`Failed to deploy template: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsBusy(false);
        }
    }, [saveTemplate, draft, onDeploy, projectRoot]);
    const actionItems = useMemo(() => [
        { label: isSelectedScheduledJob ? "Save Scheduled Job" : "Save Template", value: "save" },
        { label: "Deploy", value: "deploy" },
        { label: "Duplicate Template", value: "duplicate" },
        { label: "Delete Template", value: "delete" },
        { label: "New Template", value: "new" },
        { label: "Reload", value: "reload" },
        { label: "Close", value: "close" },
    ], [isSelectedScheduledJob]);
    const handleActionSelect = useCallback((action) => {
        if (isBusy) {
            return;
        }
        if (action === "save") {
            if (selectedJobId) {
                void saveScheduledJob();
            }
            else {
                void saveTemplate();
            }
            return;
        }
        if (action === "deploy") {
            void handleDeployTemplate();
            return;
        }
        if (action === "duplicate") {
            if (!selectedTemplate) {
                setErrorMessage("Select an existing template to duplicate.");
                return;
            }
            const duplicatedDraft = buildDraftFromTemplate(selectedTemplate, settings, currentModel);
            const duplicateId = buildDuplicateTemplateId(duplicatedDraft.id, duplicatedDraft.level, templates);
            duplicatedDraft.id = duplicateId;
            setSelectedTemplateKey(NEW_TEMPLATE_KEY);
            pendingNewDraftRef.current = duplicatedDraft;
            setSelectedField("id");
            setFocusSection("editor");
            setErrorMessage(null);
            setStatusMessage(`Duplicating "${selectedTemplate.id}" as "${duplicateId}".`);
            return;
        }
        if (action === "delete") {
            void handleDeleteTemplate();
            return;
        }
        if (action === "new") {
            pendingNewDraftRef.current = null;
            setSelectedTemplateKey(NEW_TEMPLATE_KEY);
            setDraft(buildEmptyDraft(settings, currentModel));
            setEditorResetToken((value) => value + 1);
            setStatusMessage("Switched to new template draft.");
            return;
        }
        if (action === "reload") {
            void reloadTemplates();
            return;
        }
        onExit();
    }, [
        isBusy,
        selectedJobId,
        saveScheduledJob,
        saveTemplate,
        handleDeployTemplate,
        handleDeleteTemplate,
        selectedTemplate,
        templates,
        settings,
        currentModel,
        reloadTemplates,
        onExit,
    ]);
    const renderFieldEditor = () => {
        if (selectedField === "id") {
            const readOnly = isExistingEditableTemplate || isSelectedScheduledJob;
            const value = isSelectedScheduledJob
                ? (selectedJob?.id ?? draft.id)
                : readOnly
                    ? (selectedTemplate?.id ?? draft.id)
                    : draft.id;
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: readOnly
                            ? isSelectedScheduledJob
                                ? "ID is fixed for scheduled jobs."
                                : "ID is fixed for existing project/user templates."
                            : "Unique id used by launch_task/schedule_task and task_template tools." }), _jsx(TextInput, { value: value, onChange: (value) => updateDraft({ id: value }), placeholder: "vision-ocr", inputWidth: editorInputWidth, isActive: !readOnly && focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        if (selectedField === "name") {
            return (_jsx(TextInput, { value: draft.name, onChange: (value) => updateDraft({ name: value }), placeholder: "Human-friendly display name", inputWidth: editorInputWidth, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        if (selectedField === "description") {
            return (_jsx(TextInput, { value: draft.description, onChange: (value) => updateDraft({ description: value }), placeholder: "What this template is for", inputWidth: editorInputWidth, height: editorMediumHeight, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        if (selectedField === "tags") {
            return (_jsx(TextInput, { value: draft.tags, onChange: (value) => updateDraft({ tags: value }), placeholder: "vision, ocr, docs", inputWidth: editorInputWidth, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        if (selectedField === "action_type") {
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: "prompt uses the Prompt field. slash_command runs in in_process mode only." }), _jsx(RadioButtonSelect, { items: [
                            { label: "prompt", value: "prompt" },
                            { label: "slash_command", value: "slash_command" },
                        ], initialIndex: draft.actionType === "slash_command" ? 1 : 0, onSelect: (value) => updateDraft({ actionType: value }), isFocused: focusSection === "editor" }, `action-type-${draft.actionType}`)] }));
        }
        if (selectedField === "action_value") {
            const isPrompt = draft.actionType === "prompt";
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: isPrompt
                            ? "Enter the task prompt. Use Ctrl+J for new lines (Shift+Enter also works in terminals that report it)."
                            : "Enter the slash command payload. Use Ctrl+J for new lines (Shift+Enter also works in terminals that report it)." }), _jsx(TextInput, { value: draft.actionValue, onChange: (value) => updateDraft({ actionValue: value }), placeholder: isPrompt
                            ? "Prompt for this task"
                            : "Slash command payload (for example: /compress)", height: editorLargeHeight, inputWidth: editorInputWidth, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        if (selectedField === "execution_mode") {
            const items = [
                { label: "default", value: "default" },
                { label: "headless", value: "headless" },
                { label: "zellij_tab", value: "zellij_tab" },
                { label: "in_process", value: "in_process" },
            ];
            const initialIndex = Math.max(0, items.findIndex((item) => item.value === draft.executionMode));
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => updateDraft({ executionMode: value }), isFocused: focusSection === "editor" }, `execution-${draft.executionMode}`));
        }
        if (selectedField === "approval_mode") {
            const items = [
                { label: "inherit (session approval)", value: "inherit" },
                { label: "plan", value: ApprovalMode.PLAN },
                { label: "default", value: ApprovalMode.DEFAULT },
                { label: "auto-edit", value: ApprovalMode.AUTO_EDIT },
                { label: "yolo", value: ApprovalMode.YOLO },
            ];
            const initialIndex = Math.max(0, items.findIndex((item) => item.value === draft.approvalMode));
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => updateDraft({ approvalMode: value }), isFocused: focusSection === "editor" }, `approval-${draft.approvalMode}`));
        }
        if (selectedField === "auth") {
            const items = [
                { label: "inherit (session auth)", value: "inherit" },
                { label: "openrouter", value: "openrouter" },
                { label: "lmstudio", value: "lmstudio" },
                { label: "openai", value: "openai" },
                { label: "gemini", value: "gemini" },
            ];
            const initialIndex = Math.max(0, items.findIndex((item) => item.value === draft.authChoice));
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => updateDraft({ authChoice: value }), isFocused: focusSection === "editor" }, `auth-${draft.authChoice}`));
        }
        if (selectedField === "model") {
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: isFetchingModels
                            ? "Loading models for selected auth..."
                            : "Model list mirrors /model behavior for the selected auth/provider." }), _jsx(RadioButtonSelect, { items: modelItems, initialIndex: selectedModelIndex, onSelect: (value) => updateDraft({ modelName: value }), isFocused: focusSection === "editor", maxItemsToShow: Math.max(6, actionListMaxItems) }, `model-${draft.authChoice}-${selectedModelIndex}-${modelItems.length}`)] }));
        }
        if (selectedField === "run_return") {
            const items = [
                { label: "inherit", value: "inherit" },
                { label: "true", value: "true" },
                { label: "false", value: "false" },
                { label: "current_session", value: "current_session" },
            ];
            const initialIndex = Math.max(0, items.findIndex((item) => item.value === draft.returnToSession));
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => updateDraft({ returnToSession: value }), isFocused: focusSection === "editor" }, `return-${draft.returnToSession}`));
        }
        if (selectedField === "run_recursive") {
            const items = [
                { label: "inherit", value: "inherit" },
                { label: "true", value: "true" },
                { label: "false", value: "false" },
            ];
            const initialIndex = Math.max(0, items.findIndex((item) => item.value === draft.allowRecursive));
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => updateDraft({ allowRecursive: value }), isFocused: focusSection === "editor" }, `recursive-${draft.allowRecursive}`));
        }
        if (selectedField === "system_prompt") {
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: "Use /prompt format: \"name1,name2 [--exclusive]\", \"/prompt activate name1,name2\", \"disable\", or \"inherit\"." }), _jsx(TextInput, { value: draft.systemPromptSpec, onChange: (value) => updateDraft({ systemPromptSpec: value }), placeholder: "reviewer,security --exclusive", inputWidth: editorInputWidth, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        if (selectedField === "level") {
            const readOnly = isExistingEditableTemplate || isSelectedScheduledJob;
            const items = [
                { label: "project", value: "project" },
                { label: "user", value: "user" },
            ];
            const initialIndex = draft.level === "project" ? 0 : 1;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: Colors.Gray, children: readOnly
                            ? isSelectedScheduledJob
                                ? "Scheduled jobs are not saved as templates unless you deploy."
                                : "Save level is fixed for existing project/user templates."
                            : "Choose where this template is saved." }), _jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => {
                            if (!readOnly) {
                                updateDraft({ level: value });
                            }
                        }, isFocused: focusSection === "editor" && !readOnly }, `level-${draft.level}-${readOnly ? "ro" : "rw"}`)] }));
        }
        if (selectedField === "deploy_mode") {
            if (isSelectedScheduledJob) {
                return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: "Existing @job entries are always scheduled jobs." }), _jsx(RadioButtonSelect, { items: [{ label: "schedule", value: "schedule" }], initialIndex: 0, onSelect: () => {
                                // Intentionally read-only for scheduled job records.
                            }, isFocused: false }, "deploy-job-readonly")] }));
            }
            const items = [
                { label: "launch", value: "launch" },
                { label: "schedule", value: "schedule" },
            ];
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: "Save stores the template only. Deploy applies launch/schedule using this mode." }), _jsx(RadioButtonSelect, { items: items, initialIndex: draft.deployMode === "schedule" ? 1 : 0, onSelect: (value) => updateDraft({ deployMode: value }), isFocused: focusSection === "editor" }, `deploy-${draft.deployMode}`)] }));
        }
        if (selectedField === "schedule") {
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: isSelectedScheduledJob
                            ? "Editing an @job schedule updates cron.json immediately on Save Scheduled Job."
                            : "For templates, schedule is used for deploy defaults in this session." }), _jsx(Text, { color: Colors.Gray, children: "Cron format: minute hour day month day_of_week (0-6, Sun=0). Examples: \u00A0`0 * * * *` hourly,\u00A0`*/15 * * * *` every 15 min,\u00A0`0 2 * * *` daily at 2:00." }), _jsx(TextInput, { value: draft.schedule, onChange: (value) => updateDraft({ schedule: value }), placeholder: "0 * * * *", inputWidth: editorInputWidth, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        if (selectedField === "schedule_job_id") {
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [isSelectedScheduledJob && (_jsx(Text, { color: Colors.Gray, children: "Job ID is fixed for existing scheduled jobs." })), _jsx(TextInput, { value: draft.scheduleJobId, onChange: (value) => updateDraft({ scheduleJobId: value }), placeholder: "Optional; defaults to <template>-schedule", inputWidth: editorInputWidth, isActive: focusSection === "editor" && !isSelectedScheduledJob }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        return null;
    };
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "column", width: "100%", padding: 1, gap: 1, children: [_jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "templates" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "templates", children: [focusSection === "templates" ? "> " : "  ", "Templates"] }), isLoadingTemplates ? (_jsx(Text, { color: Colors.Gray, children: "Loading templates..." })) : (_jsx(RadioButtonSelect, { items: templateOptions, initialIndex: selectedTemplateIndex, onSelect: (value) => {
                                    setSelectedTemplateKey(value);
                                    lastTaskEditorSelectionKey = value;
                                    if (value === NEW_TEMPLATE_KEY) {
                                        pendingNewDraftRef.current = null;
                                        setDraft(buildEmptyDraft(settings, currentModel));
                                        setEditorResetToken((token) => token + 1);
                                    }
                                    setFocusSection("fields");
                                }, isFocused: focusSection === "templates", maxItemsToShow: templateListMaxItems, showScrollArrows: true }, `templates-${selectedTemplateIndex}-${templateOptions.length}`))] }), _jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "fields" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "fields", children: [focusSection === "fields" ? "> " : "  ", "Fields"] }), _jsx(RadioButtonSelect, { items: fieldItems, initialIndex: selectedFieldIndex, onSelect: (value) => {
                                    setSelectedField(value);
                                    setFocusSection("editor");
                                }, isFocused: focusSection === "fields", maxItemsToShow: fieldListMaxItems, showScrollArrows: true }, `fields-${selectedFieldIndex}`)] })] }), _jsxs(Box, { flexDirection: "row", gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "actions" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "actions", children: [focusSection === "actions" ? "> " : "  ", "Actions"] }), _jsx(RadioButtonSelect, { items: actionItems, initialIndex: 0, onSelect: handleActionSelect, isFocused: focusSection === "actions", maxItemsToShow: actionListMaxItems, showScrollArrows: true }, `actions-${isBusy ? "busy" : "idle"}`), isBuiltinTemplate && (_jsx(Text, { color: Colors.AccentYellow, children: "Builtin templates are read-only. Saving creates a project/user copy." })), statusMessage && (_jsx(Text, { color: Colors.AccentGreen, children: statusMessage })), errorMessage && _jsx(Text, { color: Colors.AccentRed, children: errorMessage })] }), _jsxs(Box, { flexDirection: "column", width: "50%", borderStyle: "single", borderColor: focusSection === "editor" ? Colors.AccentBlue : Colors.Gray, paddingX: 1, children: [_jsxs(Text, { bold: focusSection === "editor", children: [focusSection === "editor" ? "> " : "  ", "Editor (", selectedField, ")"] }), renderFieldEditor()] })] }), _jsx(Text, { color: Colors.Gray, children: "Tab cycles panels: Templates, Fields, Actions, Editor. Enter selects. Esc closes." })] }));
}
//# sourceMappingURL=TaskTemplateEditorDialog.js.map