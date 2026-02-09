# Research Command

The `research` command conducts deep internet research with citation support, using multiple search strategies to gather comprehensive information.

## Overview

The research mode is designed for thorough information gathering with:
- Multiple search strategies (speed, balanced, quality, max)
- Automatic citation collection
- Source verification and ranking
- Summarization of findings

## Usage

```bash
lowcal research [mode] <query>
```

## Modes

| Mode | Description | Use When |
|------|-------------|----------|
| `speed` | Fastest research with fewer sources | Quick fact-checking, simple questions |
| `balanced` (default) | Balanced speed and quality | General research, most queries |
| `quality` | Thorough research with multiple sources | Important decisions, complex topics |
| `max` | Maximum depth and breadth of research | Comprehensive analysis, academic work |

## Examples

### Quick Research
```bash
# Fast answer for a simple question
lowcal research speed "What is the latest version of React?"
```

### Balanced Research (Default)
```bash
# General topic exploration
lowcal research balanced "Best practices for React state management"
```

### Quality Research
```bash
# Thorough investigation with multiple sources
lowcal research quality "Comparing microservices vs monolith architecture"
```

### Maximum Depth
```bash
# Comprehensive academic-style research
lowcal research max "Impact of climate change on coastal cities - 2020 to 2025"
```

## Research Process

1. **Query Analysis**: The system analyzes your query to determine search strategy
2. **Multi-Source Search**: Searches across multiple sources simultaneously
3. **Citation Collection**: Collects and verifies source citations
4. **Content Summarization**: Summarizes key findings from each source
5. **Synthesis**: Combines information into a coherent response with citations

## Output Format

Research results include:
- **Summary**: Concise answer to your query
- **Key Findings**: Bullet points of important information
- **Citations**: Numbered references to sources
- **Source Quality**: Indicators of source reliability

## Use Cases

1. **Technical Research**: Learning about new technologies, frameworks, or tools
2. **Market Analysis**: Researching competitors, market trends, or industry standards
3. **Academic Work**: Gathering information for papers or reports
4. **Troubleshooting**: Finding solutions to complex problems
5. **Competitive Intelligence**: Understanding competitor strategies and offerings

## Tips for Effective Research

1. **Be Specific**: Clear, specific queries yield better results
2. **Use Quality Mode**: For important decisions, use `quality` or `max` mode
3. **Verify Critical Information**: Cross-check important facts with multiple sources
4. **Follow Up**: Ask clarifying questions about the research findings

## Related Features

- `/prompt` - Create custom prompts for specialized research tasks
- Web search tools available in the CLI for ad-hoc searches
