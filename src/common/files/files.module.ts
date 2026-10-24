// src/common/files/files.module.ts
// Trabalhos em segundo plano da verificação de ficheiros (varrimento diário e fila de ficheiros
// grandes). Prisma e AuditService vêm de módulos globais.
import { Module } from '@nestjs/common';
import { RemoteFileSweeper } from './remote-file-sweeper';

@Module({ providers: [RemoteFileSweeper] })
export class FilesModule {}
