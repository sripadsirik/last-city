// Reproducible CC0 asset packaging. Run once; the application serves the GLB locally.
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const id = "modular_urban_apartments_facade";
async function download(file) {
  const response = await fetch(file.url); if (!response.ok) throw new Error(`${response.status}: ${file.url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (file.md5 && createHash("md5").update(bytes).digest("hex") !== file.md5) throw new Error(`Checksum failed: ${file.url}`);
  return bytes;
}
const response = await fetch(`https://api.polyhaven.com/files/${id}`);
if (!response.ok) throw new Error(`Asset manifest: ${response.status}`);
const manifest = (await response.json()).gltf["1k"].gltf;
const json = JSON.parse((await download(manifest)).toString());
const chunks = []; let length = 0;
function append(bytes) {
  const offset = length; const aligned = Buffer.alloc(Math.ceil(bytes.length / 4) * 4); bytes.copy(aligned);
  chunks.push(aligned); length += aligned.length; return offset;
}
for (const buffer of json.buffers) {
  const offset = append(await download(manifest.include[buffer.uri]));
  if (offset !== 0) throw new Error("Expected one source vertex buffer");
}
const images = await Promise.all(json.images.map(async (image) => ({ image, bytes: await download(manifest.include[image.uri]) })));
for (const { image, bytes } of images) {
  const offset = append(bytes); image.bufferView = json.bufferViews.length; image.mimeType = "image/jpeg"; delete image.uri;
  json.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length });
}
json.buffers = [{ byteLength: length }];
json.asset.extras = { source: `https://polyhaven.com/a/${id}`, license: "CC0-1.0", packagedFor: "Last City" };
const source = Buffer.from(JSON.stringify(json)), jsonChunk = Buffer.alloc(Math.ceil(source.length / 4) * 4, 0x20); source.copy(jsonChunk);
const header = Buffer.alloc(12), jsonHeader = Buffer.alloc(8), binHeader = Buffer.alloc(8);
header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(12 + 8 + jsonChunk.length + 8 + length, 8);
jsonHeader.writeUInt32LE(jsonChunk.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
binHeader.writeUInt32LE(length, 0); binHeader.writeUInt32LE(0x004e4942, 4);
await mkdir(new URL("../public/models/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/models/urban-facade.glb", import.meta.url), Buffer.concat([header, jsonHeader, jsonChunk, binHeader, ...chunks]));
console.log(`Packaged ${((length + jsonChunk.length) / 1024 / 1024).toFixed(1)} MB locally; verified source checksums.`);
console.log(json.nodes.filter((n) => /window|wall_standard/.test(n.name)).map((n) => ({ name: n.name, primitives: json.meshes[n.mesh]?.primitives.map((p) => ({ min: json.accessors[p.attributes.POSITION].min, max: json.accessors[p.attributes.POSITION].max })) })));
