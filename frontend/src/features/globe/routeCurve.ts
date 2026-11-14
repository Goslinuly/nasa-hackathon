// Чистые функции гладкой линии маршрута и анимации марсохода: кривая Catmull-Rom, выборка точек, масштаб, цикл движения, ориентация.
import * as THREE from 'three';

export const CURVE_SAMPLES = 300;
export const MAX_CONTROL_POINTS = 400;
export const ROVER_LENGTH_DIVISOR = 12;
export const ROVER_MIN_SIZE = 0.00003;
export const ROVER_MAX_SIZE = 0.0012;
export const TRAVEL_MS = 40000;
export const PAUSE_MS = 2500;
export const APPEAR_MS = 1200;

export function decimatePoints<T>(points: T[], max: number = MAX_CONTROL_POINTS): T[] {
  if (points.length <= max) return points;
  const result: T[] = [];
  for (let i = 0; i < max; i++) result.push(points[Math.round((i * (points.length - 1)) / (max - 1))]);
  return result;
}

export function buildRouteCurve(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(decimatePoints(points), false, 'centripetal');
}

export function sampleCurvePoints(curve: THREE.Curve<THREE.Vector3>, count: number = CURVE_SAMPLES): THREE.Vector3[] {
  return curve.getSpacedPoints(count - 1);
}

export function roverSizeForLength(lengthUnits: number): number {
  return Math.min(ROVER_MAX_SIZE, Math.max(ROVER_MIN_SIZE, lengthUnits / ROVER_LENGTH_DIVISOR));
}

export function roverCycle(elapsedMs: number, travelMs: number = TRAVEL_MS, pauseMs: number = PAUSE_MS, appearMs: number = APPEAR_MS) {
  const phase = ((elapsedMs % (travelMs + pauseMs)) + travelMs + pauseMs) % (travelMs + pauseMs);
  const progress = Math.min(1, phase / travelMs);
  const x = Math.min(1, phase / appearMs);
  return { progress, scale: x * x * (3 - 2 * x) };
}

export function roverBasis(position: THREE.Vector3, tangent: THREE.Vector3): THREE.Matrix4 {
  const up = position.clone().normalize();
  const forward = tangent.clone().addScaledVector(up, -tangent.dot(up));
  if (forward.lengthSq() < 1e-12) forward.set(0, 1, 0).addScaledVector(up, -up.y);
  forward.normalize();
  const right = new THREE.Vector3().crossVectors(up, forward);
  return new THREE.Matrix4().makeBasis(right, up, forward).setPosition(position);
}
