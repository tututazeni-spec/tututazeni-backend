// ─── onboarding.service.ts ───────────────────────────────────────────────────
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOnboardingPlanDto, UpdateOnboardingTaskDto } from './onboarding.dto';
 
@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService) {}
 
  async findAll() {
    return this.prisma.onboardingPlan.findMany({
      include: { user: { select: { id: true, fullName: true, email: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
 
  async findByUser(userId: number) {
    const plans = await this.prisma.onboardingPlan.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return plans.map(p => {
      const tasks = p.tasks as any[];
      const completed = tasks.filter(t => t.completed).length;
      return { ...p, completedTasks: completed, totalTasks: tasks.length, progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 };
    });
  }
 
  async findOne(id: number) {
    const p = await this.prisma.onboardingPlan.findUnique({
      where: { id },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });
    if (!p) throw new NotFoundException('Plano de onboarding não encontrado');
    const tasks = p.tasks as any[];
    const completed = tasks.filter(t => t.completed).length;
    return { ...p, completedTasks: completed, totalTasks: tasks.length, progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0 };
  }
 
  async create(dto: CreateOnboardingPlanDto) {
    const tasks = dto.tasks.map((t, i) => ({ ...t, completed: false, order: t.order ?? i }));
    return this.prisma.onboardingPlan.create({
      data: { userId: dto.userId, tasks },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }
 
  async createFromTemplate(userId: number, templateName: string) {
    const templates: Record<string, any[]> = {
      standard: [
        { title: 'Apresentação à equipa', description: 'Reunião de boas-vindas', order: 1, completed: false },
        { title: 'Configuração do ambiente de trabalho', description: 'Instalação de ferramentas e acessos', order: 2, completed: false },
        { title: 'Leitura do manual do colaborador', order: 3, completed: false },
        { title: 'Formação de segurança e compliance', order: 4, completed: false },
        { title: 'Reunião com gestor direto', order: 5, completed: false },
        { title: 'Definição de objetivos do primeiro mês', order: 6, completed: false },
        { title: 'Conclusão do curso de integração', order: 7, completed: false },
      ],
      tech: [
        { title: 'Setup de ambiente de desenvolvimento', order: 1, completed: false },
        { title: 'Acesso a repositórios e sistemas', order: 2, completed: false },
        { title: 'Code review de projetos existentes', order: 3, completed: false },
        { title: 'Formação técnica obrigatória', order: 4, completed: false },
        { title: 'Primeira tarefa acompanhada', order: 5, completed: false },
      ],
    };
    const tasks = templates[templateName] ?? templates.standard;
    return this.create({ userId, tasks });
  }
 
  async updateTask(planId: number, dto: UpdateOnboardingTaskDto) {
    const plan = await this.findOne(planId);
    const tasks = plan.tasks as any[];
    if (dto.taskIndex < 0 || dto.taskIndex >= tasks.length) {
      throw new NotFoundException('Tarefa não encontrada');
    }
    tasks[dto.taskIndex] = { ...tasks[dto.taskIndex], ...dto };
    return this.prisma.onboardingPlan.update({
      where: { id: planId }, data: { tasks },
    });
  }
 
  async completeTask(planId: number, taskIndex: number) {
    return this.updateTask(planId, { taskIndex, completed: true });
  }
 
  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.onboardingPlan.delete({ where: { id } });
    return { message: 'Plano de onboarding removido' };
  }
 
  async getDashboard() {
    const plans = await this.prisma.onboardingPlan.findMany({
      include: { user: { select: { id: true, fullName: true, createdAt: true } } },
    });
    return plans.map(p => {
      const tasks = p.tasks as any[];
      const completed = tasks.filter(t => t.completed).length;
      return {
        id: p.id, userId: p.userId, userName: p.user.fullName,
        startedAt: p.createdAt, progress: tasks.length ? Math.round((completed / tasks.length) * 100) : 0,
        completed, total: tasks.length,
      };
    });
  }
}
 
