/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { useCallback, useEffect, useRef } from "react";
import { useKeypressContext } from "../contexts/KeypressContext.js";
/**
 * A hook that listens for keypress events from stdin.
 *
 * @param onKeypress - The callback function to execute on each keypress.
 * @param options - Options to control the hook's behavior.
 * @param options.isActive - Whether the hook should be actively listening for input.
 */
export function useKeypress(onKeypress, { isActive }) {
    const { subscribe, unsubscribe } = useKeypressContext();
    const onKeypressRef = useRef(onKeypress);
    useEffect(() => {
        onKeypressRef.current = onKeypress;
    }, [onKeypress]);
    const stableHandler = useCallback((key) => {
        onKeypressRef.current(key);
    }, []);
    useEffect(() => {
        if (!isActive) {
            return;
        }
        subscribe(stableHandler);
        return () => {
            unsubscribe(stableHandler);
        };
    }, [isActive, stableHandler, subscribe, unsubscribe]);
}
//# sourceMappingURL=useKeypress.js.map