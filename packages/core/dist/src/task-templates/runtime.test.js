/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { describe, expect, it } from "vitest";
import { mergeRuntimeProfiles, normalizeRuntimeProfile, runtimeProfileFromTemplate, sanitizeRuntimeProfile, } from "./runtime.js";
describe("task runtime profile system prompt support", () => {
    it("normalizes system_prompt from runtime payload", () => {
        const profile = normalizeRuntimeProfile({
            action_type: "prompt",
            action_value: "review docs",
            approval_mode: "plan",
            system_prompt: {
                names: ["reviewer", "security"],
                exclusive: true,
            },
            toolset: {
                collection: "minimal",
            },
        });
        expect(profile.approval_mode).toBe("plan");
        expect(profile.system_prompt).toEqual({
            names: ["reviewer", "security"],
            exclusive: true,
        });
        expect(profile.toolset).toEqual({
            collection: "minimal",
        });
    });
    it("maps template systemPrompt into runtime profile", () => {
        const template = {
            id: "doc-review",
            level: "user",
            filePath: "/tmp/doc-review.md",
            prompt: "Review docs",
            action: {
                type: "prompt",
                value: "Review docs",
            },
            approvalMode: "auto-edit",
            systemPrompt: {
                names: ["reviewer"],
                exclusive: false,
            },
            toolset: {
                collection: "full",
            },
        };
        const profile = runtimeProfileFromTemplate(template);
        expect(profile.approval_mode).toBe("auto-edit");
        expect(profile.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: false,
        });
        expect(profile.toolset).toEqual({
            collection: "full",
        });
    });
    it("merges and sanitizes system_prompt", () => {
        const merged = mergeRuntimeProfiles({
            approval_mode: "default",
            system_prompt: {
                names: ["reviewer"],
                exclusive: false,
            },
            toolset: {
                collection: "full",
            },
        }, {
            approval_mode: "yolo",
            system_prompt: {
                exclusive: true,
            },
            toolset: {
                collection: "minimal",
            },
        });
        expect(merged.approval_mode).toBe("yolo");
        expect(merged.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: true,
        });
        expect(merged.toolset).toEqual({
            collection: "minimal",
        });
        expect(sanitizeRuntimeProfile(merged)).toEqual({
            template_id: undefined,
            template_level: undefined,
            action_type: undefined,
            action_value: undefined,
            approval_mode: "yolo",
            execution_mode: undefined,
            auth: undefined,
            model: undefined,
            run: undefined,
            system_prompt: {
                names: ["reviewer"],
                exclusive: true,
            },
            toolset: {
                collection: "minimal",
            },
        });
    });
});
//# sourceMappingURL=runtime.test.js.map