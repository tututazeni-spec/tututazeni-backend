// Custo do bcrypt centralizado — evita o "12" duplicado em cada ficheiro que
// faz hash de senhas, e permite ajustá-lo (ex.: subir com hardware mais rápido)
// num único sítio, sem invalidar hashes já gravados (o cost fica embutido no hash).
export const BCRYPT_COST_FACTOR = parseInt(process.env.BCRYPT_COST_FACTOR ?? '12', 10);
