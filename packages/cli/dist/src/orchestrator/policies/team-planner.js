/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as process from "node:process";
import { ApprovalMode, AuthType, Config, DEFAULT_GEMINI_EMBEDDING_MODEL, createContentGenerator, createContentGeneratorConfig, getFunctionCalls, getResponseText, listTeamStates, } from "@qwen-code/qwen-code-core";
import { normalizeAuthType } from "../../config/auth.js";
import { loadSettings } from "../../config/settings.js";
const ENV_DECISION_MODE = "LOWCAL_ORCHESTRATOR_DECISION_MODE";
const ENV_ASSISTED_PLAN_FILE = "LOWCAL_ORCHESTRATOR_ASSISTED_PLAN_FILE";
const ENV_ASSISTED_USE_MODEL = "LOWCAL_ORCHESTRATOR_ASSISTED_USE_MODEL";
const ENV_ASSISTED_MODEL = "LOWCAL_ORCHESTRATOR_ASSISTED_MODEL";
const ENV_ASSISTED_MODEL_MIN_INTERVAL_MS = "LOWCAL_ORCHESTRATOR_ASSISTED_MODEL_MIN_INTERVAL_MS";
const DEFAULT_ASSISTED_MODEL_MIN_INTERVAL_MS = 60_000;
const ORCHESTRATOR_CONFIG_RELATIVE_PATH = path.join(".lowcal", "orchestrator.config.json");
const modelPlanCacheByBaseDir = new Map();
export const ASSISTED_TEAM_PLAN_SCHEMA = {
    type: "object",
    required: ["schema_version", "summary", "confidence", "decisions"],
    properties: {
        schema_version: { type: "string", const: "1.0" },
        summary: { type: "string", minLength: 1 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        decisions: {
            type: "array",
            items: {
                type: "object",
                required: ["team_id", "strategy", "rationale"],
                properties: {
                    team_id: { type: "string", minLength: 1 },
                    strategy: {
                        type: "string",
                        enum: ["hold", "delegate_all", "delegate_subset"],
                    },
                    rationale: { type: "string", minLength: 1 },
                    target_agent_ids: {
                        type: "array",
                        items: { type: "string" },
                    },
                    preferred_agent_order: {
                        type: "array",
                        items: { type: "string" },
                    },
                    max_delegations: { type: "number", minimum: 1 },
                },
            },
        },
    },
};
function asNonEmptyString(value) {
    return typeof value === "string" && value.trim().length > 0
        ? value.trim()
        : undefined;
}
function asPositiveInteger(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === "string") {
        const parsed = Number.parseInt(value.trim(), 10);
        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }
    return undefined;
}
function parseDecisionMode(value) {
    const normalized = asNonEmptyString(value)?.toLowerCase();
    if (normalized === "assisted") {
        return "assisted";
    }
    if (normalized === "deterministic") {
        return "deterministic";
    }
    return undefined;
}
function normalizePlannerConfig(value) {
    if (!value || typeof value !== "object") {
        return {};
    }
    const record = value;
    const decision_mode = parseDecisionMode(record["decision_mode"]);
    const assisted_plan_file = asNonEmptyString(record["assisted_plan_file"]);
    return {
        ...(decision_mode ? { decision_mode } : {}),
        ...(assisted_plan_file ? { assisted_plan_file } : {}),
    };
}
export function getOrchestratorPlannerConfigPath(baseDir) {
    return path.join(baseDir, ORCHESTRATOR_CONFIG_RELATIVE_PATH);
}
export async function loadOrchestratorPlannerConfig(baseDir) {
    const configPath = getOrchestratorPlannerConfigPath(baseDir);
    try {
        const raw = await fs.readFile(configPath, "utf-8");
        const parsed = JSON.parse(raw);
        return normalizePlannerConfig(parsed);
    }
    catch {
        return {};
    }
}
export async function saveOrchestratorPlannerConfig(baseDir, config) {
    const normalized = normalizePlannerConfig(config);
    const configPath = getOrchestratorPlannerConfigPath(baseDir);
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, JSON.stringify(normalized, null, 2), "utf-8");
}
export async function setOrchestratorDecisionModeConfig(baseDir, mode) {
    const current = await loadOrchestratorPlannerConfig(baseDir);
    const next = {
        ...current,
        decision_mode: mode,
    };
    await saveOrchestratorPlannerConfig(baseDir, next);
    return next;
}
export function resolveDecisionModeFromEnv() {
    return parseDecisionMode(process.env[ENV_DECISION_MODE]) ?? "deterministic";
}
function resolveAssistedPlanFile(baseDir, config) {
    const envValue = asNonEmptyString(process.env[ENV_ASSISTED_PLAN_FILE]);
    const configValue = asNonEmptyString(config?.assisted_plan_file);
    const selected = envValue ?? configValue;
    if (!selected) {
        return undefined;
    }
    if (path.isAbsolute(selected)) {
        return selected;
    }
    return path.resolve(baseDir, selected);
}
export async function resolvePlannerSettings(baseDir) {
    const config = await loadOrchestratorPlannerConfig(baseDir);
    const envDecisionMode = parseDecisionMode(process.env[ENV_DECISION_MODE]);
    if (envDecisionMode) {
        return {
            decisionMode: envDecisionMode,
            decisionModeSource: "env",
            assistedPlanFile: resolveAssistedPlanFile(baseDir, config),
        };
    }
    const configDecisionMode = parseDecisionMode(config.decision_mode);
    if (configDecisionMode) {
        return {
            decisionMode: configDecisionMode,
            decisionModeSource: "config",
            assistedPlanFile: resolveAssistedPlanFile(baseDir, config),
        };
    }
    return {
        decisionMode: "deterministic",
        decisionModeSource: "default",
        assistedPlanFile: resolveAssistedPlanFile(baseDir, config),
    };
}
function normalizeObjective(team) {
    const fromManifest = asNonEmptyString(team.manifest.description);
    if (fromManifest) {
        return fromManifest;
    }
    return `Deliver role-specific output for team "${team.name}".`;
}
function buildTeamSnapshot(team) {
    const coordination = team.coordination;
    const delegations = Object.values(coordination?.delegations ?? {});
    const activeDelegations = delegations.filter((delegation) => delegation.status === "running" || delegation.status === "queued").length;
    const completedDelegations = delegations.filter((delegation) => delegation.status === "completed").length;
    const failedDelegations = delegations.filter((delegation) => delegation.status === "failed").length;
    const startupByAgentId = new Map(team.manifest.agents.map((agent) => [agent.id, agent.startup ?? "immediate"]));
    return {
        team_id: team.team_id,
        name: team.name,
        status: team.status,
        phase: coordination?.phase ?? "planning",
        objective: normalizeObjective(team),
        waiting_on_agent_ids: [...(coordination?.waiting_on_agent_ids ?? [])],
        active_delegations: activeDelegations,
        completed_delegations: completedDelegations,
        failed_delegations: failedDelegations,
        agents: Object.values(team.agents).map((agent) => ({
            agent_id: agent.agent_id,
            role: agent.role,
            startup: startupByAgentId.get(agent.agent_id) ?? "immediate",
            status: agent.status,
            has_session: Boolean(agent.session_id),
            last_error: agent.last_error,
        })),
        updated_at: coordination?.last_updated_at ?? team.started_at ?? team.created_at,
    };
}
export async function buildTeamPlannerSnapshot(baseDir) {
    const teams = await listTeamStates(baseDir, { statuses: ["active"], limit: 500 });
    return {
        schema_version: "1.0",
        generated_at: new Date().toISOString(),
        teams: teams.map((team) => buildTeamSnapshot(team)),
    };
}
function normalizeDecision(value) {
    if (!value || typeof value !== "object") {
        return undefined;
    }
    const record = value;
    const team_id = asNonEmptyString(record["team_id"]);
    const strategyRaw = asNonEmptyString(record["strategy"]);
    const rationale = asNonEmptyString(record["rationale"]);
    if (!team_id || !strategyRaw || !rationale) {
        return undefined;
    }
    const strategy = strategyRaw === "hold" ||
        strategyRaw === "delegate_all" ||
        strategyRaw === "delegate_subset"
        ? strategyRaw
        : undefined;
    if (!strategy) {
        return undefined;
    }
    const target_agent_ids = Array.isArray(record["target_agent_ids"])
        ? record["target_agent_ids"]
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : undefined;
    const preferred_agent_order = Array.isArray(record["preferred_agent_order"])
        ? record["preferred_agent_order"]
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : undefined;
    const max_delegations = asPositiveInteger(record["max_delegations"]);
    return {
        team_id,
        strategy,
        rationale,
        ...(target_agent_ids && target_agent_ids.length > 0
            ? { target_agent_ids }
            : {}),
        ...(preferred_agent_order && preferred_agent_order.length > 0
            ? { preferred_agent_order }
            : {}),
        ...(max_delegations ? { max_delegations } : {}),
    };
}
function parseAssistedPlan(raw) {
    if (!raw || typeof raw !== "object") {
        throw new Error("planner_response_not_object");
    }
    const record = raw;
    const schema_version = asNonEmptyString(record["schema_version"]);
    const summary = asNonEmptyString(record["summary"]);
    const confidenceRaw = record["confidence"];
    const decisionsRaw = record["decisions"];
    if (schema_version !== "1.0") {
        throw new Error("planner_schema_version_mismatch");
    }
    if (!summary) {
        throw new Error("planner_summary_missing");
    }
    if (typeof confidenceRaw !== "number" ||
        !Number.isFinite(confidenceRaw) ||
        confidenceRaw < 0 ||
        confidenceRaw > 1) {
        throw new Error("planner_confidence_invalid");
    }
    if (!Array.isArray(decisionsRaw)) {
        throw new Error("planner_decisions_invalid");
    }
    const decisions = decisionsRaw
        .map((entry) => normalizeDecision(entry))
        .filter((entry) => Boolean(entry));
    return {
        schema_version: "1.0",
        summary,
        confidence: confidenceRaw,
        decisions,
    };
}
function buildHeuristicAssistedPlan(snapshot) {
    const decisions = snapshot.teams.map((team) => {
        if (team.active_delegations > 0 || team.phase === "waiting") {
            return {
                team_id: team.team_id,
                strategy: "hold",
                rationale: "Team is waiting on active delegations.",
            };
        }
        const eligibleAgents = team.agents.filter((agent) => agent.has_session &&
            agent.status !== "failed" &&
            (agent.status === "idle" || agent.status === "pending"));
        const immediateEligible = eligibleAgents.filter((agent) => agent.startup === "immediate");
        const targets = (immediateEligible.length > 0 ? immediateEligible : eligibleAgents).map((agent) => agent.agent_id);
        if (targets.length === 0) {
            return {
                team_id: team.team_id,
                strategy: "hold",
                rationale: "No eligible agents are currently available for delegation.",
            };
        }
        return {
            team_id: team.team_id,
            strategy: "delegate_subset",
            rationale: immediateEligible.length > 0
                ? "Prioritize immediate-start agents for this planning cycle."
                : "No immediate-start agents available; use all currently idle/pending agents.",
            target_agent_ids: targets,
            preferred_agent_order: targets,
            max_delegations: targets.length,
        };
    });
    return {
        schema_version: "1.0",
        summary: `Generated heuristic assisted plan for ${snapshot.teams.length} active team(s).`,
        confidence: snapshot.teams.length > 0 ? 0.58 : 0.5,
        decisions,
    };
}
async function loadAssistedPlanFromFile(filePath) {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return parseAssistedPlan(parsed);
}
function buildSnapshotPlanningKey(snapshot) {
    const teams = [...snapshot.teams]
        .sort((left, right) => left.team_id.localeCompare(right.team_id))
        .map((team) => ({
        team_id: team.team_id,
        status: team.status,
        phase: team.phase,
        objective: team.objective,
        waiting_on_agent_ids: [...team.waiting_on_agent_ids].sort(),
        active_delegations: team.active_delegations,
        completed_delegations: team.completed_delegations,
        failed_delegations: team.failed_delegations,
        agents: [...team.agents]
            .sort((left, right) => left.agent_id.localeCompare(right.agent_id))
            .map((agent) => ({
            agent_id: agent.agent_id,
            role: agent.role,
            startup: agent.startup,
            status: agent.status,
            has_session: agent.has_session,
        })),
    }));
    return JSON.stringify(teams);
}
function isModelPlannerEnabled() {
    const raw = asNonEmptyString(process.env[ENV_ASSISTED_USE_MODEL]);
    if (!raw) {
        return true;
    }
    const normalized = raw.toLowerCase();
    return !(normalized === "0" ||
        normalized === "false" ||
        normalized === "off" ||
        normalized === "disabled");
}
function getModelPlanMinIntervalMs() {
    return (asPositiveInteger(process.env[ENV_ASSISTED_MODEL_MIN_INTERVAL_MS]) ??
        DEFAULT_ASSISTED_MODEL_MIN_INTERVAL_MS);
}
function extractJsonCandidates(text) {
    const candidates = [];
    const fencedMatches = text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi);
    for (const match of fencedMatches) {
        const candidate = asNonEmptyString(match[1]);
        if (candidate) {
            candidates.push(candidate);
        }
    }
    if (candidates.length > 0) {
        return candidates;
    }
    const trimmed = text.trim();
    if (trimmed.startsWith("{")) {
        candidates.push(trimmed);
    }
    else {
        const firstBrace = trimmed.indexOf("{");
        const lastBrace = trimmed.lastIndexOf("}");
        if (firstBrace >= 0 && lastBrace > firstBrace) {
            candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
        }
    }
    return candidates;
}
function parseAssistedPlanFromText(text) {
    const candidates = extractJsonCandidates(text);
    const errors = [];
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            return parseAssistedPlan(parsed);
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }
    throw new Error(errors.length > 0
        ? `planner_text_parse_failed:${errors.join("|")}`
        : "planner_text_parse_failed:no_json_candidates");
}
function inferAuthTypeFromEnvironment() {
    if (asNonEmptyString(process.env["OPENAI_API_KEY"])) {
        return AuthType.USE_OPENAI;
    }
    if (asNonEmptyString(process.env["GEMINI_API_KEY"])) {
        return AuthType.USE_GEMINI;
    }
    if (asNonEmptyString(process.env["GOOGLE_API_KEY"]) ||
        (asNonEmptyString(process.env["GOOGLE_CLOUD_PROJECT"]) &&
            asNonEmptyString(process.env["GOOGLE_CLOUD_LOCATION"]))) {
        return AuthType.USE_VERTEX_AI;
    }
    return AuthType.QWEN_OAUTH;
}
function resolvePlannerModelRuntime(baseDir) {
    const settings = loadSettings(baseDir).merged;
    const providerId = asNonEmptyString(settings.security?.auth?.providerId);
    const selectedType = asNonEmptyString(settings.security?.auth?.selectedType);
    const normalizedAuthType = normalizeAuthType(selectedType ?? providerId);
    const auth_type = normalizedAuthType ?? inferAuthTypeFromEnvironment();
    const providers = settings.security?.auth?.providers;
    const providerBaseUrl = providerId
        ? asNonEmptyString(providers?.[providerId]?.["baseUrl"])
        : undefined;
    const model = asNonEmptyString(process.env[ENV_ASSISTED_MODEL]) ??
        asNonEmptyString(settings.model?.name) ??
        asNonEmptyString(process.env["OPENAI_MODEL"]) ??
        asNonEmptyString(process.env["QWEN_MODEL"]) ??
        asNonEmptyString(process.env["GEMINI_MODEL"]) ??
        "qwen3-coder-plus";
    return {
        model,
        auth_type,
        openai_base_url: providerBaseUrl,
        content_generator_options: settings.contentGenerator,
    };
}
function buildModelPlannerPrompt(snapshot) {
    const instructions = [
        "You are the orchestration planner for persistent software-agent teams.",
        "Given the snapshot, produce a plan that decides for each team whether to hold or delegate work.",
        "Use `delegate_subset` when you want targeted delegation.",
        "Use `delegate_all` only when every eligible agent should receive work.",
        "Favor immediate-start agents before idle-start agents when both are available.",
        "If a team is already waiting on running delegations, use hold.",
        "Keep rationale concise and operational.",
        "Respond by calling the function `respond_in_schema`.",
    ];
    return [
        instructions.join("\n"),
        "Snapshot JSON:",
        JSON.stringify(snapshot, null, 2),
    ].join("\n\n");
}
async function runModelAssistedPlanner(options) {
    const runtime = resolvePlannerModelRuntime(options.baseDir);
    const plannerConfig = new Config({
        sessionId: `orchestrator-planner-${process.pid}`,
        embeddingModel: DEFAULT_GEMINI_EMBEDDING_MODEL,
        targetDir: options.baseDir,
        cwd: options.baseDir,
        model: runtime.model,
        includeDirectories: [],
        loadMemoryFromIncludeDirectories: false,
        debugMode: false,
        question: "",
        fullContext: false,
        approvalMode: ApprovalMode.YOLO,
        userMemory: "",
        geminiMdFileCount: 0,
        telemetry: { enabled: false },
        usageStatisticsEnabled: false,
        fileFiltering: {
            respectGitIgnore: true,
            respectGeminiIgnore: true,
        },
        authType: runtime.auth_type,
        contentGenerator: runtime.content_generator_options,
        interactive: false,
    });
    const contentGeneratorConfig = createContentGeneratorConfig(plannerConfig, runtime.auth_type);
    contentGeneratorConfig.model = runtime.model;
    if (runtime.openai_base_url && runtime.auth_type === AuthType.USE_OPENAI) {
        contentGeneratorConfig.baseUrl = runtime.openai_base_url;
    }
    const contentGenerator = await createContentGenerator(contentGeneratorConfig, plannerConfig, plannerConfig.getSessionId());
    const functionDeclaration = {
        name: "respond_in_schema",
        description: "Return the orchestrator team plan in the expected schema.",
        parameters: ASSISTED_TEAM_PLAN_SCHEMA,
    };
    const requestContents = [
        {
            role: "user",
            parts: [{ text: buildModelPlannerPrompt(options.snapshot) }],
        },
    ];
    const response = await contentGenerator.generateContent({
        model: contentGeneratorConfig.model,
        config: {
            temperature: 0.1,
            tools: [{ functionDeclarations: [functionDeclaration] }],
        },
        contents: requestContents,
    }, `orchestrator-team-planner-${Date.now()}`);
    const functionCalls = getFunctionCalls(response) ?? [];
    const functionCall = functionCalls.find((call) => call.name === "respond_in_schema");
    if (functionCall?.args) {
        return parseAssistedPlan(functionCall.args);
    }
    const responseText = getResponseText(response);
    if (responseText && responseText.trim().length > 0) {
        return parseAssistedPlanFromText(responseText);
    }
    throw new Error("planner_model_no_structured_response");
}
function planToHints(plan, snapshot) {
    const teamsById = new Map(snapshot.teams.map((team) => [team.team_id, team]));
    const by_team_id = {};
    for (const decision of plan.decisions) {
        const teamSnapshot = teamsById.get(decision.team_id);
        if (!teamSnapshot) {
            continue;
        }
        const allowedAgentIds = new Set(teamSnapshot.agents
            .filter((agent) => agent.has_session && agent.status !== "failed")
            .map((agent) => agent.agent_id));
        const target_agent_ids = (decision.target_agent_ids ?? []).filter((agentId) => allowedAgentIds.has(agentId));
        const preferred_agent_order = (decision.preferred_agent_order ?? []).filter((agentId) => allowedAgentIds.has(agentId));
        const strategy = decision.strategy === "delegate_subset" && target_agent_ids.length === 0
            ? "hold"
            : decision.strategy;
        const max_delegationsRaw = typeof decision.max_delegations === "number" &&
            Number.isFinite(decision.max_delegations) &&
            decision.max_delegations > 0
            ? Math.floor(decision.max_delegations)
            : undefined;
        const max_delegations = typeof max_delegationsRaw === "number"
            ? strategy === "delegate_subset"
                ? Math.max(1, Math.min(max_delegationsRaw, Math.max(1, target_agent_ids.length)))
                : Math.max(1, max_delegationsRaw)
            : undefined;
        by_team_id[decision.team_id] = {
            strategy,
            rationale: decision.rationale,
            target_agent_ids,
            preferred_agent_order,
            max_delegations,
        };
    }
    return { by_team_id };
}
export async function runTeamPlanner(options) {
    const snapshot = await buildTeamPlannerSnapshot(options.baseDir);
    if (options.decisionMode !== "assisted") {
        return {
            mode: options.decisionMode,
            snapshot,
            hints: { by_team_id: {} },
            source: "disabled",
        };
    }
    const assistedPlanFile = asNonEmptyString(options.assistedPlanFile) ??
        asNonEmptyString(process.env[ENV_ASSISTED_PLAN_FILE]);
    if (assistedPlanFile) {
        try {
            const plan = await loadAssistedPlanFromFile(assistedPlanFile);
            return {
                mode: options.decisionMode,
                snapshot,
                hints: planToHints(plan, snapshot),
                summary: plan.summary,
                confidence: plan.confidence,
                source: "file",
            };
        }
        catch (error) {
            const fallback = error instanceof Error ? error.message : String(error);
            const heuristicPlan = buildHeuristicAssistedPlan(snapshot);
            return {
                mode: options.decisionMode,
                snapshot,
                hints: planToHints(heuristicPlan, snapshot),
                summary: heuristicPlan.summary,
                confidence: heuristicPlan.confidence,
                fallback_reason: `file_plan_invalid:${fallback}`,
                source: "heuristic",
            };
        }
    }
    const heuristicPlan = buildHeuristicAssistedPlan(snapshot);
    if (!isModelPlannerEnabled()) {
        return {
            mode: options.decisionMode,
            snapshot,
            hints: planToHints(heuristicPlan, snapshot),
            summary: heuristicPlan.summary,
            confidence: heuristicPlan.confidence,
            source: "heuristic",
        };
    }
    const nowMs = Date.now();
    const snapshotKey = buildSnapshotPlanningKey(snapshot);
    const cached = modelPlanCacheByBaseDir.get(options.baseDir);
    const minIntervalMs = getModelPlanMinIntervalMs();
    if (cached &&
        cached.snapshot_key === snapshotKey &&
        nowMs - cached.generated_at_ms < minIntervalMs) {
        return {
            mode: options.decisionMode,
            snapshot,
            hints: planToHints(cached.plan, snapshot),
            summary: cached.plan.summary,
            confidence: cached.plan.confidence,
            source: "model_cache",
        };
    }
    try {
        const modelPlan = await runModelAssistedPlanner({
            baseDir: options.baseDir,
            snapshot,
        });
        modelPlanCacheByBaseDir.set(options.baseDir, {
            snapshot_key: snapshotKey,
            generated_at_ms: nowMs,
            plan: modelPlan,
        });
        return {
            mode: options.decisionMode,
            snapshot,
            hints: planToHints(modelPlan, snapshot),
            summary: modelPlan.summary,
            confidence: modelPlan.confidence,
            source: "model",
        };
    }
    catch (error) {
        const fallback = error instanceof Error ? error.message : String(error);
        return {
            mode: options.decisionMode,
            snapshot,
            hints: planToHints(heuristicPlan, snapshot),
            summary: heuristicPlan.summary,
            confidence: heuristicPlan.confidence,
            fallback_reason: `model_plan_failed:${fallback}`,
            source: "heuristic",
        };
    }
}
//# sourceMappingURL=team-planner.js.map