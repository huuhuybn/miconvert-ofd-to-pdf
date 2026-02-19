<p align="center">
  <h1 align="center">@miconvert/ofd-to-pdf</h1>
  <p align="center">
    <strong>High-performance OFD to PDF converter for Node.js</strong><br/>
    <strong>Node.js OFD 转 PDF 高性能转换器</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@miconvert/ofd-to-pdf"><img src="https://img.shields.io/npm/v/@miconvert/ofd-to-pdf.svg?style=flat-square&color=blue" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@miconvert/ofd-to-pdf"><img src="https://img.shields.io/npm/dm/@miconvert/ofd-to-pdf.svg?style=flat-square&color=green" alt="npm downloads"></a>
    <a href="https://github.com/huuhuybn/miconvert-ofd-to-pdf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-orange.svg?style=flat-square" alt="license"></a>
    <a href="https://miconvert.com"><img src="https://img.shields.io/badge/by-Antigravity-purple.svg?style=flat-square" alt="by Antigravity"></a>
  </p>
</p>

---

Convert OFD (Open Fixed-layout Document, China GB/T 33190) files to PDF with a single function call. Zero native dependencies — pure JavaScript powered by `pdf-lib`.

将 OFD（版式文档格式，中国国家标准 GB/T 33190）文件转换为 PDF，只需一行代码。纯 JavaScript 实现，零原生依赖。

