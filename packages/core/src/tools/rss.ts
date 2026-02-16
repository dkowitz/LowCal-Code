/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { XMLParser } from "fast-xml-parser";
import type { Config } from "../config/config.js";
import type { ToolInvocation, ToolResult } from "./tools.js";
import {
  BaseDeclarativeTool,
  BaseToolInvocation,
  Kind,
} from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";

const RSS_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ITEMS = 25;

/**
 * Parameters for the RSS tool
 */
export interface RSSToolParams {
  /**
   * The RSS/Atom feed URL to fetch
   */
  url: string;

  /**
   * Maximum number of items to return (default: 25)
   */
  maxItems?: number;
}

/**
 * Normalized RSS item structure
 */
export interface RSSItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  author?: string;
  categories?: string[];
  guid?: string;
}

/**
 * Normalized RSS feed structure
 */
export interface RSSFeed {
  title: string;
  link: string;
  description?: string;
  items: RSSItem[];
}

/**
 * Implementation of the RSS tool invocation logic
 */
class RSSToolInvocation extends BaseToolInvocation<
  RSSToolParams,
  ToolResult
> {
  private readonly parser: XMLParser;

  constructor(
    _config: Config,
    params: RSSToolParams,
  ) {
    super(params);
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
    });
  }

  getDescription(): string {
    return `RSS feed: ${this.params.url}`;
  }

  private async fetchFeed(url: string): Promise<string> {
    // Convert www.reddit.com to old.reddit.com for RSS feeds
    let fetchUrl = url;
    if (url.includes("www.reddit.com")) {
      fetchUrl = url.replace("www.reddit.com", "old.reddit.com");
      console.debug(`[RSSTool] Converted Reddit URL to old.reddit.com: ${fetchUrl}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), RSS_FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(fetchUrl, {
        signal: controller.signal,
        headers: {
          "User-Agent": "LowCal-RSS-Reader/1.0",
          Accept: "application/rss+xml, application/xml, text/xml, application/atom+xml",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      console.debug(`[RSSTool] Successfully fetched feed from ${fetchUrl}`);
      return await response.text();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private parseRSS(xml: string): RSSFeed {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed: any = this.parser.parse(xml);

    // Handle RSS 2.0
    if (parsed.rss?.channel) {
      return this.parseRSS2(parsed.rss.channel);
    }

    // Handle Atom
    if (parsed.feed) {
      return this.parseAtom(parsed.feed);
    }

    // Handle RSS 1.0 (RDF)
    if (parsed["rdf:RDF"]) {
      return this.parseRSS1(parsed["rdf:RDF"]);
    }

    throw new Error("Unknown feed format");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseRSS2(channel: any): RSSFeed {
    const items = channel.item;

    return {
      title: channel.title ?? "Untitled",
      link: channel.link ?? "",
      description: channel.description,
      items: this.normalizeItems(items),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseAtom(feed: any): RSSFeed {
    // Atom links can be an array or single object
    let link = "";
    const links = feed.link;
    if (Array.isArray(links)) {
      const alternate = links.find((l: Record<string, string>) => l["@_rel"] === "alternate");
      link = alternate?.["@_href"] || alternate?.["#text"] || "";
    } else if (links) {
      link = links["@_href"] || links["#text"] || String(links);
    }

    const entries = feed.entry;

    return {
      title: feed.title ?? "Untitled",
      link,
      description: feed.subtitle,
      items: this.normalizeAtomItems(entries),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parseRSS1(rdf: any): RSSFeed {
    const channel = rdf.channel;
    const items = rdf.items?.item;

    return {
      title: channel?.title ?? "Untitled",
      link: channel?.link ?? "",
      items: this.normalizeItems(items),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeItems(items: any): RSSItem[] {
    if (!items) return [];

    const maxItems = this.params.maxItems ?? DEFAULT_MAX_ITEMS;

    // Ensure it's an array
    const itemArray = Array.isArray(items) ? items : [items];
    const normalized: RSSItem[] = [];

    for (const item of itemArray) {
      if (normalized.length >= maxItems) break;

      // Handle both array and single category
      let categories: string[] | undefined;
      const category = item.category;
      if (category) {
        if (Array.isArray(category)) {
          categories = category.map((c: string) => c);
        } else {
          categories = [String(category)];
        }
      }

      normalized.push({
        title: item.title ?? "Untitled",
        link: item.link ?? "",
        description: item.description,
        pubDate: item.pubDate,
        author: item.author,
        categories,
        guid: item.guid,
      });
    }

    return normalized;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeAtomItems(entries: any): RSSItem[] {
    if (!entries) return [];

    const maxItems = this.params.maxItems ?? DEFAULT_MAX_ITEMS;

    // Ensure it's an array
    const entryArray = Array.isArray(entries) ? entries : [entries];
    const normalized: RSSItem[] = [];

    for (const entry of entryArray) {
      if (normalized.length >= maxItems) break;

      // Atom links can be array or string
      let link = "";
      const linkData = entry.link;
      if (Array.isArray(linkData)) {
        const alternate = linkData.find((l: Record<string, string>) => l["@_rel"] === "alternate");
        link = alternate?.["@_href"] || "";
      } else if (linkData) {
        link = linkData["@_href"] || linkData["#text"] || String(linkData);
      }

      // Handle content:encoded or description
      const description = entry.content?.["#text"]
        ? entry.content["#text"]
        : entry.description;

      normalized.push({
        title: entry.title ?? "Untitled",
        link,
        description,
        pubDate: entry.published || entry.updated,
        author: entry.author?.name,
        guid: entry.id,
      });
    }

    return normalized;
  }

  async execute(signal: AbortSignal): Promise<ToolResult> {
    try {
      const xml = await this.fetchFeed(this.params.url);
      const feed = this.parseRSS(xml);

      const llmContent = JSON.stringify(feed, null, 2);

      const summary = feed.items
        .slice(0, this.params.maxItems ?? DEFAULT_MAX_ITEMS)
        .map((item, i) => {
          const date = item.pubDate ? ` [${item.pubDate.split(" ")[0]}]` : "";
          return `${i + 1}. ${item.title}${date}`;
        })
        .join("\n");

      return {
        llmContent,
        returnDisplay: `## ${feed.title}\n${feed.link}\n\n${feed.description ? feed.description + "\n\n" : ""}### Latest ${feed.items.length} items:\n${summary}`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        llmContent: "",
        returnDisplay: `Error fetching RSS feed: ${message}`,
        error: {
          message,
          type: ToolErrorType.UNKNOWN,
        },
      };
    }
  }
}

