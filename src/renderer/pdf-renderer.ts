/**
 * PDF Renderer (Main Orchestrator)
 *
 * Coordinates the conversion of a parsed OFD document into a PDF.
 * Iterates pages → layers → objects, dispatching to specialized renderers.
 *
 * Font loading priority:
 *   1. Embedded fonts from OFD archive (TTF/OTF via fontFile path)
 *   2. User-provided fontDir (for CJK system fonts)
 *   3. Standard PDF fonts (Helvetica/TimesRoman/Courier) as last resort
 */

import { PDFDocument, StandardFonts, rgb, PDFFont } from 'pdf-lib';
import type { OfdDocument, OfdArchive, ConvertOptions, OfdFont } from '../types';
import { renderTextObject } from './text-renderer';
import { renderPathObject } from './path-renderer';
import { renderImageObject } from './image-renderer';

/** Millimeters to PDF points */
const MM_TO_PT = 2.834645669;

/**
 * Map an OFD font name to the best available standard PDF font (last resort).
 */
function mapToStandardFont(ofdFont: OfdFont | undefined): StandardFonts {
    if (!ofdFont) return StandardFonts.Helvetica;
    const name = (ofdFont.name || '').toLowerCase();

    if (name.includes('song') || name.includes('宋') || name.includes('simsun'))
        return ofdFont.bold ? StandardFonts.TimesRomanBold : StandardFonts.TimesRoman;
    if (name.includes('hei') || name.includes('黑') || name.includes('simhei'))
        return ofdFont.bold ? StandardFonts.HelveticaBold : StandardFonts.Helvetica;
    if (name.includes('kai') || name.includes('楷') || name.includes('kaiti'))
        return ofdFont.italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman;
    if (name.includes('fang') || name.includes('仿') || name.includes('fangsong'))
        return StandardFonts.TimesRoman;
    if (name.includes('courier') || name.includes('mono') || ofdFont.fixedWidth)
        return ofdFont.bold ? StandardFonts.CourierBold : StandardFonts.Courier;
    if (name.includes('times') || name.includes('serif') || ofdFont.serif) {
        if (ofdFont.bold && ofdFont.italic) return StandardFonts.TimesRomanBoldItalic;
        if (ofdFont.bold) return StandardFonts.TimesRomanBold;
        if (ofdFont.italic) return StandardFonts.TimesRomanItalic;
        return StandardFonts.TimesRoman;
    }

    if (ofdFont.bold && ofdFont.italic) return StandardFonts.HelveticaBoldOblique;
    if (ofdFont.bold) return StandardFonts.HelveticaBold;
    if (ofdFont.italic) return StandardFonts.HelveticaOblique;
    return StandardFonts.Helvetica;
}

/**
 * Read a binary file from the OFD archive (Map<string, Uint8Array>).
 */
function readBinaryFile(archive: OfdArchive, path: string): Uint8Array | null {
    if (!path) return null;
    const normalizedPath = path.replace(/\\/g, '/');

    const candidates = [
        normalizedPath,
        normalizedPath.replace(/^\//, ''),
        `Doc_0/${normalizedPath}`,
        `Doc_0/Res/${normalizedPath.split('/').pop()}`,
    ];

    for (const candidate of candidates) {
        const entry = archive.get(candidate);
        if (entry) return entry;

        const lower = candidate.toLowerCase();
        for (const [key, value] of archive) {
            if (key.toLowerCase() === lower) return value;
        }
    }
    return null;
}

// ─── Fontkit Dynamic Import ─────────────────────────────────────────

let fontkitRegistered = false;

/**
 * Attempt to register fontkit with the PDF document.
 * Uses dynamic import to avoid hard dependency on @pdf-lib/fontkit.
 */
async function registerFontkit(pdfDoc: PDFDocument): Promise<boolean> {
    if (fontkitRegistered) return true;
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const fontkit = require('@pdf-lib/fontkit');
        const fk = fontkit.default || fontkit;
        pdfDoc.registerFontkit(fk);
        fontkitRegistered = true;
        return true;
    } catch {
        return false;
    }
}

/**
 * Known CJK font file names (TTF preferred — fontkit v1 renders OTF/CFF as blank).
 * Ordered: TTF first, OTF last. fontkit v1 does NOT support TTC.
 */
