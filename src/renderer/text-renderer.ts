/**
 * Text Renderer
 *
 * Converts OFD TextObject elements into PDF text operations.
 * Handles positioning, font size mapping, CTM transformation, DeltaY, and color.
 *
 * Ported from ofdrw Java library (PointUtil.calPdfTextCoordinate / ItextMaker.writeText).
 */

import { PDFPage, PDFFont, rgb } from 'pdf-lib';
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
 * Apply CTM to a point in OFD coordinate space.
 * The CTM is [a b c d e f] where:
 *   x' = a*x + c*y + e
 *   y' = b*x + d*y + f
 */
function applyCTM(
    ctm: CT_Matrix,
    x: number,
    y: number,
): { x: number; y: number } {
    return {
        x: ctm.a * x + ctm.c * y + ctm.e,
        y: ctm.b * x + ctm.d * y + ctm.f,
    };
}

/**
 * Decode HTML entities in text content.
 * Ported from ofdrw PointUtil.calPdfTextCoordinate.
 */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&copy;/g, '©')
        .replace(/\n/g, '');
}

/**
 * Apply CTM to a delta offset.
 * Ported from ofdrw PointUtil: when there's rotation, apply CTM to deltas.
 */
function applyCTMToDelta(
    dx: number, dy: number,
    ctm: CT_Matrix,
): { dx: number; dy: number } {
    const angle = Math.atan2(-ctm.b, ctm.d);

    let resultDx = dx;
    let resultDy = dy;

    if (dx !== 0) {
        if (angle === 0) {
            // No rotation: apply CTM to horizontal delta
            const p = applyCTM(ctm, dx, 0);
            resultDx = p.x;
        }
        // If rotated, keep original delta
    }

    if (dy !== 0) {
        if (angle === 0) {
            // No rotation: apply CTM to vertical delta
            const p = applyCTM(ctm, 0, dy);
            resultDy = p.y;
        }
        // If rotated, keep original delta
    }

    return { dx: resultDx, dy: resultDy };
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
    const { boundary, textCodes, size, fillColor, ctm, alpha } = textObj;

    // Convert font size from mm to points
    let fontSize = size * MM_TO_PT;

    // If there's a CTM, apply font scaling from the matrix
    if (ctm) {
        const scaleY = Math.sqrt(ctm.b * ctm.b + ctm.d * ctm.d);
        if (scaleY > 0) {
            fontSize = size * scaleY * MM_TO_PT;
        }
    }

    const color = colorToRgb(fillColor);
    const opacity = alpha != null ? alpha / 255 : undefined;

    for (const tc of textCodes) {
        if (!tc.text) continue;

        // Decode HTML entities (ported from ofdrw)
        const text = decodeHtmlEntities(tc.text);
        if (!text) continue;

        // Calculate text position in OFD space (mm)
        let textX = tc.x ?? 0;
        let textY = tc.y ?? 0;

        // Apply CTM transformation to position if present
        if (ctm) {
            const transformed = applyCTM(ctm, textX, textY);
            textX = transformed.x;
            textY = transformed.y;
        }

        // Convert to PDF coordinates (add boundary offset, flip Y axis)
        const startX = (boundary.x + textX) * MM_TO_PT;
        const startY = (pageHeight - boundary.y - textY) * MM_TO_PT;

        const hasDeltaX = tc.deltaX && tc.deltaX.length > 0;
        const hasDeltaY = tc.deltaY && tc.deltaY.length > 0;

        if (hasDeltaX || hasDeltaY) {
            // Draw characters individually with delta spacing (X and/or Y)
            let currentX = startX;
            let currentY = startY;
            const chars = [...text]; // Handle Unicode correctly

            for (let i = 0; i < chars.length; i++) {
                const char = chars[i];

                try {
                    page.drawText(char, {
                        x: currentX,
                        y: currentY - fontSize,
                        size: fontSize,
                        font,
                        color,
                        opacity,
                    });
                } catch {
                    // Character not in font — draw placeholder
                    page.drawText('?', {
                        x: currentX,
                        y: currentY - fontSize,
                        size: fontSize,
                        font,
                        color,
                        opacity,
                    });
                }

                // Apply deltas for next character
                let rawDx = 0;
                let rawDy = 0;

                if (hasDeltaX && tc.deltaX) {
                    const dxIndex = Math.min(i, tc.deltaX.length - 1);
                    rawDx = tc.deltaX[dxIndex] ?? 0;
                } else {
                    rawDx = fontSize * 0.6 / MM_TO_PT; // Estimated character width in mm
                }

                if (hasDeltaY && tc.deltaY) {
                    const dyIndex = Math.min(i, tc.deltaY.length - 1);
                    rawDy = tc.deltaY[dyIndex] ?? 0;
                }

                // Apply CTM to deltas if present (ported from ofdrw)
                if (ctm) {
                    const adjusted = applyCTMToDelta(rawDx, rawDy, ctm);
                    rawDx = adjusted.dx;
                    rawDy = adjusted.dy;
                }

                currentX += rawDx * MM_TO_PT;
                // DeltaY goes in the same direction as Y in OFD space (top-down),
                // but PDF Y is bottom-up, so we subtract
                currentY -= rawDy * MM_TO_PT;
            }
        } else {
            // Draw entire text string at once
            try {
                page.drawText(text, {
                    x: startX,
                    y: startY - fontSize,
                    size: fontSize,
                    font,
                    color,
                    opacity,
                });
            } catch {
                // Fallback: draw character by character, replacing unsupported ones
                const chars = [...text];
                let currentX = startX;
                for (const char of chars) {
                    try {
                        page.drawText(char, {
                            x: currentX,
                            y: startY - fontSize,
                            size: fontSize,
                            font,
                            color,
                            opacity,
                        });
                    } catch {
                        page.drawText('?', {
                            x: currentX,
                            y: startY - fontSize,
                            size: fontSize,
                            font,
                            color,
                            opacity,
                        });
                    }
                    currentX += fontSize * 0.6;
                }
            }
        }
    }
}
