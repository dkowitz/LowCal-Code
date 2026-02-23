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
            system_prompt: {
                names: ["reviewer", "security"],
                exclusive: true,
            },
        });
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
            systemPrompt: {
                names: ["reviewer"],
                exclusive: false,
            },
        };
        const profile = runtimeProfileFromTemplate(template);
        expect(profile.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: false,
        });
    });
    it("merges and sanitizes system_prompt", () => {
        const merged = mergeRuntimeProfiles({
            system_prompt: {
                names: ["reviewer"],
                exclusive: false,
            },
        }, {
            system_prompt: {
                exclusive: true,
            },
        });
        expect(merged.system_prompt).toEqual({
            names: ["reviewer"],
            exclusive: true,
        });
        expect(sanitizeRuntimeProfile(merged)).toEqual({
            template_id: undefined,
            template_level: undefined,
            action_type: undefined,
            action_value: undefined,
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