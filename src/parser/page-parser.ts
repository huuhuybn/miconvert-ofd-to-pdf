/**
 * OFD Page Content Parser
 *
 * Parses individual page XML files to extract:
 * - TextObject  → text with position, font, color
 * - PathObject  → vector graphics with path data
 * - ImageObject → embedded images with position
 */

import type {
    CT_Box,
    CT_Color,
    CT_Matrix,
    OfdLayer,
    OfdObject,
    OfdPage,
    OfdTextObject,
    OfdPathObject,
    OfdImageObject,
    TextCode,
    PathCommand,
} from '../types';
import { parseBox } from './ofd-xml';

// ─── Helper Functions ───────────────────────────────────────────────

function getVal(node: any, ...names: string[]): any {
    if (!node) return undefined;
    for (const name of names) {
        if (node[name] !== undefined) return node[name];
        if (node[`ofd:${name}`] !== undefined) return node[`ofd:${name}`];
    }
    return undefined;
}

function ensureArray<T>(val: T | T[] | undefined | null): T[] {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
}

function parseColor(node: any): CT_Color | undefined {
    if (!node) return undefined;

    // Color can be specified as an attribute or child element
    const colorVal = node?.['@_Value'] ?? node?.['#text'];
    if (typeof colorVal === 'string') {
        return {
            value: colorVal,
            alpha: node?.['@_Alpha'] ? Number(node['@_Alpha']) : undefined,
        };
    }

    return undefined;
}

function parseColorStr(str: string | undefined): CT_Color | undefined {
    if (!str) return undefined;
    return { value: str };
}

function parseCTM(ctmStr: string | undefined): CT_Matrix | undefined {
    if (!ctmStr) return undefined;
    const parts = ctmStr.trim().split(/\s+/).map(Number);
    if (parts.length < 6) return undefined;
    return {
        a: parts[0], b: parts[1],
        c: parts[2], d: parts[3],
        e: parts[4], f: parts[5],
    };
}

// ─── Path Data Parser ───────────────────────────────────────────────

/**
 * Parse OFD abbreviated path data into structured commands.
 *
 * OFD path data format is similar to SVG path data:
 * M x y       — MoveTo
 * L x y       — LineTo
 * B x1 y1 x2 y2 x y — CubicBezier
 * Q x1 y1 x y — QuadraticBezier
 * A rx ry angle large sweep x y — Arc
 * C           — ClosePath
 * S           — (treated as ClosePath in some implementations)
 */
export function parseAbbreviatedData(data: string): PathCommand[] {
    if (!data) return [];

    const commands: PathCommand[] = [];
    const tokens = data.trim().split(/\s+/);
    let i = 0;

    while (i < tokens.length) {
        const cmd = tokens[i];

        switch (cmd) {
            case 'M':
                commands.push({
                    type: 'M',
                    x: Number(tokens[i + 1]),
                    y: Number(tokens[i + 2]),
                });
                i += 3;
                break;

            case 'L':
                commands.push({
                    type: 'L',
                    x: Number(tokens[i + 1]),
                    y: Number(tokens[i + 2]),
                });
                i += 3;
                break;

            case 'B':
                commands.push({
                    type: 'B',
                    x1: Number(tokens[i + 1]),
                    y1: Number(tokens[i + 2]),
                    x2: Number(tokens[i + 3]),
                    y2: Number(tokens[i + 4]),
                    x: Number(tokens[i + 5]),
                    y: Number(tokens[i + 6]),
                });
                i += 7;
                break;

            case 'Q':
                commands.push({
                    type: 'Q',
                    x1: Number(tokens[i + 1]),
                    y1: Number(tokens[i + 2]),
                    x: Number(tokens[i + 3]),
                    y: Number(tokens[i + 4]),
                });
                i += 5;
                break;

            case 'A':
                commands.push({
                    type: 'A',
                    rx: Number(tokens[i + 1]),
                    ry: Number(tokens[i + 2]),
                    angle: Number(tokens[i + 3]),
                    large: tokens[i + 4] === '1',
                    sweep: tokens[i + 5] === '1',
                    x: Number(tokens[i + 6]),
                    y: Number(tokens[i + 7]),
                });
                i += 8;
                break;

            case 'C':
            case 'S':
                commands.push({ type: 'C' });
                i += 1;
                break;

            default:
                // Unknown command or number — skip
                i += 1;
                break;
        }
    }

    return commands;
}

// ─── Text Code Parser ───────────────────────────────────────────────

