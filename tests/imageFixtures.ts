import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

export interface RasterMask {
    activePixels: Uint8Array;
    width: number;
    height: number;
    activeCount: number;
}

export interface PngImage {
    width: number;
    height: number;
    rgba: Uint8Array;
}

interface JpegComponent {
    id: number;
    horizontalSampling: number;
    verticalSampling: number;
    quantizationTableId: number;
}

interface JpegScanComponent {
    id: number;
    dcTableId: number;
    acTableId: number;
}

interface HuffmanTable {
    maps: Array<Map<number, number>>;
}

interface JpegLuminanceBlocks {
    width: number;
    height: number;
    blockWidth: number;
    blockHeight: number;
    values: Float32Array;
    componentIds: number[];
    componentBlocks: Map<
        number,
        { blockWidth: number; blockHeight: number; values: Float32Array }
    >;
}

export const testAssetsRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'assets');
export const logoFixturePath = resolve(testAssetsRoot, '1024x1024p.png');
export const largeIssueFixturePath = resolve(testAssetsRoot, '3888x2916p.jpg');

const jpegLuminanceBlockCache = new Map<string, JpegLuminanceBlocks>();

function paeth(left: number, up: number, upLeft: number) {
    const estimate = left + up - upLeft;
    const leftDistance = Math.abs(estimate - left);
    const upDistance = Math.abs(estimate - up);
    const upLeftDistance = Math.abs(estimate - upLeft);

    if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
    if (upDistance <= upLeftDistance) return up;
    return upLeft;
}

function bytesPerPixelForColorType(colorType: number) {
    switch (colorType) {
        case 0:
            return 1;
        case 2:
            return 3;
        case 4:
            return 2;
        case 6:
            return 4;
        default:
            throw new Error(`Unsupported PNG color type ${colorType}`);
    }
}

function readPng(filePath: string): PngImage {
    const data = readFileSync(filePath);
    const signature = data.subarray(0, 8).toString('hex');
    assert.equal(signature, '89504e470d0a1a0a', `${filePath} is not a PNG`);

    let offset = 8;
    let width = 0;
    let height = 0;
    let bitDepth = 0;
    let colorType = 0;
    let interlaceMethod = 0;
    const idatChunks: Buffer[] = [];

    while (offset < data.length) {
        const length = data.readUInt32BE(offset);
        const type = data.toString('ascii', offset + 4, offset + 8);
        const chunk = data.subarray(offset + 8, offset + 8 + length);
        offset += length + 12;

        if (type === 'IHDR') {
            width = chunk.readUInt32BE(0);
            height = chunk.readUInt32BE(4);
            bitDepth = chunk[8];
            colorType = chunk[9];
            interlaceMethod = chunk[12];
        } else if (type === 'IDAT') {
            idatChunks.push(chunk);
        } else if (type === 'IEND') {
            break;
        }
    }

    assert.equal(bitDepth, 8, 'Only 8-bit PNG fixtures are supported');
    assert.equal(interlaceMethod, 0, 'Interlaced PNG fixtures are not supported');

    const bytesPerPixel = bytesPerPixelForColorType(colorType);
    const stride = width * bytesPerPixel;
    const inflated = inflateSync(Buffer.concat(idatChunks));
    const scanlines = new Uint8Array(stride * height);
    let sourceOffset = 0;

    for (let y = 0; y < height; y++) {
        const filter = inflated[sourceOffset++];
        const rowOffset = y * stride;
        const previousRowOffset = rowOffset - stride;

        for (let x = 0; x < stride; x++) {
            const raw = inflated[sourceOffset++];
            const left = x >= bytesPerPixel ? scanlines[rowOffset + x - bytesPerPixel] : 0;
            const up = y > 0 ? scanlines[previousRowOffset + x] : 0;
            const upLeft =
                y > 0 && x >= bytesPerPixel ? scanlines[previousRowOffset + x - bytesPerPixel] : 0;

            switch (filter) {
                case 0:
                    scanlines[rowOffset + x] = raw;
                    break;
                case 1:
                    scanlines[rowOffset + x] = (raw + left) & 0xff;
                    break;
                case 2:
                    scanlines[rowOffset + x] = (raw + up) & 0xff;
                    break;
                case 3:
                    scanlines[rowOffset + x] = (raw + Math.floor((left + up) / 2)) & 0xff;
                    break;
                case 4:
                    scanlines[rowOffset + x] = (raw + paeth(left, up, upLeft)) & 0xff;
                    break;
                default:
                    throw new Error(`Unsupported PNG row filter ${filter}`);
            }
        }
    }

    const rgba = new Uint8Array(width * height * 4);
    for (let pixel = 0; pixel < width * height; pixel++) {
        const src = pixel * bytesPerPixel;
        const dst = pixel * 4;

        if (colorType === 6) {
            rgba[dst] = scanlines[src];
            rgba[dst + 1] = scanlines[src + 1];
            rgba[dst + 2] = scanlines[src + 2];
            rgba[dst + 3] = scanlines[src + 3];
        } else if (colorType === 2) {
            rgba[dst] = scanlines[src];
            rgba[dst + 1] = scanlines[src + 1];
            rgba[dst + 2] = scanlines[src + 2];
            rgba[dst + 3] = 255;
        } else if (colorType === 4) {
            rgba[dst] = scanlines[src];
            rgba[dst + 1] = scanlines[src];
            rgba[dst + 2] = scanlines[src];
            rgba[dst + 3] = scanlines[src + 1];
        } else {
            rgba[dst] = scanlines[src];
            rgba[dst + 1] = scanlines[src];
            rgba[dst + 2] = scanlines[src];
            rgba[dst + 3] = 255;
        }
    }

    return { width, height, rgba };
}

