/**
 * Partilha o resultado de uma computação assíncrona entre chamadores
 * simultâneos ou muito próximos no tempo (por defeito 15 s). Serve para
 * métricas agregadas caras que vários serviços pedem uns aos outros no mesmo
 * tick de cron — sem isto a mesma query corre 4–6× em paralelo e todas
 * aparecem como "slow query". Falhas não ficam em cache.
 */
export class SharedResult {
  private entry: { at: number; value: Promise<unknown> } | null = null;

  constructor(private readonly ttlMs = 15_000) {}

  get<T>(compute: () => Promise<T>): Promise<T> {
    const now = Date.now();
    if (!this.entry || now - this.entry.at > this.ttlMs) {
      const entry = { at: now, value: compute() as Promise<unknown> };
      this.entry = entry;
      entry.value.catch(() => {
        if (this.entry === entry) this.entry = null;
      });
    }
    return this.entry.value as Promise<T>;
  }
}
