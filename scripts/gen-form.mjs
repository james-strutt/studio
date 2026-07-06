// Generates public/form-doc.pdf: 4 pages, two text form fields on page 1, and a
// 3-entry bookmark outline (pages 1, 2, 4). Used to eyeball the outline panel
// and the merge form-field/bookmark preservation path.
import { PDFDocument, PDFName, PDFNumber, PDFHexString, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.HelveticaBold);
const pages = [];
for (let i = 1; i <= 4; i++) {
  const page = doc.addPage([595, 842]);
  page.drawText(`Form fixture — page ${i}`, { x: 60, y: 770, size: 24, font, color: rgb(0.1, 0.15, 0.4) });
  pages.push(page);
}

const form = doc.getForm();
const name = form.createTextField("applicant.name");
name.setText("Ada Lovelace");
name.addToPage(pages[0], { x: 60, y: 680, width: 240, height: 24 });
const dept = form.createTextField("applicant.dept");
dept.setText("Analytical Engines");
dept.addToPage(pages[0], { x: 60, y: 630, width: 240, height: 24 });

// Hand-build an outline: Intro (p1) > Details (p2), Appendix (p4).
const ctx = doc.context;
const entries = [
  { title: "Introduction", page: 0, children: [{ title: "Details", page: 1 }] },
  { title: "Appendix", page: 3 },
];
const pageRef = (i) => doc.getPage(i).ref;
const rootRef = ctx.nextRef();

function build(items, parentRef) {
  const refs = items.map(() => ctx.nextRef());
  let total = 0;
  items.forEach((item, i) => {
    const dict = ctx.obj({});
    dict.set(PDFName.of("Title"), PDFHexString.fromText(item.title));
    dict.set(PDFName.of("Parent"), parentRef);
    if (i > 0) dict.set(PDFName.of("Prev"), refs[i - 1]);
    if (i < refs.length - 1) dict.set(PDFName.of("Next"), refs[i + 1]);
    const dest = ctx.obj([]);
    dest.push(pageRef(item.page));
    dest.push(PDFName.of("Fit"));
    dict.set(PDFName.of("Dest"), dest);
    total += 1;
    if (item.children?.length) {
      const c = build(item.children, refs[i]);
      dict.set(PDFName.of("First"), c.first);
      dict.set(PDFName.of("Last"), c.last);
      dict.set(PDFName.of("Count"), PDFNumber.of(c.count));
      total += c.count;
    }
    ctx.assign(refs[i], dict);
  });
  return { first: refs[0], last: refs[refs.length - 1], count: total };
}

const built = build(entries, rootRef);
const root = ctx.obj({});
root.set(PDFName.of("Type"), PDFName.of("Outlines"));
root.set(PDFName.of("First"), built.first);
root.set(PDFName.of("Last"), built.last);
root.set(PDFName.of("Count"), PDFNumber.of(built.count));
ctx.assign(rootRef, root);
doc.catalog.set(PDFName.of("Outlines"), rootRef);

writeFileSync("public/form-doc.pdf", await doc.save());
console.log("wrote public/form-doc.pdf");
