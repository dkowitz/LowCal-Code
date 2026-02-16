/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { XMLParser } from "fast-xml-parser";
import { BaseDeclarativeTool, BaseToolInvocation, Kind, } from "./tools.js";
import { ToolErrorType } from "./tool-error.js";
import { ToolNames } from "./tool-names.js";
const RSS_FETCH_TIMEOUT_MS = 15000;
const DEFAULT_MAX_ITEMS = 25;
/**
 * Implementation of the RSS tool invocation logic
 */
class RSSToolInvocation extends BaseToolInvocation {
    parser;
    constructor(_config, params) {
        super(params);
        this.parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: "@_",
        });
    }
    getDescription() {
        return `RSS feed: ${this.params.url}`;
    }
    async fetchFeed(url) {
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
        }
        finally {
            clearTimeout(timeoutId);
        }
    }
    parseRSS(xml) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = this.parser.parse(xml);
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
    parseRSS2(channel) {
        const items = channel.item;
        return {
            title: channel.title ?? "Untitled",
            link: channel.link ?? "",
            description: channel.description,
            items: this.normalizeItems(items),
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    parseAtom(feed) {
        // Atom links can be an array or single object
        let link = "";
        const links = feed.link;
        if (Array.isArray(links)) {
            const alternate = links.find((l) => l["@_rel"] === "alternate");
            link = alternate?.["@_href"] || alternate?.["#text"] || "";
        }
        else if (links) {
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
    parseRSS1(rdf) {
        const channel = rdf.channel;
        const items = rdf.items?.item;
        return {
            title: channel?.title ?? "Untitled",
            link: channel?.link ?? "",
            items: this.normalizeItems(items),
        };
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    normalizeItems(items) {
        if (!items)
            return [];
        const maxItems = this.params.maxItems ?? DEFAULT_MAX_ITEMS;
        // Ensure it's an array
        const itemArray = Array.isArray(items) ? items : [items];
        const normalized = [];
        for (const item of itemArray) {
            if (normalized.length >= maxItems)
                break;
            // Handle both array and single category
            let categories;
            const category = item.category;
            if (category) {
                if (Array.isArray(category)) {
                    categories = category.map((c) => c);
                }
                else {
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
    normalizeAtomItems(entries) {
        if (!entries)
            return [];
        const maxItems = this.params.maxItems ?? DEFAULT_MAX_ITEMS;
        // Ensure it's an array
        const entryArray = Array.isArray(entries) ? entries : [entries];
        const normalized = [];
        for (const entry of entryArray) {
            if (normalized.length >= maxItems)
                break;
            // Atom links can be array or string
            let link = "";
            const linkData = entry.link;
            if (Array.isArray(linkData)) {
                const alternate = linkData.find((l) => l["@_rel"] === "alternate");
                link = alternate?.["@_href"] || "";
            }
            else if (linkData) {
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
    async execute(signal) {
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
        }
        catch (error) {
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
export class RSSTool extends BaseDeclarativeTool {
    config;
    static Name = ToolNames.RSS;
    static description = "Fetch and parse RSS/Atom feeds. Supports RSS 2.0, Atom, and RSS 1.0 formats. Returns structured feed data including title, description, and items with titles, links, and publication dates.";
    constructor(config) {
        super(RSSTool.Name, "RSS", RSSTool.description, Kind.Read, {
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
        });
        this.config = config;
    }
    getName() {
        return RSSTool.Name;
    }
    getDescription() {
        return RSSTool.description;
    }
    createInvocation(params) {
        return new RSSToolInvocation(this.config, params);
    }
}
//# sourceMappingURL=rss.js.map