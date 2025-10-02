/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
export class IdleStreamTimeoutError extends Error {
    idleMs;
    constructor(idleMs, message = `Stream idle for ${idleMs}ms`) {
        super(message);
        this.idleMs = idleMs;
        this.name = 'IdleStreamTimeoutError';
    }
}
//# sourceMappingURL=networkErrors.js.map