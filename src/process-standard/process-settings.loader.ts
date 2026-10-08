// src/process-standard/process-settings.loader.ts
// Leitura de uma secção de configuração (valor guardado ou por omissão). Função
// livre — evita dependências circulares entre serviços do módulo.
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_SETTINGS, SettingKey } from './process-settings';

export async function loadSetting<T>(prisma: PrismaService, key: SettingKey): Promise<T> {
  try {
    const row = await prisma.processSetting.findUnique({ where: { key } });
    if (row) return JSON.parse(row.value) as T;
  } catch {
    // base de dados indisponível ou JSON corrompido → valores por omissão
  }
  return DEFAULT_SETTINGS[key] as T;
}
