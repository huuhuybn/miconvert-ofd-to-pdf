/**
 * Path Renderer
 *
 * Converts OFD PathObject elements into PDF vector drawing operations.
 * Maps OFD path commands (MoveTo, LineTo, CubicBezier, QuadraticBezier, Arc, Close)
 * to pdf-lib drawing primitives.
 *
 * Ported from ofdrw Java library (ItextMaker.writePath / AWTMaker.writePath).
 */

import {
    PDFPage, rgb,
    pushGraphicsState, popGraphicsState,
    moveTo, lineTo, closePath,
    setFillingColor, setStrokingColor, setLineWidth,
    appendBezierCurve,
    fill, stroke, fillAndStroke,
    setLineCap, setLineJoin, setDashPattern, LineCapStyle, LineJoinStyle,
    setGraphicsState, PDFDocument,
} from 'pdf-lib';
import type { OfdPathObject, PathCommand, CT_Color, CT_Matrix } from '../types';

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
 * Calculate CTM-adjusted line width.
 * Ported from ofdrw: sx = signum(a) * sqrt(a² + c²)
 */
function ctmScaleLineWidth(lineWidth: number, ctm: CT_Matrix): number {
    const a = ctm.a;
    const c = ctm.c;
    const sx = Math.sign(a) * Math.sqrt(a * a + c * c);
    return lineWidth * Math.abs(sx);
}

/**
 * Apply CTM transform to a point: x' = a*x + c*y + e, y' = b*x + d*y + f
 */
function ctmTransformPoint(
    x: number, y: number,
    ctm: CT_Matrix,
): { x: number; y: number } {
    return {
        x: ctm.a * x + ctm.c * y + ctm.e,
        y: ctm.b * x + ctm.d * y + ctm.f,
    };
}

/**
 * Convert an arc (endpoint parameterization) to cubic Bézier segments.
 *
 * Based on the W3C SVG arc implementation notes:
 * https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
 */
function arcToBeziers(
    x0: number, y0: number,
    rx: number, ry: number,
    angle: number,
    largeArcFlag: boolean,
    sweepFlag: boolean,
    x: number, y: number,
): Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> {
    // Handle degenerate cases
    if (rx === 0 || ry === 0) {
        return []; // Degenerate — caller should fall back to lineTo
    }

    const phi = (angle * Math.PI) / 180;
    const cosPhi = Math.cos(phi);
    const sinPhi = Math.sin(phi);

    // Step 1: Compute (x1', y1')
    const dx2 = (x0 - x) / 2;
    const dy2 = (y0 - y) / 2;
    const x1p = cosPhi * dx2 + sinPhi * dy2;
    const y1p = -sinPhi * dx2 + cosPhi * dy2;

    // Ensure radii are large enough
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    let lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) {
        const sqrtLambda = Math.sqrt(lambda);
        rx *= sqrtLambda;
        ry *= sqrtLambda;
    }

    // Step 2: Compute (cx', cy')
    const rx2 = rx * rx;
    const ry2 = ry * ry;
    const x1p2 = x1p * x1p;
    const y1p2 = y1p * y1p;

    let sq = Math.max(0, (rx2 * ry2 - rx2 * y1p2 - ry2 * x1p2) / (rx2 * y1p2 + ry2 * x1p2));
    sq = Math.sqrt(sq);
    if (largeArcFlag === sweepFlag) sq = -sq;

    const cxp = sq * (rx * y1p) / ry;
    const cyp = sq * -(ry * x1p) / rx;

    // Step 3: Compute (cx, cy)
    const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
    const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;

    // Step 4: Compute angles
    function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
        const sign = ux * vy - uy * vx < 0 ? -1 : 1;
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
        let cos = dot / len;
        cos = Math.max(-1, Math.min(1, cos)); // clamp
        return sign * Math.acos(cos);
    }

    const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dTheta = vectorAngle(
        (x1p - cxp) / rx, (y1p - cyp) / ry,
        (-x1p - cxp) / rx, (-y1p - cyp) / ry,
    );

    if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

    // Step 5: Split into segments (max 90° each) and convert to cubic Béziers
    const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const segmentAngle = dTheta / segments;
    const result: Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> = [];

    for (let i = 0; i < segments; i++) {
        const startAngle = theta1 + i * segmentAngle;
        const endAngle = theta1 + (i + 1) * segmentAngle;

        // Bézier approximation of a circular arc
        const alpha = (4 / 3) * Math.tan(segmentAngle / 4);

        const cosStart = Math.cos(startAngle);
        const sinStart = Math.sin(startAngle);
        const cosEnd = Math.cos(endAngle);
        const sinEnd = Math.sin(endAngle);

        // Control points in the unit circle
        const p2x = cosStart - alpha * sinStart;
        const p2y = sinStart + alpha * cosStart;
        const p3x = cosEnd + alpha * sinEnd;
        const p3y = sinEnd - alpha * cosEnd;
        const p4x = cosEnd;
        const p4y = sinEnd;

        // Transform back
        function transform(px: number, py: number): [number, number] {
            const sx = px * rx;
            const sy = py * ry;
            return [
                cosPhi * sx - sinPhi * sy + cx,
                sinPhi * sx + cosPhi * sy + cy,
            ];
        }

        const [cp1x, cp1y] = transform(p2x, p2y);
        const [cp2x, cp2y] = transform(p3x, p3y);
        const [epx, epy] = transform(p4x, p4y);

        result.push({
            x1: cp1x, y1: cp1y,
            x2: cp2x, y2: cp2y,
            x: epx, y: epy,
        });
    }

    return result;
}

