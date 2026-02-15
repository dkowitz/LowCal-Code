/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export interface SessionMailboxMessage {
    to_session_id?: string;
    from_session_id?: string;
    from_task_id?: string;
    job_id?: string;
    status?: "success" | "error";
    timestamp?: string;
    prompt_preview?: string;
    preview?: string;
    output_path?: string;
    return_payload?: string;
    result_file_path?: string;
}
export declare function getMailboxPath(baseDir: string, sessionId: string): string;
export declare function readMailboxMessages(mailboxPath: string): Promise<SessionMailboxMessage[]>;
export declare function clearMailboxMessages(mailboxPath: string): Promise<void>;
export declare function toMessageTimestampMs(message: SessionMailboxMessage): number;
export declare function sortMailboxMessages(messages: SessionMailboxMessage[]): SessionMailboxMessage[];
export declare function summarizeMailboxPayload(message: SessionMailboxMessage, maxLength?: number): string;
export declare function mailboxMessageTaskId(message: SessionMailboxMessage): string;
export declare function loadMailboxPayloadText(message: SessionMailboxMessage): Promise<string>;
export declare function resolveMailboxSelection(messages: SessionMailboxMessage[], selector: string): {
    message: SessionMailboxMessage;
    index: number;
} | null;
