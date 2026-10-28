// Caminho da página onde o pedido foi aberto: só o path, sem query/hash, para ajudar o suporte
// a reproduzir o problema sem guardar parâmetros que possam conter dados pessoais.
export function normalizeSupportPage(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const base = raw.split(/[?#]/)[0].slice(0, 200);
  return base.startsWith('/') ? base : null;
}
