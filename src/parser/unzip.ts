/**
 * OFD Archive Extractor
 *
 * OFD files are ZIP archives. This module extracts
 * their contents into a virtual file system map.
 */

import JSZip from 'jszip';
import * as fs from 'fs';
import * as path from 'path';
import type { OfdArchive } from '../types';

/**
 * Extract an OFD file into a virtual file system.
 *
 * @param input - File path (string), Buffer, or ArrayBuffer of the OFD file
 * @returns Map of normalized file paths → file contents as Uint8Array
 */
export async function extractOfd(
    input: string | Buffer | ArrayBuffer | Uint8Array,
): Promise<OfdArchive> {
    let data: Buffer | ArrayBuffer | Uint8Array;

    if (typeof input === 'string') {
        // File path — read from disk
        data = fs.readFileSync(path.resolve(input));
    } else {
        data = input;
    }

    const zip = await JSZip.loadAsync(data);
    const archive: OfdArchive = new Map();

    const entries = Object.keys(zip.files);

    for (const entryPath of entries) {
        const entry = zip.files[entryPath];
        if (entry.dir) continue;

        const content = await entry.async('uint8array');
        // Normalize path separators to forward slash
        const normalizedPath = entryPath.replace(/\\/g, '/');
        archive.set(normalizedPath, content);
    }

    return archive;
}

/**
 * Read a text file from the OFD archive.
 *
 * @param archive - The extracted OFD archive
 * @param filePath - Path within the archive (case-insensitive search fallback)
 * @returns UTF-8 string content, or null if not found
 */
export function readTextFile(archive: OfdArchive, filePath: string): string | null {
    const normalized = filePath.replace(/\\/g, '/');

    // Direct lookup
    const data = archive.get(normalized);
    if (data) {
        return new TextDecoder('utf-8').decode(data);
    }

    // Case-insensitive fallback
    const lowerTarget = normalized.toLowerCase();
    for (const [key, value] of archive) {
        if (key.toLowerCase() === lowerTarget) {
            return new TextDecoder('utf-8').decode(value);
        }
    }

    return null;
}

/**
 * Read a binary file from the OFD archive.
 */
export function readBinaryFile(archive: OfdArchive, filePath: string): Uint8Array | null {
    const normalized = filePath.replace(/\\/g, '/');

    const data = archive.get(normalized);
    if (data) return data;

    // Case-insensitive fallback
    const lowerTarget = normalized.toLowerCase();
    for (const [key, value] of archive) {
        if (key.toLowerCase() === lowerTarget) {
            return value;
        }
    }

    return null;
}
