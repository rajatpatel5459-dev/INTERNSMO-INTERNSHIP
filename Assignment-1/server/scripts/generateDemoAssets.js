const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..', '..');
const TRACK_DIRECTORY = path.join(ROOT, 'assets', 'tracks');
const COVER_DIRECTORY = path.join(ROOT, 'assets', 'covers');
const SAMPLE_RATE = 22050;
const DURATION_SECONDS = 16;
const BPM = [100, 103, 106, 108, 112];
const ROOT_HZ = [110, 82.41, 123.47, 98, 110];
const PALETTES = [
  [[18, 30, 66], [24, 211, 190], [255, 190, 80]],
  [[48, 23, 76], [179, 91, 255], [255, 142, 102]],
  [[12, 73, 91], [50, 220, 184], [240, 218, 112]],
  [[66, 27, 38], [255, 105, 117], [255, 201, 111]],
  [[24, 43, 74], [91, 163, 255], [194, 238, 255]],
];

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function interpolateColor(start, end, amount) {
  return start.map((value, index) => Math.round(value + (end[index] - value) * amount));
}

function createCover(index) {
  const width = 512;
  const height = 512;
  const palette = PALETTES[index];
  const scanlines = Buffer.alloc(height * (1 + width * 3));

  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (1 + width * 3);
    scanlines[rowStart] = 0;
    for (let x = 0; x < width; x += 1) {
      const gradient = (x + y * 0.62) / (width + height * 0.62);
      let color = interpolateColor(palette[0], palette[1], gradient);
      const dx = x - (155 + index * 36);
      const dy = y - (180 + index * 17);
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius < 105 || (radius > 132 && radius < 148)) {
        const blend = radius < 105 ? 0.8 : 0.42;
        color = interpolateColor(color, palette[2], blend);
      }
      const stripe = ((x + y + index * 27) % 96) < 5;
      if (stripe) color = interpolateColor(color, palette[2], 0.45);
      const pixelOffset = rowStart + 1 + x * 3;
      scanlines[pixelOffset] = color[0];
      scanlines[pixelOffset + 1] = color[1];
      scanlines[pixelOffset + 2] = color[2];
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  header[10] = 0;
  header[11] = 0;
  header[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function createWav(index) {
  const sampleCount = SAMPLE_RATE * DURATION_SECONDS;
  const data = Buffer.alloc(sampleCount * 2);
  const beatSeconds = 60 / BPM[index];
  const notes = [1, 1.25, 1.5, 2, 1.5, 1.25, 1, 1.5];

  for (let sample = 0; sample < sampleCount; sample += 1) {
    const time = sample / SAMPLE_RATE;
    const beat = Math.floor(time / beatSeconds);
    const beatTime = time % beatSeconds;
    const noteHz = ROOT_HZ[index] * notes[beat % notes.length];
    const fadeIn = Math.min(1, time / 0.2);
    const fadeOut = Math.min(1, (DURATION_SECONDS - time) / 0.5);
    const pulse = Math.exp(-beatTime * 5);
    const pad = Math.sin(2 * Math.PI * noteHz * time) * 0.18
      + Math.sin(2 * Math.PI * noteHz * 1.5 * time) * 0.07;
    const bass = Math.sin(2 * Math.PI * ROOT_HZ[index] * 0.5 * time) * 0.18 * pulse;
    const accent = Math.sin(2 * Math.PI * 880 * time) * 0.035 * pulse;
    const value = Math.max(-1, Math.min(1, (pad + bass + accent) * fadeIn * fadeOut));
    data.writeInt16LE(Math.round(value * 32767), sample * 2);
  }

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

fs.mkdirSync(TRACK_DIRECTORY, { recursive: true });
fs.mkdirSync(COVER_DIRECTORY, { recursive: true });
for (let index = 0; index < BPM.length; index += 1) {
  const number = String(index + 1).padStart(2, '0');
  fs.writeFileSync(path.join(TRACK_DIRECTORY, `demo-track-${number}.wav`), createWav(index));
  fs.writeFileSync(path.join(COVER_DIRECTORY, `demo-track-${number}.png`), createCover(index));
}
console.log(`Generated ${BPM.length} original synthetic WAV tracks and PNG covers.`);