export function readPngFixture(filePath: string): PngImage {
    return readPng(filePath);
}

function buildHuffmanTable(lengthCounts: Uint8Array, symbols: Uint8Array): HuffmanTable {
    const maps = Array.from({ length: 17 }, () => new Map<number, number>());
    let code = 0;
    let symbolOffset = 0;

    for (let length = 1; length <= 16; length++) {
        const count = lengthCounts[length - 1];

        for (let i = 0; i < count; i++) {
            maps[length].set(code, symbols[symbolOffset++]);
            code++;
        }

        code <<= 1;
    }

    return { maps };
}

class JpegBitReader {
    private readonly data: Buffer;
    private offset: number;
    private bitBuffer = 0;
    private bitCount = 0;

    constructor(data: Buffer, offset: number) {
        this.data = data;
        this.offset = offset;
    }

    readBit() {
        if (this.bitCount === 0) {
            this.bitBuffer = this.readEntropyByte();
            this.bitCount = 8;
        }

        this.bitCount--;
        return (this.bitBuffer >> this.bitCount) & 1;
    }

    readBits(count: number) {
        let value = 0;

        for (let i = 0; i < count; i++) {
            value = (value << 1) | this.readBit();
        }

        return value;
    }

    receiveExtend(count: number) {
        if (count === 0) return 0;

        const value = this.readBits(count);
        const threshold = 1 << (count - 1);
        return value < threshold ? value + (-1 << count) + 1 : value;
    }

    decode(table: HuffmanTable) {
        let code = 0;

        for (let length = 1; length <= 16; length++) {
            code = (code << 1) | this.readBit();
            const symbol = table.maps[length].get(code);

            if (symbol !== undefined) {
                return symbol;
            }
        }

        throw new Error('Invalid JPEG Huffman code');
    }

    alignToByte() {
        this.bitCount = 0;
    }

    consumeRestartMarker(expectedMarker: number) {
        this.alignToByte();

        assert.equal(this.data[this.offset], 0xff, 'Expected JPEG restart marker prefix');
        while (this.data[this.offset] === 0xff) {
            this.offset++;
        }

        const marker = this.data[this.offset++];
        assert.equal(marker, 0xd0 + expectedMarker, 'Unexpected JPEG restart marker');
    }

    private readEntropyByte() {
        const value = this.data[this.offset++];
        if (value !== 0xff) {
            return value;
        }

        let marker = this.data[this.offset++];
        while (marker === 0xff) {
            marker = this.data[this.offset++];
        }

        if (marker === 0x00) {
            return 0xff;
        }

        throw new Error(`Unexpected JPEG marker 0x${marker.toString(16)} inside entropy data`);
    }
}

function skipJpegBlockAc(reader: JpegBitReader, table: HuffmanTable) {
    let coefficient = 1;

    while (coefficient < 64) {
        const symbol = reader.decode(table);

        if (symbol === 0) {
            break;
        }

        if (symbol === 0xf0) {
            coefficient += 16;
            continue;
        }

        coefficient += symbol >> 4;
        const bitCount = symbol & 0x0f;

        if (bitCount > 0) {
            reader.readBits(bitCount);
            coefficient++;
        }
    }
}

