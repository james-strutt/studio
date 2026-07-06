import type { PDFDocumentProxy } from "pdfjs-dist";
import { destToPageIndex } from "@/editors/pdf/pdfDest";
import type { MergeOutlineItem } from "@/editors/pdf/pdfMutations";

interface RawOutlineNode {
  title: string;
  dest: string | unknown[] | null;
  items: RawOutlineNode[];
}

/**
 * Resolve a pdf.js document's outline into the page-index tree that mergeDocs
 * expects. pdf.js handles named-destination resolution for us; unresolvable
 * destinations become `pageIndex: null` (bookmark kept, no jump target).
 */
export async function resolveOutlineTree(doc: PDFDocumentProxy): Promise<MergeOutlineItem[]> {
  const outline = (await doc.getOutline()) as RawOutlineNode[] | null;
  if (!outline) return [];
  const walk = async (nodes: RawOutlineNode[]): Promise<MergeOutlineItem[]> => {
    const out: MergeOutlineItem[] = [];
    for (const n of nodes) {
      out.push({
        title: n.title,
        pageIndex: await destToPageIndex(doc, n.dest),
        children: await walk(n.items ?? []),
      });
    }
    return out;
  };
  return walk(outline);
}
