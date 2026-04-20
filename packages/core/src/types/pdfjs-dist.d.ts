declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  export const GlobalWorkerOptions: {
    workerSrc?: string;
  };
  export const VerbosityLevel: {
    ERRORS: number;
    WARNINGS: number;
    INFOS: number;
  };
  export function getDocument(src: unknown): {
    promise: Promise<{
      annotationStorage: {
        setValue(id: string, value: unknown): void;
      };
      getFieldObjects(): Promise<unknown>;
      saveDocument(): Promise<Uint8Array>;
    }>;
    destroy(): Promise<void>;
  };
}
