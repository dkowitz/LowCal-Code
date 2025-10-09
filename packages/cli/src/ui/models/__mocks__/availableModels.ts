export const getLMStudioConfiguredModels = async () => [
  { id: 'lm-default-model', label: 'lm-default-model', configuredContextLength: 131072, matchedRestId: 'lm-default-model', configuredName: 'lm-default-model' }
];
export const getOpenAIAvailableModelFromEnv = () => [];
export const fetchOpenAICompatibleModels = async () => [];
export const getDefaultVisionModel = () => ({ id: 'vision-default', label: 'vision-default' });
export const fetchOpenAIAvailableModels = async () => [];
export type AvailableModel = { id: string; label: string; configuredContextLength?: number; matchedRestId?: string; configuredName?: string };
