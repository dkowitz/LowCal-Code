export declare const getOpenAIAvailableModelFromEnv: () => null;
export declare const fetchOpenAICompatibleModels: () => Promise<never[]>;
export declare const getDefaultVisionModel: () => string;
export declare const fetchOpenAIAvailableModels: () => Promise<never[]>;
export type AvailableModel = {
    id: string;
    label: string;
    inputPrice?: string;
    outputPrice?: string;
    contextLength?: number;
    maxContextLength?: number;
    quantization?: string;
    modelType?: string;
    capabilities?: string[];
    state?: string;
    isVision?: boolean;
};
