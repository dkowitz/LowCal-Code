# Deep Research Functionality in Perplexica

## Core Prompting Strategies

### 1. Query Rephrasing and Context Analysis

Perplexica uses a two-stage prompting approach for deep research:

- **Query Generation Stage**: A specialized prompt rephrases user queries into standalone questions that can be used by search engines.
- For example, when given "What is Docker?", it generates "What is Docker" as the query to search with.
- When given "Can you tell me what is X from https://example.com", it extracts both a question ("What is X?") and links for content retrieval.

### 2. Focus Mode-Specific Prompts

Perplexica implements different focus modes that each use distinct prompting strategies:

- **Web Search**: Uses comprehensive prompts with formatting instructions, citation requirements, and detailed response structure guidelines.
- **Academic Search**: Specialized prompt targeting academic databases (arXiv, Google Scholar, PubMed).
- **Writing Assistant**: Prompt designed for content creation without web search, focusing on context from uploaded files or previous  
  conversation history.
- **Wolfram Alpha Search**: Prompt optimized for computational queries and data analysis.
- **YouTube Search**: Prompt tailored to video content retrieval.
- **Reddit Search**: Prompt focused on discussion-based information gathering.

### 3. Response Structure Instructions

The core response prompt includes detailed formatting instructions:

- Use clear headings and subheadings with Markdown syntax
- Maintain a neutral, journalistic tone
- Structure responses like professional blog posts
- Include inline citations using [number] notation for each fact or detail
- Prioritize credibility by linking all statements to their source context

## Agentic Looping Structures

### 1. Multi-stage Search Process

Perplexica implements an agentic loop that:

- First rephrases the user query into a search-ready format
- Then performs web searches using SearxNG with focus mode-specific engines
- Retrieves content from relevant links (web pages or PDFs)
- Processes and ranks results based on relevance to the original question

### 2. Query Generation Loop

The system uses an iterative approach for complex queries:

- Takes user input and conversation history as context
- Generates multiple search queries using a specialized prompt template
- Uses these generated queries to find more relevant sources from the web
- Reranks results based on similarity scores

### 3. Contextual Processing with Embeddings

Perplexica uses embeddings for:

- Document similarity calculations
- Content ranking and filtering
- Ensuring responses are grounded in retrieved information rather than hallucinations

## Research Parameters and Configuration

### 1. Focus Modes

The system supports six distinct focus modes that define research parameters:

- All Mode: General web search across all sources
- Writing Assistant Mode: No web search, relies on context from files or conversation history
- Academic Search Mode: Targets academic databases (arXiv, Google Scholar, PubMed)
- YouTube Search Mode: Focuses on video content retrieval
- Wolfram Alpha Search Mode: For computational knowledge queries
- Reddit Search Mode: Specialized for discussion-based information

### 2. Optimization Modes

Three optimization modes control the research depth:

- Speed mode: Fast but less comprehensive results
- Balanced mode: Moderate processing time and quality
- Quality mode: Most thorough, detailed analysis with longer processing times

### 3. Reranking Parameters

The system implements reranking for search results:

- Enabled by default in most focus modes (except Wolfram Alpha)
- Uses similarity thresholds to filter relevant content
- Processes documents through embeddings to rank relevance

## Key Research Patterns

1. **Context-Aware Query Generation**: The system analyzes conversation history and user input to generate appropriate queries, rather than  
   just using the raw question.

2. **Multi-source Integration**: Responses are built from multiple sources with proper citation of each source's number in the context.

3. **Structured Output Requirements**: All responses must follow specific formatting rules including:
   - Proper headings
   - Inline citations for every statement
   - Professional tone and structure

4. **Specialized Prompting per Focus Mode**: Each focus mode has its own prompt template that guides how to process information, ensuring  
   domain-specific research approaches.

5. **Document Processing Pipeline**: For URL-based queries, the system:
   - Retrieves content from links using HTTP requests
   - Converts HTML to text for processing
   - Parses PDFs when needed
   - Splits documents into chunks for embedding and retrieval

This approach allows Perplexica to conduct deep research by combining multiple prompting strategies with structured agentic loops that ensure  
 comprehensive, well-cited responses.

# Research Functionality in Perplexica - Detailed Analysis

### Query Rephrasing Prompts (Web Search Focus Mode)

#### Primary Query Generator Prompt:

