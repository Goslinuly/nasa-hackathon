// 3D-движок глобуса Марса на Three.js: тайлы Mars Trek на рельефе MOLA с детальными снимками CTX и HiRISE.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

import { DTM_FOOTPRINTS, REGION_MARKERS, type RegionMarker } from './coverageData';
import {
  CTX_OVERLAY,
  CTX_REGION_BOUNDS,
  DEFAULT_SPECTRUM,
  HIRISE_OVERLAYS,
  MERCATOR_MAX_LAT,
  SPECTRA,
  boundsIntersect,
  ctxTileUrl,
  lonLatToMercatorTile,
  mercatorRowLat,
  mercatorTileBounds,
  trekTileUrl,
  type OverlaySource,
  type SpectrumId,
  type SpectrumLayer,
  type TrekSource,
} from './layers';
import { loadHeightField, type HeightField } from './terrain';
import {
  MARS_EQUATOR_M,
  MARS_RADIUS_KM,
  ancestorRect,
  dataResolutionM,
  lonLatToTile,
  tileBounds,
  tileColumns,
  tileRows,
  type TileBounds,
} from './tiles';

const MARS_RADIUS_M = MARS_RADIUS_KM * 1000;

export const EXAGGERATION_OPTIONS = [1, 3, 5, 10] as const;
export const DEFAULT_EXAGGERATION = 5;

export type GlobeMode = 'home' | 'planner';

export interface LonLat {
  lon: number;
  lat: number;
}

export interface ViewState {
  altitudeKm: number;
  zoom: number;
  dataResolutionM: number;
  sourceTitle: string;
  nativeResolutionM: number;
  overLimit: boolean;
}

export type TerrainState =
  | { status: 'loading' }
  | { status: 'ready'; field: HeightField; resolutionM: number; credit: string }
  | { status: 'failed'; message?: string };

export interface HoverPoint extends LonLat {
  heightM: number | null;
}

export interface GlobeEvents {
  onHover(point: HoverPoint | null): void;
  onView(view: ViewState): void;
  onSelect(point: LonLat): void;
  onRegionSelect(marker: RegionMarker): void;
  onTerrain(state: TerrainState): void;
}

function lonLatToVec3(lonDeg: number, latDeg: number, r: number): THREE.Vector3 {
  const lat = THREE.MathUtils.degToRad(latDeg);
  const lon = THREE.MathUtils.degToRad(lonDeg);
  return new THREE.Vector3(
    r * Math.cos(lat) * Math.cos(lon),
    r * Math.sin(lat),
    -r * Math.cos(lat) * Math.sin(lon),
  );
}

function vec3ToLonLat(v: THREE.Vector3): LonLat {
  const r = v.length();
  const lat = THREE.MathUtils.radToDeg(Math.asin(v.y / r));
  const lon = THREE.MathUtils.radToDeg(Math.atan2(-v.z, v.x));
  return { lat, lon };
}

function contains(bounds: TileBounds, point: LonLat): boolean {
  return (
    point.lon >= bounds.west &&
    point.lon <= bounds.east &&
    point.lat >= bounds.south &&
    point.lat <= bounds.north
  );
}

const BASE_ZOOM = 2;
const BASE_SEGMENTS = 48;
const DETAIL_MIN_ZOOM = 3;
const DETAIL_SEGMENTS = 32;
const OVERLAY_SEGMENTS = 12;
const DETAIL_GRID_PAD = 2;
const OVERLAY_GRID_PAD = 3;
const MAX_COVER_RECTS = (2 * DETAIL_GRID_PAD + 1) ** 2;
const SKIRT_DROP = 0.01;
const COVER_INSET = 1 / 128;
const PLANNER_CLEARANCE = 0.00006;
const FLAT_SHADE = 0.71;
const TEXTURE_CACHE_LIMIT = 500;

interface SkirtEdges {
  north: boolean;
  south: boolean;
  west: boolean;
  east: boolean;
}

const NO_SKIRTS: SkirtEdges = { north: false, south: false, west: false, east: false };

class TextureStore {
  private cache = new Map<string, THREE.Texture>();
  private pending = new Map<string, { controller: AbortController; waiters: Set<(texture: THREE.Texture | null) => void> }>();
  private failed = new Set<string>();

  constructor(private anisotropy: number) {}

  private key(url: string, srgb: boolean): string {
    return `${srgb ? 's' : 'l'}|${url}`;
  }

  get(url: string, srgb = true): THREE.Texture | undefined {
    return this.cache.get(this.key(url, srgb));
  }

  hasFailed(url: string): boolean {
    return this.failed.has(url);
  }

  load(url: string, srgb: boolean, done: (texture: THREE.Texture | null) => void): () => void {
    const key = this.key(url, srgb);
    const cached = this.cache.get(key);
    if (cached) {
      done(cached);
      return () => {};
    }
    if (this.failed.has(url)) {
      done(null);
      return () => {};
    }
    let entry = this.pending.get(key);
    if (!entry) {
      const controller = new AbortController();
      const created = { controller, waiters: new Set<(texture: THREE.Texture | null) => void>() };
      entry = created;
      this.pending.set(key, created);
      fetch(url, { signal: controller.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.blob();
        })
        .then((blob) => createImageBitmap(blob, { imageOrientation: 'flipY' }))
        .then((bitmap) => {
          const texture = new THREE.Texture(bitmap);
          texture.flipY = false;
          texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
          texture.anisotropy = this.anisotropy;
          texture.needsUpdate = true;
          if (this.cache.size > TEXTURE_CACHE_LIMIT) {
            const [oldestKey] = this.cache.keys();
            this.cache.get(oldestKey)?.dispose();
            this.cache.delete(oldestKey);
          }
          this.cache.set(key, texture);
          this.flush(key, created, texture);
        })
        .catch(() => {
          if (controller.signal.aborted) return;
          this.failed.add(url);
          this.flush(key, created, null);
        });
    }
    const waiters = entry.waiters;
    waiters.add(done);
    const pendingEntry = entry;
    return () => {
      if (!waiters.delete(done) || waiters.size > 0) return;
      if (this.pending.get(key) === pendingEntry) {
        this.pending.delete(key);
        pendingEntry.controller.abort();
      }
    };
  }

