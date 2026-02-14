/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { CreateTaskTemplateOptions, ListTaskTemplatesOptions, ResolveTaskTemplateOptions, TaskTemplate, TaskTemplateLevel } from "./types.js";
/**
 * Manages task templates in project/user/builtin scopes.
 */
export declare class TaskTemplateManager {
    private readonly projectRoot;
    private cache;
    constructor(projectRoot: string);
    clearCache(): void;
    private ensureCache;
    private getLevelDir;
    getTemplatePath(id: string, level: TaskTemplateLevel): string;
    private parseTemplateFile;
    private serializeTemplate;
    private listTemplatesAtLevel;
    listTemplates(options?: ListTaskTemplatesOptions): Promise<TaskTemplate[]>;
    resolveTemplate(id: string, options?: ResolveTaskTemplateOptions): Promise<TaskTemplate | null>;
    createTemplate(template: TaskTemplate, options: CreateTaskTemplateOptions): Promise<void>;
    updateTemplate(id: string, updates: Partial<TaskTemplate>, level?: TaskTemplateLevel): Promise<TaskTemplate>;
    deleteTemplate(id: string, level?: TaskTemplateLevel): Promise<void>;
}
