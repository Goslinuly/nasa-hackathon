// Общее состояние шара для оболочки и своих режимов: движок, рельеф, курсор, вид камеры.
// Частые события (курсор) идут через маленькие хранилища, чтобы не перерисовывать всю оболочку.
import { createContext, useContext, useSyncExternalStore } from 'react';

import type { HoverPoint, MarsGlobeEngine, TerrainState, ViewState } from '@/features/globe/engine';

export class ValueStore<T> {
  private listeners = new Set<() => void>();

  constructor(private value: T) {}

  get = (): T => this.value;

  set(value: T): void {
    if (Object.is(value, this.value)) return;
    this.value = value;
    this.listeners.forEach((listener) => listener());
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
}

export function useValue<T>(store: ValueStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface GlobeState {
  engine: MarsGlobeEngine;
  terrain: ValueStore<TerrainState>;
  hover: ValueStore<HoverPoint | null>;
  view: ValueStore<ViewState | null>;
}

export const GlobeStateContext = createContext<GlobeState | null>(null);

/** Движок и хранилища шара; доступно внутри оболочки (режимы route и layers). */
export function useGlobeState(): GlobeState {
  const state = useContext(GlobeStateContext);
  if (!state) throw new Error('useGlobeState вне оболочки');
  return state;
}
