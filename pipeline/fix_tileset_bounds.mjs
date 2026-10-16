// Make an ODM (Obj2Tiles) 3D Tiles tileset place correctly in Cesium.
//
// ODM 3.6.2's Obj2Tiles 1.4.0 writes the b3dm vertices already z-up in local ENU metres, but
// (1) leaves the tileset's gltfUpAxis at the y-up default, so Cesium rotates the content by
// 90 degrees and buries it, and (2) writes each tile's `box` with the vertical axis on y and a
// flipped sign (centre y = -height), so Cesium culls every tile. Either way nothing draws.
// Fix: declare asset.gltfUpAxis "Z" and remap every box (x, y, z) -> (x, z, -y).
//
// Usage: node pipeline/fix_tileset_bounds.mjs <mesh-dir>   (keeps the original as tileset.odm.json)
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) throw new Error('usage: fix_tileset_bounds.mjs <mesh-dir>')
const original = join(dir, 'tileset.odm.json')
const target = join(dir, 'tileset.json')
if (!existsSync(original)) copyFileSync(target, original)
const tileset = JSON.parse(readFileSync(original, 'utf8'))

const remap = ([x, y, z]) => [x, z, -y]
let boxes = 0
function fix(tile) {
  const box = tile.boundingVolume?.box
  if (box) {
    tile.boundingVolume.box = [
      ...remap(box.slice(0, 3)),
      ...remap(box.slice(3, 6)),
      ...remap(box.slice(9, 12)), // the old z half-axis becomes the new y (north) half-axis
      ...remap(box.slice(6, 9)).map(v => -v), // the old y half-axis becomes the new z (up) half-axis
    ]
    boxes++
  }
  tile.children?.forEach(fix)
}
fix(tileset.root)
tileset.asset = { ...tileset.asset, gltfUpAxis: 'Z' }
writeFileSync(target, JSON.stringify(tileset))
const [cx, cy, cz] = tileset.root.boundingVolume.box
console.log(`remapped ${boxes} boxes; root centre ENU ${cx.toFixed(1)} E, ${cy.toFixed(1)} N, ${cz.toFixed(1)} m up`)
