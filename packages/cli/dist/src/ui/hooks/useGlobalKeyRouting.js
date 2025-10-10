/**
 * Simple hook to allow exclusive capture of stdin events by one component.
 * When locked, other components should avoid processing useInput events.
 */
const lockRef = { current: null };
export function useGlobalInputLock() {
    return {
        requestLock: (owner) => {
            if (lockRef.current === null) {
                lockRef.current = owner;
                return true;
            }
            return false;
        },
        releaseLock: (owner) => {
            if (lockRef.current === owner) {
                lockRef.current = null;
                return true;
            }
            return false;
        },
        isLockedBy: (owner) => lockRef.current === owner,
        isLocked: () => lockRef.current !== null,
        whoHasLock: () => lockRef.current,
    };
}
//# sourceMappingURL=useGlobalKeyRouting.js.map