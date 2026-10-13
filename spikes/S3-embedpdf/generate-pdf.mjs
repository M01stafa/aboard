import { PDFDocument, rgb, StandardFonts } from "@cantoo/pdf-lib";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generate50MbPdf() {
  console.log("Generating ~50 MB test PDF...");
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  // Create an image or raw streams to build realistic bulk
  // We'll create a 2000x2000 PNG image pattern
  // Or multiple pages with embedded data streams
  // Let's create a solid PNG or embed multiple pages with high-resolution drawings
  
  // Create a raw 10MB JPEG or PNG buffer
  // Better yet, generate 50 pages each with realistic medical/engineering content
  // and an embedded PNG stream to hit ~50 MB
  
  // Let's create a 1MB PNG chunk
  // Simple 1024x1024 PNG with uncompressible noise/patterns
  const width = 1000;
  const height = 1000;
  // A raw PNG with 1000x1000 pixels is ~3-4 MB
  // Let's create a minimal valid PNG using raw chunks or canvas, or create 10 distinct pages with attached streams
  
  // Alternatively, embed text and metadata chunks:
  // In PDF, we can attach streams or pages with text and graphics.
  // Let's create pages with content:
  const targetBytes = 50 * 1024 * 1024; // 50 MB
  
  // Create 100 pages with diagrams and text
  const pagesCount = 50;
  console.log(`Creating ${pagesCount} pages...`);

  // To make the file ~50 MB without taking 10 minutes to compute:
  // We can create a base page, and add an uncompressed stream / attachment or large stream to each page
  for (let i = 0; i < pagesCount; i++) {
    const page = pdfDoc.addPage([595.28, 841.89]); // A4
    page.drawText(`Aboard Medical & Engineering Study Document — Page ${i + 1}`, {
      x: 50,
      y: 800,
      size: 16,
      font,
      color: rgb(0.1, 0.2, 0.5),
    });

    page.drawText(`Circuits & Anatomy Section ${i + 1}: Detailed schematic analysis and pathological notes.`, {
      x: 50,
      y: 770,
      size: 11,
      font: regularFont,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Draw some vector elements (circuit lines and anatomical boxes)
    for (let j = 0; j < 20; j++) {
      page.drawRectangle({
        x: 50 + (j % 5) * 100,
        y: 600 - Math.floor(j / 5) * 80,
        width: 80,
        height: 60,
        borderColor: rgb(0.3, 0.5, 0.7),
        borderWidth: 1.5,
      });
      page.drawText(`Unit ${j + 1}`, {
        x: 60 + (j % 5) * 100,
        y: 625 - Math.floor(j / 5) * 80,
        size: 10,
        font: regularFont,
      });
    }
  }

  const remainingBytes = 50 * 1024 * 1024;
  console.log(`Adding bulk payload stream of ${(remainingBytes / (1024 * 1024)).toFixed(1)} MB...`);
  const crypto = await import("node:crypto");
  const bulkBuffer = crypto.randomBytes(remainingBytes);

  await pdfDoc.attach(bulkBuffer, "study_dataset_imaging.bin", {
    mimeType: "application/octet-stream",
    description: "High-resolution anatomical scan raw telemetry",
    creationDate: new Date(),
    modificationDate: new Date(),
  });

  const pdfBytes = await pdfDoc.save();
  const outDir = path.join(__dirname, "public");
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "test-50mb.pdf");
  fs.writeFileSync(outFile, pdfBytes);

  const stats = fs.statSync(outFile);
  console.log(`Success! Written: ${outFile}`);
  console.log(`File size: ${(stats.size / (1024 * 1024)).toFixed(2)} MB (${stats.size} bytes)`);
}

generate50MbPdf().catch((err) => {
  console.error("Error generating PDF:", err);
  process.exit(1);
});