```
You are an AI question rephraser. You will be given a conversation and a follow-up question,  you will have to rephrase the follow up question so it is a standalone question and can be used by another LLM to search the web for information to answer it.
If it is a simple writing task or a greeting (unless the greeting contains a question after it) like Hi, Hello, How are you, etc. than a question then you need to return `not_needed` as the response (This is because the LLM won't need to search the web for finding information on this topic).
If the user asks some question from some URL or wants you to summarize a PDF or a webpage (via URL) you need to return the links inside the `links` XML block and the question inside the `question` XML block. If the user wants to you to summarize the webpage or the PDF you need to return `summarize` inside the `question` XML block in place of a question and the link to summarize in the `links` XML block.
You must always return the rephrased question inside the `question` XML block, if there are no links in the follow-up question then don't insert a `links` XML block in your response.

**Note**: All user messages are individual entities and should be treated as such do not mix conversations.
```

#### Few-Shot Examples for Query Rephrasing:

1. User: `<conversation></conversation><query>What is the capital of France</query>`
   Assistant: `<question>Capital of france</question>`

2. User: `<conversation></conversation><query>Hi, how are you?</query>`
   Assistant: `<question>not_needed</question>`

3. User: `<conversation></conversation><query>What is Docker?</query>`
   Assistant: `<question>What is Docker</question>`

4. User: `<conversation></conversation><query>Can you tell me what is X from https://example.com</query>`
   Assistant:

   ```
   <question>What is X?</question>
   <links>
   https://example.com
   </links>
   ```

5. User: `<conversation></conversation><query>Summarize the content from https://example.com</query>`
   Assistant:
   ```
   <question>summarize</question>
   <links>
   https://example.com
   </links>
   ```

### Web Search Response Prompts

#### Core Response Prompt Template:

```
You are Perplexica, an AI model skilled in web search and crafting detailed, engaging, and well-structured answers. You excel at summarizing web pages and extracting relevant information to create professional, blog-style responses.

Your task is to provide answers that are:
- **Informative and relevant**: Thoroughly address the user's query using the given context.
- **Well-structured**: Include clear headings and subheadings, and use a professional tone to present information concisely and logically.
- **Engaging and detailed**: Write responses that read like a high-quality blog post, including extra details and relevant insights.
- **Cited and credible**: Use inline citations with [number] notation to refer to the context source(s) for each fact or detail included.
- **Explanatory and Comprehensive**: Strive to explain the topic in depth, offering detailed analysis, insights, and clarifications wherever applicable.

### Formatting Instructions
- **Structure**: Use a well-organized format with proper headings (e.g., "## Example heading 1" or "## Example heading 2"). Present information in paragraphs or concise bullet points where appropriate.
- **Tone and Style**: Maintain a neutral, journalistic tone with engaging narrative flow. Write as though you're crafting an in-depth article for a professional audience.
- **Markdown Usage**: Format your response with Markdown for clarity. Use headings, subheadings, bold text, and italicized words as needed to enhance readability.
- **Length and Depth**: Provide comprehensive coverage of the topic. Avoid superficial responses and strive for depth without unnecessary repetition. Expand on technical or complex topics to make them easier to understand for a general audience.
- **No main heading/title**: Start your response directly with the introduction unless asked to provide a specific title.
- **Conclusion or Summary**: Include a concluding paragraph that synthesizes the provided information or suggests potential next steps, where appropriate.

### Citation Requirements
- Cite every single fact, statement, or sentence using [number] notation corresponding to the source from the provided `context`.
- Integrate citations naturally at the end of sentences or clauses as appropriate. For example, "The Eiffel Tower is one of the most visited landmarks in the world[1]."
- Ensure that **every sentence in your response includes at least one citation**, even when information is inferred or connected to general knowledge available in the provided context.
- Use multiple sources for a single detail if applicable, such as, "Paris is a cultural hub, attracting millions of visitors annually[1][2]."
- Always prioritize credibility and accuracy by linking all statements back to their respective context sources.
- Avoid citing unsupported assumptions or personal interpretations; if no source supports a statement, clearly indicate the limitation.

### Special Instructions
- If the query involves technical, historical, or complex topics, provide detailed background and explanatory sections to ensure clarity.
- If the user provides vague input or if relevant information is missing, explain what additional details might help refine the search.
- If no relevant information is found, say: "Hmm, sorry I could not find any relevant information on this topic. Would you like me to search again or ask something else?" Be transparent about limitations and suggest alternatives or ways to reframe the query.

### User instructions
These instructions are shared to you by the user and not by the system. You will have to follow them but give them less priority than the above instructions. If the user has provided specific instructions or preferences, incorporate them into your response while adhering to the overall guidelines.
{systemInstructions}

### Example Output
- Begin with a brief introduction summarizing the event or query topic.
- Follow with detailed sections under clear headings, covering all aspects of the query if possible.
- Provide explanations or historical context as needed to enhance understanding.
- End with a conclusion or overall perspective if relevant.

<context>
{context}
</context>

Current date & time in ISO format (UTC timezone) is: {date}.
```

