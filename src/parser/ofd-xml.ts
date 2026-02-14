/**
 * OFD XML Parser
 *
 * Parses the structural XML files within an OFD archive:
 * - OFD.xml         → Document entry point
 * - Document.xml    → Page list, fonts, resources
 * - PublicRes.xml   → Shared resources (fonts, color spaces)
 * - DocumentRes.xml → Document-specific resources (images)
 */

import { XMLParser } from 'fast-xml-parser';
import type {
    OfdArchive,
    OfdDocument,
    OfdFont,
    OfdImageResource,
    OfdPage,
    CT_Box,
} from '../types';
import { readTextFile } from './unzip';
import { parsePage } from './page-parser';

// ─── XML Parser Instance ────────────────────────────────────────────

const xmlParser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (name) => {
        // These elements can appear multiple times
        const arrayTags = [
            'ofd:Page', 'Page',
            'ofd:Font', 'Font',
            'ofd:MultiMedia', 'MultiMedia',
            'ofd:Layer', 'Layer',
            'ofd:TextObject', 'TextObject',
            'ofd:PathObject', 'PathObject',
            'ofd:ImageObject', 'ImageObject',
            'ofd:TextCode', 'TextCode',
            'ofd:PageBlock', 'PageBlock',
        ];
        return arrayTags.includes(name);
    },
    removeNSPrefix: false,
});

// ─── Helper Functions ───────────────────────────────────────────────

/**
 * Parse a box string "x y width height" into CT_Box
 */
export function parseBox(boxStr: string | undefined): CT_Box {
    if (!boxStr) return { x: 0, y: 0, width: 210, height: 297 }; // A4 default
    const parts = boxStr.trim().split(/\s+/).map(Number);
    return {
        x: parts[0] ?? 0,
        y: parts[1] ?? 0,
        width: parts[2] ?? 210,
        height: parts[3] ?? 297,
    };
}

/**
 * Resolve a path relative to a base directory within the archive
 */
function resolvePath(basePath: string, relativePath: string): string {
    if (relativePath.startsWith('/')) return relativePath.slice(1);

    const baseDir = basePath.includes('/')
        ? basePath.substring(0, basePath.lastIndexOf('/'))
        : '';

    const parts = [...baseDir.split('/'), ...relativePath.split('/')];
    const resolved: string[] = [];

    for (const part of parts) {
        if (part === '..') resolved.pop();
        else if (part !== '.' && part !== '') resolved.push(part);
    }

    return resolved.join('/');
}

/**
 * Get a value from a parsed XML node, handling both namespaced and non-namespaced tags
 */
function getXmlVal(node: any, ...names: string[]): any {
    if (!node) return undefined;
    for (const name of names) {
        if (node[name] !== undefined) return node[name];
        if (node[`ofd:${name}`] !== undefined) return node[`ofd:${name}`];
    }
    return undefined;
}

/**
 * Ensure a value is an array
 */
function ensureArray<T>(val: T | T[] | undefined | null): T[] {
    if (val === undefined || val === null) return [];
    return Array.isArray(val) ? val : [val];
}

// ─── Main Parser ────────────────────────────────────────────────────

/**
 * Parse a complete OFD archive into a structured OfdDocument.
 */
