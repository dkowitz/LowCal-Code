/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { installExtension, } from '../../config/extension.js';
import { getErrorMessage } from '../../utils/errors.js';
export async function handleInstall(args) {
    try {
        const installMetadata = {
            source: (args.source || args.path),
            type: args.source ? 'git' : 'local',
        };
        const extensionName = await installExtension(installMetadata);
        console.log(`Extension "${extensionName}" installed successfully and enabled.`);
    }
    catch (error) {
        console.error(getErrorMessage(error));
        process.exit(1);
    }
}
export const installCommand = {
    command: 'install [--source | --path ]',
    describe: 'Installs an extension from a git repository or a local path.',
    builder: (yargs) => yargs
        .option('source', {
        describe: 'The git URL of the extension to install.',
        type: 'string',
    })
        .option('path', {
        describe: 'Path to a local extension directory.',
        type: 'string',
    })
        .conflicts('source', 'path')
        .check((argv) => {
        if (!argv.source && !argv.path) {
            throw new Error('Either a git URL --source or a --path must be provided.');
        }
        return true;
    }),
    handler: async (argv) => {
        await handleInstall({
            source: argv['source'],
            path: argv['path'],
        });
    },
};
//# sourceMappingURL=install.js.map