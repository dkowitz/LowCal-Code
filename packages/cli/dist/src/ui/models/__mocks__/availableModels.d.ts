export declare const getLMStudioConfiguredModels: () => Promise<{
    id: string;
    label: string;
    configuredContextLength: number;
    matchedRestId: string;
    configuredName: string;
}[]>;
export declare const getOpenAIAvailableModelFromEnv: () => never[];
export declare const fetchOpenAICompatibleModels: () => Promise<never[]>;
export declare const getDefaultVisionModel: () => {
    id: string;
    label: string;
};
export declare const fetchOpenAIAvailableModels: () => Promise<never[]>;
export type AvailableModel = {
    id: string;
    label: string;
    configuredContextLength?: number;
    matchedRestId?: string;
    configuredName?: string;
};
