/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export class IdleStreamTimeoutError extends Error {
  constructor(
    readonly idleMs: number,
    message: string = `Stream idle for ${idleMs}ms`,
  ) {
    super(message);
    this.name = 'IdleStreamTimeoutError';
  }
}
