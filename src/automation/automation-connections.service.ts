// src/automation/automation-connections.service.ts
// §10/§12 — gestão segura de credenciais e segredos de API. O segredo é cifrado
// (AES-256-GCM) antes de gravar e nunca volta nas respostas nem nos registos:
// só `secretHint` (últimos 4 caracteres) serve para identificar a credencial.
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { calculatePagination, buildPaginatedResponse } from '../common/helpers/pagination.helper';
import { ConnectionFilterDto, CreateConnectionDto, UpdateConnectionDto } from './automation-governance.dto';
import { AutomationAuditService, diffFields } from './automation-audit.service';

type ConnectionRow = NonNullable<
  Awaited<ReturnType<PrismaService['automationConnection']['findUnique']>>
>;

/** Chave de 32 bytes: AUTOMATION_SECRET_KEY, ou derivada do JWT_SECRET como último recurso. */
function encryptionKey(): Buffer {
  const material = process.env.AUTOMATION_SECRET_KEY ?? process.env.JWT_SECRET;
  if (!material) {
    throw new BadRequestException(
      'Defina AUTOMATION_SECRET_KEY no ambiente para guardar credenciais de forma segura',
    );
  }
  return createHash('sha256').update(material).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map(b => b.toString('base64')).join(':');
}