const KNOWN_CJK_FONTS = [
    // Google Noto CJK (TTF preferred)
    'NotoSansSC-Regular.ttf',
    'NotoSansCJKsc-Regular.ttf',
    'NotoSerifSC-Regular.ttf',
    'NotoSerifCJKsc-Regular.ttf',
    // Windows system fonts (all TTF)
    'simsun.ttf', 'SimSun.ttf',
    'simhei.ttf', 'SimHei.ttf',
    'msyh.ttf', 'MSYH.ttf', 'msyh.ttc',
    'simkai.ttf', 'KaiTi.ttf',
    'simfang.ttf', 'FangSong.ttf',
    'msyhbd.ttf',
    // WenQuanYi (Linux, TTF)
    'wqy-microhei.ttf',
    'wqy-zenhei.ttf',
    'WenQuanYiMicroHei.ttf',
    'WenQuanYiZenHei.ttf',
    // Adobe Source Han (TTF preferred, OTF fallback)
    'SourceHanSansSC-Regular.ttf',
    'SourceHanSansCN-Regular.ttf',
    'SourceHanSansSC-Regular.otf',
    'SourceHanSansCN-Regular.otf',
    'SourceHanSerifSC-Regular.otf',
    // Google Noto CJK OTF (last resort — may render blank with fontkit v1)
    'NotoSansCJKsc-Regular.otf',
    'NotoSansSC-Regular.otf',
    'NotoSerifCJKsc-Regular.otf',
    'NotoSerifSC-Regular.otf',
];

/**
 * System font directories per platform.
 */
function getSystemFontDirs(): string[] {
    const platform = process.platform;
    const home = process.env.HOME || process.env.USERPROFILE || '';

    if (platform === 'win32') {
        return [
            'C:\\Windows\\Fonts',
            `${home}\\AppData\\Local\\Microsoft\\Windows\\Fonts`,
        ];
    }
    if (platform === 'darwin') {
        return [
            '/Library/Fonts',
            `${home}/Library/Fonts`,
            '/System/Library/Fonts/Supplemental',
            '/usr/local/share/fonts',
            '/opt/homebrew/share/fonts',
        ];
    }
    // Linux
    return [
        '/usr/share/fonts',
        '/usr/share/fonts/truetype',
        '/usr/share/fonts/opentype',
        '/usr/share/fonts/noto-cjk',
        '/usr/share/fonts/google-noto-cjk',
        '/usr/share/fonts/truetype/noto',
        '/usr/share/fonts/opentype/noto',
        '/usr/local/share/fonts',
        `${home}/.fonts`,
        `${home}/.local/share/fonts`,
    ];
}

/** Cached fallback CJK font path (null = not searched, undefined = not found) */
let cachedCJKFontPath: string | null | undefined = null;

/**
 * Auto-detect a CJK font from the system.
 * Returns the path to a usable TTF/OTF file, or undefined if none found.
 */
function findSystemCJKFont(): string | undefined {
    if (cachedCJKFontPath !== null) return cachedCJKFontPath ?? undefined;

    const fs = require('fs');
    const path = require('path');
    const dirs = getSystemFontDirs();

    for (const dir of dirs) {
        for (const fontFile of KNOWN_CJK_FONTS) {
            const fullPath = path.join(dir, fontFile);
            try {
                if (fs.existsSync(fullPath)) {
                    cachedCJKFontPath = fullPath;
                    return fullPath;
                }
            } catch { /* directory not accessible */ }
        }
        // Also try recursive search in subdirectories (Linux distros nest fonts)
        try {
            if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
                const walkDir = (d: string, depth: number): string | undefined => {
                    if (depth > 2) return undefined;
                    const entries = fs.readdirSync(d, { withFileTypes: true });
                    for (const entry of entries) {
                        if (entry.isFile() && KNOWN_CJK_FONTS.includes(entry.name)) {
                            const fp = path.join(d, entry.name);
                            cachedCJKFontPath = fp;
                            return fp;
                        }
                    }
                    for (const entry of entries) {
                        if (entry.isDirectory()) {
                            const found = walkDir(path.join(d, entry.name), depth + 1);
                            if (found) return found;
                        }
                    }
                    return undefined;
                };
                const found = walkDir(dir, 0);
                if (found) return found;
            }
        } catch { /* skip */ }
    }

    cachedCJKFontPath = undefined;
    return undefined;
}

