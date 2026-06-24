/**
 * Forma do utilizador autenticado devolvido por @CurrentUser().
 * Corresponde ao objecto que o JwtStrategy.validate() coloca em req.user
 * (modelo Prisma User com a relação role + permissions).
 *
 * Substitui o `any` que estava espalhado por ~445 endpoints: typos como
 * `user.idd` passam a ser erro de compilação.
 */
export interface CurrentUserData {
  id: number;
  email: string;
  active: boolean;
  roleId: number | null;
  role: { id: number; name: string; permissions?: { name: string }[] } | null;

  // ⚠️ LEGADO — A REVER: campos acedidos em alguns controllers
  // (dashboard, evaluation360, document-repository) mas que NÃO existem no
  // modelo Prisma User, logo são `undefined` em runtime. Mantidos opcionais
  // para preservar o comportamento actual sem partir a compilação.
  // Provavelmente deviam ser `user.role?.name` e a relação de departamento.
  roleCode?: string;
  employee?: { department?: string | null };
}
