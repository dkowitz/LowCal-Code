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
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value
        : null;
}
function valueToString(value) {
    if (typeof value === "string") {
        return value;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return undefined;
}
function toRecordArray(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((item) => asRecord(item))
        .filter((item) => !!item);
}
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
        const parsed = asRecord(this.parser.parse(xml));
        if (!parsed) {
            throw new Error("Unknown feed format");
        }
        // Handle RSS 2.0
        const rss = asRecord(parsed["rss"]);
        if (rss?.["channel"]) {
            return this.parseRSS2(rss["channel"]);
        }
        // Handle Atom
        if (parsed["feed"]) {
            return this.parseAtom(parsed["feed"]);
        }
        // Handle RSS 1.0 (RDF)
        if (parsed["rdf:RDF"]) {
            return this.parseRSS1(parsed["rdf:RDF"]);
        }
        throw new Error("Unknown feed format");
    }
    parseRSS2(channel) {
        const channelRecord = asRecord(channel) ?? {};
        const items = channelRecord["item"];
        return {
            title: valueToString(channelRecord["title"]) ?? "Untitled",
            link: valueToString(channelRecord["link"]) ?? "",
            description: valueToString(channelRecord["description"]),
            items: this.normalizeItems(items),
        };
    }
    parseAtom(feed) {
        const feedRecord = asRecord(feed) ?? {};
        // Atom links can be an array or single object
        let link = "";
        const links = feedRecord["link"];
        if (Array.isArray(links)) {
            const alternate = toRecordArray(links).find((l) => valueToString(l["@_rel"]) === "alternate");
            link =
                valueToString(alternate?.["@_href"]) ??
                    valueToString(alternate?.["#text"]) ??
                    "";
        }
        else if (links) {
            const linksRecord = asRecord(links);
            link =
                valueToString(linksRecord?.["@_href"]) ??
                    valueToString(linksRecord?.["#text"]) ??
                    valueToString(links) ??
                    "";
        }
        const entries = feedRecord["entry"];
        return {
            title: valueToString(feedRecord["title"]) ?? "Untitled",
            link,
            description: valueToString(feedRecord["subtitle"]),
            items: this.normalizeAtomItems(entries),
        };
    }
    parseRSS1(rdf) {
        const rdfRecord = asRecord(rdf) ?? {};
        const channel = asRecord(rdfRecord["channel"]) ?? {};
        const items = asRecord(rdfRecord["items"])?.["item"];
        return {
            title: valueToString(channel["title"]) ?? "Untitled",
            link: valueToString(channel["link"]) ?? "",
            items: this.normalizeItems(items),
        };
    }
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
            const itemRecord = asRecord(item) ?? {};
            // Handle both array and single category
            let categories;
            const category = itemRecord["category"];
            if (category) {
                if (Array.isArray(category)) {
                    categories = category
                        .map((c) => valueToString(c))
                        .filter((c) => typeof c === "string");
                }
                else {
                    const categoryValue = valueToString(category);
                    categories = categoryValue ? [categoryValue] : undefined;
                }
            }
            normalized.push({
                title: valueToString(itemRecord["title"]) ?? "Untitled",
                link: valueToString(itemRecord["link"]) ?? "",
                description: valueToString(itemRecord["description"]),
                pubDate: valueToString(itemRecord["pubDate"]),
                author: valueToString(itemRecord["author"]),
                categories,
                guid: valueToString(itemRecord["guid"]),
            });
        }
        return normalized;
    }
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
            const entryRecord = asRecord(entry) ?? {};
            // Atom links can be array or string
            let link = "";
            const linkData = entryRecord["link"];
            if (Array.isArray(linkData)) {
                const alternate = toRecordArray(linkData).find((l) => valueToString(l["@_rel"]) === "alternate");
                link = valueToString(alternate?.["@_href"]) ?? "";
            }
            else if (linkData) {
                const linkRecord = asRecord(linkData);
                link =
                    valueToString(linkRecord?.["@_href"]) ??
                        valueToString(linkRecord?.["#text"]) ??
                        valueToString(linkData) ??
                        "";
            }
            // Handle content:encoded or description
            const content = asRecord(entryRecord["content"]);
            const description = valueToString(content?.["#text"]) ??
                valueToString(entryRecord["description"]);
            const author = asRecord(entryRecord["author"]);
            normalized.push({
                title: valueToString(entryRecord["title"]) ?? "Untitled",
                link,
                description,
                pubDate: valueToString(entryRecord["published"]) ??
                    valueToString(entryRecord["updated"]),
                author: valueToString(author?.["name"]),
                guid: valueToString(entryRecord["id"]),
            });
        }
        return normalized;
    }
    async execute(_signal) {
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