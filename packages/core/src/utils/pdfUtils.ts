/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

type TextItem = { str: string; transform: number[] };
type TextContent = { items: TextItem[] };
type OperatorList = { fnArray: number[] };
type PdfPage = {
  getTextContent: (options: {
    normalizeWhitespace: boolean;
    disableCombineTextItems: boolean;
  }) => Promise<TextContent>;
  getOperatorList?: () => Promise<OperatorList>;
};
type PdfDocument = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPage>;
  destroy: () => void;
};
type PdfLoadingTask = { promise: Promise<PdfDocument> };
type PdfjsModule = {
  getDocument: (options: {
    data: Buffer | Uint8Array;
    disableWorker: boolean;
  }) => PdfLoadingTask;
  OPS?: Record<string, number>;
};

async function loadPdfjs(): Promise<PdfjsModule | null> {
  try {
    const mod = (await import(
      "pdfjs-dist/legacy/build/pdf.mjs"
    )) as unknown as {
      default?: PdfjsModule;
      getDocument?: PdfjsModule["getDocument"];
      OPS?: Record<string, number>;
    };
    if (mod?.getDocument) {
      return mod as PdfjsModule;
    }
    if (mod?.default?.getDocument) {
      return { ...mod.default, OPS: mod.OPS };
    }
    return null;
  } catch (_error) {
    return null;
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`PDF parsing timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

export type ParsedPdfPage = {
  pageNumber: number;
  text: string;
  hasText: boolean;
  hasImages: boolean;
};

export async function parsePdfBuffer(
  buffer: Buffer,
  options: { maxPages: number; timeoutMs: number },
): Promise<{ text: string; pages: ParsedPdfPage[]; pageCount: number }> {
  const pdfjs = await loadPdfjs();
  if (!pdfjs) {
    throw new Error("PDF parsing module is not available");
  }

  const parseTask = async (): Promise<{
    text: string;
    pages: ParsedPdfPage[];
    pageCount: number;
  }> => {
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      disableWorker: true,
    });
    const doc = await loadingTask.promise;
    try {
      const pageCount =
        options.maxPages > 0
          ? Math.min(options.maxPages, doc.numPages)
          : doc.numPages;
      const pages: ParsedPdfPage[] = [];
      const imageOps = new Set<number>();
      const ops = pdfjs.OPS || {};
      const imageOpKeys = [
        "paintImageXObject",
        "paintImageMaskXObject",
        "paintInlineImageXObject",
        "paintImageXObjectRepeat",
        "paintImageMaskXObjectRepeat",
        "paintInlineImageXObjectGroup",
        "paintImageMaskXObjectGroup",
        "paintSolidColorImageMask",
        "beginInlineImage",
        "beginImageData",
        "endInlineImage",
      ];
      for (const key of imageOpKeys) {
        const op = ops[key];
        if (typeof op === "number") {
          imageOps.add(op);
        }
      }

      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        const textContent = await page.getTextContent({
          normalizeWhitespace: false,
          disableCombineTextItems: false,
        });
        let lastY: number | undefined;
        let pageText = "";
        for (const item of textContent.items) {
          if (lastY === undefined || lastY === item.transform[5]) {
            pageText += item.str;
          } else {
            pageText += `\n${item.str}`;
          }
          lastY = item.transform[5];
        }
        const hasText = textContent.items.some((item) => item.str?.trim());
        let hasImages = false;
        if (page.getOperatorList && imageOps.size > 0) {
          try {
            const operatorList = await page.getOperatorList();
            hasImages = operatorList.fnArray.some((op) => imageOps.has(op));
          } catch (_error) {
            hasImages = false;
          }
        }
        pages.push({
          pageNumber,
          text: pageText,
          hasText,
          hasImages,
        });
      }
      return { text: pages.map((p) => p.text).join("\n\n"), pages, pageCount };
    } finally {
      doc.destroy();
    }
  };

  return withTimeout(parseTask(), options.timeoutMs);
}