function readJpegLuminanceBlocks(filePath: string): JpegLuminanceBlocks {
    const cached = jpegLuminanceBlockCache.get(filePath);
    if (cached) {
        return cached;
    }

    const data = readFileSync(filePath);
    assert.equal(data.readUInt16BE(0), 0xffd8, `${filePath} is not a JPEG`);

    const quantizationTables = new Map<number, Uint16Array>();
    const dcHuffmanTables = new Map<number, HuffmanTable>();
    const acHuffmanTables = new Map<number, HuffmanTable>();
    const frameComponents = new Map<number, JpegComponent>();
    let width = 0;
    let height = 0;
    let restartInterval = 0;
    let scanComponents: JpegScanComponent[] = [];
    let entropyOffset = 0;
    let offset = 2;

    while (offset < data.length) {
        assert.equal(data[offset++], 0xff, 'Expected JPEG marker prefix');
        while (data[offset] === 0xff) {
            offset++;
        }

        const marker = data[offset++];
        if (marker === 0xd9) break;
        if (marker >= 0xd0 && marker <= 0xd7) continue;

        const length = data.readUInt16BE(offset);
        const segmentStart = offset + 2;
        const segmentEnd = offset + length;
        offset = segmentEnd;

        if (marker === 0xdb) {
            let segmentOffset = segmentStart;
            while (segmentOffset < segmentEnd) {
                const tableInfo = data[segmentOffset++];
                const precision = tableInfo >> 4;
                const tableId = tableInfo & 0x0f;
                assert.equal(precision, 0, 'Only 8-bit JPEG quantization tables are supported');
                quantizationTables.set(
                    tableId,
                    Uint16Array.from(data.subarray(segmentOffset, segmentOffset + 64))
                );
                segmentOffset += 64;
            }
        } else if (marker === 0xc4) {
            let segmentOffset = segmentStart;
            while (segmentOffset < segmentEnd) {
                const tableInfo = data[segmentOffset++];
                const tableClass = tableInfo >> 4;
                const tableId = tableInfo & 0x0f;
                const counts = data.subarray(segmentOffset, segmentOffset + 16);
                segmentOffset += 16;
                const symbolCount = counts.reduce((sum, count) => sum + count, 0);
                const symbols = data.subarray(segmentOffset, segmentOffset + symbolCount);
                segmentOffset += symbolCount;

                if (tableClass === 0) {
                    dcHuffmanTables.set(tableId, buildHuffmanTable(counts, symbols));
                } else {
                    acHuffmanTables.set(tableId, buildHuffmanTable(counts, symbols));
                }
            }
        } else if (marker === 0xc0) {
            assert.equal(data[segmentStart], 8, 'Only 8-bit baseline JPEG fixtures are supported');
            height = data.readUInt16BE(segmentStart + 1);
            width = data.readUInt16BE(segmentStart + 3);
            const componentCount = data[segmentStart + 5];
            let componentOffset = segmentStart + 6;

            for (let i = 0; i < componentCount; i++) {
                const id = data[componentOffset++];
                const sampling = data[componentOffset++];
                const quantizationTableId = data[componentOffset++];
                frameComponents.set(id, {
                    id,
                    horizontalSampling: sampling >> 4,
                    verticalSampling: sampling & 0x0f,
                    quantizationTableId,
                });
            }
        } else if (marker === 0xdd) {
            restartInterval = data.readUInt16BE(segmentStart);
        } else if (marker === 0xda) {
            const componentCount = data[segmentStart];
            let componentOffset = segmentStart + 1;
            scanComponents = [];

            for (let i = 0; i < componentCount; i++) {
                const id = data[componentOffset++];
                const tableIds = data[componentOffset++];
                scanComponents.push({
                    id,
                    dcTableId: tableIds >> 4,
                    acTableId: tableIds & 0x0f,
                });
            }

            assert.equal(data[componentOffset], 0, 'Only baseline JPEG scans are supported');
            assert.equal(data[componentOffset + 1], 63, 'Only baseline JPEG scans are supported');
            assert.equal(data[componentOffset + 2], 0, 'Only baseline JPEG scans are supported');
            entropyOffset = segmentEnd;
            break;
        }
    }

    assert.ok(width > 0 && height > 0, 'JPEG fixture should declare dimensions');
    assert.ok(scanComponents.length > 0, 'JPEG fixture should contain a scan');

    const components = Array.from(frameComponents.values());
    const maxHorizontalSampling = Math.max(
        ...components.map((component) => component.horizontalSampling)
    );
    const maxVerticalSampling = Math.max(
        ...components.map((component) => component.verticalSampling)
    );
    const mcuWidth = maxHorizontalSampling * 8;
    const mcuHeight = maxVerticalSampling * 8;
    const mcusX = Math.ceil(width / mcuWidth);
    const mcusY = Math.ceil(height / mcuHeight);
    const blockWidth = Math.ceil(width / 8);
    const blockHeight = Math.ceil(height / 8);
    const values = new Float32Array(blockWidth * blockHeight);
    values.fill(255);

    const componentBlocks = new Map<
        number,
        { blockWidth: number; blockHeight: number; values: Float32Array }
    >();
    for (const component of components) {
        const componentBlockWidth = mcusX * component.horizontalSampling;
        const componentBlockHeight = mcusY * component.verticalSampling;
        const componentValues = new Float32Array(componentBlockWidth * componentBlockHeight);
        componentValues.fill(128);
        componentBlocks.set(component.id, {
            blockWidth: componentBlockWidth,
            blockHeight: componentBlockHeight,
            values: componentValues,
        });
    }

    const reader = new JpegBitReader(data, entropyOffset);
    const dcPredictors = new Map<number, number>();
    const luminanceComponentId = components[0].id;
    let mcuCount = 0;
    let expectedRestartMarker = 0;

    for (let mcuY = 0; mcuY < mcusY; mcuY++) {
        for (let mcuX = 0; mcuX < mcusX; mcuX++) {
            if (restartInterval > 0 && mcuCount > 0 && mcuCount % restartInterval === 0) {
                reader.consumeRestartMarker(expectedRestartMarker);
                expectedRestartMarker = (expectedRestartMarker + 1) & 7;
                dcPredictors.clear();
            }

            for (const scanComponent of scanComponents) {
                const component = frameComponents.get(scanComponent.id);
                assert.ok(component, `Missing JPEG component ${scanComponent.id}`);

                const dcTable = dcHuffmanTables.get(scanComponent.dcTableId);
                const acTable = acHuffmanTables.get(scanComponent.acTableId);
                const quantizationTable = quantizationTables.get(component.quantizationTableId);
                assert.ok(dcTable, `Missing JPEG DC Huffman table ${scanComponent.dcTableId}`);
                assert.ok(acTable, `Missing JPEG AC Huffman table ${scanComponent.acTableId}`);
                assert.ok(
                    quantizationTable,
                    `Missing JPEG quantization table ${component.quantizationTableId}`
                );

                for (let by = 0; by < component.verticalSampling; by++) {
                    for (let bx = 0; bx < component.horizontalSampling; bx++) {
                        const category = reader.decode(dcTable);
                        const dc =
                            (dcPredictors.get(component.id) ?? 0) + reader.receiveExtend(category);
                        dcPredictors.set(component.id, dc);
                        skipJpegBlockAc(reader, acTable);

                        const componentBlock = componentBlocks.get(component.id);
                        assert.ok(componentBlock, `Missing block storage for component ${component.id}`);
                        const blockX = mcuX * component.horizontalSampling + bx;
                        const blockY = mcuY * component.verticalSampling + by;
                        const average = Math.max(
                            0,
                            Math.min(255, (dc * quantizationTable[0]) / 8 + 128)
                        );

                        if (
                            blockX < componentBlock.blockWidth &&
                            blockY < componentBlock.blockHeight
                        ) {
                            componentBlock.values[blockY * componentBlock.blockWidth + blockX] =
                                average;
                        }

                        if (component.id === luminanceComponentId) {
                            if (blockX < blockWidth && blockY < blockHeight) {
                                values[blockY * blockWidth + blockX] = average;
                            }
                        }
                    }
                }
            }

            mcuCount++;
        }
    }

    const result = {
        width,
        height,
        blockWidth,
        blockHeight,
        values,
        componentIds: components.map((component) => component.id),
        componentBlocks,
    };
    jpegLuminanceBlockCache.set(filePath, result);
    return result;
}