/**
 * Convert OFD path coordinates to PDF coordinates, applying CTM if present.
 * Ported from ofdrw PointUtil.calPdfPathPoint.
 */
function toPdfCoord(
    x: number, y: number,
    boundary: { x: number; y: number },
    pageHeight: number,
    ctm?: CT_Matrix,
): { x: number; y: number } {
    let px = x;
    let py = y;

    // Apply CTM if present
    if (ctm) {
        const t = ctmTransformPoint(px, py, ctm);
        px = t.x;
        py = t.y;
    }

    return {
        x: (boundary.x + px) * MM_TO_PT,
        y: (pageHeight - boundary.y - py) * MM_TO_PT,
    };
}

/**
 * Render a PathObject onto a PDF page.
 */
export function renderPathObject(
    page: PDFPage,
    pathObj: OfdPathObject,
    pageHeight: number,
    pdfDoc?: PDFDocument,
): void {
    const {
        boundary, commands, fillColor, strokeColor,
        lineWidth: lw, fill: doFill, stroke: doStroke,
        ctm, dashPattern, dashOffset, join, cap, miterLimit, alpha,
    } = pathObj;

    if (commands.length === 0) return;

    // Build PDF operators array
    const operators: any[] = [];

    // Save graphics state
    operators.push(pushGraphicsState());

    // Apply alpha/opacity via ExtGState if needed
    if (alpha != null && alpha < 255 && pdfDoc) {
        const opacity = alpha / 255;
        const extGState = pdfDoc.context.obj({
            Type: 'ExtGState',
            ca: opacity,   // fill opacity
            CA: opacity,   // stroke opacity
        });
        operators.push(setGraphicsState(
            page.node.newExtGState('GS-a', extGState) as any,
        ));
    }

    // Set line width (with CTM scaling from ofdrw)
    let lineWidth = (lw ?? 0.353) * MM_TO_PT;
    if (ctm && lw != null) {
        lineWidth = ctmScaleLineWidth(lw * MM_TO_PT, ctm);
    }
    operators.push(setLineWidth(lineWidth));

    // Set dash pattern (ported from ofdrw ItextMaker.writePath)
    if (dashPattern && dashPattern.length >= 2) {
        const unitsOn = dashPattern[0] * MM_TO_PT;
        const unitsOff = dashPattern[1] * MM_TO_PT;
        const phase = (dashOffset ?? 0) * MM_TO_PT;
        operators.push(setDashPattern([unitsOn, unitsOff], phase));
    }

    // Set line join style
    if (join) {
        const joinMap = { miter: LineJoinStyle.Miter, round: LineJoinStyle.Round, bevel: LineJoinStyle.Bevel };
        operators.push(setLineJoin(joinMap[join]));
    }

    // Set line cap style
    if (cap) {
        const capMap = { butt: LineCapStyle.Butt, round: LineCapStyle.Round, square: LineCapStyle.Projecting };
        operators.push(setLineCap(capMap[cap]));
    }

    // Note: miterLimit is stored but pdf-lib doesn't expose setMiterLimit operator directly
    // It can be set by raw content stream if needed in the future

    // Set colors
    if (doFill && fillColor) {
        const fc = parseColorComponents(fillColor);
        operators.push(setFillingColor(rgb(fc.r, fc.g, fc.b)));
    }

    if (doStroke !== false) {
        const sc = parseColorComponents(strokeColor);
        operators.push(setStrokingColor(rgb(sc.r, sc.g, sc.b)));
    }

    // Track current point for Q→Cubic and Arc conversions
    let currentPtX = 0;
    let currentPtY = 0;
    let moveToX = 0;
    let moveToY = 0;

    // Convert OFD coordinates to PDF coordinates and build path
    for (const cmd of commands) {
        switch (cmd.type) {
            case 'M': {
                const p = toPdfCoord(cmd.x, cmd.y, boundary, pageHeight, ctm);
                operators.push(moveTo(p.x, p.y));
                currentPtX = p.x;
                currentPtY = p.y;
                moveToX = p.x;
                moveToY = p.y;
                break;
            }

            case 'L': {
                const p = toPdfCoord(cmd.x, cmd.y, boundary, pageHeight, ctm);
                operators.push(lineTo(p.x, p.y));
                currentPtX = p.x;
                currentPtY = p.y;
                break;
            }

            case 'B': {
                const p1 = toPdfCoord(cmd.x1, cmd.y1, boundary, pageHeight, ctm);
                const p2 = toPdfCoord(cmd.x2, cmd.y2, boundary, pageHeight, ctm);
                const p = toPdfCoord(cmd.x, cmd.y, boundary, pageHeight, ctm);
                operators.push(appendBezierCurve(p1.x, p1.y, p2.x, p2.y, p.x, p.y));
                currentPtX = p.x;
                currentPtY = p.y;
                break;
            }

            case 'Q': {
                // Quadratic → Cubic Bézier conversion
                const qControl = toPdfCoord(cmd.x1, cmd.y1, boundary, pageHeight, ctm);
                const qEnd = toPdfCoord(cmd.x, cmd.y, boundary, pageHeight, ctm);

                const cp1x = currentPtX + (2 / 3) * (qControl.x - currentPtX);
                const cp1y = currentPtY + (2 / 3) * (qControl.y - currentPtY);
                const cp2x = qEnd.x + (2 / 3) * (qControl.x - qEnd.x);
                const cp2y = qEnd.y + (2 / 3) * (qControl.y - qEnd.y);

                operators.push(appendBezierCurve(cp1x, cp1y, cp2x, cp2y, qEnd.x, qEnd.y));
                currentPtX = qEnd.x;
                currentPtY = qEnd.y;
                break;
            }

            case 'A': {
                // Arc → Cubic Bézier approximation (no CTM on arc radii/endpoint since
                // CTM is applied per-point in toPdfCoord)
                const arcEnd = toPdfCoord(cmd.x, cmd.y, boundary, pageHeight, ctm);
                const arcRx = cmd.rx * MM_TO_PT;
                const arcRy = cmd.ry * MM_TO_PT;

                const beziers = arcToBeziers(
                    currentPtX, currentPtY,
                    arcRx, arcRy,
                    cmd.angle,
                    cmd.large,
                    cmd.sweep,
                    arcEnd.x, arcEnd.y,
                );

                if (beziers.length > 0) {
                    for (const seg of beziers) {
                        operators.push(appendBezierCurve(
                            seg.x1, seg.y1,
                            seg.x2, seg.y2,
                            seg.x, seg.y,
                        ));
                    }
                    const last = beziers[beziers.length - 1];
                    currentPtX = last.x;
                    currentPtY = last.y;
                } else {
                    operators.push(lineTo(arcEnd.x, arcEnd.y));
                    currentPtX = arcEnd.x;
                    currentPtY = arcEnd.y;
                }
                break;
            }

            case 'C':
                operators.push(closePath());
                currentPtX = moveToX;
                currentPtY = moveToY;
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
