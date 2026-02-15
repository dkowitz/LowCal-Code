import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthType, TaskTemplateManager, } from "@qwen-code/qwen-code-core";
import { Box, Text } from "ink";
import { Colors } from "../colors.js";
import { fetchGeminiModels, fetchOpenAICompatibleModels, getFilteredGeminiModels, getOpenAIAvailableModelFromEnv, } from "../models/availableModels.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { RadioButtonSelect, } from "./shared/RadioButtonSelect.js";
import { TextInput } from "./shared/TextInput.js";
const OPENROUTER_DEFAULT_BASE_URL = "https://openrouter.ai/api/v1";
const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";
const LM_STUDIO_DEFAULT_BASE_URL = "http://127.0.0.1:1234/v1";
const NEW_TEMPLATE_KEY = "__new__";
function templateKeyFor(template) {
    return `${template.id}:${template.level}`;
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
function buildEmptyDraft(settings, currentModel) {
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
function buildDraftFromTemplate(template, settings, currentModel) {
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
        authChoice: toAuthChoice(template.auth),
        modelName: template.model?.name ?? currentModel,
        returnToSession: returnChoice,
        allowRecursive: recursiveChoice,
        level: template.level === "project" || template.level === "user"
            ? template.level
            : "user",
        deployMode: "launch",
        schedule: "0 * * * *",
        scheduleJobId: `${template.id}-schedule`,
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
export function TaskTemplateEditorDialog({ projectRoot, settings, currentModel, onExit, onDeploy, }) {
    const [focusSection, setFocusSection] = useState("templates");
    const [selectedField, setSelectedField] = useState("id");
    const [selectedTemplateKey, setSelectedTemplateKey] = useState(NEW_TEMPLATE_KEY);
    const [templates, setTemplates] = useState([]);
    const [draft, setDraft] = useState(() => buildEmptyDraft(settings, currentModel));
    const [statusMessage, setStatusMessage] = useState("");
    const [errorMessage, setErrorMessage] = useState(null);
    const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
    const [isBusy, setIsBusy] = useState(false);
    const [models, setModels] = useState([]);
    const [isFetchingModels, setIsFetchingModels] = useState(false);
    const [editorResetToken, setEditorResetToken] = useState(0);
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
    const isBuiltinTemplate = selectedTemplate?.level === "builtin";
    const isExistingEditableTemplate = selectedTemplate !== null && selectedTemplate.level !== "builtin";
    const reloadTemplates = useCallback(async (preferred) => {
        setIsLoadingTemplates(true);
        setErrorMessage(null);
        try {
            const levels = ["project", "user", "builtin"];
            // Force a cache refresh first, then list by level so we can edit each scope.
            await manager.listTemplates({ force: true });
            const byLevel = await Promise.all(levels.map((level) => manager.listTemplates({ level })));
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
                const exact = all.find((template) => template.id === preferred.id &&
                    (!preferred.level || template.level === preferred.level));
                if (exact) {
                    nextSelected = templateKeyFor(exact);
                }
            }
            if (nextSelected === NEW_TEMPLATE_KEY && all.length > 0) {
                nextSelected = templateKeyFor(all[0]);
            }
            setSelectedTemplateKey(nextSelected);
        }
        catch (error) {
            setErrorMessage(`Failed to load task templates: ${error instanceof Error ? error.message : String(error)}`);
            setTemplates([]);
            setSelectedTemplateKey(NEW_TEMPLATE_KEY);
        }
        finally {
            setIsLoadingTemplates(false);
        }
    }, [manager]);
    useEffect(() => {
        void reloadTemplates();
    }, [reloadTemplates]);
    useEffect(() => {
        if (!selectedTemplate) {
            setDraft(buildEmptyDraft(settings, currentModel));
            setEditorResetToken((value) => value + 1);
            return;
        }
        setDraft(buildDraftFromTemplate(selectedTemplate, settings, currentModel));
        setEditorResetToken((value) => value + 1);
    }, [selectedTemplate, settings, currentModel]);
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
                "editor",
                "actions",
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
        const items = [
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
        const index = templateOptions.findIndex((item) => item.value === selectedTemplateKey);
        return index >= 0 ? index : 0;
    }, [templateOptions, selectedTemplateKey]);
    const updateDraft = useCallback((updates) => {
        setDraft((previous) => ({
            ...previous,
            ...updates,
        }));
        setErrorMessage(null);
    }, [setDraft]);
    const modelItems = useMemo(() => {
        const items = [
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
        if (!targetModel)
            return 0;
        const index = modelItems.findIndex((item) => item.value === targetModel);
        return index >= 0 ? index : 0;
    }, [modelItems, draft.modelName]);
    const fieldItems = useMemo(() => [
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
    ], [draft]);
    const selectedFieldIndex = useMemo(() => {
        const index = fieldItems.findIndex((item) => item.value === selectedField);
        return index >= 0 ? index : 0;
    }, [fieldItems, selectedField]);
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
        const finalTemplate = {
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
            run: runReturnToSession === undefined && runAllowRecursive === undefined
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
                ? `Scheduled template "${saved.id}".`
                : `Launched template "${saved.id}".`);
        }
        catch (error) {
            setErrorMessage(`Failed to deploy template: ${error instanceof Error ? error.message : String(error)}`);
        }
        finally {
            setIsBusy(false);
        }
    }, [saveTemplate, draft, onDeploy]);
    const actionItems = [
        { label: "Save Template", value: "save" },
        { label: "Deploy", value: "deploy" },
        { label: "Delete Template", value: "delete" },
        { label: "New Template", value: "new" },
        { label: "Reload", value: "reload" },
        { label: "Close", value: "close" },
    ];
    const handleActionSelect = useCallback((action) => {
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
        saveTemplate,
        handleDeployTemplate,
        handleDeleteTemplate,
        settings,
        currentModel,
        reloadTemplates,
        onExit,
    ]);
    const renderFieldEditor = () => {
        if (selectedField === "id") {
            const readOnly = isExistingEditableTemplate;
            return (_jsxs(Box, { flexDirection: "column", marginTop: 1, children: [_jsx(Text, { color: Colors.Gray, children: readOnly
                            ? "ID is fixed for existing project/user templates."
                            : "Unique id used by launch_task/schedule_task and task_template tools." }), _jsx(TextInput, { value: readOnly ? (selectedTemplate?.id ?? draft.id) : draft.id, onChange: (value) => updateDraft({ id: value }), placeholder: "vision-ocr", isActive: !readOnly && focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
        }
        if (selectedField === "name") {
            return (_jsx(TextInput, { value: draft.name, onChange: (value) => updateDraft({ name: value }), placeholder: "Human-friendly display name", isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        if (selectedField === "description") {
            return (_jsx(TextInput, { value: draft.description, onChange: (value) => updateDraft({ description: value }), placeholder: "What this template is for", isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        if (selectedField === "tags") {
            return (_jsx(TextInput, { value: draft.tags, onChange: (value) => updateDraft({ tags: value }), placeholder: "vision, ocr, docs", isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
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
                            ? "Enter the task prompt. Use Shift+Enter for new lines."
                            : "Enter the slash command payload. Use Shift+Enter for new lines." }), _jsx(TextInput, { value: draft.actionValue, onChange: (value) => updateDraft({ actionValue: value }), placeholder: isPrompt
                            ? "Prompt for this task"
                            : "Slash command payload (for example: /compress)", height: 5, isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`)] }));
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
                            : "Model list mirrors /model behavior for the selected auth/provider." }), _jsx(RadioButtonSelect, { items: modelItems, initialIndex: selectedModelIndex, onSelect: (value) => updateDraft({ modelName: value }), isFocused: focusSection === "editor", maxItemsToShow: 7 }, `model-${draft.authChoice}-${selectedModelIndex}-${modelItems.length}`)] }));
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
        if (selectedField === "level") {
            const readOnly = isExistingEditableTemplate;
            const items = [
                { label: "project", value: "project" },
                { label: "user", value: "user" },
            ];
            const initialIndex = draft.level === "project" ? 0 : 1;
            return (_jsxs(Box, { flexDirection: "column", children: [_jsx(Text, { color: Colors.Gray, children: readOnly
                            ? "Save level is fixed for existing project/user templates."
                            : "Choose where this template is saved." }), _jsx(RadioButtonSelect, { items: items, initialIndex: initialIndex, onSelect: (value) => {
                            if (!readOnly) {
                                updateDraft({ level: value });
                            }
                        }, isFocused: focusSection === "editor" && !readOnly }, `level-${draft.level}-${readOnly ? "ro" : "rw"}`)] }));
        }
        if (selectedField === "deploy_mode") {
            const items = [
                { label: "launch", value: "launch" },
                { label: "schedule", value: "schedule" },
            ];
            return (_jsx(RadioButtonSelect, { items: items, initialIndex: draft.deployMode === "schedule" ? 1 : 0, onSelect: (value) => updateDraft({ deployMode: value }), isFocused: focusSection === "editor" }, `deploy-${draft.deployMode}`));
        }
        if (selectedField === "schedule") {
            return (_jsx(TextInput, { value: draft.schedule, onChange: (value) => updateDraft({ schedule: value }), placeholder: "0 * * * *", isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
        }
        return (_jsx(TextInput, { value: draft.scheduleJobId, onChange: (value) => updateDraft({ scheduleJobId: value }), placeholder: "Optional; defaults to <template>-schedule", isActive: focusSection === "editor" }, `task-editor-${selectedField}-${editorResetToken}`));
    };
    return (_jsxs(Box, { borderStyle: "round", borderColor: Colors.AccentBlue, flexDirection: "row", width: "100%", padding: 1, gap: 1, children: [_jsxs(Box, { flexDirection: "column", width: "40%", paddingRight: 1, children: [_jsxs(Text, { bold: focusSection === "templates", children: [focusSection === "templates" ? "> " : "  ", "Templates"] }), isLoadingTemplates ? (_jsx(Text, { color: Colors.Gray, children: "Loading templates..." })) : (_jsx(RadioButtonSelect, { items: templateOptions, initialIndex: selectedTemplateIndex, onSelect: (value) => {
                            setSelectedTemplateKey(value);
                            setFocusSection("fields");
                        }, isFocused: focusSection === "templates", maxItemsToShow: 14 }, `templates-${selectedTemplateIndex}-${templateOptions.length}`))] }), _jsxs(Box, { flexDirection: "column", width: "60%", paddingLeft: 1, children: [_jsxs(Text, { bold: focusSection === "fields", children: [focusSection === "fields" ? "> " : "  ", "Fields"] }), _jsx(RadioButtonSelect, { items: fieldItems, initialIndex: selectedFieldIndex, onSelect: (value) => {
                            setSelectedField(value);
                            setFocusSection("editor");
                        }, isFocused: focusSection === "fields", maxItemsToShow: 7 }, `fields-${selectedFieldIndex}`), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsxs(Text, { bold: focusSection === "editor", children: [focusSection === "editor" ? "> " : "  ", "Editor (", selectedField, ")"] }), renderFieldEditor()] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [_jsxs(Text, { bold: focusSection === "actions", children: [focusSection === "actions" ? "> " : "  ", "Actions"] }), _jsx(RadioButtonSelect, { items: actionItems, initialIndex: 0, onSelect: handleActionSelect, isFocused: focusSection === "actions", maxItemsToShow: 6 }, `actions-${isBusy ? "busy" : "idle"}`)] }), _jsxs(Box, { marginTop: 1, flexDirection: "column", children: [isBuiltinTemplate && (_jsx(Text, { color: Colors.AccentYellow, children: "Builtin templates are read-only. Saving creates a project/user copy." })), statusMessage && (_jsx(Text, { color: Colors.AccentGreen, children: statusMessage })), errorMessage && _jsx(Text, { color: Colors.AccentRed, children: errorMessage }), _jsx(Text, { color: Colors.Gray, children: "Tab cycles panels. Enter selects. Esc closes." })] })] })] }));
}
//# sourceMappingURL=TaskTemplateEditorDialog.js.map