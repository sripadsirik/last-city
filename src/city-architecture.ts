import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { BUILDING_PLOTS } from "./city-layout";

/** Authored CC0 architectural components, instanced around four Southbank buildings. */
export async function loadArchitecturalFacades(): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync("/models/urban-facade.glb");
  const group = new THREE.Group(); group.name = "Authored urban apartment façades · Poly Haven CC0";
  const modules = ["wall_window_centered_large_01", "window_centered_large_01", "cornice_standard_standard_01"];
  const placements: THREE.Matrix4[] = [];
  const plots = BUILDING_PLOTS.filter((p) => (p.z === 64 && (p.x === -34 || p.x === 36)) || (p.z === 98 && (p.x === -8 || p.x === 10)));
  for (const plot of plots) {
    for (let floor = 1; floor < plot.floors; floor++) {
      for (const side of [-1, 1]) {
        for (let column = 0; column < 4; column++) {
          const position = new THREE.Vector3(plot.x + (column - 1.5) * plot.width / 4, 0.4 + floor * 3.2, plot.z + side * (plot.depth / 2 + 0.36));
          placements.push(new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side === 1 ? 0 : Math.PI), new THREE.Vector3(plot.width / 12, 3.2 / 3, 1)));
        }
        for (let column = 0; column < 6; column++) {
          const position = new THREE.Vector3(plot.x + side * (plot.width / 2 + 0.36), 0.4 + floor * 3.2, plot.z + (column - 2.5) * plot.depth / 6);
          placements.push(new THREE.Matrix4().compose(position, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), side * Math.PI / 2), new THREE.Vector3(plot.depth / 18, 3.2 / 3, 1)));
        }
      }
    }
  }
  const usedMaterials = new Set<THREE.Material>();
  for (const name of modules) {
    const source = gltf.scene.getObjectByName(name); if (!source) throw new Error(`Architecture module missing: ${name}`);
    source.traverse((part) => {
      if (!(part instanceof THREE.Mesh)) return;
      const geometry = part.geometry.clone(); geometry.translate(1.5, name.startsWith("cornice") ? 2.8 : 0, 0);
      const material = part.material as THREE.MeshStandardMaterial;
      usedMaterials.add(material); material.side = THREE.FrontSide;
      if (material.name.endsWith("glass")) { material.transparent = false; material.opacity = 1; material.color.set(0x667a82); material.metalness = 0.7; material.roughness = 0.23; }
      const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
      placements.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); group.add(mesh);
    });
  }
  const protectedTextures = new Set<THREE.Texture>();
  for (const material of usedMaterials) for (const value of Object.values(material)) if (value instanceof THREE.Texture) protectedTextures.add(value);
  const freedMaterials = new Set<THREE.Material>();
  gltf.scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (usedMaterials.has(material) || freedMaterials.has(material)) continue;
      for (const value of Object.values(material)) if (value instanceof THREE.Texture && !protectedTextures.has(value)) value.dispose();
      material.dispose(); freedMaterials.add(material);
    }
  });
  group.userData.buildingCount = plots.length;
  return group;
}
