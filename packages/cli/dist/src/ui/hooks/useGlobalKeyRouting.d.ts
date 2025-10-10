/**
 * Simple hook to allow exclusive capture of stdin events by one component.
 * When locked, other components should avoid processing useInput events.
 */
export declare function useGlobalInputLock(): {
    readonly requestLock: (owner: string) => boolean;
    readonly releaseLock: (owner: string) => boolean;
    readonly isLockedBy: (owner: string) => boolean;
    readonly isLocked: () => boolean;
    readonly whoHasLock: () => string | null;
};
