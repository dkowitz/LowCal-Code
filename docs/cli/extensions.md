# Extensions Command

The `extensions` command manages LowCal Code extensions - additional functionality that can be added to extend the CLI's capabilities.

## Overview

Extensions are modular packages that add new features, tools, or integrations to LowCal Code. They can be:
- Installed from extension repositories
- Shared across projects via version control
- Enabled/disabled without uninstalling

## Usage

```bash
lowcal extensions <command> [options]
```

## Sub-commands

### install

Install an extension.

```bash
lowcal extensions install <name>
```

**Examples:**
```bash
# Install a specific extension
lowcal extensions install git-tools

# Install from a registry (if configured)
lowcal extensions install my-extension@1.2.3
```

### uninstall

Remove an installed extension.

```bash
lowcal extensions uninstall <name>
```

**Example:**
```bash
lowcal extensions uninstall git-tools
```

### list

List all installed extensions.

```bash
lowcal extensions list [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

**Example Output:**
```
✓ git-tools v1.0.0 - Git integration tools
✓ docker-tools v2.1.0 - Docker container management
✓ k8s-tools v0.5.0 - Kubernetes cluster management

3 extensions installed
```

### update

Update extensions to their latest versions.

```bash
lowcal extensions update [name]
```

**Examples:**
```bash
# Update all extensions
lowcal extensions update

# Update a specific extension
lowcal extensions update git-tools
```

### disable

Temporarily disable an extension without uninstalling it.

```bash
lowcal extensions disable <name>
```

The extension will not be loaded in future sessions but can be re-enabled later.

**Example:**
```bash
lowcal extensions disable docker-tools
```

### enable

Re-enable a disabled extension.

```bash
lowcal extensions enable <name>
```

**Example:**
```bash
lowcal extensions enable docker-tools
```

## Extension Management

### Storage Locations

Extensions are stored in:
- **Project-level**: `<project>/.qwen/extensions/` - Project-specific extensions
- **User-level**: `~/.qwen/extensions/` - Global extensions available to all projects

### Extension Format

Extensions are typically npm packages with a specific structure:

```json
{
  "name": "extension-name",
  "version": "1.0.0",
  "lowcal": {
    "type": "tool-provider",
    "tools": ["tool1", "tool2"]
  }
}
```

## Use Cases

1. **Add Project-Specific Tools**: Install extensions that provide tools for your tech stack
2. **Team Collaboration**: Share extensions via version control for consistent team tooling
3. **Try Before Commit**: Enable/disable extensions to test functionality without permanent installation
4. **Version Control**: Keep extension versions in sync across development environments

## Related Commands

- [`lowcal mcp`](mcp.md) - Model Context Protocol server management