/**
 * Create a compact, stable color histogram from a baseline JPEG's DC blocks.
 *
 * The existing test decoder intentionally skips AC coefficients because mesh
 * fixtures only need image structure. For auto-paint regression coverage we
 * reuse those block averages: they preserve broad image colors while keeping
 * the fixture fast to load and dependency-free.
 */
export function colorSwatchesFromJpegBlocks(
    filePath: string,
    maxColors: number = 4096
): Array<{ hex: string; count: number }> {
    const image = readJpegLuminanceBlocks(filePath);
    const [luminanceId, cbId, crId] = image.componentIds;
    const luminanceBlocks = image.componentBlocks.get(luminanceId);
    const cbBlocks = cbId === undefined ? undefined : image.componentBlocks.get(cbId);
    const crBlocks = crId === undefined ? undefined : image.componentBlocks.get(crId);
    assert.ok(luminanceBlocks, 'JPEG fixture should include a luminance component');

    const counts = new Map<string, number>();
    const clampByte = (value: number) => Math.max(0, Math.min(255, Math.round(value)));
    const quantize = (value: number) => Math.min(255, Math.round(value / 16) * 16);
    const sample = (
        component: { blockWidth: number; blockHeight: number; values: Float32Array },
        x: number,
        y: number
    ) => {
        const sourceX = Math.min(
            component.blockWidth - 1,
            Math.floor((x * component.blockWidth) / image.blockWidth)
        );
        const sourceY = Math.min(
            component.blockHeight - 1,
            Math.floor((y * component.blockHeight) / image.blockHeight)
        );
        return component.values[sourceY * component.blockWidth + sourceX];
    };

    for (let y = 0; y < image.blockHeight; y++) {
        for (let x = 0; x < image.blockWidth; x++) {
            const luminance = sample(luminanceBlocks, x, y);
            const cb = cbBlocks ? sample(cbBlocks, x, y) : 128;
            const cr = crBlocks ? sample(crBlocks, x, y) : 128;
            const r = quantize(clampByte(luminance + 1.402 * (cr - 128)));
            const g = quantize(clampByte(luminance - 0.344136 * (cb - 128) - 0.714136 * (cr - 128)));
            const b = quantize(clampByte(luminance + 1.772 * (cb - 128)));
            const hex = `#${[r, g, b]
                .map((value) => value.toString(16).padStart(2, '0'))
                .join('')}`;
            counts.set(hex, (counts.get(hex) ?? 0) + 1);
        }
    }

    return Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, maxColors)
        .map(([hex, count]) => ({ hex, count }));
}

