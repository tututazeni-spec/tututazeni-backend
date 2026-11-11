// Regra da hierarquia: quem pode ser responsável directo de um colaborador.
// Serve o colaborador do mesmo departamento e ainda os chefes do departamento
// superior (qualquer nível acima), dos subdepartamentos (qualquer nível abaixo)
// e do próprio departamento.

export interface DeptLite {
  id: number;
  parentId: number | null;
  headId: number | null;
}

/** IDs dos chefes do departamento, dos superiores e dos subdepartamentos. */
export function relatedHeadIds(depts: DeptLite[], deptId: number): number[] {
  const byId = new Map(depts.map(d => [d.id, d]));
  const heads = new Set<number>();

  const own = byId.get(deptId);
  if (own?.headId != null) heads.add(own.headId);

  // Superiores
  const seen = new Set<number>();
  let cur = own?.parentId ?? null;
  while (cur != null && !seen.has(cur)) {
    seen.add(cur);
    const d = byId.get(cur);
    if (d?.headId != null) heads.add(d.headId);
    cur = d?.parentId ?? null;
  }

  // Subdepartamentos (qualquer nível)
  const visited = new Set<number>([deptId]);
  const stack = [deptId];
  while (stack.length) {
    const id = stack.pop() as number;
    for (const d of depts) {
      if (d.parentId === id && !visited.has(d.id)) {
        visited.add(d.id);
        if (d.headId != null) heads.add(d.headId);
        stack.push(d.id);
      }
    }
  }
  return [...heads];
}