function parseDeltaValues(deltaStr: string | undefined): number[] {
    if (!deltaStr) return [];

    const result: number[] = [];
    const tokens = deltaStr.trim().split(/\s+/);
    let i = 0;

    while (i < tokens.length) {
        const token = tokens[i];

        if (token === 'g') {
            // "g count delta" — repeat delta count times
            const count = Number(tokens[i + 1]);
            const delta = Number(tokens[i + 2]);
            for (let j = 0; j < count; j++) {
                result.push(delta);
            }
            i += 3;
        } else {
            result.push(Number(token));
            i += 1;
        }
    }

    return result;
}

function parseTextCodes(objNode: any): TextCode[] {
    const textCodeNodes = ensureArray(getVal(objNode, 'TextCode'));
    const codes: TextCode[] = [];

    for (const tc of textCodeNodes) {
        const text = typeof tc === 'string' ? tc : tc?.['#text'] ?? '';
        if (!text) continue;

        codes.push({
            x: tc?.['@_X'] !== undefined ? Number(tc['@_X']) : undefined,
            y: tc?.['@_Y'] !== undefined ? Number(tc['@_Y']) : undefined,
            deltaX: parseDeltaValues(tc?.['@_DeltaX']),
            deltaY: parseDeltaValues(tc?.['@_DeltaY']),
            text: String(text),
        });
    }

    return codes;
}

// ─── Object Parsers ─────────────────────────────────────────────────

function parseTextObject(obj: any): OfdTextObject | null {
    const id = obj?.['@_ID'] ?? '';
    const boundary = parseBox(obj?.['@_Boundary']);
    const font = obj?.['@_Font'] ?? '';
    const size = Number(obj?.['@_Size'] ?? 10);

    const fillColorNode = getVal(obj, 'FillColor');
    const strokeColorNode = getVal(obj, 'StrokeColor');

    return {
        type: 'text',
        id,
        boundary,
        font,
        size,
        fillColor: fillColorNode ? parseColor(fillColorNode) ?? parseColorStr(fillColorNode?.['@_Value']) : undefined,
        strokeColor: strokeColorNode ? parseColor(strokeColorNode) ?? parseColorStr(strokeColorNode?.['@_Value']) : undefined,
        weight: obj?.['@_Weight'] ? Number(obj['@_Weight']) : undefined,
        italic: obj?.['@_Italic'] === 'true',
        ctm: parseCTM(obj?.['@_CTM']),
        textCodes: parseTextCodes(obj),
        alpha: obj?.['@_Alpha'] != null ? Number(obj['@_Alpha']) : undefined,
    };
}

function parsePathObject(obj: any): OfdPathObject | null {
    const id = obj?.['@_ID'] ?? '';
    const boundary = parseBox(obj?.['@_Boundary']);

    const abbreviatedDataNode = getVal(obj, 'AbbreviatedData');
    const abbreviatedData = typeof abbreviatedDataNode === 'string'
        ? abbreviatedDataNode
        : abbreviatedDataNode?.['#text'] ?? '';

    const fillColorNode = getVal(obj, 'FillColor');
    const strokeColorNode = getVal(obj, 'StrokeColor');

    const hasFill = obj?.['@_Fill'] !== 'false' && fillColorNode !== undefined;
    const hasStroke = obj?.['@_Stroke'] !== 'false';

    // Parse dash pattern "unitsOn unitsOff"
    const dashPatternStr = obj?.['@_DashPattern'];
    let dashPattern: number[] | undefined;
    if (dashPatternStr) {
        dashPattern = String(dashPatternStr).trim().split(/\s+/).map(Number);
    }

    // Parse join style
    const joinStr = obj?.['@_Join'];
    let join: 'miter' | 'round' | 'bevel' | undefined;
    if (joinStr === 'Round') join = 'round';
    else if (joinStr === 'Bevel') join = 'bevel';
    else if (joinStr === 'Miter') join = 'miter';

    // Parse cap style
    const capStr = obj?.['@_Cap'];
    let cap: 'butt' | 'round' | 'square' | undefined;
    if (capStr === 'Round') cap = 'round';
    else if (capStr === 'Square') cap = 'square';
    else if (capStr === 'Butt') cap = 'butt';

    return {
        type: 'path',
        id,
        boundary,
        abbreviatedData,
        commands: parseAbbreviatedData(abbreviatedData),
        fillColor: fillColorNode ? parseColor(fillColorNode) ?? parseColorStr(fillColorNode?.['@_Value']) : undefined,
        strokeColor: strokeColorNode ? parseColor(strokeColorNode) ?? parseColorStr(strokeColorNode?.['@_Value']) : undefined,
        lineWidth: obj?.['@_LineWidth'] ? Number(obj['@_LineWidth']) : undefined,
        ctm: parseCTM(obj?.['@_CTM']),
        fill: hasFill,
        stroke: hasStroke,
        dashPattern,
        dashOffset: obj?.['@_DashOffset'] != null ? Number(obj['@_DashOffset']) : undefined,
        join,
        cap,
        miterLimit: obj?.['@_MiterLimit'] != null ? Number(obj['@_MiterLimit']) : undefined,
        alpha: obj?.['@_Alpha'] != null ? Number(obj['@_Alpha']) : undefined,
    };
}