**[English](#-features) | [中文文档](#-中文文档)**

## ✨ Features

- 🚀 **One-line conversion** — `await convert('input.ofd', 'output.pdf')`
- 📦 **Zero native deps** — No Java, C++, or WASM required
- 🀄 **CJK font support** — Auto-detects system Chinese fonts (宋体, 黑体, Noto Sans SC)
- 🔤 **Text extraction** — Preserves text positioning and layout
- 🎨 **Vector graphics** — Converts OFD path objects to PDF vectors
- 🖼️ **Image embedding** — PNG/JPEG images from OFD resources
- 📄 **Multi-page & templates** — Full document with template page support
- 💰 **E-invoice ready** — Optimized for Chinese 电子发票
- 🔌 **Dual format** — CommonJS + ES Modules

## 📥 Installation

```bash
npm install @miconvert/ofd-to-pdf
```

```bash
yarn add @miconvert/ofd-to-pdf
```

```bash
pnpm add @miconvert/ofd-to-pdf
```

## 🚀 Quick Start

### File-to-File Conversion

```typescript
import { convert } from '@miconvert/ofd-to-pdf';

// Convert OFD to PDF
await convert('invoice.ofd', 'invoice.pdf');
```

### Buffer-to-Buffer

```typescript
import { convert } from '@miconvert/ofd-to-pdf';
import { readFileSync } from 'fs';

const ofdBuffer = readFileSync('invoice.ofd');
const pdfBuffer = await convert(ofdBuffer);
// pdfBuffer is a Uint8Array containing the PDF
```

### CommonJS

```javascript
const { convert } = require('@miconvert/ofd-to-pdf');

async function main() {
  await convert('input.ofd', 'output.pdf');
}
main();
```

### With Options

```typescript
const pdfBuffer = await convert(ofdBuffer, {
  fontDir: '/path/to/fonts',  // Directory with CJK fonts (.ttf/.otf)
  watermark: true,             // Add "Powered by Antigravity" watermark
  silent: true,                // Suppress startup message
});
```

## 🀄 CJK Font Support (Chinese / 中文字体)

OFD files often contain Chinese text (电子发票, 政府公文). This package auto-detects CJK fonts from your system:

| Platform | Auto-detected fonts |
|----------|-------------------|
| **Windows** | SimSun.ttf, SimHei.ttf, msyh.ttf (微软雅黑) |
| **macOS** | Requires manual install (see below) |
| **Linux** | `noto-fonts-cjk` package, WenQuanYi |

### Setup for macOS

macOS system CJK fonts use TTC format (not supported by fontkit). Install a TTF font:

```bash
# Download Noto Sans SC from Google Fonts
curl -L "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf" \
  -o ~/Library/Fonts/NotoSansSC-Regular.ttf
```

### Setup for Linux

```bash
# Ubuntu/Debian
sudo apt install fonts-noto-cjk

# Fedora/RHEL
sudo dnf install google-noto-sans-cjk-fonts

# Arch
sudo pacman -S noto-fonts-cjk
```

### Custom Font Directory

You can also provide a directory with TTF/OTF fonts:

```typescript
const pdf = await convert(ofdBuffer, {
  fontDir: '/path/to/fonts'  // Contains SimSun.ttf, NotoSansSC-Regular.ttf, etc.
});
```

> **Note:** CJK fonts are embedded without subsetting due to a limitation in `@pdf-lib/fontkit` v1. This results in larger PDF files (~10-17MB) but ensures all Chinese characters render correctly.

## 📖 API Reference

### `convert(input, output?, options?)`

Convert an OFD file to PDF.

| Parameter | Type | Description |
|-----------|------|-------------|
| `input` | `string \| Buffer \| ArrayBuffer \| Uint8Array` | OFD file path or binary data |
| `output` | `string` | *(Optional)* Output PDF file path |
| `options` | `ConvertOptions` | *(Optional)* Conversion options |

**Returns:** `Promise<Uint8Array>` (if no output path) or `Promise<void>` (if output path given)

### `parse(input)`

Parse an OFD file without converting. Useful for inspecting document structure.

```typescript
import { parse } from '@miconvert/ofd-to-pdf';

const doc = await parse('invoice.ofd');
console.log(`Pages: ${doc.pages.length}`);
console.log(`Fonts: ${doc.fonts.size}`);
```

### `ConvertOptions`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontDir` | `string` | — | Directory containing CJK fonts (.ttf/.otf) |
| `watermark` | `boolean` | `false` | Add subtle branding watermark |
| `dpi` | `number` | `150` | Image resolution |
| `silent` | `boolean` | `false` | Suppress console branding |

## 📋 OFD Format

OFD (Open Fixed-layout Document) is China's national standard for electronic documents (GB/T 33190-2016), widely used for:

- 🧾 **Electronic invoices** (电子发票)
- 📑 **Government documents** (政府公文)
- 📃 **Electronic contracts** (电子合同)
- 🏛️ **Document archiving** (档案存储)

---

# 📘 中文文档

## 简介

`@miconvert/ofd-to-pdf` 是一个高性能的 Node.js 库，用于将 OFD（开放版式文档，国家标准 GB/T 33190-2016）文件转换为 PDF 格式。

### 核心优势

- ⚡ **一行代码转换** — 简单易用，开箱即用
- 📦 **零原生依赖** — 无需安装 Java、C++ 编译器或 WASM 运行时
- 🀄 **中文字体支持** — 自动检测系统中文字体（宋体、黑体、Noto Sans SC）
- 🔤 **文字保留** — 精确保留文字位置和排版
- 🎨 **矢量图形** — 完整转换 OFD 路径对象为 PDF 矢量图
- 🖼️ **图片嵌入** — 支持 PNG/JPEG 图片资源嵌入
- 📄 **多页和模板页** — 完整支持文档模板页合并
- 💰 **电子发票优化** — 针对中国电子发票格式深度优化
- 🔌 **双模块格式** — 同时支持 CommonJS 和 ES Modules

## 安装

```bash
npm install @miconvert/ofd-to-pdf
```

## 快速开始

### 文件转换

```typescript
import { convert } from '@miconvert/ofd-to-pdf';

// 将 OFD 文件转换为 PDF
await convert('发票.ofd', '发票.pdf');
```

### 内存转换（Buffer）

```typescript
import { convert } from '@miconvert/ofd-to-pdf';
import { readFileSync } from 'fs';

const ofdBuffer = readFileSync('发票.ofd');
const pdfBuffer = await convert(ofdBuffer);
// pdfBuffer 是包含 PDF 内容的 Uint8Array
```

### 配置选项

```typescript
const pdfBuffer = await convert(ofdBuffer, {
  fontDir: '/path/to/fonts',  // 中文字体目录（.ttf/.otf 文件）
  watermark: true,             // 添加 "Powered by Antigravity" 水印
  silent: true,                // 静默模式
});
```

## 🀄 中文字体配置

### Windows

Windows 系统自带宋体（SimSun）、黑体（SimHei）等字体，**无需额外配置**。

### macOS

macOS 系统字体为 TTC 格式（fontkit 不支持），需要手动安装 TTF 字体：

```bash
curl -L "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc/NotoSansSC%5Bwght%5D.ttf" \
  -o ~/Library/Fonts/NotoSansSC-Regular.ttf
```

### Linux

```bash
# Ubuntu/Debian
sudo apt install fonts-noto-cjk

# Fedora/RHEL
sudo dnf install google-noto-sans-cjk-fonts
```

### 自定义字体目录

```typescript
const pdf = await convert(ofdBuffer, {
  fontDir: '/path/to/fonts'  // 包含 SimSun.ttf、NotoSansSC-Regular.ttf 等
});
```

> **注意：** 由于 `@pdf-lib/fontkit` v1 的限制，中文字体将完整嵌入（不做子集化），生成的 PDF 文件较大（约 10-17MB）。

## 接口文档

### `convert(input, output?, options?)`

将 OFD 文件转换为 PDF。

| 参数 | 类型 | 说明 |
|------|------|------|
| `input` | `string \| Buffer \| ArrayBuffer \| Uint8Array` | OFD 文件路径或二进制数据 |
| `output` | `string` | *（可选）* PDF 输出文件路径 |
| `options` | `ConvertOptions` | *（可选）* 转换配置 |

**返回值：** `Promise<Uint8Array>`（未指定输出路径时）或 `Promise<void>`（指定输出路径时）

### 配置项 `ConvertOptions`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `fontDir` | `string` | — | 中文字体目录（.ttf/.otf 文件）|
| `watermark` | `boolean` | `false` | 添加品牌水印 |
| `dpi` | `number` | `150` | 图片渲染分辨率 |
| `silent` | `boolean` | `false` | 静默模式 |

## 关于 OFD 格式

OFD（开放版式文档）是中华人民共和国国家标准（GB/T 33190-2016），广泛应用于：

- 🧾 **电子发票** — 国家税务总局推行的增值税电子发票格式
- 📑 **政府公文** — 各级政府机关电子公文交换格式
- 📃 **电子合同** — 具有法律效力的电子合同存储格式
- 🏛️ **档案存储** — 国家档案局推荐的电子档案长期保存格式
- 🏥 **医疗单据** — 电子病历、检验报告等医疗文档
- 🏦 **金融票据** — 银行电子回单、保险单据等

## 许可证

[Apache-2.0](./LICENSE) — 可免费用于商业和个人项目。

---

<p align="center">
  <sub>⚡ Powered by <a href="https://miconvert.com">Antigravity | miconvert.com</a></sub>
</p>
