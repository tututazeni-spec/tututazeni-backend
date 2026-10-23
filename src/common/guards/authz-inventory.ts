import 'reflect-metadata';
import { readdirSync, statSync } from 'fs';
import { join, sep } from 'path';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AUTHENTICATED_ONLY_KEY, PERMISSION_KEY } from '../decorators/authz.decorators';

export interface HandlerPolicy {
  controller: string;
  handler: string;
  file: string;
  /** roles | public | authenticated | permission | none */
  policy: 'roles' | 'public' | 'authenticated' | 'permission' | 'none';
}

const HTTP_METHOD_KEY = 'method'; // METHOD_METADATA do @nestjs/common
const CONTROLLER_PATH_KEY = 'path';

function controllerFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) controllerFiles(full, out);
    else if (name.endsWith('.controller.ts') && !name.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

function policyOf(target: object, handler: object): HandlerPolicy['policy'] {
  const has = (key: string) =>
    Reflect.getMetadata(key, handler) ?? Reflect.getMetadata(key, target);
  if (has(IS_PUBLIC_KEY)) return 'public';
  if (has(ROLES_KEY)) return 'roles';
  if (has(PERMISSION_KEY)) return 'permission';
  if (has(AUTHENTICATED_ONLY_KEY)) return 'authenticated';
  return 'none';
}

/** Lê os metadados de autorização de todos os handlers HTTP de todos os controllers em `srcDir`. */
export function collectAuthzInventory(srcDir: string): HandlerPolicy[] {
  const result: HandlerPolicy[] = [];
  for (const file of controllerFiles(srcDir)) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(file) as Record<string, unknown>;
    for (const exported of Object.values(mod)) {
      if (typeof exported !== 'function') continue;
      if (Reflect.getMetadata(CONTROLLER_PATH_KEY, exported) === undefined) continue;
      const proto = (exported as { prototype: Record<string, unknown> }).prototype;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (typeof handler !== 'function') continue;
        if (Reflect.getMetadata(HTTP_METHOD_KEY, handler) === undefined) continue;
        result.push({
          controller: (exported as { name: string }).name,
          handler: name,
          file: file
            .slice(srcDir.length + 1)
            .split(sep)
            .join('/'),
          policy: policyOf(exported, handler),
        });
      }
    }
  }
  return result;
}