export function decryptSecret(blob: string): string {
  const [iv, tag, data] = blob.split(':').map(p => Buffer.from(p, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/** Representação segura: sem segredo cifrado. */
function publicView(c: ConnectionRow) {
  const { secretEnc, ...rest } = c;
  return { ...rest, hasSecret: !!secretEnc };
}

@Injectable()
export class AutomationConnectionsService {
  private readonly logger = new Logger(AutomationConnectionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AutomationAuditService,
  ) {}

  private validate(dto: Partial<CreateConnectionDto>, current?: ConnectionRow) {
    const authType = dto.authType ?? current?.authType ?? 'NONE';
    const baseUrl = dto.baseUrl ?? current?.baseUrl;
    if (baseUrl && !/^https?:\/\//i.test(baseUrl)) {
      throw new BadRequestException('O endereço base tem de começar por http:// ou https://');
    }
    if (authType === 'BASIC' && !(dto.username ?? current?.username)) {
      throw new BadRequestException('Autenticação BASIC exige o utilizador');
    }
    if (authType === 'API_KEY_HEADER' && !(dto.headerName ?? current?.headerName)) {
      throw new BadRequestException('Autenticação por chave exige o nome do cabeçalho');
    }
    if (authType !== 'NONE' && !dto.secret && !current?.secretEnc) {
      throw new BadRequestException('Esta autenticação exige o segredo (token, palavra-passe ou chave)');
    }
  }

  async list(f: ConnectionFilterDto = {}) {
    const { page = 1, limit = 30 } = f;
    const { skip, take } = calculatePagination(page, limit);
    const where = {
      ...(f.status ? { status: f.status } : {}),
      ...(f.type ? { type: f.type } : {}),
      ...(f.search?.trim()
        ? { name: { contains: f.search.trim(), mode: 'insensitive' as const } }
        : {}),
    };
    const [rows, total] = await Promise.all([
      this.prisma.automationConnection.findMany({
        where,
        skip,
        take,
        orderBy: { name: 'asc' },
      }),
      this.prisma.automationConnection.count({ where }),
    ]);
    return buildPaginatedResponse(rows.map(publicView), total, page, limit);
  }

  private async find(id: string) {
    const row = await this.prisma.automationConnection.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Ligação não encontrada');
    return row;
  }

  async get(id: string) {
    return publicView(await this.find(id));
  }

  async create(dto: CreateConnectionDto, userId: number) {
    this.validate(dto);
    const exists = await this.prisma.automationConnection.findUnique({ where: { name: dto.name } });
    if (exists) throw new BadRequestException('Já existe uma ligação com este nome');
    const row = await this.prisma.automationConnection.create({
      data: {
        name: dto.name,
        type: dto.type ?? 'HTTP',
        baseUrl: dto.baseUrl,
        authType: dto.authType ?? 'NONE',
        headerName: dto.headerName,
        username: dto.username,
        description: dto.description,
        ...(dto.secret
          ? { secretEnc: encryptSecret(dto.secret), secretHint: dto.secret.slice(-4) }
          : {}),
        ownerId: dto.ownerId ?? userId,
        createdBy: userId,
      },
    });
    await this.audit.record({
      entity: 'CONNECTION',
      action: 'CONNECTION_CREATED',
      entityId: row.id,
      userId,
      after: publicView(row),
    });
    return publicView(row);
  }

  async update(id: string, dto: UpdateConnectionDto, userId: number) {
    const current = await this.find(id);
    this.validate(dto, current);
    if (dto.name && dto.name !== current.name) {
      const dup = await this.prisma.automationConnection.findUnique({ where: { name: dto.name } });
      if (dup) throw new BadRequestException('Já existe uma ligação com este nome');
    }
    const { secret, ...rest } = dto;
    const row = await this.prisma.automationConnection.update({
      where: { id },
      data: {
        ...rest,
        ...(secret ? { secretEnc: encryptSecret(secret), secretHint: secret.slice(-4) } : {}),
      },
    });
    const changed = diffFields(
      publicView(current) as unknown as Record<string, unknown>,
      publicView(row) as unknown as Record<string, unknown>,
    );
    await this.audit.record({
      entity: 'CONNECTION',
      action: secret ? 'CONNECTION_SECRET_ROTATED' : 'CONNECTION_UPDATED',
      entityId: id,
      userId,
      before: { ...changed.before, updatedAt: undefined },
      after: { ...changed.after, updatedAt: undefined },
    });
    return publicView(row);
  }

  async remove(id: string, userId: number) {
    const row = await this.find(id);
    await this.prisma.automationConnection.delete({ where: { id } });
    await this.audit.record({
      entity: 'CONNECTION',
      action: 'CONNECTION_DELETED',
      entityId: id,
      userId,
      before: publicView(row),
    });
    return { message: 'Ligação removida' };
  }

  /** Cabeçalhos de autenticação em claro — só para o motor, nunca expostos por API. */
  async authHeaders(id: string): Promise<{ baseUrl: string | null; headers: Record<string, string> }> {
    const c = await this.find(id);
    if (c.status !== 'ACTIVE') throw new BadRequestException('A ligação está desactivada');
    const headers: Record<string, string> = {};
    if (c.secretEnc) {
      const secret = decryptSecret(c.secretEnc);
      if (c.authType === 'BEARER') headers.Authorization = `Bearer ${secret}`;
      else if (c.authType === 'BASIC') {
        headers.Authorization = `Basic ${Buffer.from(`${c.username ?? ''}:${secret}`).toString('base64')}`;
      } else if (c.authType === 'API_KEY_HEADER' && c.headerName) headers[c.headerName] = secret;
    }
    return { baseUrl: c.baseUrl, headers };
  }

  /** Teste de conectividade (GET ao endereço base com a autenticação configurada). */
  async test(id: string, userId: number) {
    const c = await this.find(id);
    if (!c.baseUrl) throw new BadRequestException('A ligação não tem endereço base para testar');
    const started = Date.now();
    let status = 'OK';
    let httpStatus: number | null = null;
    let error: string | undefined;
    try {
      const { headers } = await this.authHeaders(id);
      const res = await fetch(c.baseUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(8000),
      });
      httpStatus = res.status;
      if (res.status >= 500) status = 'FAILED';
    } catch (e: unknown) {
      status = 'FAILED';
      error = e instanceof Error ? e.message : String(e);
    }
    await this.prisma.automationConnection.update({
      where: { id },
      data: { lastTestedAt: new Date(), lastTestStatus: status },
    });
    await this.audit.record({
      entity: 'CONNECTION',
      action: 'CONNECTION_TESTED',
      entityId: id,
      userId,
      note: `${status}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`,
    });
    this.logger.log({ connectionId: id, status, msg: 'Teste de ligação de automação' });
    return { status, httpStatus, durationMs: Date.now() - started, ...(error ? { error } : {}) };
  }
}
