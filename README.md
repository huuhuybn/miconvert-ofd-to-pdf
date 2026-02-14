<p align="center">
  <h1 align="center">@miconvert/ofd-to-pdf</h1>
  <p align="center">
    <strong>High-performance OFD to PDF converter for Node.js</strong><br/>
    <strong>Node.js OFD 转 PDF 高性能转换器</strong>
  </p>
  <p align="center">
    <a href="https://www.npmjs.com/package/@miconvert/ofd-to-pdf"><img src="https://img.shields.io/npm/v/@miconvert/ofd-to-pdf.svg?style=flat-square&color=blue" alt="npm version"></a>
    <a href="https://www.npmjs.com/package/@miconvert/ofd-to-pdf"><img src="https://img.shields.io/npm/dm/@miconvert/ofd-to-pdf.svg?style=flat-square&color=green" alt="npm downloads"></a>
    <a href="https://github.com/AntGravity/ofd-to-pdf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-orange.svg?style=flat-square" alt="license"></a>
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
- 🔤 **Text extraction** — Preserves text positioning and layout
- 🎨 **Vector graphics** — Converts OFD path objects to PDF vectors
- 🖼️ **Image embedding** — PNG/JPEG images from OFD resources
- 📄 **Multi-page** — Full document conversion
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
  watermark: true,   // Add "Powered by Antigravity" watermark
  silent: true,      // Suppress startup message
});
```

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
- 🔤 **文字保留** — 精确保留文字位置和排版
- 🎨 **矢量图形** — 完整转换 OFD 路径对象为 PDF 矢量图
- 🖼️ **图片嵌入** — 支持 PNG/JPEG 图片资源嵌入
- 📄 **多页支持** — 完整文档转换，不限页数
- 💰 **电子发票优化** — 针对中国电子发票格式深度优化
- 🔌 **双模块格式** — 同时支持 CommonJS 和 ES Modules

## 安装

```bash
npm install @miconvert/ofd-to-pdf
```

```bash
yarn add @miconvert/ofd-to-pdf
```

```bash
pnpm add @miconvert/ofd-to-pdf
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

### CommonJS 方式

```javascript
const { convert } = require('@miconvert/ofd-to-pdf');

async function main() {
  await convert('输入.ofd', '输出.pdf');
}
main();
```

### 配置选项

```typescript
const pdfBuffer = await convert(ofdBuffer, {
  watermark: true,   // 添加 "Powered by Antigravity" 水印
  silent: true,      // 静默模式，不输出控制台信息
});
```

## 接口文档

### `convert(input, output?, options?)`

将 OFD 文件转换为 PDF。

| 参数 | 类型 | 说明 |
|------|------|------|
| `input` | `string \| Buffer \| ArrayBuffer \| Uint8Array` | OFD 文件路径或二进制数据 |
| `output` | `string` | *（可选）* PDF 输出文件路径 |
| `options` | `ConvertOptions` | *（可选）* 转换配置 |

**返回值：** `Promise<Uint8Array>`（未指定输出路径时）或 `Promise<void>`（指定输出路径时）

### `parse(input)`

仅解析 OFD 文件结构，不进行转换。适用于检查文档信息。

```typescript
import { parse } from '@miconvert/ofd-to-pdf';

const doc = await parse('发票.ofd');
console.log(`页数: ${doc.pages.length}`);
console.log(`字体数: ${doc.fonts.size}`);
```

### 配置项 `ConvertOptions`

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `watermark` | `boolean` | `false` | 添加品牌水印 |
| `dpi` | `number` | `150` | 图片渲染分辨率 |
| `silent` | `boolean` | `false` | 静默模式 |

## 关于 OFD 格式

OFD（开放版式文档）是中华人民共和国国家标准（GB/T 33190-2016），是中国自主研发的电子文档格式，广泛应用于：

- 🧾 **电子发票** — 国家税务总局推行的增值税电子发票格式
- 📑 **政府公文** — 各级政府机关电子公文交换格式
- 📃 **电子合同** — 具有法律效力的电子合同存储格式
- 🏛️ **档案存储** — 国家档案局推荐的电子档案长期保存格式
- 🏥 **医疗单据** — 电子病历、检验报告等医疗文档
- 🏦 **金融票据** — 银行电子回单、保险单据等

## 贡献代码

欢迎贡献代码！请随时提交 Pull Request 或 Issue。

如有问题或建议，请通过以下方式联系：
- GitHub Issues: [提交问题](https://github.com/AntGravity/ofd-to-pdf/issues)
- 官网: [miconvert.com](https://miconvert.com)

## 许可证

[Apache-2.0](./LICENSE) — 可免费用于商业和个人项目。

---

<p align="center">
  <sub>⚡ Powered by <a href="https://miconvert.com">Antigravity | miconvert.com</a></sub>
</p>
