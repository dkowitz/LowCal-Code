/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { CommandKind, } from './types.js';
export const agentsCommand = {
    name: 'agents',
    description: 'Manage subagents for specialized task delegation.',
    kind: CommandKind.BUILT_IN,
    subCommands: [
        {
            name: 'manage',
            description: 'Manage existing subagents (view, edit, delete).',
            kind: CommandKind.BUILT_IN,
            action: () => ({
                type: 'dialog',
                dialog: 'subagent_list',
            }),
        },
        {
            name: 'create',
            description: 'Create a new subagent with guided setup.',
            kind: CommandKind.BUILT_IN,
            action: () => ({
                type: 'dialog',
                dialog: 'subagent_create',
            }),
        },
    ],
};
//# sourceMappingURL=agentsCommand.js.map