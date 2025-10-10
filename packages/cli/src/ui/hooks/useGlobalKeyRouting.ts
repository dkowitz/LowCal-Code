/**
 * Simple hook to allow exclusive capture of stdin events by one component.
 * When locked, other components should avoid processing useInput events.
 */

const lockRef = { current: null as null | string };

export function useGlobalInputLock() {
  return {
    requestLock: (owner: string) => {
      if (lockRef.current === null) {
        lockRef.current = owner;
        return true;
      }
      return false;
    },
    releaseLock: (owner: string) => {
      if (lockRef.current === owner) {
        lockRef.current = null;
        return true;
      }
      return false;
    },
    isLockedBy: (owner: string) => lockRef.current === owner,
    isLocked: () => lockRef.current !== null,
    whoHasLock: () => lockRef.current,
  } as const;
}
