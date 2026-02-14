/**
 * OFD Data Model Types
 *
 * Based on GB/T 33190-2016: Electronic Document Storage and Exchange Format
 * Open Fixed-layout Document (OFD)
 *
 * OFD files are ZIP archives containing XML files that describe
 * fixed-layout document pages with text, paths, and images.
 */

// ─── Core Measurement ───────────────────────────────────────────────

/** Physical box in millimeters: x y width height */
export interface CT_Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

/** 2D transformation matrix [a b c d e f] */
export interface CT_Matrix {
    a: number;
    b: number;
    c: number;
    d: number;
    e: number;
    f: number;
}

// ─── Color ──────────────────────────────────────────────────────────

export interface CT_Color {
    value: string;         // e.g. "0 0 0" (space-separated RGB 0-255)
    alpha?: number;        // 0-255, default 255
    colorSpace?: string;   // Reference to color space resource
}

// ─── Font ───────────────────────────────────────────────────────────

export interface OfdFont {
    id: string;
    name: string;          // Font family name
    familyName?: string;
    charset?: string;      // e.g. "unicode"
    italic?: boolean;
    bold?: boolean;
    serif?: boolean;
    fixedWidth?: boolean;
    fontFile?: string;     // Path to embedded font file in OFD archive
}

// ─── Text Object ────────────────────────────────────────────────────

export interface TextCode {
    x?: number;            // Starting X position
    y?: number;            // Starting Y position
    deltaX?: number[];     // Character spacing deltas
    deltaY?: number[];     // Character spacing deltas (vertical)
    text: string;          // The actual text content
}

export interface OfdTextObject {
    type: 'text';
    id: string;
    boundary: CT_Box;
    font: string;          // Font resource ID reference
    size: number;          // Font size in mm
    fillColor?: CT_Color;
    strokeColor?: CT_Color;
    weight?: number;       // Font weight (100-900)
    italic?: boolean;
    ctm?: CT_Matrix;       // Coordinate transformation matrix
    textCodes: TextCode[];
}

// ─── Path Object ────────────────────────────────────────────────────

/** Individual path command */
export type PathCommand =
    | { type: 'M'; x: number; y: number }                                           // MoveTo
    | { type: 'L'; x: number; y: number }                                           // LineTo
    | { type: 'B'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } // CubicBezier
    | { type: 'Q'; x1: number; y1: number; x: number; y: number }                   // QuadraticBezier
    | { type: 'A'; rx: number; ry: number; angle: number; large: boolean; sweep: boolean; x: number; y: number } // Arc
    | { type: 'C' }                                                                  // ClosePath
    ;

export interface OfdPathObject {
    type: 'path';
    id: string;
    boundary: CT_Box;
    abbreviatedData: string;    // Raw abbreviated path data string
    commands: PathCommand[];    // Parsed path commands
    fillColor?: CT_Color;
    strokeColor?: CT_Color;
    lineWidth?: number;
    ctm?: CT_Matrix;
    fill?: boolean;
    stroke?: boolean;
}

// ─── Image Object ───────────────────────────────────────────────────

export interface OfdImageObject {
    type: 'image';
    id: string;
    boundary: CT_Box;
    resourceId: string;     // Reference to image resource
    ctm?: CT_Matrix;
}

// ─── Page Layer & Page ──────────────────────────────────────────────

export type OfdObject = OfdTextObject | OfdPathObject | OfdImageObject;

export interface OfdLayer {
    id?: string;
    type?: string;           // e.g. "Body", "Foreground", "Background"
    objects: OfdObject[];
}

export interface OfdPage {
    id: string;
    index: number;
    area?: CT_Box;           // Page area (defaults to document PhysicalBox)
    layers: OfdLayer[];
}

// ─── Image Resource ─────────────────────────────────────────────────

export interface OfdImageResource {
    id: string;
    format: string;          // "PNG", "JPEG", "BMP", etc.
    path: string;            // Path within the OFD archive
}

// ─── Document ───────────────────────────────────────────────────────

export interface OfdDocument {
    /** Document physical box (default page size) in mm */
    physicalBox: CT_Box;

    /** All fonts declared in the document */
    fonts: Map<string, OfdFont>;

    /** All image resources */
    images: Map<string, OfdImageResource>;

    /** All pages in order */
    pages: OfdPage[];

    /** Document base path within the ZIP */
    basePath: string;
}

// ─── Conversion Options ─────────────────────────────────────────────

export interface ConvertOptions {
    /** Whether to add a subtle "Powered by Antigravity | miconvert.com" watermark. Default: false */
    watermark?: boolean;

    /** DPI for image rendering. Default: 150 */
    dpi?: number;

    /** Suppress the startup branding console message. Default: false */
    silent?: boolean;
}

// ─── Virtual File System (extracted OFD archive) ────────────────────

export type OfdArchive = Map<string, Uint8Array>;
