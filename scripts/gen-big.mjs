import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
for (let i = 1; i <= 200; i++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`Page ${i} / 200`, { x: 60, y: 720, size: 28, font, color: rgb(0.1,0.15,0.4) });
}
writeFileSync("public/big.pdf", await doc.save());
console.log("wrote public/big.pdf");