### Optimization Modes Implementation Details

#### 1. Speed Mode

- **Parameters**:
  - Limited number of search results (typically 3-5)
  - Minimal rephrased queries (usually 1 query generated)
  - Reduced document processing depth
  - Faster response generation with less comprehensive analysis
- **Implementation**: Optimized for quick responses, prioritizing speed over thoroughness

#### 2. Balanced Mode (Default)

- **Parameters**:
  - Moderate number of search results (typically 5-10)
  - Standard rephrased queries (usually 2-3 queries generated)
  - Normal document processing depth
  - Balanced response generation with reasonable analysis time
- **Implementation**: Default mode that provides a good compromise between speed and quality

#### 3. Quality Mode

- **Parameters**:
  - Maximum number of search results (typically 10+)
  - Multiple rephrased queries (4-5 queries generated)
  - Full document processing depth with detailed analysis
  - Most comprehensive response generation with thorough research
- **Implementation**: Prioritizes quality and completeness over speed, using more extensive search strategies

### Document Processing Pipeline Details

#### 1. Content Retrieval from Links:

When a user provides URLs for content retrieval, Perplexica follows this process:

```typescript
export const getDocumentsFromLinks = async ({ links }: { links: string[] }) => {
  const splitter = new RecursiveCharacterTextSplitter();

  let docs: Document[] = [];

  await Promise.all(
    links.map(async (link) => {
      link =
        link.startsWith("http://") || link.startsWith("https://")
          ? link
          : `https://${link}`;

      try {
        const res = await axios.get(link, {
          responseType: "arraybuffer",
        });

        // Check if content is PDF
        const isPdf = res.headers["content-type"] === "application/pdf";

        if (isPdf) {
          // Parse PDF using pdf-parse library
          const pdfText = await pdfParse(res.data);
          const parsedText = pdfText.text
            .replace(/\r\n|\n|\r/gm, " ")
            .replace(/\s+/g, " ")
            .trim();

          // Split text into chunks for processing
          const splittedText = await splitter.splitText(parsedText);

          // Create documents with metadata
          const linkDocs = splittedText.map((text) => {
            return new Document({
              pageContent: text,
              metadata: {
                title: "PDF Document",
                url: link,
              },
            });
          });

          docs.push(...linkDocs);
          return;
        }

        // For HTML content
        const parsedText = htmlToText(res.data.toString("utf8"), {
          selectors: [
            {
              selector: "a",
              options: {
                ignoreHref: true,
              },
            },
          ],
        })
          .replace(/\r\n|\n|\r/gm, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Split text into chunks for processing
        const splittedText = await splitter.splitText(parsedText);

        // Extract title from HTML
        const title = res.data
          .toString("utf8")
          .match(/<title.*>(.*?)<\/title>/)?.[1];

        // Create documents with metadata
        const linkDocs = splittedText.map((text) => {
          return new Document({
            pageContent: text,
            metadata: {
              title: title || link,
              url: link,
            },
          });
        });

        docs.push(...linkDocs);
      } catch (err) {
        // Handle errors by creating a document with error information
        docs.push(
          new Document({
            pageContent: `Failed to retrieve content from the link: ${err}`,
            metadata: {
              title: "Failed to retrieve content",
              url: link,
            },
          }),
        );
      }
    }),
  );

  return docs;
};
```

#### 2. Text Splitting Strategy:

- Uses RecursiveCharacterTextSplitter for chunking documents
- Splits text into manageable chunks that can be processed by the LLM
- Maintains context within chunks while ensuring they're not too large

#### 3. Document Metadata Handling:

Each retrieved document includes metadata such as:

- Title (from HTML title tag or default to URL)
- URL source for citation purposes
- Content processing information for tracking

This detailed analysis shows how Perplexica implements its deep research functionality through carefully structured prompts, optimization modes that control search depth and processing time, and a robust pipeline for retrieving and structuring content from web sources.
