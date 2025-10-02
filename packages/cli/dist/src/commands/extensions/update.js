/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { updateExtension } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
export async function handleUpdate(args) {
    try {
        // TODO(chrstnb): we should list extensions if the requested extension is not installed.
        const updatedExtensionInfo = await updateExtension(args.name);
        if (!updatedExtensionInfo) {
            console.log(`Extension "${args.name}" failed to update.`);
            return;
        }
        console.log(`Extension "${args.name}" successfully updated: ${updatedExtensionInfo.originalVersion} → ${updatedExtensionInfo.updatedVersion}.`);
    }
    catch (error) {
        console.error(getErrorMessage(error));
        process.exit(1);
    }
}
export const updateCommand = {
    command: 'update <name>',
    describe: 'Updates an extension.',
    builder: (yargs) => yargs
        .positional('name', {
        describe: 'The name of the extension to update.',
        type: 'string',
    })
        .check((_argv) => true),
    handler: async (argv) => {
        await handleUpdate({
            name: argv['name'],
        });
    },
};
//# sourceMappingURL=update.js.map