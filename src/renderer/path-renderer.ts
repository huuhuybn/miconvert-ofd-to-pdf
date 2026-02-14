/**
 * Path Renderer
 *
 * Converts OFD PathObject elements into PDF vector drawing operations.
 * Maps OFD path commands (MoveTo, LineTo, CubicBezier, Close) to
 * pdf-lib drawing primitives.
 */

import { PDFPage, rgb, pushGraphicsState, popGraphicsState, moveTo, lineTo, closePath, setFillingColor, setStrokingColor, setLineWidth, appendBezierCurve, fill, stroke, fillAndStroke } from 'pdf-lib';
import type { OfdPathObject, PathCommand, CT_Color } from '../types';

/** Millimeters to PDF points */
const MM_TO_PT = 2.834645669;

/**
 * Parse OFD color value to raw RGB components (0-1 range)
 */
function parseColorComponents(color?: CT_Color): { r: number; g: number; b: number } {
    if (!color?.value) return { r: 0, g: 0, b: 0 };

    const parts = color.value.trim().split(/\s+/).map(Number);
    return {
        r: (parts[0] ?? 0) / 255,
        g: (parts[1] ?? 0) / 255,
        b: (parts[2] ?? 0) / 255,
    };
}

/**
 * Render a PathObject onto a PDF page.
 */
export function renderPathObject(
    page: PDFPage,
    pathObj: OfdPathObject,
    pageHeight: number,
): void {
    const { boundary, commands, fillColor, strokeColor, lineWidth: lw, fill: doFill, stroke: doStroke } = pathObj;

    if (commands.length === 0) return;

    // Build PDF operators array
    const operators: any[] = [];

    // Save graphics state
    operators.push(pushGraphicsState());

    // Set line width
    const lineWidth = (lw ?? 0.353) * MM_TO_PT; // Default ~0.353mm ≈ 1pt
    operators.push(setLineWidth(lineWidth));

    // Set colors
    if (doFill && fillColor) {
        const fc = parseColorComponents(fillColor);
        operators.push(setFillingColor(rgb(fc.r, fc.g, fc.b)));
    }

    if (doStroke !== false) {
        const sc = parseColorComponents(strokeColor);
        operators.push(setStrokingColor(rgb(sc.r, sc.g, sc.b)));
    }

    // Convert OFD coordinates to PDF coordinates and build path
    for (const cmd of commands) {
        switch (cmd.type) {
            case 'M':
                operators.push(moveTo(
                    (boundary.x + cmd.x) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y) * MM_TO_PT,
                ));
                break;

            case 'L':
                operators.push(lineTo(
                    (boundary.x + cmd.x) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y) * MM_TO_PT,
                ));
                break;

            case 'B':
                operators.push(appendBezierCurve(
                    (boundary.x + cmd.x1) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y1) * MM_TO_PT,
                    (boundary.x + cmd.x2) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y2) * MM_TO_PT,
                    (boundary.x + cmd.x) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y) * MM_TO_PT,
                ));
                break;

            case 'Q': {
                // Quadratic → Cubic conversion
                // PDF only supports cubic bezier, so we promote quadratic
                // by computing the two control points from the single QBezier control point
                // We need the current point — approximate from last MoveTo/LineTo
                // For simplicity, just draw a line to the endpoint
                operators.push(lineTo(
                    (boundary.x + cmd.x) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y) * MM_TO_PT,
                ));
                break;
            }

            case 'A':
                // Arc — approximate with lineTo for now
                operators.push(lineTo(
                    (boundary.x + cmd.x) * MM_TO_PT,
                    (pageHeight - boundary.y - cmd.y) * MM_TO_PT,
                ));
                break;

            case 'C':
                operators.push(closePath());
                break;
        }
    }

    // Fill and/or stroke
    if (doFill && doStroke !== false && strokeColor) {
        operators.push(fillAndStroke());
    } else if (doFill) {
        operators.push(fill());
    } else if (doStroke !== false) {
        operators.push(stroke());
    }

    // Restore graphics state
    operators.push(popGraphicsState());

    // Apply all operators to the page
    page.pushOperators(...operators);
}
