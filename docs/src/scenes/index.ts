import { smoke } from './smoke';
import type { SceneDef } from './types';

/** Menu order. */
export const SCENES: Record<string, SceneDef> = { smoke };

export const DEFAULT_SCENE = 'smoke';
