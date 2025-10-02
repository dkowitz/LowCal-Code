/**
 * @license
 * Copyright 2025 Qwen
 * SPDX-License-Identifier: Apache-2.0
 */
import { EventEmitter } from 'events';
export var SubAgentEventType;
(function (SubAgentEventType) {
    SubAgentEventType["START"] = "start";
    SubAgentEventType["ROUND_START"] = "round_start";
    SubAgentEventType["ROUND_END"] = "round_end";
    SubAgentEventType["STREAM_TEXT"] = "stream_text";
    SubAgentEventType["TOOL_CALL"] = "tool_call";
    SubAgentEventType["TOOL_RESULT"] = "tool_result";
    SubAgentEventType["TOOL_WAITING_APPROVAL"] = "tool_waiting_approval";
    SubAgentEventType["FINISH"] = "finish";
    SubAgentEventType["ERROR"] = "error";
})(SubAgentEventType || (SubAgentEventType = {}));
export class SubAgentEventEmitter {
    ee = new EventEmitter();
    on(event, listener) {
        this.ee.on(event, listener);
    }
    off(event, listener) {
        this.ee.off(event, listener);
    }
    emit(event, payload) {
        this.ee.emit(event, payload);
    }
}
//# sourceMappingURL=subagent-events.js.map