/**
 * Image Renderer
 *
 * Embeds images from OFD resources into PDF pages.
 * Supports PNG and JPEG formats via pdf-lib.
 */

import { PDFPage, PDFDocument } from 'pdf-lib';
import type { OfdImageObject, OfdImageResource, OfdArchive } from '../types';
import { readBinaryFile } from '../parser/unzip';

/** Millimeters to PDF points */
const MM_TO_PT = 2.834645669;

/**
 * Render an ImageObject onto a PDF page.
 */
export async function renderImageObject(
    page: PDFPage,
    pdfDoc: PDFDocument,
    imgObj: OfdImageObject,
    imageResource: OfdImageResource | undefined,
    archive: OfdArchive,
    pageHeight: number,
): Promise<void> {
    if (!imageResource) return;

    // Read image data from archive
    const imageData = readBinaryFile(archive, imageResource.path);
    if (!imageData) return;

    try {
        let embeddedImage;

        const format = imageResource.format.toUpperCase();
        if (format === 'PNG') {
            embeddedImage = await pdfDoc.embedPng(imageData);
        } else if (format === 'JPG' || format === 'JPEG' || format === 'JPC') {
            embeddedImage = await pdfDoc.embedJpg(imageData);
        } else {
            // Try PNG first, then JPEG
            try {
                embeddedImage = await pdfDoc.embedPng(imageData);
            } catch {
                try {
                    embeddedImage = await pdfDoc.embedJpg(imageData);
                } catch {
                    // Unsupported format — skip
                    return;
                }
            }
        }

        if (!embeddedImage) return;

        const { boundary } = imgObj;

        // Calculate position and size in PDF points
        const x = boundary.x * MM_TO_PT;
        const y = (pageHeight - boundary.y - boundary.height) * MM_TO_PT;
        const width = boundary.width * MM_TO_PT;
        const height = boundary.height * MM_TO_PT;

        page.drawImage(embeddedImage, {
            x,
            y,
            width,
            height,
        });
    } catch {
        // Failed to embed image — skip silently
    }
}
