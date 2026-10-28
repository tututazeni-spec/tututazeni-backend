import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators';
import { ApiKeyGuard, ApiKeyRequest, RequireApiScope } from './api-key.guard';
import { PublicApiService } from './public-api.service';
import { PublicEnrollDto, PublicListDto } from './public-api.dto';

// API pública para integrações externas. Só expõe o que está aqui, com dados mínimos; nada
// do resto da plataforma é acessível por chave. @Public() só desliga a sessão JWT — a
// autenticação é feita pelo ApiKeyGuard.
@ApiTags('Public API')
@ApiSecurity('api-key')
@Public()
@UseGuards(ApiKeyGuard)
@Controller('public-api')
export class PublicApiController {
  constructor(private readonly svc: PublicApiService) {}

  @Get('me')
  @RequireApiScope('read')
  @ApiOperation({
    summary: 'Identifica a chave usada: nome, scopes, limite por minuto e expiração',
  })
  me(@Req() req: ApiKeyRequest) {
    const k = req.apiKey!;
    return {
      name: k.name,
      scopes: k.scopes,
      rateLimitPerMinute: k.rateLimit ?? 1000,
      expiresAt: k.expiresAt ?? null,
    };
  }

  @Get('employees')
  @RequireApiScope('read')
  @ApiOperation({ summary: 'Colaboradores activos (dados mínimos)' })
  employees(@Query() q: PublicListDto) {
    return this.svc.employees(q.page, q.limit);
  }

  @Get('courses')
  @RequireApiScope('read')
  @ApiOperation({ summary: 'Cursos publicados' })
  courses(@Query() q: PublicListDto) {
    return this.svc.courses(q.page, q.limit);
  }

  @Get('courses/:id/enrollments')
  @RequireApiScope('read')
  @ApiOperation({ summary: 'Inscrições de um curso e o respectivo estado' })
  enrollments(@Param('id', ParseIntPipe) id: number, @Query() q: PublicListDto) {
    return this.svc.courseEnrollments(id, q.page, q.limit);
  }

  @Post('enrollments')
  @RequireApiScope('write')
  @ApiOperation({ summary: 'Inscrever um colaborador num curso publicado' })
  enroll(@Body() dto: PublicEnrollDto) {
    return this.svc.enroll(dto);
  }
}
