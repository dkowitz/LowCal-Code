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
        });
        expect(profile.approval_mode).toBe("plan");
        expect(profile.system_prompt).toEqual({
            names: ["reviewer", "security"],
            exclusive: true,
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
        };
        const profile = runtimeProfileFromTemplate(template);
        expect(profile.approval_mode).toBe("auto-edit");
        expect(profile.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: false,
        });
    });
    it("merges and sanitizes system_prompt", () => {
        const merged = mergeRuntimeProfiles({
            approval_mode: "default",
            system_prompt: {
                names: ["reviewer"],
                exclusive: false,
            },
        }, {
            approval_mode: "yolo",
            system_prompt: {
                exclusive: true,
            },
        });
        expect(merged.approval_mode).toBe("yolo");
        expect(merged.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: true,
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
        });
    });
});
//# sourceMappingURL=runtime.test.js.map