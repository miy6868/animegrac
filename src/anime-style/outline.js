// Inverted-hull outline helpers.
import { BufferAttribute, Mesh, SkinnedMesh, InstancedMesh } from 'three';

/**
 * Adds an `outlineNormal` attribute: normals averaged over vertices that share a
 * position, so hard-edged meshes (boxes, low-poly props, glTF with split
 * normals) get a continuous hull instead of cracked lines.
 */
export function computeOutlineNormals(geometry, { force = false } = {}) {
  if (geometry.attributes.outlineNormal && !force) return geometry;
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  const pos = geometry.attributes.position;
  const nrm = geometry.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const acc = [];
  for (let i = 0; i < pos.count; i++) {
    const k = key(i);
    let a = map.get(k);
    if (!a) {
      a = [0, 0, 0];
      map.set(k, a);
    }
    a[0] += nrm.getX(i);
    a[1] += nrm.getY(i);
    a[2] += nrm.getZ(i);
    acc.push(a);
  }
  const out = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const a = acc[i];
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    out[i * 3] = a[0] / l;
    out[i * 3 + 1] = a[1] / l;
    out[i * 3 + 2] = a[2] / l;
  }
  geometry.setAttribute('outlineNormal', new BufferAttribute(out, 3));
  return geometry;
}

/** Use the regular normals as outline normals (geometry already smooth). */
export function useNormalsAsOutline(geometry) {
  if (!geometry.attributes.normal) geometry.computeVertexNormals();
  geometry.setAttribute('outlineNormal', geometry.attributes.normal);
  return geometry;
}

/** Creates the hull object that renders the outline of `mesh`. */
export function createHull(mesh, material) {
  let hull;
  if (mesh.isSkinnedMesh) {
    hull = new SkinnedMesh(mesh.geometry, material);
    hull.bind(mesh.skeleton, mesh.bindMatrix);
    hull.bindMode = mesh.bindMode;
  } else if (mesh.isInstancedMesh) {
    hull = new InstancedMesh(mesh.geometry, material, mesh.count);
    hull.instanceMatrix = mesh.instanceMatrix;
  } else {
    hull = new Mesh(mesh.geometry, material);
  }
  hull.name = `${mesh.name || 'mesh'}__outline`;
  hull.castShadow = false;
  hull.receiveShadow = false;
  hull.frustumCulled = mesh.frustumCulled;
  hull.renderOrder = mesh.renderOrder;
  hull.userData.isOutlineHull = true;
  if (mesh.morphTargetInfluences) {
    hull.morphTargetInfluences = mesh.morphTargetInfluences;
    hull.morphTargetDictionary = mesh.morphTargetDictionary;
  }
  return hull;
}
