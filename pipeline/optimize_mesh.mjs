// Shrink a 3D Tiles mesh's textures to what each level of detail needs, as WebP.
//
// Obj2Tiles repacks each tile's texture into a square atlas; on the coarse levels these reach
// 32768 x 32768 px (over 4 GB decoded), far beyond what a browser GPU accepts, so the viewer
// stalls. Coarse tiles are only seen from far away, so they get small textures; the finest
// level keeps the most detail. Geometry is untouched.
//
// Usage: node pipeline/optimize_mesh.mjs <src-mesh-dir> <dst-mesh-dir>
//        (copies the tileset, writing optimized LOD-*/*.b3dm into the destination)
import { cpSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { EXTTextureWebP } from '@gltf-transform/extensions'
import sharp from 'sharp'

// Longest texture side per level. LOD-0 is the finest level in Obj2Tiles output.
const MAX_SIDE = { 'LOD-0': 4096, 'LOD-1': 2048, 'LOD-2': 1024 }
const WEBP_QUALITY = 82

const src = resolve(process.argv[2] ?? '')
const dir = resolve(process.argv[3] ?? '')
if (!existsSync(join(src, 'tileset.json')) || !process.argv[3]) {
  throw new Error('usage: optimize_mesh.mjs <src-mesh-dir> <dst-mesh-dir>')
}
if (src !== dir) cpSync(src, dir, { recursive: true })

const io = new NodeIO().registerExtensions([EXTTextureWebP])

function splitB3dm(buffer) {
  const ft = buffer.readUInt32LE(12) + buffer.readUInt32LE(16)
  const bt = buffer.readUInt32LE(20) + buffer.readUInt32LE(24)
  const tablesEnd = 28 + ft + bt
  return { header: buffer.subarray(0, 28), tables: buffer.subarray(28, tablesEnd), glb: buffer.subarray(tablesEnd) }
}

function joinB3dm(header, tables, glb) {
  const pad = (8 - ((28 + tables.length + glb.length) % 8)) % 8
  const out = Buffer.concat([header, tables, Buffer.from(glb), Buffer.alloc(pad)])
  out.writeUInt32LE(out.length, 8)
  return out
}

let before = 0
let after = 0
for (const lod of Object.keys(MAX_SIDE)) {
  const lodDir = join(src, lod)
  if (!existsSync(lodDir)) continue
  for (const name of readdirSync(lodDir).filter(f => f.endsWith('.b3dm'))) {
    const source = readFileSync(join(lodDir, name))
    const { header, tables, glb } = splitB3dm(source)
    const doc = await io.readBinary(new Uint8Array(glb))
    doc.createExtension(EXTTextureWebP).setRequired(true)
    for (const texture of doc.getRoot().listTextures()) {
      const image = texture.getImage()
      if (!image) continue
      const webp = await sharp(Buffer.from(image), { limitInputPixels: false })
        .resize(MAX_SIDE[lod], MAX_SIDE[lod], { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY, effort: 4 })
        .toBuffer()
      texture.setImage(new Uint8Array(webp)).setMimeType('image/webp')
    }
    const optimized = joinB3dm(header, tables, await io.writeBinary(doc))
    writeFileSync(join(dir, lod, name), optimized)
    before += source.length
    after += optimized.length
  }
  console.log(`${lod}: textures capped at ${MAX_SIDE[lod]} px`)
}
console.log(`mesh ${(before / 1e6).toFixed(0)} MB -> ${(after / 1e6).toFixed(0)} MB`)