/** Cached embedded CJK font (already loaded into memory) */
let cachedCJKFontBytes: Uint8Array | null = null;

/**
 * Get CJK font bytes — from fontDir, system auto-detection, or null.
 */
function getCJKFontBytes(fontDir?: string): Uint8Array | null {
    if (cachedCJKFontBytes) return cachedCJKFontBytes;

    const fs = require('fs');
    const path = require('path');

    // Priority 1: User-provided fontDir
    if (fontDir) {
        for (const fontFile of KNOWN_CJK_FONTS) {
            const fullPath = path.join(fontDir, fontFile);
            try {
                if (fs.existsSync(fullPath)) {
                    cachedCJKFontBytes = fs.readFileSync(fullPath);
                    return cachedCJKFontBytes;
                }
            } catch { /* skip */ }
        }
        // Try first TTF/OTF in fontDir
        try {
            const entries = fs.readdirSync(fontDir);
            for (const entry of entries) {
                if (/\.(ttf|otf)$/i.test(entry)) {
                    try {
                        cachedCJKFontBytes = fs.readFileSync(path.join(fontDir, entry));
                        return cachedCJKFontBytes;
                    } catch { continue; }
                }
            }
        } catch { /* skip */ }
    }

    // Priority 2: Auto-detect from system
    const systemPath = findSystemCJKFont();
    if (systemPath) {
        try {
            cachedCJKFontBytes = require('fs').readFileSync(systemPath);
            return cachedCJKFontBytes;
        } catch { /* skip */ }
    }

    return null;
}

/**
 * Render a parsed OFD document to a PDF.
 */
export async function renderToPdf(
    doc: OfdDocument,
    archive: OfdArchive,
    options: ConvertOptions = {},
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();
    const hasFontkit = await registerFontkit(pdfDoc);

    pdfDoc.setTitle('Converted from OFD');
    pdfDoc.setProducer('ofd-to-pdf by Antigravity | miconvert.com');
    pdfDoc.setCreator('ofd-to-pdf (https://github.com/huuhuybn/miconvert-ofd-to-pdf)');

    // Pre-load fonts
    const fontCache = new Map<string, PDFFont>();
    const defaultFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const embeddedFontCache = new Map<string, PDFFont>();

    // Pre-load CJK fallback font (from fontDir or system auto-detect)
    let cjkFont: PDFFont | null = null;
    if (hasFontkit) {
        const cjkBytes = getCJKFontBytes(options.fontDir);
        if (cjkBytes) {
            try {
                cjkFont = await pdfDoc.embedFont(cjkBytes, { subset: false });
            } catch {
                // CJK font couldn't be embedded
            }
        }
    }

    for (const [fontId, ofdFont] of doc.fonts) {
        let pdfFont: PDFFont | null = null;

        // Priority 1: Embedded font from OFD archive (only TTF/OTF)
        if (!pdfFont && hasFontkit && ofdFont.fontFile) {
            const fontPath = ofdFont.fontFile;
            const ext = fontPath.toLowerCase().split('.').pop() || '';
            if (['ttf', 'otf', 'woff'].includes(ext)) {
                if (embeddedFontCache.has(fontPath)) {
                    pdfFont = embeddedFontCache.get(fontPath)!;
                } else {
                    const fontBytes = readBinaryFile(archive, fontPath);
                    if (fontBytes && fontBytes.length > 100) {
                        try {
                            const embedded = await pdfDoc.embedFont(fontBytes, { subset: false });
                            embeddedFontCache.set(fontPath, embedded);
                            pdfFont = embedded;
                        } catch {
                            // OFD subset fonts may have non-standard tables
                        }
                    }
                }
            }
        }

        // Priority 2: CJK fallback font (from fontDir or system auto-detect)
        if (!pdfFont && cjkFont) {
            const fontName = (ofdFont.name || '').toLowerCase();
            // Use CJK font for any Chinese/CJK font names
            const isCJK = /[\u4e00-\u9fff]/.test(ofdFont.name || '')
                || fontName.includes('song') || fontName.includes('hei')
                || fontName.includes('kai') || fontName.includes('fang')
                || fontName.includes('sim') || fontName.includes('noto')
                || fontName.includes('pingfang') || fontName.includes('hiragino')
                || fontName.includes('source han') || fontName.includes('wenquanyi')
                || fontName.includes('stkaiti') || fontName.includes('stsong')
                || fontName.includes('stheiti') || fontName.includes('stfangsong')
                || fontName.includes('fz') || fontName.includes('adobe');
            if (isCJK) {
                pdfFont = cjkFont;
            }
        }

        // Priority 3: Standard PDF font
        if (!pdfFont) {
            const stdFont = mapToStandardFont(ofdFont);
            try {
                pdfFont = await pdfDoc.embedFont(stdFont);
            } catch {
                pdfFont = defaultFont;
            }
        }

        fontCache.set(fontId, pdfFont);
    }

    // Render each page
    for (const ofdPage of doc.pages) {
        const pageArea = ofdPage.area ?? doc.physicalBox;
        const pageWidth = pageArea.width * MM_TO_PT;
        const pageHeight = pageArea.height * MM_TO_PT;
        const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

        for (const layer of ofdPage.layers) {
            for (const obj of layer.objects) {
                try {
                    switch (obj.type) {
                        case 'text': {
                            const font = fontCache.get(obj.font) ?? defaultFont;
                            renderTextObject(pdfPage, obj, font, pageArea.height);
                            break;
                        }
                        case 'path': {
                            renderPathObject(pdfPage, obj, pageArea.height, pdfDoc);
                            break;
                        }
                        case 'image': {
                            const imageResource = doc.images.get(obj.resourceId);
                            await renderImageObject(pdfPage, pdfDoc, obj, imageResource, archive, pageArea.height, options);
                            break;
                        }
                    }
                } catch {
                    // Skip objects that fail to render (e.g. font encoding issues)
                }
            }
        }

        if (options.watermark) {
            const watermarkFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
            const watermarkText = 'Powered by Antigravity | miconvert.com';
            const watermarkSize = 8;
            const textWidth = watermarkFont.widthOfTextAtSize(watermarkText, watermarkSize);
            pdfPage.drawText(watermarkText, {
                x: pageWidth - textWidth - 10, y: 10,
                size: watermarkSize, font: watermarkFont,
                color: rgb(0.75, 0.75, 0.75), opacity: 0.5,
            });
        }
    }

    // Save with error recovery — if embedded fonts cause save-time errors,
    // retry without them
    try {
        return pdfDoc.save();
    } catch {
        // If save fails (e.g. fontkit 'tables' error from subset fonts),
        // recreate PDF using only standard fonts
        return renderToPdfSafe(doc, archive, options);
    }
}

