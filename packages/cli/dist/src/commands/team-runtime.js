import { jsx as _jsx } from "react/jsx-runtime";
import path from "node:path";
import process from "node:process";
import { render } from "ink";
import { loadSettings } from "../config/settings.js";
import { TeamRuntimeDialog } from "../ui/components/TeamRuntimeDialog.js";
import { KeypressProvider } from "../ui/contexts/KeypressContext.js";
import { themeManager } from "../ui/themes/theme-manager.js";
import { teamCommand } from "../ui/commands/teamCommand.js";
import { orchestratorCommand } from "../ui/commands/orchestratorCommand.js";
import { detectAndEnableKittyProtocol } from "../ui/utils/kittyProtocolDetector.js";
function createRuntimeCommandContext(baseDir) {
    return {
        services: {
            config: {
                getTargetDir: () => baseDir,
            },
            settings: {},
            git: undefined,
            logger: {},
            logging: {},
        },
        ui: {
            addItem: (() => undefined),
            clear: () => undefined,
            setDebugMessage: () => undefined,
            pendingItem: null,
            setPendingItem: () => undefined,
            loadHistory: (() => undefined),
            getHistory: () => [],
            toggleCorgiMode: () => undefined,
            toggleVimEnabled: async () => false,
            setGeminiMdFileCount: () => undefined,
            reloadCommands: () => undefined,
        },
        session: {
            stats: {},
            sessionShellAllowlist: new Set(),
        },
    };
}
function splitCommand(raw) {
    const trimmed = raw.trim().replace(/^\/+/, "");
    if (!trimmed) {
        return { name: "", args: "" };
    }
    const firstSpace = trimmed.indexOf(" ");
    if (firstSpace < 0) {
        return { name: trimmed.toLowerCase(), args: "" };
    }
    return {
        name: trimmed.slice(0, firstSpace).trim().toLowerCase(),
        args: trimmed.slice(firstSpace + 1).trim(),
    };
}
function asMessageOrDialog(result) {
    if (!result) {
        return undefined;
    }
    if (result.type === "message" || result.type === "dialog") {
        return result;
    }
    return undefined;
}
async function executeRuntimeSlashCommand(rawCommand, context) {
    const { name, args } = splitCommand(rawCommand);
    if (!name) {
        return;
    }
    let result;
    if (name === "team") {
        const action = teamCommand.action;
        if (!action) {
            throw new Error("Team command handler is unavailable.");
        }
        result = asMessageOrDialog(await action(context, args));
    }
    else if (name === "orchestrator") {
        const action = orchestratorCommand.action;
        if (!action) {
            throw new Error("Orchestrator command handler is unavailable.");
        }
        result = asMessageOrDialog(await action(context, args));
    }
    else {
        throw new Error(`Unsupported command in Team Runtime Console: "${name}". Use /team ... or /orchestrator ...`);
    }
    if (!result) {
        return undefined;
    }
    if (result.type === "message" && result.messageType === "error") {
        throw new Error(result.content);
    }
    if (result.type === "message") {
        return {
            messageType: result.messageType,
            content: result.content,
        };
    }
    return undefined;
}
async function runTeamRuntimeConsole(baseDir) {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("Team runtime console requires an interactive terminal (TTY).");
    }
    const kittyProtocolEnabled = await detectAndEnableKittyProtocol();
    const settings = loadSettings(baseDir);
    themeManager.loadCustomThemes(settings.merged.ui?.customThemes);
    if (settings.merged.ui?.theme) {
        themeManager.setActiveTheme(settings.merged.ui?.theme);
    }
    const nodeMajorVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "20", 10);
    const commandContext = createRuntimeCommandContext(baseDir);
    await new Promise((resolve, reject) => {
        let settled = false;
        const finish = (error) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            instance.unmount();
            if (error) {
                reject(error instanceof Error ? error : new Error(String(error)));
            }
            else {
                resolve();
            }
        };
        const onSignal = () => finish();
        const cleanup = () => {
            process.removeListener("SIGINT", onSignal);
            process.removeListener("SIGTERM", onSignal);
        };
        process.once("SIGINT", onSignal);
        process.once("SIGTERM", onSignal);
        const instance = render(_jsx(KeypressProvider, { kittyProtocolEnabled: kittyProtocolEnabled, pasteWorkaround: process.platform === "win32" || nodeMajorVersion < 20, debugKeystrokeLogging: settings.merged.general?.debugKeystrokeLogging, children: _jsx(TeamRuntimeDialog, { baseDir: baseDir, onExit: () => finish(), onSubmitCommand: (command) => executeRuntimeSlashCommand(command, commandContext) }) }), { exitOnCtrlC: false });
    });
}
export const teamRuntimeCommand = {
    command: "team-runtime",
    aliases: ["team-monitor"],
    describe: "Open a standalone full-screen Team Runtime Console for live team operations",
    builder: (yargs) => yargs.option("base-dir", {
        type: "string",
        description: "Base directory containing .lowcal team state (defaults to current directory)",
    }),
    handler: async (argv) => {
        const baseDir = path.resolve(argv.baseDir ?? process.cwd());
        try {
            await runTeamRuntimeConsole(baseDir);
        }
        catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    },
};
//# sourceMappingURL=team-runtime.js.map