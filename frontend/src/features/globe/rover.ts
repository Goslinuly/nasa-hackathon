// Марсоход Perseverance на глобусе: ленивая загрузка glb и плавный проезд по кривой маршрута с зацикливанием.
import * as THREE from 'three';
import { roverBasis, roverCycle, roverSizeForLength } from './routeCurve';

const MODEL_URL = '/models/perseverance.glb';

export class RoverTrack {
  readonly group = new THREE.Group();
  private pivot = new THREE.Group();
  private curve: THREE.Curve<THREE.Vector3> | null = null;
  private size = 0;
  private startedAt = 0;
  private model: THREE.Object3D | null = null;
  private loading = false;
  private disposed = false;

  constructor() {
    this.group.visible = false;
    this.group.matrixAutoUpdate = false;
    this.group.add(this.pivot);
  }

  get active(): boolean {
    return this.curve !== null && this.model !== null;
  }

  setCurve(curve: THREE.Curve<THREE.Vector3> | null, restart: boolean): void {
    this.curve = curve;
    if (!curve) {
      this.group.visible = false;
      return;
    }
    this.size = roverSizeForLength(curve.getLength());
    if (restart) this.startedAt = performance.now();
    void this.ensureModel();
  }

  update(nowMs: number): void {
    if (!this.curve || !this.model) return;
    const { progress, scale } = roverCycle(nowMs - this.startedAt);
    const position = this.curve.getPointAt(progress);
    const tangent = this.curve.getTangentAt(progress);
    this.group.matrix.copy(roverBasis(position, tangent));
    this.group.matrixWorldNeedsUpdate = true;
    this.pivot.scale.setScalar(this.size * Math.max(scale, 1e-4));
    this.group.visible = true;
  }

  dispose(): void {
    this.disposed = true;
    this.curve = null;
    this.group.visible = false;
    this.model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
        material.dispose();
      }
    });
    this.pivot.clear();
    this.model = null;
  }

  private async ensureModel(): Promise<void> {
    if (this.model || this.loading) return;
    this.loading = true;
    try {
      const [{ GLTFLoader }, { DRACOLoader }] = await Promise.all([
        import('three/examples/jsm/loaders/GLTFLoader.js'),
        import('three/examples/jsm/loaders/DRACOLoader.js'),
      ]);
      const draco = new DRACOLoader().setDecoderPath('/draco/');
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      const gltf = await loader.loadAsync(MODEL_URL);
      draco.dispose();
      if (this.disposed) return;
      const box = new THREE.Box3().setFromObject(gltf.scene);
      const dims = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      const wrapper = new THREE.Group();
      gltf.scene.position.set(-centre.x, -box.min.y, -centre.z);
      wrapper.add(gltf.scene);
      wrapper.scale.setScalar(1 / Math.max(dims.x, dims.z, 1e-6));
      this.model = wrapper;
      this.pivot.add(wrapper);
    } catch (error) {
      console.warn('Модель марсохода не загрузилась:', error);
      this.curve = null;
    } finally {
      this.loading = false;
    }
  }
}
