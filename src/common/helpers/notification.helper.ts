// src/common/helpers/notification.helper.ts
//
// Wrapper "melhor esforço" para criar um NotificationLog — nunca lança.
// Consolida dois problemas encontrados em ~15 services:
//  1. ~18 call sites faziam `prisma.notificationLog.create(...)` em linha,
//     sem try/catch nenhum — uma falha ao inserir a notificação (ex.: pico
//     de carga na BD) fazia fracassar toda a operação de negócio que já
//     tinha sido concluída com sucesso (inscrição em curso, emissão de
//     certificado, criação de recibo, avaliação submetida, etc.).
//  2. ~9 outros call sites já reimplementavam manualmente, ficheiro a
//     ficheiro, o mesmo wrapper try/catch + logger.warn (notifyUser/notify/
//     notifyRH em work-declarations, document-declarations,
//     document-repository, competency-map, career-plans, leave-management).
//
// Esta função não substitui `NotificationsService.send()` — não valida
// destinatário nem respeita `NotificationPreference.disabledCategories`.
// É apenas a extracção do padrão "criar e nunca rebentar" já em uso.

import { Logger } from '@nestjs/common';
import { NotificationCategory, NotificationLog, NotificationPriority } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationSafeInput {
  userId: number;
  type: string;
  message: string;
  title?: string;
  priority?: NotificationPriority;
  category?: NotificationCategory;
  /** Objecto a serializar com JSON.stringify — NotificationLog.metadata é String?. */
  metadata?: unknown;
}

export async function createNotificationSafe(
  prisma: PrismaService,
  logger: Logger,
  input: CreateNotificationSafeInput,
): Promise<NotificationLog | null> {
  try {
    return await prisma.notificationLog.create({
      data: {
        userId: input.userId,
        type: input.type,
        message: input.message,
        title: input.title,
        priority: input.priority,
        category: input.category,
        metadata: JSON.stringify(input.metadata ?? {}),
      },
    });
  } catch (e: unknown) {
    logger.warn(
      `Falha ao criar notificação (não bloqueante) — userId=${input.userId} type=${input.type}: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    return null;
  }
}
