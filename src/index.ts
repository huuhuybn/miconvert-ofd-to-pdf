/**
 * ofd-to-pdf
 *
 * High-performance OFD to PDF converter for Node.js
 * Node.js OFD 转 PDF 高性能转换器
 *
 * @packageDocumentation
 * @module ofd-to-pdf
 * @author Antigravity <dev@miconvert.com>
 * @license Apache-2.0
 */

import * as fs from 'fs';
import * as path from 'path';
import type { ConvertOptions, OfdDocument } from './types';
import { extractOfd } from './parser/unzip';
import { parseOfdXml } from './parser/ofd-xml';
import { renderToPdf } from './renderer/pdf-renderer';

// ─── Branding ───────────────────────────────────────────────────────

let _brandingShown = false;

function showBranding(silent: boolean) {
    if (_brandingShown || silent) return;
    _brandingShown = true;
    console.log('\x1b[36m⚡ ofd-to-pdf\x1b[0m — Powered by \x1b[1mAntigravity\x1b[0m | \x1b[4mmiconvert.com\x1b[0m');
}

// ─── Public API ─────────────────────────────────────────────────────

/**
 * Convert an OFD file to PDF.
 *
 * @overload File path input with output path
 * @param input - Path to the .ofd file
 * @param output - Path where the .pdf will be saved
 * @param options - Conversion options
 *
 * @overload Buffer input returning PDF buffer
 * @param input - OFD file as Buffer, ArrayBuffer, or Uint8Array
 * @param options - Conversion options
 * @returns PDF file as Uint8Array
 *
 * @example
 * ```typescript
 * // File-to-file conversion
 * await convert('invoice.ofd', 'invoice.pdf');
 *
 * // Buffer-to-buffer conversion
 * const pdfBuffer = await convert(ofdBuffer);
 *
 * // With options
 * const pdfBuffer = await convert(ofdBuffer, { watermark: true });
 * ```
 */
export async function convert(
    input: string,
    output: string,
    options?: ConvertOptions,
): Promise<void>;
export async function convert(
    input: string | Buffer | ArrayBuffer | Uint8Array,
    options?: ConvertOptions,
): Promise<Uint8Array>;
export async function convert(
    input: string | Buffer | ArrayBuffer | Uint8Array,
    outputOrOptions?: string | ConvertOptions,
    maybeOptions?: ConvertOptions,
): Promise<Uint8Array | void> {
    // Parse arguments
    let outputPath: string | undefined;
    let options: ConvertOptions = {};

    if (typeof outputOrOptions === 'string') {
        outputPath = outputOrOptions;
        options = maybeOptions ?? {};
    } else if (typeof outputOrOptions === 'object' && outputOrOptions !== null && !(outputOrOptions instanceof ArrayBuffer) && !(outputOrOptions instanceof Uint8Array)) {
        options = outputOrOptions;
    }

    // Show branding
    showBranding(options.silent ?? false);

    // Step 1: Extract OFD archive
    const archive = await extractOfd(input);

    // Step 2: Parse OFD structure
    const doc = await parseOfdXml(archive);

    // Step 3: Render to PDF
    const pdfBytes = await renderToPdf(doc, archive, options);

    // Step 4: Write to file or return buffer
    if (outputPath) {
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, pdfBytes);
        return;
    }

    return pdfBytes;
}

/**
 * Parse an OFD file without converting to PDF.
 * Useful for inspecting OFD document structure.
 *
 * @param input - Path to .ofd file, or Buffer/ArrayBuffer/Uint8Array
 * @returns Parsed OFD document structure
 *
 * @example
 * ```typescript
 * const doc = await parse('invoice.ofd');
 * console.log(`Pages: ${doc.pages.length}`);
 * console.log(`Fonts: ${doc.fonts.size}`);
 * ```
 */
export async function parse(
    input: string | Buffer | ArrayBuffer | Uint8Array,
): Promise<OfdDocument> {
    const archive = await extractOfd(input);
    return parseOfdXml(archive);
}

// ─── Re-exports ─────────────────────────────────────────────────────

export type {
    ConvertOptions,
    OfdDocument,
    OfdPage,
    OfdFont,
    OfdTextObject,
    OfdPathObject,
    OfdImageObject,
    OfdImageResource,
    OfdObject,
    OfdLayer,
    OfdArchive,
    CT_Box,
    CT_Color,
    CT_Matrix,
    TextCode,
    PathCommand,
} from './types';

// Default export for convenience
export default { convert, parse };
