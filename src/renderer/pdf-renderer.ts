/**
 * PDF Renderer (Main Orchestrator)
 *
 * Coordinates the conversion of a parsed OFD document into a PDF.
 * Iterates pages → layers → objects, dispatching to specialized renderers.
 */

import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import type { OfdDocument, OfdArchive, ConvertOptions, OfdFont } from '../types';
import { renderTextObject, colorToRgb } from './text-renderer';
import { renderPathObject } from './path-renderer';
import { renderImageObject } from './image-renderer';

/** Millimeters to PDF points */
const MM_TO_PT = 2.834645669;

/**
 * Map an OFD font name to the best available standard PDF font.
 *
 * Since pdf-lib only supports the 14 standard PDF fonts natively,
 * we map common Chinese/OFD font names to reasonable fallbacks.
 * Full CJK font embedding would require a custom font file.
 */
function mapToStandardFont(ofdFont: OfdFont | undefined): StandardFonts {
    if (!ofdFont) return StandardFonts.Helvetica;

    const name = (ofdFont.name || '').toLowerCase();

    // Common Chinese font names → best standard fallback
    if (name.includes('song') || name.includes('宋') || name.includes('simsun')) {
        return ofdFont.bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
    }
    if (name.includes('hei') || name.includes('黑') || name.includes('simhei')) {
        return ofdFont.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
    }
    if (name.includes('kai') || name.includes('楷') || name.includes('kaiti')) {
        return ofdFont.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman;
    }
    if (name.includes('fang') || name.includes('仿') || name.includes('fangsong')) {
        return StandardFonts.TimesRoman;
    }
    if (name.includes('courier') || name.includes('mono') || ofdFont.fixedWidth) {
        return ofdFont.bold ? StandardFonts.CourierBold : StandardFonts.Courier;
    }
    if (name.includes('times') || name.includes('serif') || ofdFont.serif) {
        if (ofdFont.bold && ofdFont.italic) return StandardFonts.TimesRomanBoldItalic;
        if (ofdFont.bold) return StandardFonts.TimesRomanBold;
        if (ofdFont.italic) return StandardFonts.TimesRomanItalic;
        return StandardFonts.TimesRoman;
    }

    // Default
    if (ofdFont.bold && ofdFont.italic) return StandardFonts.HelveticaBoldOblique;
    if (ofdFont.bold) return StandardFonts.HelveticaBold;
    if (ofdFont.italic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
}

/**
 * Render a parsed OFD document to a PDF.
 *
 * @param doc - Parsed OFD document structure
 * @param archive - Original OFD archive (for reading images/fonts)
 * @param options - Conversion options
 * @returns PDF as Uint8Array
 */
export async function renderToPdf(
    doc: OfdDocument,
    archive: OfdArchive,
    options: ConvertOptions = {},
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    // Set PDF metadata
    pdfDoc.setTitle('Converted from OFD');
    pdfDoc.setProducer('ofd-to-pdf by Antigravity | miconvert.com');
    pdfDoc.setCreator('ofd-to-pdf (https://github.com/AntGravity/ofd-to-pdf)');

    // Pre-load fonts (map OFD font IDs → PDF fonts)
    const fontCache = new Map<string, PDFFont>();
    const defaultFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const [fontId, ofdFont] of doc.fonts) {
        const stdFont = mapToStandardFont(ofdFont);
        try {
            const pdfFont = await pdfDoc.embedFont(stdFont);
            fontCache.set(fontId, pdfFont);
        } catch {
            fontCache.set(fontId, defaultFont);
        }
    }

    // Render each page
    for (const ofdPage of doc.pages) {
        const pageArea = ofdPage.area ?? doc.physicalBox;
        const pageWidth = pageArea.width * MM_TO_PT;
        const pageHeight = pageArea.height * MM_TO_PT;

        const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

        // Render each layer
        for (const layer of ofdPage.layers) {
            for (const obj of layer.objects) {
                switch (obj.type) {
                    case 'text': {
                        const font = fontCache.get(obj.font) ?? defaultFont;
                        renderTextObject(pdfPage, obj, font, pageArea.height);
                        break;
                    }

                    case 'path': {
                        renderPathObject(pdfPage, obj, pageArea.height);
                        break;
                    }

                    case 'image': {
                        const imageResource = doc.images.get(obj.resourceId);
                        await renderImageObject(
                            pdfPage,
                            pdfDoc,
                            obj,
                            imageResource,
                            archive,
                            pageArea.height,
                        );
                        break;
                    }
                }
            }
        }

        // Add watermark if requested
        if (options.watermark) {
            const watermarkFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
            const watermarkText = 'Powered by Antigravity | miconvert.com';
            const watermarkSize = 8;
            const textWidth = watermarkFont.widthOfTextAtSize(watermarkText, watermarkSize);

            pdfPage.drawText(watermarkText, {
                x: pageWidth - textWidth - 10,
                y: 10,
                size: watermarkSize,
                font: watermarkFont,
                color: rgb(0.75, 0.75, 0.75),
                opacity: 0.5,
            });
        }
    }

    return pdfDoc.save();
}
