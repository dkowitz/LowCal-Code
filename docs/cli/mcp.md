# MCP Command

The `mcp` command manages Model Context Protocol (MCP) servers - external services that provide additional tools and capabilities to LowCal Code.

## Overview

Model Context Protocol (MCP) is a standard for connecting AI models to external data sources and tools. LowCal Code can connect to multiple MCP servers to extend its functionality with:
- Database connections
- API integrations
- Custom tool providers
- Specialized services

## Usage

```bash
lowcal mcp <command> [options]
```

## Sub-commands

### add

Add a new MCP server configuration.

```bash
lowcal mcp add <name> <command>
```

**Options:**
| Option | Description |
|--------|-------------|
| `--env` | Environment variables for the server (JSON format) |
| `--cwd` | Working directory for the server process |

**Examples:**
```bash
# Add a Git MCP server
lowcal mcp add git "npx -y @modelcontextprotocol/server-git"

# Add a PostgreSQL database connection
lowcal mcp add postgres "npx -y @upstash/mcp-server-postgres" \
  --env '{"DATABASE_URL": "postgresql://user:pass@localhost/db"}'

# Add a custom tool provider
lowcal mcp add my-tools "node /path/to/tools/server.js"
```

### remove

Remove an MCP server configuration.

```bash
lowcal mcp remove <name>
```

**Example:**
```bash
lowcal mcp remove git
```

### list

List all configured MCP servers.

```bash
lowcal mcp list [options]
```

**Options:**
| Option | Description |
|--------|-------------|
| `--json` | Output in JSON format |

**Example Output:**
```
✓ git - npx -y @modelcontextprotocol/server-git
  Tools: git_log, git_status, git_diff, git_checkout

✓ postgres - npx -y @upstash/mcp-server-postgres
  Tools: db_query, db_tables, db_schema

2 MCP servers configured
```

## Configuration

MCP server configurations are stored in your settings file:
- **Project-level**: `<project>/.qwen/settings.json`
- **User-level**: `~/.qwen/settings.json`

**Example Settings Entry:**
```json
{
  "mcpServers": {
    "git": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-git"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@upstash/mcp-server-postgres"],
      "env": {
        "DATABASE_URL": "postgresql://user:pass@localhost/db"
      }
    }
  }
}
```

## Using MCP Tools

Once an MCP server is configured, its tools become available in LowCal Code:

1. **Automatic Discovery**: Tools from all connected MCP servers are automatically discovered
2. **Tool Naming**: Tools are prefixed with the server name (e.g., `git__git_log`, `postgres__db_query`)
3. **Model Integration**: The LLM can use MCP tools when they're relevant to your request

## Best Practices

1. **Security**: Only add MCP servers from trusted sources
2. **Environment Variables**: Use project-level settings for sensitive credentials
3. **Error Handling**: MCP server issues are logged; check logs if tools aren't working
4. **Performance**: Some MCP servers may add latency; consider this for time-sensitive tasks

## Related Commands

- [`lowcal extensions`](extensions.md) - Extension management
