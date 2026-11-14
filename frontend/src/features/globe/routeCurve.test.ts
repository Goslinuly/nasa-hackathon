// Тесты гладкой кривой маршрута, масштаба и цикла анимации марсохода.
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { APPEAR_MS, buildRouteCurve, decimatePoints, PAUSE_MS, ROVER_MIN_SIZE, roverBasis, roverCycle, roverSizeForView, sampleCurvePoints, TRAVEL_MS } from './routeCurve';

const arc = (n: number) => Array.from({ length: n }, (_, i) => { const a = i / (n - 1) * 0.5; return new THREE.Vector3(Math.cos(a), Math.sin(a), 0); });

describe('route curve', () => {
  it('samples the requested number of points through both ends', () => {
    const points = arc(30);
    const samples = sampleCurvePoints(buildRouteCurve(points), 250);
    expect(samples).toHaveLength(250);
    expect(samples[0].distanceTo(points[0])).toBeLessThan(1e-6);
    expect(samples[249].distanceTo(points[29])).toBeLessThan(1e-6);
  });
  it('decimates long routes keeping endpoints', () => {
    const points = arc(5000);
    const thin = decimatePoints(points, 400);
    expect(thin).toHaveLength(400);
    expect(thin[0]).toBe(points[0]);
    expect(thin[399]).toBe(points[4999]);
    expect(decimatePoints(points.slice(0, 10), 400)).toHaveLength(10);
  });
});

describe('rover size and cycle', () => {
  it('scales with route length and clamps', () => {
    expect(roverSizeForView(0, 1)).toBe(ROVER_MIN_SIZE);
    expect(roverSizeForView(10, 0.004)).toBeCloseTo(0.001, 6);
    expect(roverSizeForView(0.003, 1)).toBeCloseTo(0.00027, 6);
  });
  it('appears smoothly, travels at constant rate, pauses and loops', () => {
    expect(roverCycle(0)).toEqual({ progress: 0, scale: 0 });
    expect(roverCycle(APPEAR_MS).scale).toBe(1);
    expect(roverCycle(TRAVEL_MS / 2).progress).toBeCloseTo(0.5, 6);
    expect(roverCycle(TRAVEL_MS + PAUSE_MS / 2).progress).toBe(1);
    expect(roverCycle(TRAVEL_MS + PAUSE_MS).progress).toBe(0);
  });
});

describe('rover orientation', () => {
  it('puts the nose on the tangent and the top along the sphere normal', () => {
    const position = new THREE.Vector3(1, 0, 0);
    const m = roverBasis(position, new THREE.Vector3(0.3, 1, 0));
    const forward = new THREE.Vector3(0, 0, 1).transformDirection(m);
    const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
    expect(up.distanceTo(new THREE.Vector3(1, 0, 0))).toBeLessThan(1e-9);
    expect(forward.distanceTo(new THREE.Vector3(0, 1, 0))).toBeLessThan(1e-9);
  });
});