export function maskFromPngAlpha(filePath: string, maxSide: number): RasterMask {
    const image = readPng(filePath);
    const sampleSize = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxSide));
    const width = Math.ceil(image.width / sampleSize);
    const height = Math.ceil(image.height / sampleSize);
    const activePixels = new Uint8Array(width * height);
    let activeCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sourceMinX = x * sampleSize;
            const sourceMinY = y * sampleSize;
            const sourceMaxX = Math.min(sourceMinX + sampleSize, image.width);
            const sourceMaxY = Math.min(sourceMinY + sampleSize, image.height);
            let alphaTotal = 0;
            let samples = 0;

            for (let sourceY = sourceMinY; sourceY < sourceMaxY; sourceY++) {
                for (let sourceX = sourceMinX; sourceX < sourceMaxX; sourceX++) {
                    alphaTotal += image.rgba[(sourceY * image.width + sourceX) * 4 + 3];
                    samples++;
                }
            }

            if (alphaTotal / samples >= 24) {
                activePixels[y * width + x] = 1;
                activeCount++;
            }
        }
    }

    return { activePixels, width, height, activeCount };
}

export function maskFromJpegLuminance(
    filePath: string,
    maxSide: number,
    threshold: number
): RasterMask {
    const image = readJpegLuminanceBlocks(filePath);
    const sampleSize = Math.max(1, Math.ceil(Math.max(image.width, image.height) / maxSide));
    const width = Math.ceil(image.width / sampleSize);
    const height = Math.ceil(image.height / sampleSize);
    const activePixels = new Uint8Array(width * height);
    let activeCount = 0;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const sourceMinX = x * sampleSize;
            const sourceMinY = y * sampleSize;
            const sourceMaxX = Math.min(sourceMinX + sampleSize, image.width);
            const sourceMaxY = Math.min(sourceMinY + sampleSize, image.height);
            const blockMinX = Math.floor(sourceMinX / 8);
            const blockMinY = Math.floor(sourceMinY / 8);
            const blockMaxX = Math.min(image.blockWidth - 1, Math.floor((sourceMaxX - 1) / 8));
            const blockMaxY = Math.min(image.blockHeight - 1, Math.floor((sourceMaxY - 1) / 8));
            let luminanceTotal = 0;
            let samples = 0;

            for (let blockY = blockMinY; blockY <= blockMaxY; blockY++) {
                for (let blockX = blockMinX; blockX <= blockMaxX; blockX++) {
                    luminanceTotal += image.values[blockY * image.blockWidth + blockX];
                    samples++;
                }
            }

            if (samples > 0 && luminanceTotal / samples <= threshold) {
                activePixels[y * width + x] = 1;
                activeCount++;
            }
        }
    }

    return { activePixels, width, height, activeCount };
}