export async function parseOfdXml(archive: OfdArchive): Promise<OfdDocument> {
    // Step 1: Find and parse OFD.xml (entry point)
    const ofdXmlContent = findOfdXml(archive);
    if (!ofdXmlContent) {
        throw new Error('Invalid OFD file: OFD.xml not found in archive');
    }

    const ofdXml = xmlParser.parse(ofdXmlContent);
    const ofdRoot = getXmlVal(ofdXml, 'OFD') ?? ofdXml;

    // Get the document body
    const body = getXmlVal(ofdRoot, 'DocBody');
    if (!body) {
        throw new Error('Invalid OFD file: DocBody not found');
    }

    // Get document path reference
    const docRoot = getXmlVal(body, 'DocRoot');
    const docPath = typeof docRoot === 'string' ? docRoot : docRoot?.['#text'] ?? docRoot;

    if (!docPath) {
        throw new Error('Invalid OFD file: DocRoot path not found');
    }

    // Step 2: Parse Document.xml
    const docXmlContent = readTextFile(archive, docPath);
    if (!docXmlContent) {
        throw new Error(`Document XML not found at: ${docPath}`);
    }

    const docXml = xmlParser.parse(docXmlContent);
    const document = getXmlVal(docXml, 'Document') ?? docXml;

    // Get the base path for resolving relative paths
    const basePath = docPath.includes('/') ? docPath.substring(0, docPath.lastIndexOf('/')) : '';

    // Step 3: Parse physical box (default page size)
    const commonData = getXmlVal(document, 'CommonData');
    const physicalBoxStr = getXmlVal(commonData, 'PageArea', 'CT_PageArea');
    let physicalBox: CT_Box;

    if (physicalBoxStr) {
        const physicalBoxContent = getXmlVal(physicalBoxStr, 'PhysicalBox');
        physicalBox = parseBox(
            typeof physicalBoxContent === 'string'
                ? physicalBoxContent
                : physicalBoxContent?.['#text'],
        );
    } else {
        physicalBox = { x: 0, y: 0, width: 210, height: 297 }; // A4
    }

    // Step 4: Parse resources (fonts, images)
    const fonts = new Map<string, OfdFont>();
    const images = new Map<string, OfdImageResource>();

    // Parse PublicRes.xml if referenced
    const publicResRef = getXmlVal(commonData, 'PublicRes');
    if (publicResRef) {
        const publicResPath = resolvePath(docPath, typeof publicResRef === 'string' ? publicResRef : publicResRef?.['#text'] ?? publicResRef);
        const publicResContent = readTextFile(archive, publicResPath);
        if (publicResContent) {
            parseResources(xmlParser.parse(publicResContent), fonts, images, basePath);
        }
    }

    // Parse DocumentRes.xml if referenced
    const docResRef = getXmlVal(commonData, 'DocumentRes');
    if (docResRef) {
        const docResPath = resolvePath(docPath, typeof docResRef === 'string' ? docResRef : docResRef?.['#text'] ?? docResRef);
        const docResContent = readTextFile(archive, docResPath);
        if (docResContent) {
            parseResources(xmlParser.parse(docResContent), fonts, images, basePath);
        }
    }

    // Step 5: Parse pages
    const pages: OfdPage[] = [];
    const pagesNode = getXmlVal(document, 'Pages');
    const pageRefs = ensureArray(getXmlVal(pagesNode, 'Page'));

    for (let i = 0; i < pageRefs.length; i++) {
        const pageRef = pageRefs[i];
        const pageId = pageRef?.['@_ID'] ?? String(i);
        const pageBaseLoc = pageRef?.['@_BaseLoc'];

        if (!pageBaseLoc) continue;

        const pagePath = resolvePath(docPath, pageBaseLoc);
        const pageContent = readTextFile(archive, pagePath);

        if (!pageContent) continue;

        const parsedPage = parsePage(
            xmlParser.parse(pageContent),
            pageId,
            i,
            physicalBox,
        );

        pages.push(parsedPage);
    }

    return {
        physicalBox,
        fonts,
        images,
        pages,
        basePath,
    };
}

// ─── Resource Parsing ───────────────────────────────────────────────

function parseResources(
    resXml: any,
    fonts: Map<string, OfdFont>,
    images: Map<string, OfdImageResource>,
    basePath: string,
): void {
    const res = getXmlVal(resXml, 'Res') ?? resXml;

    // Parse fonts
    const fontNodes = ensureArray(getXmlVal(res, 'Fonts'));
    for (const fontsContainer of fontNodes) {
        const fontList = ensureArray(getXmlVal(fontsContainer, 'Font'));
        for (const font of fontList) {
            const id = font?.['@_ID'];
            if (!id) continue;

            const fontObj: OfdFont = {
                id,
                name: font?.['@_FontName'] ?? font?.['@_FamilyName'] ?? 'unknown',
                familyName: font?.['@_FamilyName'],
                charset: font?.['@_Charset'],
                italic: font?.['@_Italic'] === 'true',
                bold: font?.['@_Bold'] === 'true',
                serif: font?.['@_Serif'] === 'true',
                fixedWidth: font?.['@_FixedWidth'] === 'true',
            };

            // Check for embedded font file
            const fontFile = getXmlVal(font, 'FontFile');
            if (fontFile) {
                fontObj.fontFile = typeof fontFile === 'string'
                    ? `${basePath}/${fontFile}`
                    : `${basePath}/${fontFile?.['#text'] ?? fontFile}`;
            }

            fonts.set(id, fontObj);
        }
    }

    // Parse MultiMedia (images)
    const multiMediaNodes = ensureArray(getXmlVal(res, 'MultiMedias'));
    for (const mmContainer of multiMediaNodes) {
        const mmList = ensureArray(getXmlVal(mmContainer, 'MultiMedia'));
        for (const mm of mmList) {
            const id = mm?.['@_ID'];
            const type = mm?.['@_Type'];
            if (!id) continue;
            if (type !== 'Image' && type !== undefined) continue;

            const mediaFile = getXmlVal(mm, 'MediaFile');
            const filePath = typeof mediaFile === 'string'
                ? mediaFile
                : mediaFile?.['#text'] ?? '';

            if (!filePath) continue;

            const format = filePath.split('.').pop()?.toUpperCase() ?? 'PNG';

            images.set(id, {
                id,
                format,
                path: `${basePath}/${filePath}`,
            });
        }
    }
}

// ─── Utility ────────────────────────────────────────────────────────

/**
 * Find OFD.xml in the archive (handles different locations)
 */
function findOfdXml(archive: OfdArchive): string | null {
    // Try common locations
    const candidates = ['OFD.xml', 'ofd.xml', 'OFD/OFD.xml'];

    for (const candidate of candidates) {
        const content = readTextFile(archive, candidate);
        if (content) return content;
    }

    // Search for any file named OFD.xml
    for (const [path] of archive) {
        if (path.toLowerCase().endsWith('ofd.xml') && !path.toLowerCase().includes('document')) {
            return readTextFile(archive, path);
        }
    }

    return null;
}
