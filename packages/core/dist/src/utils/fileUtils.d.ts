/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type { PartUnion } from "@google/genai";
import type { FileSystemService } from "../services/fileSystemService.js";
import { ToolErrorType } from "../tools/tool-error.js";
export declare const DEFAULT_MAX_LINES_TEXT_FILE = 2000;
export declare const DEFAULT_ENCODING: BufferEncoding;
/**
 * Looks up the specific MIME type for a file path.
 * @param filePath Path to the file.
 * @returns The specific MIME type string (e.g., 'text/python', 'application/javascript') or undefined if not found or ambiguous.
 */
export declare function getSpecificMimeType(filePath: string): string | undefined;
/**
 * Checks if a path is within a given root directory.
 * @param pathToCheck The absolute path to check.
 * @param rootDirectory The absolute root directory.
 * @returns True if the path is within the root directory, false otherwise.
 */
export declare function isWithinRoot(pathToCheck: string, rootDirectory: string): boolean;
/**
 * Determines if a file is likely binary based on content sampling.
 * @param filePath Path to the file.
 * @returns Promise that resolves to true if the file appears to be binary.
 */
export declare function isBinaryFile(filePath: string): Promise<boolean>;
/**
 * Detects the type of file based on extension and content.
 * @param filePath Path to the file.
 * @returns Promise that resolves to 'text', 'image', 'pdf', 'audio', 'video', 'binary' or 'svg'.
 */
export declare function detectFileType(filePath: string): Promise<"text" | "image" | "pdf" | "audio" | "video" | "binary" | "svg">;
export interface ProcessedFileReadResult {
    llmContent: PartUnion;
    returnDisplay: string;
    error?: string;
    errorType?: ToolErrorType;
    isTruncated?: boolean;
    originalLineCount?: number;
    linesShown?: [number, number];
}
/**
 * Reads and processes a single file, handling text, images, and PDFs.
 * @param filePath Absolute path to the file.
 * @param rootDirectory Absolute path to the project root for relative path display.
 * @param offset Optional offset for text files (0-based line number).
 * @param limit Optional limit for text files (number of lines to read).
 * @returns ProcessedFileReadResult object.
 */
export declare function processSingleFileContent(filePath: string, rootDirectory: string, fileSystemService: FileSystemService, offset?: number, limit?: number): Promise<ProcessedFileReadResult>;
