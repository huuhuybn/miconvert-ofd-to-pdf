/**
 * Image Renderer
 *
 * Embeds images from OFD resources into PDF pages.
 * Supports PNG and JPEG formats via pdf-lib.
 *
 * Ported from ofdrw Java library (AWTMaker.writeImage).
 */

import { PDFPage, PDFDocument } from 'pdf-lib';
import type { OfdImageObject, OfdImageResource, OfdArchive, ConvertOptions, CT_Matrix } from '../types';
import { readBinaryFile } from '../parser/unzip';

/** Millimeters to PDF points */
const MM_TO_PT = 2.834645669;

/**
 * Calculate image placement using CTM.
 * Ported from ofdrw AWTMaker.writeImage:
 * 1. Scale image to 1x1
 * 2. Apply CTM
 * 3. Apply boundary offset
 */
function calculateImagePlacement(
    boundary: { x: number; y: number; width: number; height: number },
    pageHeight: number,
    ctm?: CT_Matrix,
): { x: number; y: number; width: number; height: number } {
    if (ctm) {
        // With CTM: use the matrix to determine position and size
        // CTM maps from image space (where image is 1x1 after normalization) to OFD space
        const width = Math.abs(ctm.a) * MM_TO_PT;
        const height = Math.abs(ctm.d) * MM_TO_PT;

        // Position from CTM translation + boundary offset
        const x = (boundary.x + ctm.e) * MM_TO_PT;
        const y = (pageHeight - boundary.y - ctm.f) * MM_TO_PT - height;

        return { x, y, width, height };
    }

    // Without CTM: use boundary directly
    return {
        x: boundary.x * MM_TO_PT,
        y: (pageHeight - boundary.y - boundary.height) * MM_TO_PT,
        width: boundary.width * MM_TO_PT,
        height: boundary.height * MM_TO_PT,
    };
}

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
    options: ConvertOptions = {},
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
                    return;
                }
            }
        }

        if (!embeddedImage) return;

        // Calculate placement (with CTM support, ported from ofdrw)
        const placement = calculateImagePlacement(
            imgObj.boundary,
            pageHeight,
            imgObj.ctm,
        );

        // Apply alpha/opacity
        const opacity = imgObj.alpha != null ? imgObj.alpha / 255 : undefined;

        page.drawImage(embeddedImage, {
            x: placement.x,
            y: placement.y,
            width: placement.width,
            height: placement.height,
            opacity,
        });
    } catch {
        // Failed to embed image — skip silently
    }
}
