import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { MODEL_YAW_FIX } from './roverRig';

describe('ориентация модели ровера в прогулке', () => {
  it('нос модели (+Z в файле) смотрит вперёд сцены (−Z), куда едет W при курсе 0', () => {
    const nose = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), MODEL_YAW_FIX);
    expect(nose.x).toBeCloseTo(0, 6);
    expect(nose.z).toBeCloseTo(-1, 6);
  });
});