/**
 * RSS Tool - Fetch and parse RSS/Atom feeds
 *
 * Provides a unified interface for fetching RSS 2.0, Atom, and RSS 1.0 feeds.
 * Returns structured JSON with feed metadata and items.
 */
export class RSSTool extends BaseDeclarativeTool<RSSToolParams, ToolResult> {
  static readonly Name = ToolNames.RSS as string;
  static readonly description =
    "Fetch and parse RSS/Atom feeds. Supports RSS 2.0, Atom, and RSS 1.0 formats. Returns structured feed data including title, description, and items with titles, links, and publication dates.";

  constructor(private readonly config: Config) {
    super(
      RSSTool.Name,
      "RSS",
      RSSTool.description,
      Kind.Read,
      {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The RSS/Atom feed URL to fetch",
          },
          maxItems: {
            type: "number",
            description: "Maximum number of items to return (default: 25)",
            minimum: 1,
            maximum: 100,
          },
        },
        required: ["url"],
      },
    );
  }

  getName(): string {
    return RSSTool.Name;
  }

  getDescription(): string {
    return RSSTool.description;
  }

  createInvocation(
    params: RSSToolParams,
  ): ToolInvocation<RSSToolParams, ToolResult> {
    return new RSSToolInvocation(this.config, params);
  }
}