/**
 * Fallback renderer using only standard PDF fonts (no custom font embedding).
 * Used when fontkit-embedded fonts cause save-time errors.
 */
async function renderToPdfSafe(
    doc: OfdDocument,
    archive: OfdArchive,
    options: ConvertOptions = {},
): Promise<Uint8Array> {
    const pdfDoc = await PDFDocument.create();

    pdfDoc.setTitle('Converted from OFD');
    pdfDoc.setProducer('ofd-to-pdf by Antigravity | miconvert.com');

    const fontCache = new Map<string, PDFFont>();
    const defaultFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (const [fontId, ofdFont] of doc.fonts) {
        const stdFont = mapToStandardFont(ofdFont);
        try {
            fontCache.set(fontId, await pdfDoc.embedFont(stdFont));
        } catch {
            fontCache.set(fontId, defaultFont);
        }
    }

    for (const ofdPage of doc.pages) {
        const pageArea = ofdPage.area ?? doc.physicalBox;
        const pageWidth = pageArea.width * MM_TO_PT;
        const pageHeight = pageArea.height * MM_TO_PT;
        const pdfPage = pdfDoc.addPage([pageWidth, pageHeight]);

        for (const layer of ofdPage.layers) {
            for (const obj of layer.objects) {
                try {
                    switch (obj.type) {
                        case 'text': {
                            const font = fontCache.get(obj.font) ?? defaultFont;
                            renderTextObject(pdfPage, obj, font, pageArea.height);
                            break;
                        }
                        case 'path': {
                            renderPathObject(pdfPage, obj, pageArea.height, pdfDoc);
                            break;
                        }
                        case 'image': {
                            const imageResource = doc.images.get(obj.resourceId);
                            await renderImageObject(pdfPage, pdfDoc, obj, imageResource, archive, pageArea.height, options);
                            break;
                        }
                    }
                } catch { /* skip failed objects */ }
            }
        }
    }

    return pdfDoc.save();
}
