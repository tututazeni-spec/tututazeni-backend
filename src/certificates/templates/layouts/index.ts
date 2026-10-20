import { Ctx } from '../plan-types';
import { LayoutKey } from '../template-config';
import { layout1 } from './layout-1';
import { layout2 } from './layout-2';
import { layout3 } from './layout-3';
import { layout4 } from './layout-4';
import { layout5 } from './layout-5';
import { layout6 } from './layout-6';
import { layout7 } from './layout-7';
import { layout8 } from './layout-8';
import { layout9 } from './layout-9';

const LAYOUTS: Record<LayoutKey, (ctx: Ctx) => void> = {
  'corporativo-classico': layout1,
  'moderno-minimalista': layout2,
  'executivo-premium': layout3,
  'institucional-formal': layout4,
  'tecnologico-contemporaneo': layout5,
  'elegante-geometrico': layout6,
  'academico-tradicional': layout7,
  'faixa-lateral': layout8,
  'premium-moldura': layout9,
};

export const layoutFor = (key: LayoutKey) => LAYOUTS[key];
