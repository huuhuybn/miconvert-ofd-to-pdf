/**
 * Text Renderer
 *
 * Converts OFD TextObject elements into PDF text operations.
 * Handles positioning, font size mapping, and color.
 */

import { PDFPage, PDFFont, rgb, degrees } from 'pdf-lib';
import type { OfdTextObject, CT_Color, CT_Matrix } from '../types';

/** Millimeters to PDF points conversion factor */
const MM_TO_PT = 2.834645669;

/**
 * Parse OFD color value "R G B" (0-255) to pdf-lib rgb (0-1)
 */
export function colorToRgb(color?: CT_Color) {
    if (!color?.value) return rgb(0, 0, 0); // Default black

    const parts = color.value.trim().split(/\s+/).map(Number);
    return rgb(
        (parts[0] ?? 0) / 255,
        (parts[1] ?? 0) / 255,
        (parts[2] ?? 0) / 255,
    );
}

/**
 * Render a TextObject onto a PDF page.
 */
export function renderTextObject(
    page: PDFPage,
    textObj: OfdTextObject,
    font: PDFFont,
    pageHeight: number,
): void {
    const { boundary, textCodes, size, fillColor, ctm } = textObj;

    // Convert font size from mm to points
    let fontSize = size * MM_TO_PT;

    // If there's a CTM, apply font scaling from the matrix
    if (ctm) {
        // The font size is scaled by the matrix's vertical scale factor
        const scaleY = Math.sqrt(ctm.b * ctm.b + ctm.d * ctm.d);
        if (scaleY > 0) {
            fontSize = size * scaleY * MM_TO_PT;
        }
    }

    const color = colorToRgb(fillColor);

    for (const tc of textCodes) {
        if (!tc.text) continue;

        // Calculate starting position
        const startX = ((boundary.x) + (tc.x ?? 0)) * MM_TO_PT;
        // PDF Y-axis is bottom-up, OFD is top-down
        const startY = (pageHeight - (boundary.y) - (tc.y ?? 0)) * MM_TO_PT;

        if (tc.deltaX && tc.deltaX.length > 0) {
            // Draw characters individually with delta spacing
            let currentX = startX;
            const chars = [...tc.text]; // Handle Unicode correctly

            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];

                try {
                    page.drawText(char, {
                        x: currentX,
                        y: startY - fontSize, // Adjust for baseline
                        size: fontSize,
                        font,
                        color,
                    });
                } catch {
                    // Character not in font — draw placeholder
                    page.drawText('?', {
                        x: currentX,
                        y: startY - fontSize,
                        size: fontSize,
                        font,
                        color,
                    });
                }

                // Apply delta for next character
                if (i < tc.deltaX.length) {
                    currentX += tc.deltaX[i] * MM_TO_PT;
                } else if (tc.deltaX.length > 0) {
                    // Reuse last delta
                    currentX += tc.deltaX[tc.deltaX.length - 1] * MM_TO_PT;
                } else {
                    currentX += fontSize * 0.6; // Estimated character width
                }
            }
        } else {
            // Draw entire text string at once
            try {
                page.drawText(tc.text, {
                    x: startX,
                    y: startY - fontSize,
                    size: fontSize,
                    font,
                    color,
                });
            } catch {
                // Fallback: draw character by character, replacing unsupported ones
                const chars = [...tc.text];
                let currentX = startX;
                for (const char of chars) {
                    try {
                        page.drawText(char, {
                            x: currentX,
                            y: startY - fontSize,
                            size: fontSize,
                            font,
                            color,
                        });
                    } catch {
                        page.drawText('?', {
                            x: currentX,
                            y: startY - fontSize,
                            size: fontSize,
                            font,
                            color,
                        });
                    }
                    currentX += fontSize * 0.6;
                }
            }
        }
    }
}
