export const getOpenAIAvailableModelFromEnv = () => null;
export const fetchOpenAICompatibleModels = async () => [];
export const getDefaultVisionModel = () => "vision-default";
export const fetchOpenAIAvailableModels = async () => [];
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