function parseImageObject(obj: any): OfdImageObject | null {
    const id = obj?.['@_ID'] ?? '';
    const boundary = parseBox(obj?.['@_Boundary']);
    const resourceId = obj?.['@_ResourceID'] ?? '';

    return {
        type: 'image',
        id,
        boundary,
        resourceId,
        ctm: parseCTM(obj?.['@_CTM']),
        alpha: obj?.['@_Alpha'] != null ? Number(obj['@_Alpha']) : undefined,
    };
}

// ─── Layer Parser ───────────────────────────────────────────────────

function parseLayer(layerNode: any): OfdLayer {
    const objects: OfdObject[] = [];

    // Parse TextObjects
    const textObjects = ensureArray(getVal(layerNode, 'TextObject'));
    for (const obj of textObjects) {
        const parsed = parseTextObject(obj);
        if (parsed) objects.push(parsed);
    }

    // Parse PathObjects
    const pathObjects = ensureArray(getVal(layerNode, 'PathObject'));
    for (const obj of pathObjects) {
        const parsed = parsePathObject(obj);
        if (parsed) objects.push(parsed);
    }

    // Parse ImageObjects
    const imageObjects = ensureArray(getVal(layerNode, 'ImageObject'));
    for (const obj of imageObjects) {
        const parsed = parseImageObject(obj);
        if (parsed) objects.push(parsed);
    }

    // Parse nested PageBlock containers (recursive)
    const pageBlocks = ensureArray(getVal(layerNode, 'PageBlock'));
    for (const block of pageBlocks) {
        const nestedLayer = parseLayer(block);
        objects.push(...nestedLayer.objects);
    }

    return {
        id: layerNode?.['@_ID'],
        type: layerNode?.['@_Type'],
        drawParamRef: layerNode?.['@_DrawParam'],
        objects,
    };
}

// ─── Page Parser (Main Export) ──────────────────────────────────────

/**
 * Parse a page XML node into a structured OfdPage.
 */
export function parsePage(
    pageXml: any,
    pageId: string,
    pageIndex: number,
    defaultArea: CT_Box,
): OfdPage {
    let pageRoot = getVal(pageXml, 'Page') ?? pageXml;

    // Handle case where ofd:Page is parsed as an array (isArray config)
    if (Array.isArray(pageRoot)) {
        pageRoot = pageRoot[0] ?? pageXml;
    }

    // Parse page area (may override document default)
    const pageAreaNode = getVal(pageRoot, 'Area');
    let area = defaultArea;
    if (pageAreaNode) {
        const physicalBox = getVal(pageAreaNode, 'PhysicalBox');
        if (physicalBox) {
            area = parseBox(typeof physicalBox === 'string' ? physicalBox : physicalBox?.['#text']);
        }
    }

    // Extract template reference (for later merging)
    const templateNode = getVal(pageRoot, 'Template');
    const templateId = templateNode?.['@_TemplateID'];

    // Parse content layers
    const layers: OfdLayer[] = [];
    const contentNode = getVal(pageRoot, 'Content');

    if (contentNode) {
        const layerNodes = ensureArray(getVal(contentNode, 'Layer'));
        for (const layerNode of layerNodes) {
            layers.push(parseLayer(layerNode));
        }
    }

    // Some OFD files put layers directly under Page
    if (layers.length === 0) {
        const directLayers = ensureArray(getVal(pageRoot, 'Layer'));
        for (const layerNode of directLayers) {
            layers.push(parseLayer(layerNode));
        }
    }

    return {
        id: pageId,
        index: pageIndex,
        area,
        layers,
        templateId,
    };
}

