# LowCal Code

<div align="center">

![LowCal Code Screenshot](./docs/assets/LowCal-screenshot.png)

**AI-powered command-line workflow tool for developers**

</div>

LowCal is a powerful command-line AI workflow tool adapted from Qwen Code, specifically optimized for local use with LM Studio and cloud models with OpenRouter. It enhances your development workflow with advanced code understanding, automated tasks, and intelligent assistance.

#### Installation

Global installation has not been tested.

Instructions:

Node and git required.  Tested on Linux and MacOS, Windows may not be fully compatible.

```bash
git clone https://github.com/dkowitz/LowCal-Code
cd LowCal-Code
npm run build
npm run bundle
```

Run from installation directory:
```bash
npm start
```

Run from a workspace directory:
```bash
cd [workspace directory]
node ~/LowCal-Code/bundle/gemini.ts (replace ~/LowCal-Code with your installation directory if different)
```

For LM Studio:  Make sure LM Studio is running with the server enabled.

For OpenRouter: An OpenRouter api key is required.

For WebSearch: A Tavily api key is required.  Highly recommend a free api key, which gets 1,000 api calls per month.
Add "tavilyApiKey": "your-key-here" to your settings.json.

#### Session Commands

- **`/compress`** - Compress conversation history to continue within token limits
- **`/clear`** - Clear all conversation history and start fresh
- **`/stats`** - Check current token usage and limits

- **`/init`** - Run in project directory to generate LOWCAL.md summary file that will automatically be included to guide the model on your project.

- **`/auth`** - Select between either OpenRouter or LM Studio.  OpenRouter requires an api key.
- **`/model`** - Select a model.  
    - LM Studio shows only models that have been manually configured through the LM Studio gui.  It finds them in the LM Studio's configuration files located in ~/.lmstudio/.internal/user-concrete-model-default-config/.  The app tries to match the models here with the models returned by LM Studio's api - which often use different names.  If it can't resolve a matching api model for a found configured model, it offers a wizard for the user to match the models.  Matching the models allows the app to list available models, along with their maximum context size and their configured context size.
    - OpenRouter shows available models, their maximum context size, and their cost along with a search filter (e.g. 'free', 'grok', 'qwen', etc).  OpenRouter offers hundreds of available models, from GPT-5 to free models.

#### Local Model Latency Enhancements (Designed for local model use, can be used with any model)

- **`/promptmode set <full/concise/auto>`**
    - full:  full, long system prompt with verbose instructions and lots of examples
    - concise:  short, abbreviated prompt for conserving context space and decreasing latency, particularly for local models.  Dynamically constructed to only include instructions/examples for tools from the currently activated /toolset.
    - auto:  automatically uses concise prompt when using LM Studio endpoint and full prompt when using OpenRouter endpoint

- **`/toolset (list, show, activate/use, create, add, remove)`** - use custom tool collections to exclude tools from being used and saving context space and decreasing latency, particularly with local models.  Using the shell tool is often more efficient than using file tools.
    - list: list available preset tool collections
    - show <toolset collection name>:  shows which tools are in a collection
    - activate/use: Use a selected tool collection
    - create: Create a new tool collection`/toolset create <name> [tool1, tool2, ...]` (Use tool names from /tools)
    - add/remove: add/remove tool to/from a tool collection `/toolset add[remove] <name> tool`

- **`/promptinfo`** - Show the current system prompt in a /view window (↑↓ to scroll, 'q' to quit viewer).

#### Additional New Commands
    
- **`/view filename`** - view a markdown or text file in a viewer window in-line in the chat.  Use ↑↓ to scroll, 'q' to quit viewer.

- **`/tokens filename`** - show the token count of a file.

- **`/export [compact, report] [filename]`** - Export the current conversation to a markdown file.  If no filename is provided one will be generated.
    - no argument: saves full conversation, including tool use and all notification messages to ./conversations/
    - `compact`: saves only the user and assistant messages, omitting all tool uses and other messages to ./conversations/
    - `report`: saves the first user message and the trailing assistant messages of the conversation.  Intended use is: user asks for a detailed report on x, assistant uses tools to generate material, and final messages are the actual report - this tries to capture just the request and the report.  Saves to ./reports/

Note: Tavily api key required for WebSearch tool.  A free key is highly recommended, allows up to 1,000 api calls per month.

### 🔍 Explore Codebases

```bash
/init

# Architecture analysis
> Describe the main pieces of this system's architecture
> What are the key dependencies and how do they interact?
> Find all API endpoints and their authentication methods
```

### 💻 Code Development

```bash
# Refactoring
> Refactor this function to improve readability and performance
> Convert this class to use dependency injection
> Split this large module into smaller, focused components

# Code generation
> Create a REST API endpoint for user management
> Generate unit tests for the authentication module
> Add error handling to all database operations
```

### 🔄 Automate Workflows

```bash
# Git automation
> Analyze git commits from the last 7 days, grouped by feature
> Create a changelog from recent commits
> Find all TODO comments and create GitHub issues

# File operations
> Convert all images in this directory to PNG format
> Rename all test files to follow the *.test.ts pattern
> Find and remove all console.log statements
```

### 🐛 Debugging & Analysis

```bash
# Performance analysis
> Identify performance bottlenecks in this React component
> Find all N+1 query problems in the codebase

# Security audit
> Check for potential SQL injection vulnerabilities
> Find all hardcoded credentials or API keys
```

## Popular Tasks

### 📚 Understand New Codebases

```text
> What are the core business logic components?
> What security mechanisms are in place?
> How does the data flow through the system?
> What are the main design patterns used?
> Generate a dependency graph for this module
```

### 🔨 Code Refactoring & Optimization

```text
> What parts of this module can be optimized?
> Help me refactor this class to follow SOLID principles
> Add proper error handling and logging
> Convert callbacks to async/await pattern
> Implement caching for expensive operations
```

### 📝 Documentation & Testing

```text
> Generate comprehensive JSDoc comments for all public APIs
> Write unit tests with edge cases for this component
> Create API documentation in OpenAPI format
> Add inline comments explaining complex algorithms
> Generate a README for this module
```

### 🚀 Development Acceleration

```text
> Set up a new Express server with authentication
> Create a React component with TypeScript and tests
> Implement a rate limiter middleware
> Add database migrations for new schema
> Configure CI/CD pipeline for this project
```

## Commands & Shortcuts

### Session Commands

- `/help` - Display available commands
- `/clear` - Clear conversation history
- `/compress` - Compress history to save tokens
- `/stats` - Show current session information
- `/exit` or `/quit` - Exit LowCal Code

### Keyboard Shortcuts

- `Ctrl+C` - Cancel current operation
- `Ctrl+D` - Exit (on empty line)
- `Up/Down` - Navigate command history

## License

[LICENSE](./LICENSE)
