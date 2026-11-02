import { join } from 'path';
import { readFileSync } from 'fs';
import { collectAuthzInventory, externalReach } from '../../src/common/guards/authz-inventory';

// Barreira do instrutor externo (fase 3): a lista de handlers a que ele chega está CONGELADA em
// external-reach.snapshot.json. Qualquer endpoint novo que o admita (um @Roles(INSTRUCTOR_EXTERNO)
// ou um @AllowExternal) falha aqui até a lista ser atualizada DE PROPÓSITO, com revisão humana.
describe('alcance do instrutor externo', () => {
  const inv = collectAuthzInventory(join(__dirname, '..', '..', 'src'));
  const reach = externalReach(inv);
  const snapshot: string[] = JSON.parse(
    readFileSync(join(__dirname, 'external-reach.snapshot.json'), 'utf8'),
  );

  it('os handlers acessíveis ao externo são exatamente os do snapshot revisto', () => {
    expect(reach).toEqual(snapshot);
  }, 300_000);

  it('nenhum handler @AnyAuthenticated sem @AllowExternal é acessível ao externo', () => {
    const leaked = inv
      .filter(h => h.policy === 'authenticated' && !h.allowExternal)
      .map(h => `${h.file}#${h.handler}`)
      .filter(id => reach.includes(id));
    expect(leaked).toEqual([]);
  }, 300_000);

  it('todo o handler de módulos/lições a que o externo chega valida a posse do curso', () => {
    // Exceções explícitas: listagem filtrada no serviço (findAll) e turmas (âmbito por instructorId).
    const unscoped = inv
      .filter(
        h =>
          reach.includes(`${h.file}#${h.handler}`) &&
          (h.file === 'course-modules/course-modules.controller.ts' ||
            h.file === 'courses/courses.controller.ts') &&
          h.handler !== 'findAll' &&
          !/cohort/i.test(h.handler) &&
          !h.externalCourseScope,
      )
      .map(h => `${h.file}#${h.handler}`);
    expect(unscoped).toEqual([]);
  }, 300_000);

  it('todo o handler de aulas ao vivo por id a que o externo chega valida a posse da aula', () => {
    // Sem rota :id (listagens e criação) o âmbito é aplicado no serviço (ownerScope / create).
    const SERVICE_SCOPED = new Set([
      'findAll',
      'upcoming',
      'dashboard',
      'calendar',
      'listAllSessions',
      'listParticipants',
      'listInstructors',
      'listVirtualRooms',
      'listRecordings',
      'listMaterials',
      'listEvaluations',
      'evaluationsSummary',
      'reports',
      'exportReports',
      'create',
    ]);
    const unscoped = inv
      .filter(
        h =>
          reach.includes(`${h.file}#${h.handler}`) &&
          h.file === 'live-classes/live-classes.controller.ts' &&
          !SERVICE_SCOPED.has(h.handler) &&
          !h.externalLiveClassScope,
      )
      .map(h => `${h.file}#${h.handler}`);
    expect(unscoped).toEqual([]);
  }, 300_000);

  it('o externo nunca alcança endpoints de administração (utilizadores, definições, auditoria, pagamentos)', () => {
    const sensitive =
      /^(users\/(?!users\.controller\.ts#(me|updateMyProfile|setMyAvatar|removeMyAvatar|changePassword)$)|settings\/|audit\/|payroll\/|roles-permissions\/|acl\/|billing\/|leave-management\/|career\/|development-plans\/|evaluation360\/|crm-)/;
    expect(reach.filter(id => sensitive.test(id))).toEqual([]);
  }, 300_000);
});