  private flush(
    key: string,
    entry: { waiters: Set<(texture: THREE.Texture | null) => void> },
    texture: THREE.Texture | null,
  ): void {
    if (this.pending.get(key) === entry) this.pending.delete(key);
    const waiters = [...entry.waiters];
    entry.waiters.clear();
    waiters.forEach((done) => done(texture));
  }

  view(base: THREE.Texture, rect?: { repeat: number; offsetX: number; offsetY: number }): THREE.Texture {
    const texture = base.clone();
    if (rect) {
      texture.repeat.set(rect.repeat, rect.repeat);
      texture.offset.set(rect.offsetX, rect.offsetY);
    }
    texture.needsUpdate = true;
    return texture;
  }

  dispose(): void {
    this.pending.forEach((entry) => entry.controller.abort());
    this.pending.clear();
    this.cache.forEach((texture) => texture.dispose());
    this.cache.clear();
  }
}

interface TileMaterialState {
  disposed: boolean;
  views: THREE.Texture[];
  cancels: (() => void)[];
}

export class MarsGlobeEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();
  private pickSphere: THREE.Mesh;
  private baseGroup = new THREE.Group();
  private detailGroup = new THREE.Group();
  private overlayGroup = new THREE.Group();
  private footprintGroup = new THREE.Group();
  private markerGroup = new THREE.Group();
  private routeGroup = new THREE.Group();
  private selectionMarker: THREE.Sprite;
  private endpointMarkers: Record<'a' | 'b', THREE.Sprite>;
  private selection: LonLat | null = null;
  private endpoints: Record<'a' | 'b', LonLat | null> = { a: null, b: null };
  private route: LonLat[] | null = null;
  private routeMaterial: LineMaterial;
  private textures: TextureStore;
  private labelElements = new Map<string, HTMLDivElement>();
  private spectrum: SpectrumLayer = SPECTRA[DEFAULT_SPECTRUM];
  private overlays = new Map<string, OverlaySource>();
  private overlayMeshes = new Map<string, THREE.Mesh>();
  private terrain: HeightField | null = null;
  private exaggeration: number;
  private terrainAbort = new AbortController();
  private listenersAbort = new AbortController();
  private coverRects = Array.from({ length: MAX_COVER_RECTS }, () => new THREE.Vector4());
  private coverUniforms = {
    uCoverRects: { value: this.coverRects },
    uCoverCount: { value: 0 },
  };
  private whiteTexture: THREE.DataTexture;
  private detailGeneration = 0;
  private currentDetailKey = '';
  private overlayLift = 0;
  private frameHandle = 0;
  private detailTimer: number | undefined;
  private pointerDown: { x: number; y: number } | null = null;
  private userMoved = false;
  private disposed = false;
  private lastView: ViewState | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private labelLayer: HTMLDivElement,
    private events: GlobeEvents,
    private mode: GlobeMode = 'home',
  ) {
    this.exaggeration = mode === 'planner' ? 3 : DEFAULT_EXAGGERATION;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.textures = new TextureStore(Math.min(4, this.renderer.capabilities.getMaxAnisotropy()));
    this.whiteTexture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.whiteTexture.needsUpdate = true;

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.001, 50);
    this.camera.position.set(0, 0.6, 3.2);

    const sun = new THREE.DirectionalLight(0xffffff, Math.PI * 0.62);
    sun.position.set(-1.4, 1.2, 1);
    this.camera.add(sun);
    this.scene.add(this.camera);
    this.scene.add(new THREE.AmbientLight(0xffffff, Math.PI * 0.5));

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minDistance = 1.012;
    this.controls.maxDistance = 4.2;
    this.controls.rotateSpeed = 0.45;
    this.controls.zoomSpeed = 0.8;
    this.controls.autoRotate = mode === 'home';
    this.controls.autoRotateSpeed = 0.35;

    this.pickSphere = new THREE.Mesh(
      new THREE.SphereGeometry(1, 64, 32),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    this.scene.add(this.pickSphere);
    this.scene.add(this.baseGroup);
    this.scene.add(this.detailGroup);
    this.scene.add(this.overlayGroup);
    this.scene.add(this.footprintGroup);
    this.scene.add(this.routeGroup);
    this.scene.add(this.markerGroup);

    this.routeMaterial = new LineMaterial({
      color: 0x7fd6ff,
      linewidth: 3.5,
      transparent: true,
      opacity: 0.95,
    });

    this.selectionMarker = this.makeMarker(this.makeDotTexture('#ffffff'), 0.02);
    this.selectionMarker.visible = false;
    this.scene.add(this.selectionMarker);
    this.endpointMarkers = {
      a: this.makeMarker(this.makeLetterTexture('A', '#8fd0a0'), 0.032),
      b: this.makeMarker(this.makeLetterTexture('Б', '#ff9b7a'), 0.032),
    };
    this.endpointMarkers.a.visible = false;
    this.endpointMarkers.b.visible = false;
    this.scene.add(this.endpointMarkers.a, this.endpointMarkers.b);

    if (mode === 'planner') {
      this.overlays.set(CTX_OVERLAY.id, CTX_OVERLAY);
      HIRISE_OVERLAYS.forEach((overlay) => this.overlays.set(overlay.id, overlay));
    }

    this.overlayLift = this.targetLift();
    this.buildBaseLayer();
    this.buildRegionMarkers();
    this.buildOverlays();
    this.bindPointer();
    this.loadTerrain();

    this.controls.addEventListener('start', () => {
      this.controls.autoRotate = false;
      this.userMoved = true;
    });
    this.controls.addEventListener('change', () => {
      this.clampCamera();
      this.scheduleDetailUpdate();
    });

    const loop = () => {
      if (this.disposed) return;
      this.frameHandle = requestAnimationFrame(loop);
      this.adaptToAltitude();
      this.controls.update();
      this.updateLabels();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
    this.scheduleDetailUpdate();
  }

  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.routeMaterial.resolution.set(width, height);

    const verticalHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const horizontalHalf = Math.atan(Math.tan(verticalHalf) * this.camera.aspect);
    const fitDistance = Math.min(7, Math.max(3.2, 1.25 / Math.sin(Math.min(horizontalHalf, verticalHalf))));
    this.controls.maxDistance = Math.max(4.2, fitDistance * 1.1);
    if (!this.userMoved) {
      this.camera.position.setLength(fitDistance);
    }

    this.clampCamera();
    this.scheduleDetailUpdate();
  }

  focus(lonDeg: number, latDeg: number, altitudeScene = 0.35): void {
    const direction = lonLatToVec3(lonDeg, latDeg, 1).normalize();
    const surface = 1 + this.heightScene(lonDeg, latDeg);
    this.camera.position.copy(direction.multiplyScalar(surface + altitudeScene));
    this.controls.autoRotate = false;
    this.userMoved = true;
    this.clampCamera();
    this.controls.update();
    this.scheduleDetailUpdate();
  }

  zoomBy(factor: number): void {
    const direction = this.camera.position.clone().normalize();
    const surface = this.surfaceUnderCamera();
    const altitude = (this.camera.position.length() - surface) * factor;
    const distance = THREE.MathUtils.clamp(surface + altitude, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(direction.multiplyScalar(distance));
    this.controls.autoRotate = false;
    this.userMoved = true;
    this.controls.update();
    this.scheduleDetailUpdate();
  }

  setSelection(lonDeg: number, latDeg: number): void {
    this.selection = { lon: lonDeg, lat: latDeg };
    this.selectionMarker.position.copy(this.surfacePoint(lonDeg, latDeg, this.overlayLift * 2));
    this.selectionMarker.visible = true;
  }

  setProbe(point: LonLat | null): void {
    if (point) this.setSelection(point.lon, point.lat);
    else {
      this.selection = null;
      this.selectionMarker.visible = false;
    }
  }

  setEndpoint(which: 'a' | 'b', point: LonLat | null): void {
    this.endpoints[which] = point;
    const marker = this.endpointMarkers[which];
    marker.visible = point !== null;
    if (point) marker.position.copy(this.surfacePoint(point.lon, point.lat, this.overlayLift * 2));
  }

  setRoute(points: LonLat[] | null): void {
    this.route = points;
    this.buildRoute();
  }

  setSpectrum(id: SpectrumId): void {
    if (this.spectrum.id === id) return;
    this.spectrum = SPECTRA[id];
    this.buildBaseLayer();
    this.refreshDetail();
    this.emitView(true);
  }

  setOverlayEnabled(id: string, enabled: boolean): void {
    const source = [CTX_OVERLAY, ...HIRISE_OVERLAYS].find((overlay) => overlay.id === id);
    if (!source) return;
    if (enabled) this.overlays.set(id, source);
    else this.overlays.delete(id);
    this.updateOverlays();
    this.emitView(true);
  }

  setExaggeration(value: number): void {
    if (this.exaggeration === value) return;
    this.exaggeration = value;
    this.rebuildSurface();
  }

  dispose(): void {
    this.disposed = true;
    this.terrainAbort.abort();
    this.listenersAbort.abort();
    cancelAnimationFrame(this.frameHandle);
    window.clearTimeout(this.detailTimer);
    this.controls.dispose();
    this.clearGroup(this.baseGroup);
    this.clearDetail();
    this.clearOverlays();
    this.clearGroup(this.footprintGroup);
    this.clearGroup(this.routeGroup);
    this.textures.dispose();
    this.renderer.dispose();
    this.labelElements.forEach((el) => el.remove());
  }


  private loadTerrain(): void {
    this.events.onTerrain({ status: 'loading' });
    loadHeightField(this.terrainAbort.signal)
      .then((field) => {
        if (this.disposed) return;
        this.terrain = field;
        this.rebuildSurface();
        this.events.onTerrain({
          status: 'ready',
          field,
          resolutionM: field.resolutionM,
          credit: field.meta.source.credit,
        });
      })
      .catch((error: unknown) => {
        if (this.disposed) return;
        console.warn('[globe] карта высот недоступна', error);
        this.events.onTerrain({ status: 'failed', message: error instanceof Error ? error.message : 'Не удалось загрузить карту высот' });
      });
  }

  private heightScene(lonDeg: number, latDeg: number): number {
    if (!this.terrain) return 0;
    return (this.terrain.sample(lonDeg, latDeg) * this.exaggeration) / MARS_RADIUS_M;
  }

  private surfacePoint(lonDeg: number, latDeg: number, lift = 0): THREE.Vector3 {
    return lonLatToVec3(lonDeg, latDeg, 1 + this.heightScene(lonDeg, latDeg) + lift);
  }

  private surfaceNormal(lonDeg: number, latDeg: number, deltaDeg: number, at: THREE.Vector3): THREE.Vector3 {
    const radial = at.clone().normalize();
    if (!this.terrain) return radial;
    const cosLat = Math.cos(THREE.MathUtils.degToRad(latDeg));
    if (cosLat < 0.02) return radial;
    const dLon = deltaDeg / cosLat;
    const east = this.surfacePoint(lonDeg + dLon, latDeg).sub(this.surfacePoint(lonDeg - dLon, latDeg));
    const north = this.surfacePoint(lonDeg, Math.min(90, latDeg + deltaDeg)).sub(
      this.surfacePoint(lonDeg, Math.max(-90, latDeg - deltaDeg)),
    );
    const normal = east.cross(north).normalize();
    return normal.dot(radial) > 0 ? normal : normal.negate();
  }

  private buildPatchGeometry(
    west: number,
    east: number,
    latAt: (t: number) => number,
    segments: number,
    skirts: SkirtEdges = NO_SKIRTS,
  ): THREE.BufferGeometry {
    const stepDeg = (east - west) / segments;
    const normalDelta = Math.max(stepDeg, this.terrain ? 1 / this.terrain.meta.pixels_per_degree : 0);
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let iy = 0; iy <= segments; iy++) {
      const latT = iy / segments;
      const lat = latAt(latT);
      for (let ix = 0; ix <= segments; ix++) {
        const lonT = ix / segments;
        const lon = west + (east - west) * lonT;
        const p = this.surfacePoint(lon, lat);
        const n = this.surfaceNormal(lon, lat, normalDelta, p);
        positions.push(p.x, p.y, p.z);
        normals.push(n.x, n.y, n.z);
        uvs.push(lonT, 1 - latT);
      }
    }
    const row = segments + 1;
    for (let iy = 0; iy < segments; iy++) {
      for (let ix = 0; ix < segments; ix++) {
        const a = iy * row + ix;
        const b = a + 1;
        const c = a + row;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    const edges: number[][] = [];
    const edgeOf = (index: (i: number) => number) =>
      Array.from({ length: segments + 1 }, (_, i) => index(i));
    if (skirts.north) edges.push(edgeOf((i) => i));
    if (skirts.south) edges.push(edgeOf((i) => segments * row + i));
    if (skirts.west) edges.push(edgeOf((i) => i * row));
    if (skirts.east) edges.push(edgeOf((i) => i * row + segments));
    for (const edge of edges) {
      const start = positions.length / 3;
      for (const index of edge) {
        const k = index * 3;
        const scale = 1 - SKIRT_DROP;
        positions.push(positions[k] * scale, positions[k + 1] * scale, positions[k + 2] * scale);
        normals.push(normals[k], normals[k + 1], normals[k + 2]);
        uvs.push(uvs[index * 2], uvs[index * 2 + 1]);
      }
      for (let i = 0; i < edge.length - 1; i++) {
        indices.push(edge[i], start + i, edge[i + 1], edge[i + 1], start + i, start + i + 1);
        indices.push(edge[i], edge[i + 1], start + i, edge[i + 1], start + i + 1, start + i);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    return geometry;
  }

  private buildTileGeometry(z: number, x: number, y: number, segments: number, skirts?: SkirtEdges): THREE.BufferGeometry {
    const { west, east, south, north } = tileBounds(z, x, y);
    return this.buildPatchGeometry(west, east, (t) => north + (south - north) * t, segments, skirts);
  }

  private rebuildSurface(): void {
    this.buildBaseLayer();
    this.refreshDetail();
    this.clearOverlays();
    this.updateOverlays();
    this.overlayLift = this.targetLift();
    this.buildOverlays();
    this.buildRoute();
    this.clampCamera();
    this.emitView(true);
  }

  private altitudeScene(): number {
    return this.camera.position.length() - this.surfaceUnderCamera();
  }

  private surfaceUnderCamera(): number {
    const below = vec3ToLonLat(this.camera.position);
    return 1 + this.heightScene(below.lon, below.lat);
  }

  private clampCamera(): void {
    let clearance = PLANNER_CLEARANCE;
    if (this.mode === 'home') {
      const viewHeightM = this.spectrum.nativeResolutionM * this.canvas.clientHeight;
      const altitudeM = viewHeightM / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      clearance = Math.max(0.004, (altitudeM * 0.8) / MARS_RADIUS_M);
    }
    this.controls.minDistance = this.surfaceUnderCamera() + clearance;
  }

  private adaptToAltitude(): void {
    const altitude = Math.max(this.altitudeScene(), 1e-6);
    this.controls.rotateSpeed = THREE.MathUtils.clamp(altitude * 0.16, 1e-5, 0.45);
    const near = THREE.MathUtils.clamp(altitude * 0.2, 1e-6, 0.05);
    const far = this.camera.position.length() + 1.5;
    if (Math.abs(near - this.camera.near) > this.camera.near * 0.2 || Math.abs(far - this.camera.far) > 0.1) {
      this.camera.near = near;
      this.camera.far = far;
      this.camera.updateProjectionMatrix();
    }
    const lift = this.targetLift();
    if (lift / this.overlayLift > 2 || lift / this.overlayLift < 0.5) {
      this.overlayLift = lift;
      this.buildOverlays();
      this.buildRoute();
    }
  }

  private targetLift(): number {
    const coarse = 0.0012 + (this.terrain ? this.exaggeration * 0.00016 : 0);
    return THREE.MathUtils.clamp(this.altitudeScene() * 0.01, 2e-6, coarse);
  }


  private patchMaterial(
    material: THREE.MeshLambertMaterial,
    options: { cover: boolean; shadeUniforms?: Record<string, THREE.IUniform> },
  ): void {
    const { cover, shadeUniforms } = options;
    if (!cover && !shadeUniforms) return;
    material.onBeforeCompile = (shader) => {
      let vertexHead = '';
      let vertexBody = '';
      let fragmentHead = '';
      let fragmentStart = '';
      let fragmentAfterMap = '';
      if (cover) {
        shader.uniforms.uCoverRects = this.coverUniforms.uCoverRects;
        shader.uniforms.uCoverCount = this.coverUniforms.uCoverCount;
        vertexHead += 'varying vec3 vSpherePos;\n';
        vertexBody += '\n  vSpherePos = position;';
        fragmentHead += `varying vec3 vSpherePos;\nuniform vec4 uCoverRects[${MAX_COVER_RECTS}];\nuniform int uCoverCount;\n`;
        fragmentStart += `
  {
    vec3 dir = normalize(vSpherePos);
    float lat = degrees(asin(clamp(dir.y, -1.0, 1.0)));
    float lon = degrees(atan(-dir.z, dir.x));
    for (int i = 0; i < ${MAX_COVER_RECTS}; i++) {
      if (i >= uCoverCount) break;
      vec4 r = uCoverRects[i];
      if (lon >= r.x && lon <= r.z && lat >= r.y && lat <= r.w) discard;
    }
  }`;
      }
      if (shadeUniforms) {
        Object.assign(shader.uniforms, shadeUniforms);
        vertexHead += 'varying vec2 vTileUv;\n';
        vertexBody += '\n  vTileUv = uv;';
        fragmentHead += 'varying vec2 vTileUv;\nuniform sampler2D uShadeMap;\nuniform vec3 uShadeRect;\nuniform float uShadeStrength;\n';
        fragmentAfterMap += `
  {
    float shade = texture2D(uShadeMap, vTileUv * uShadeRect.z + uShadeRect.xy).r;
    diffuseColor.rgb *= mix(1.0, clamp(shade / ${FLAT_SHADE.toFixed(2)}, 0.0, 1.8), uShadeStrength);
  }`;
      }
      shader.vertexShader =
        vertexHead + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>${vertexBody}`);
      shader.fragmentShader =
        fragmentHead +
        shader.fragmentShader
          .replace('void main() {', `void main() {${fragmentStart}`)
          .replace('#include <map_fragment>', `#include <map_fragment>${fragmentAfterMap}`);
    };
    material.customProgramCacheKey = () => `mars-${cover ? 'c' : ''}${shadeUniforms ? 's' : ''}`;
  }

  private loadSourceTile(
    source: TrekSource,
    z: number,
    x: number,
    y: number,
    srgb: boolean,
    done: (texture: THREE.Texture | null, rect: ReturnType<typeof ancestorRect>) => void,
  ): () => void {
    const zs = Math.min(z, source.maxZoom);
    const rect = ancestorRect(z, x, y, zs);
    return this.textures.load(trekTileUrl(source, zs, rect.x, rect.y), srgb, (texture) => done(texture, rect));
  }

  private cachedAncestor(source: TrekSource, z: number, x: number, y: number): THREE.Texture | null {
    for (let zs = Math.min(z, source.maxZoom + 1) - 1; zs >= 0; zs--) {
      const rect = ancestorRect(z, x, y, zs);
      const cached = this.textures.get(trekTileUrl(source, zs, rect.x, rect.y));
      if (cached) return this.textures.view(cached, rect);
    }
    return null;
  }

  private spectrumMaterial(z: number, x: number, y: number, cover: boolean, onShown?: () => void): THREE.MeshLambertMaterial {
    const layer = this.spectrum;
    const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const state: TileMaterialState = { disposed: false, views: [], cancels: [] };
    material.userData.tile = state;
    const shadeUniforms = layer.shade
      ? {
          uShadeMap: { value: this.whiteTexture as THREE.Texture },
          uShadeRect: { value: new THREE.Vector3(0, 0, 1) },
          uShadeStrength: { value: 0 },
        }
      : undefined;
    this.patchMaterial(material, { cover, shadeUniforms });

    let shown = false;
    let final = false;
    const show = (texture: THREE.Texture, isFinal: boolean) => {
      if (state.disposed || final) return;
      state.views.push(texture);
      material.map = texture;
      material.visible = true;
      material.needsUpdate = true;
      final = isFinal;
      if (!shown) {
        shown = true;
        onShown?.();
      }
    };

    material.visible = false;
    const ancestor = this.cachedAncestor(layer.color, z, x, y);
    if (ancestor) show(ancestor, false);

    const loadColor = (source: TrekSource, onMissing?: () => void) => {
      state.cancels.push(
        this.loadSourceTile(source, z, x, y, true, (texture, rect) => {
          if (texture) show(this.textures.view(texture, rect), true);
          else if (!state.disposed) onMissing?.();
        }),
      );
    };
    const fallback = layer.fallback ? SPECTRA[layer.fallback] : null;
    loadColor(layer.color, fallback ? () => loadColor(fallback.color) : undefined);

    if (layer.shade && shadeUniforms) {
      state.cancels.push(
        this.loadSourceTile(layer.shade, z, x, y, false, (texture, rect) => {
          if (!texture || state.disposed) return;
          shadeUniforms.uShadeMap.value = texture;
          shadeUniforms.uShadeRect.value.set(rect.offsetX, rect.offsetY, rect.repeat);
          shadeUniforms.uShadeStrength.value = 0.85;
        }),
      );
    }
    return material;
  }

  private buildBaseLayer(): void {
    const previous = [...this.baseGroup.children];
    for (let y = 0; y < tileRows(BASE_ZOOM); y++) {
      for (let x = 0; x < tileColumns(BASE_ZOOM); x++) {
        this.baseGroup.add(
          new THREE.Mesh(
            this.buildTileGeometry(BASE_ZOOM, x, y, BASE_SEGMENTS),
            this.spectrumMaterial(BASE_ZOOM, x, y, true),
          ),
        );
      }
    }
    this.removeObjects(this.baseGroup, previous);
  }


  private screenMetersPerPixel(): number {
    const altitudeKm = this.altitudeScene() * MARS_RADIUS_KM;
    const viewHeightKm = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * altitudeKm;
    return (viewHeightKm * 1000) / Math.max(1, this.canvas.clientHeight);
  }

  private desiredZoom(): number {
    const mpp = this.screenMetersPerPixel();
    const z = Math.ceil(Math.log2(MARS_EQUATOR_M / (512 * mpp)));
    return Math.max(1, z);
  }

  private scheduleDetailUpdate(): void {
    window.clearTimeout(this.detailTimer);
    this.detailTimer = window.setTimeout(() => {
      this.updateDetail();
      this.updateOverlays();
    }, 160);
    this.emitView();
  }

  private refreshDetail(): void {
    this.currentDetailKey = '';
    this.updateDetail();
  }

  private updateDetail(): void {
    if (this.disposed) return;
    const z = Math.min(this.desiredZoom(), this.spectrum.maxNativeZoom);
    if (z < DETAIL_MIN_ZOOM) {
      this.currentDetailKey = '';
      this.clearDetail();
      return;
    }
    const center = vec3ToLonLat(this.camera.position);
    const centerTile = lonLatToTile(z, center.lon, center.lat);
    const key = `${this.spectrum.id}/${z}/${centerTile.x}/${centerTile.y}`;
    if (key === this.currentDetailKey) return;
    this.currentDetailKey = key;
    const previous = [...this.detailGroup.children];
    this.detailGeneration++;
    this.coverUniforms.uCoverCount.value = 0;

    const generation = this.detailGeneration;
    const cols = tileColumns(z);
    const rows = tileRows(z);
    for (let dy = -DETAIL_GRID_PAD; dy <= DETAIL_GRID_PAD; dy++) {
      for (let dx = -DETAIL_GRID_PAD; dx <= DETAIL_GRID_PAD; dx++) {
        const y = centerTile.y + dy;
        if (y < 0 || y >= rows) continue;
        const x = ((centerTile.x + dx) % cols + cols) % cols;
        const bounds = tileBounds(z, x, y);
        const skirts: SkirtEdges = {
          north: dy === -DETAIL_GRID_PAD,
          south: dy === DETAIL_GRID_PAD,
          west: dx === -DETAIL_GRID_PAD,
          east: dx === DETAIL_GRID_PAD,
        };
        const material = this.spectrumMaterial(z, x, y, false, () => {
          if (generation === this.detailGeneration) this.addCoverRect(bounds, skirts);
        });
        this.detailGroup.add(
          new THREE.Mesh(this.buildTileGeometry(z, x, y, DETAIL_SEGMENTS, skirts), material),
        );
      }
    }
    this.removeObjects(this.detailGroup, previous);
  }

  private addCoverRect(bounds: TileBounds, outer: SkirtEdges): void {
    const count = this.coverUniforms.uCoverCount.value;
    if (count >= MAX_COVER_RECTS) return;
    const inset = (bounds.east - bounds.west) * COVER_INSET;
    this.coverRects[count].set(
      bounds.west + (outer.west ? inset : 0),
      bounds.south + (outer.south ? inset : 0),
      bounds.east - (outer.east ? inset : 0),
      bounds.north - (outer.north ? inset : 0),
    );
    this.coverUniforms.uCoverCount.value = count + 1;
  }

  private clearDetail(): void {
    this.detailGeneration++;
    this.coverUniforms.uCoverCount.value = 0;
    this.clearGroup(this.detailGroup);
  }


  private updateOverlays(): void {
    if (this.disposed) return;
    const wanted = new Map<string, () => THREE.Mesh>();
    const desired = this.desiredZoom();
    const center = vec3ToLonLat(this.camera.position);
    let order = 1;
    for (const source of this.overlays.values()) {
      order++;
      if (desired < source.minViewZoom) continue;
      if (source.kind === 'trek') {
        const z = Math.min(desired, source.source.maxZoom);
        const centerTile = lonLatToTile(z, center.lon, center.lat);
        for (let dy = -OVERLAY_GRID_PAD; dy <= OVERLAY_GRID_PAD; dy++) {
          for (let dx = -OVERLAY_GRID_PAD; dx <= OVERLAY_GRID_PAD; dx++) {
            const x = centerTile.x + dx;
            const y = centerTile.y + dy;
            if (x < 0 || y < 0 || x >= tileColumns(z) || y >= tileRows(z)) continue;
            const bounds = tileBounds(z, x, y);
            if (!boundsIntersect(bounds, source.bounds)) continue;
            const url = trekTileUrl(source.source, z, x, y);
            if (this.textures.hasFailed(url)) continue;
            const level = order;
            wanted.set(url, () => this.overlayMesh(url, this.buildTileGeometry(z, x, y, OVERLAY_SEGMENTS), level));
          }
        }
      } else {
        const z = Math.min(desired + 1, source.maxZoom);
        const centerTile = lonLatToMercatorTile(z, center.lon, center.lat);
        const n = 2 ** z;
        for (let dy = -OVERLAY_GRID_PAD; dy <= OVERLAY_GRID_PAD; dy++) {
          for (let dx = -OVERLAY_GRID_PAD; dx <= OVERLAY_GRID_PAD; dx++) {
            const x = ((centerTile.x + dx) % n + n) % n;
            const y = centerTile.y + dy;
            if (y < 0 || y >= n) continue;
            const bounds = mercatorTileBounds(z, x, y);
            for (const region of CTX_REGION_BOUNDS) {
              if (!boundsIntersect(bounds, region.bounds)) continue;
              const url = ctxTileUrl(region.name, z, x, y);
              if (this.textures.hasFailed(url)) continue;
              const level = order;
              wanted.set(url, () =>
                this.overlayMesh(
                  url,
                  this.buildPatchGeometry(bounds.west, bounds.east, (t) => mercatorRowLat(z, y + t), OVERLAY_SEGMENTS),
                  level,
                ),
              );
            }
          }
        }
      }
    }
    for (const [url, mesh] of this.overlayMeshes) {
      if (wanted.has(url)) continue;
      this.disposeMesh(mesh);
      this.overlayGroup.remove(mesh);
      this.overlayMeshes.delete(url);
    }
    for (const [url, build] of wanted) {
      if (this.overlayMeshes.has(url)) continue;
      const mesh = build();
      this.overlayMeshes.set(url, mesh);
      this.overlayGroup.add(mesh);
    }
  }

  private overlayMesh(url: string, geometry: THREE.BufferGeometry, order: number): THREE.Mesh {
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff,
      transparent: true,
      alphaTest: 0.04,
      depthTest: false,
      depthWrite: false,
    });
    const state: TileMaterialState = { disposed: false, views: [], cancels: [] };
    material.userData.tile = state;
    material.visible = false;
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = order;
    state.cancels.push(this.textures.load(url, true, (texture) => {
      if (state.disposed) return;
      if (!texture) {
        this.overlayGroup.remove(mesh);
        this.overlayMeshes.delete(url);
        this.disposeMesh(mesh);
        return;
      }
      const view = this.textures.view(texture);
      state.views.push(view);
      material.map = view;
      material.visible = true;
      material.needsUpdate = true;
    }));
    return mesh;
  }

  private clearOverlays(): void {
    this.overlayMeshes.forEach((mesh) => this.disposeMesh(mesh));
    this.overlayMeshes.clear();
    this.overlayGroup.clear();
  }

  private viewSource(desired: number): Pick<ViewState, 'dataResolutionM' | 'sourceTitle' | 'nativeResolutionM' | 'overLimit'> {
    const center = vec3ToLonLat(this.camera.position);
    const z = Math.min(desired, this.spectrum.maxNativeZoom);
    let best = {
      dataResolutionM: dataResolutionM(this.spectrum.nativeResolutionM, z),
      sourceTitle: this.spectrum.title,
      nativeResolutionM: this.spectrum.nativeResolutionM,
      overLimit: desired > this.spectrum.maxNativeZoom,
    };
    for (const source of this.overlays.values()) {
      if (desired < source.minViewZoom) continue;
      let resolution: number;
      let maxTrekZoom: number;
      if (source.kind === 'trek') {
        if (!contains(source.bounds, center)) continue;
        maxTrekZoom = source.source.maxZoom;
        resolution = dataResolutionM(source.nativeResolutionM, Math.min(desired, maxTrekZoom));
      } else {
        if (Math.abs(center.lat) > MERCATOR_MAX_LAT) continue;
        maxTrekZoom = source.maxZoom - 1;
        const zm = Math.min(desired + 1, source.maxZoom);
        const mercatorM = (MARS_EQUATOR_M * Math.cos(THREE.MathUtils.degToRad(center.lat))) / (256 * 2 ** zm);
        resolution = Math.max(mercatorM, source.nativeResolutionM);
      }
      if (resolution < best.dataResolutionM) {
        best = {
          dataResolutionM: resolution,
          sourceTitle: source.title,
          nativeResolutionM: source.nativeResolutionM,
          overLimit: desired > maxTrekZoom,
        };
      }
    }
    return best;
  }

  private emitView(force = false): void {
    const desired = this.desiredZoom();
    const view: ViewState = {
      altitudeKm: this.altitudeScene() * MARS_RADIUS_KM,
      zoom: desired,
      ...this.viewSource(desired),
    };
    const previous = this.lastView;
    if (
      force ||
      !previous ||
      Math.abs(previous.altitudeKm - view.altitudeKm) > Math.max(0.05, view.altitudeKm * 0.01) ||
      previous.zoom !== view.zoom ||
      previous.sourceTitle !== view.sourceTitle ||
      previous.overLimit !== view.overLimit
    ) {
      this.lastView = view;
      this.events.onView(view);
    }
  }


  private buildOverlays(): void {
    const lift = this.overlayLift;
    this.clearGroup(this.footprintGroup);
    const material = new THREE.LineBasicMaterial({
      color: 0xe8a06a,
      transparent: true,
      opacity: 0.85,
    });
    for (const footprint of DTM_FOOTPRINTS) {
      const ring = [...footprint.ring, footprint.ring[0]];
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < ring.length - 1; i++) {
        const [lonA, latA] = ring[i];
        const [lonB, latB] = ring[i + 1];
        for (let s = 0; s < 8; s++) {
          const t = s / 8;
          points.push(this.surfacePoint(lonA + (lonB - lonA) * t, latA + (latB - latA) * t, lift));
        }
      }
      points.push(points[0].clone());
      this.footprintGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
    for (const sprite of this.markerGroup.children) {
      const marker = sprite.userData.marker as RegionMarker;
      sprite.position.copy(this.surfacePoint(marker.lon, marker.lat, lift * 3));
    }
    if (this.selection) this.setSelection(this.selection.lon, this.selection.lat);
    this.setEndpoint('a', this.endpoints.a);
    this.setEndpoint('b', this.endpoints.b);
  }

  private buildRoute(): void {
    this.clearGroup(this.routeGroup);
    if (!this.route || this.route.length < 2) return;
    const positions: number[] = [];
    for (const point of this.route) {
      const p = this.surfacePoint(point.lon, point.lat, this.overlayLift * 1.5);
      positions.push(p.x, p.y, p.z);
    }
    const geometry = new LineGeometry();
    geometry.setPositions(positions);
    const line = new Line2(geometry, this.routeMaterial);
    line.computeLineDistances();
    line.renderOrder = 20;
    this.routeGroup.add(line);
  }

  private makeDotTexture(color: string): THREE.Texture {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private makeLetterTexture(letter: string, color: string): THREE.Texture {
    const size = 96;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(5, 5, 7, 0.85)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '700 46px Unbounded, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(letter, size / 2, size / 2 + 3);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  private makeMarker(texture: THREE.Texture, size: number): THREE.Sprite {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: texture, transparent: true, sizeAttenuation: false, depthTest: true }),
    );
    sprite.scale.setScalar(size);
    sprite.renderOrder = 30;
    return sprite;
  }

  private buildRegionMarkers(): void {
    const texture = this.makeDotTexture('#aebfdd');
    for (const marker of REGION_MARKERS) {
      const sprite = this.makeMarker(texture, 0.022);
      sprite.userData.marker = marker;
      this.markerGroup.add(sprite);

      const label = document.createElement('div');
      label.className = 'globe-label';
      label.textContent = marker.name;
      label.addEventListener('click', () => this.events.onRegionSelect(marker));
      this.labelLayer.appendChild(label);
      this.labelElements.set(marker.slug, label);
    }
  }

  private updateLabels(): void {
    const cameraDirection = this.camera.position.clone().normalize();
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    for (const sprite of this.markerGroup.children) {
      const marker = sprite.userData.marker as RegionMarker;
      const label = this.labelElements.get(marker.slug);
      if (!label) continue;
      const world = sprite.position.clone();
      const onNearSide = world.clone().normalize().dot(cameraDirection) > 0.12;
      const projected = world.clone().project(this.camera);
      const onScreen = Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1 && projected.z < 1;
      if (!onNearSide || !onScreen) {
        label.style.opacity = '0';
        label.style.pointerEvents = 'none';
        continue;
      }
      label.style.opacity = '1';
      label.style.pointerEvents = 'auto';
      label.style.transform = `translate(${((projected.x + 1) / 2) * width + 10}px, ${((1 - projected.y) / 2) * height - 8}px)`;
    }
  }


  private disposeMesh(object: THREE.Object3D): void {
    const mesh = object as THREE.Mesh | THREE.Line;
    mesh.geometry.dispose();
    const material = mesh.material as THREE.Material;
    const state = material.userData.tile as TileMaterialState | undefined;
    if (state) {
      state.disposed = true;
      state.cancels.forEach((cancel) => cancel());
      state.views.forEach((texture) => texture.dispose());
    }
    if (material !== this.routeMaterial) material.dispose();
  }

  private clearGroup(group: THREE.Group): void {
    this.removeObjects(group, [...group.children]);
  }

  private removeObjects(group: THREE.Group, objects: THREE.Object3D[]): void {
    for (const object of objects) {
      group.remove(object);
      this.disposeMesh(object);
    }
  }


  private pointerToRay(event: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
  }

  private pickSurface(): LonLat | null {
    const hit =
      this.raycaster.intersectObjects([this.detailGroup, this.baseGroup], true)[0] ??
      this.raycaster.intersectObject(this.pickSphere, false)[0];
    return hit ? vec3ToLonLat(hit.point) : null;
  }

  private bindPointer(): void {
    const options = { signal: this.listenersAbort.signal };
    this.canvas.addEventListener('pointermove', (event) => {
      if (this.pointerDown) return;
      this.pointerToRay(event);
      const point = this.pickSurface();
      this.events.onHover(
        point ? { ...point, heightM: this.terrain?.sample(point.lon, point.lat) ?? null } : null,
      );
    }, options);
    this.canvas.addEventListener('pointerdown', (event) => {
      this.pointerDown = { x: event.clientX, y: event.clientY };
    }, options);
    this.canvas.addEventListener('pointerup', (event) => {
      const start = this.pointerDown;
      this.pointerDown = null;
      if (!start) return;
      const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
      if (moved > 6) return;

      this.pointerToRay(event);
      const markerHit = this.raycaster.intersectObjects(this.markerGroup.children, false)[0];
      if (markerHit && this.mode === 'home') {
        this.events.onRegionSelect(markerHit.object.userData.marker as RegionMarker);
        return;
      }
      const point = this.pickSurface();
      if (point) {
        if (this.mode === 'home') this.setSelection(point.lon, point.lat);
        this.events.onSelect(point);
      }
    }, options);
    this.canvas.addEventListener('pointerleave', () => {
      this.pointerDown = null;
      this.events.onHover(null);
    }, options);
  }
}

