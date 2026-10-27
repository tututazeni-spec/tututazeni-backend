import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

// Feature flags para lançamentos graduais. Configuradas por ambiente em FEATURE_FLAGS,
// lista separada por vírgulas: `nome:on`, `nome:off` ou `nome:25` (25 % dos utilizadores).
// Ex.: FEATURE_FLAGS=nova-folha:25,relatorios-v2:on
// Flag inexistente = desligada. Desligar/reduzir uma flag é o rollback instantâneo de uma
// funcionalidade (basta alterar o .env e reiniciar em rolling, sem novo deploy de código).
@Injectable()
export class FeatureFlagsService {
  private readonly percents: Map<string, number>;

  constructor() {
    this.percents = FeatureFlagsService.parse(process.env.FEATURE_FLAGS);
  }

  static parse(raw: string | undefined): Map<string, number> {
    const out = new Map<string, number>();
    for (const part of (raw ?? '').split(',')) {
      const [name, value] = part.split(':').map(s => s.trim());
      if (!name) continue;
      if (value === 'on') out.set(name, 100);
      else if (value === 'off') out.set(name, 0);
      else {
        const pct = Number(value);
        if (Number.isFinite(pct)) out.set(name, Math.min(100, Math.max(0, pct)));
      }
    }
    return out;
  }

  // Sem userId, só é verdadeira com 100 %. Com userId o bucket (0-99) é estável por
  // (flag, utilizador): o mesmo utilizador vê sempre o mesmo comportamento enquanto o
  // percentual só aumentar.
  isEnabled(flag: string, userId?: string): boolean {
    const pct = this.percents.get(flag) ?? 0;
    if (pct >= 100) return true;
    if (pct <= 0 || !userId) return false;
    const hash = createHash('sha256').update(`${flag}:${userId}`).digest().readUInt32BE(0);
    return hash % 100 < pct;
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.percents);
  }
}
