import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface IntegrationData {
  name: string;
  type: string;       // campo obrigatório no IntegrationConfig
  endpoint: string;   // campo obrigatório no IntegrationConfig
  config?: any;       // campo obrigatório no IntegrationConfig
  baseUrl?: string;
  apiKey?: string;
  active?: boolean;
}

@Injectable()
export class ApiIntegrationService {
  private readonly logger = new Logger(ApiIntegrationService.name);
  constructor(private prisma: PrismaService) {}

  async getIntegrations() {
    return this.prisma.integrationConfig.findMany({ orderBy: { name: 'asc' } });
  }

  async createIntegration(data: IntegrationData) {
    return this.prisma.integrationConfig.create({
      data: {
        name:     data.name,
        type:     data.type,
        endpoint: data.endpoint,
        config:   data.config ?? {},
        baseUrl:  data.baseUrl,
        apiKey:   data.apiKey,
        active:   data.active ?? true,
      },
    });
  }

  async toggleIntegration(id: number) {
    const i = await this.prisma.integrationConfig.findUnique({ where: { id } });
    if (!i) return null;
    return this.prisma.integrationConfig.update({
      where: { id },
      data: { active: !i.active },
    });
  }

  async testIntegration(id: number) {
    const integration = await this.prisma.integrationConfig.findUnique({ where: { id } });
    if (!integration) return { success: false, message: 'Integração não encontrada' };

    const url = integration.baseUrl ?? integration.endpoint;
    try {
      const res = await fetch(url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      const success = res.ok || res.status < 500;

      // FIX: log resultado em ApiIntegrationLog
      await this.prisma.apiIntegrationLog.create({
        data: {
          integrationId: id,
          status:        success ? 'OK' : 'ERROR',
          statusCode:    res.status,
          message:       success ? 'Conexão estabelecida' : `Erro HTTP ${res.status}`,
        },
      });

      return {
        success,
        statusCode: res.status,
        message: success ? 'Conexão estabelecida' : `Erro HTTP ${res.status}`,
      };
    } catch (err: any) {
      await this.prisma.apiIntegrationLog.create({
        data: {
          integrationId: id,
          status:        'ERROR',
          message:       err.message ?? 'Falha na conexão',
        },
      });
      return { success: false, message: err.message ?? 'Falha na conexão' };
    }
  }

  async getLogs(integrationId: number, limit = 50) {
    return this.prisma.apiIntegrationLog.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}