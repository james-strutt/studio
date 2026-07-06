import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync, mkdirSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 30; i++) {
  const page = doc.addPage([595, 842]);
  page.drawText("Studio sample", { x: 60, y: 760, size: 36, font, color: rgb(0.1, 0.15, 0.4) });
  page.drawText(`Page ${i} of 30`, { x: 60, y: 700, size: 24, font, color: rgb(0.2, 0.2, 0.2) });
  page.drawRectangle({ x: 60, y: 120, width: 475, height: 540, borderColor: rgb(0.7, 0.5, 0.05), borderWidth: 2 });
}
mkdirSync("public", { recursive: true });
writeFileSync("public/sample.pdf", await doc.save());
console.log("wrote public/sample.pdf");
