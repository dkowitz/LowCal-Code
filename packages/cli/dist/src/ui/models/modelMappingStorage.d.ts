export type Mappings = Record<string, string>;
export declare function loadMappings(): Promise<Mappings>;
export declare function saveMappings(mappings: Mappings): Promise<void>;
