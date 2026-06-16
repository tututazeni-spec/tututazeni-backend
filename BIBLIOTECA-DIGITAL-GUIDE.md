# INNOVA — Módulo 4: Biblioteca Digital
> Mesmo padrão dos Módulos 1, 2 e 3
> Referência: SharePoint + DocuWare + Confluence + Springer Nature

---

## ⚠️ REGRAS ABSOLUTAS DO INNOVA

```
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000
```

---

## CHECKLIST OBRIGATÓRIO

```
□ Schema Prisma + migrate dev
□ DTOs (create-collection + create-item + update-item + filter + rating + comment)
□ Service completo (CRUD + view/download tracking + ratings + comentários + dashboard)
□ Controller completo (Swagger + Guards + rotas RESTful)
□ Module registado no AppModule
□ Spec file (8 testes mínimo)
□ Bruno CLI (6 ficheiros .bru)
□ Frontend page.tsx (grelha de cards + loading + paginação + filtros)
□ Frontend [id]/page.tsx (detalhe + preview + ratings + comentários)
□ Frontend novo/page.tsx (formulário de upload)
□ npm run build → 0 erros
□ npm run test → 0 falhas
□ npm run test:cov → > 55%
□ npx bru run bruno/library/ → passa
□ git commit descritivo
```

---

## PASSO 1 — Schema Prisma

```prisma
# Adicionar a prisma/schema.prisma

model LibraryCollection {
  id          String   @id @default(cuid())
  name        String
  description String?
  icon        String?
  color       String?
  isPublic    Boolean  @default(true)
  order       Int      @default(0)
  createdById String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  deletedAt   DateTime?

  createdBy User          @relation("CollectionCreator", fields: [createdById], references: [id])
  items     LibraryItem[]

  @@index([isPublic])
  @@index([deletedAt])
}

model LibraryItem {
  id           String          @id @default(cuid())
  code         String          @unique
  collectionId String?
  title        String
  subtitle     String?
  description  String?
  type         LibraryItemType
  fileUrl      String
  fileSize     Int?
  mimeType     String?
  thumbnailUrl String?
  author       String?
  publisher    String?
  isbn         String?
  issn         String?
  doi          String?
  year         Int?
  edition      String?
  language     String          @default("pt")
  pages        Int?
  tags         String[]
  categories   String[]
  keywords     String[]
  targetRoles  String[]
  isPublic     Boolean         @default(false)
  requiresAuth Boolean         @default(true)
  downloads    Int             @default(0)
  views        Int             @default(0)
  rating       Float           @default(0)
  ratingCount  Int             @default(0)
  version      String          @default("1.0")
  parentId     String?
  uploadedById String
  reviewedById String?
  isApproved   Boolean         @default(false)
  approvedAt   DateTime?
  expiresAt    DateTime?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  deletedAt    DateTime?

  collection LibraryCollection? @relation(fields: [collectionId], references: [id])
  uploadedBy User               @relation("LibraryUploader", fields: [uploadedById], references: [id])
  reviewedBy User?              @relation("LibraryReviewer", fields: [reviewedById], references: [id])
  accesses   LibraryAccess[]
  ratings    LibraryRating[]
  comments   LibraryComment[]

  @@index([type])
  @@index([collectionId])
  @@index([isPublic])
  @@index([isApproved])
  @@index([uploadedById])
  @@index([deletedAt])
}

model LibraryAccess {
  id        String        @id @default(cuid())
  itemId    String
  userId    String
  action    LibraryAction
  ipAddress String?
  userAgent String?
  createdAt DateTime      @default(now())

  item LibraryItem @relation(fields: [itemId], references: [id])
  user User        @relation("LibraryAccessUser", fields: [userId], references: [id])

  @@index([itemId])
  @@index([userId])
  @@index([action])
  @@index([createdAt])
}

model LibraryRating {
  id        String   @id @default(cuid())
  itemId    String
  userId    String
  score     Int
  comment   String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  item LibraryItem @relation(fields: [itemId], references: [id])
  user User        @relation("LibraryRatingUser", fields: [userId], references: [id])

  @@unique([itemId, userId])
  @@index([itemId])
}

model LibraryComment {
  id        String   @id @default(cuid())
  itemId    String
  userId    String
  content   String
  parentId  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  deletedAt DateTime?

  item LibraryItem @relation(fields: [itemId], references: [id])
  user User        @relation("LibraryCommentUser", fields: [userId], references: [id])

  @@index([itemId])
  @@index([userId])
  @@index([deletedAt])
}

enum LibraryItemType {
  PDF EBOOK VIDEO AUDIO PRESENTATION
  SPREADSHEET DOCUMENT IMAGE LINK SCORM OTHER
}
enum LibraryAction { VIEW DOWNLOAD SHARE PRINT }
```

```bash
npx prisma validate
npx prisma migrate dev --name "add_library"
npx prisma generate
```

---

## PASSO 2 — DTOs

```typescript
// src/library/dto/create-collection.dto.ts
import { IsString, IsOptional, IsBoolean, IsInt, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCollectionDto {
  @ApiProperty({ example: 'Manuais Técnicos' })
  @IsString() @Length(2, 100)
  name: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  icon?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  color?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional() @IsInt()
  order?: number;
}

// src/library/dto/create-item.dto.ts
import {
  IsString, IsOptional, IsEnum, IsInt, IsBoolean,
  IsArray, IsDateString, Min, Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LibraryItemType } from '@prisma/client';

export class CreateItemDto {
  @ApiProperty({ enum: LibraryItemType })
  @IsEnum(LibraryItemType)
  type: LibraryItemType;

  @ApiProperty({ example: 'Manual de Segurança no Trabalho' })
  @IsString() @Length(2, 250)
  title: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  subtitle?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  description?: string;

  @ApiProperty({ example: 'https://storage.innova.ao/docs/manual.pdf' })
  @IsString()
  fileUrl: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(0)
  fileSize?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  mimeType?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  thumbnailUrl?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  collectionId?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  author?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  publisher?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  isbn?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  issn?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  doi?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  edition?: string;

  @ApiPropertyOptional({ default: 'pt' })
  @IsOptional() @IsString()
  language?: string;

  @ApiPropertyOptional()
  @IsOptional() @IsInt() @Min(1)
  pages?: number;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional() @IsArray() @IsString({ each: true })
  targetRoles?: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional() @IsBoolean()
  requiresAuth?: boolean;

  @ApiPropertyOptional()
  @IsOptional() @IsDateString()
  expiresAt?: string;
}

// src/library/dto/update-item.dto.ts
import { PartialType } from '@nestjs/swagger';
import { CreateItemDto } from './create-item.dto';

export class UpdateItemDto extends PartialType(CreateItemDto) {}

// src/library/dto/filter-item.dto.ts
import { IsOptional, IsEnum, IsString, IsInt, IsBoolean, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { LibraryItemType } from '@prisma/client';

export class FilterItemDto {
  @ApiPropertyOptional() @IsOptional() @IsEnum(LibraryItemType)
  type?: LibraryItemType;

  @ApiPropertyOptional() @IsOptional() @IsString()
  collectionId?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  category?: string;

  @ApiPropertyOptional() @IsOptional() @IsString()
  search?: string;

  @ApiPropertyOptional() @IsOptional() @Type(() => Boolean) @IsBoolean()
  isApproved?: boolean;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  limit?: number = 20;
}

// src/library/dto/create-rating.dto.ts
import { IsInt, IsOptional, IsString, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRatingDto {
  @ApiProperty({ minimum: 1, maximum: 5 })
  @IsInt() @Min(1) @Max(5)
  score: number;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  comment?: string;
}

// src/library/dto/create-comment.dto.ts
import { IsString, IsOptional, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty()
  @IsString() @Length(1, 2000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional() @IsString()
  parentId?: string;
}

// src/library/dto/index.ts
export * from './create-collection.dto';
export * from './create-item.dto';
export * from './update-item.dto';
export * from './filter-item.dto';
export * from './create-rating.dto';
export * from './create-comment.dto';
```

---

## PASSO 3 — Service Completo

```typescript
// src/library/library.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCollectionDto, CreateItemDto, UpdateItemDto,
  FilterItemDto, CreateRatingDto, CreateCommentDto,
} from './dto';

@Injectable()
export class LibraryService {
  constructor(private prisma: PrismaService) {}

  // ─── CÓDIGO AUTO-GERADO ──────────────────────────────

  private async generateCode(): Promise<string> {
    const last = await this.prisma.libraryItem.findFirst({
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const num = last ? parseInt(last.code.replace('LIB-', '')) + 1 : 1;
    return `LIB-${String(num).padStart(5, '0')}`;
  }

  // ─── COLECÇÕES ───────────────────────────────────────

  async createCollection(dto: CreateCollectionDto, userId: string) {
    const collection = await this.prisma.libraryCollection.create({
      data: { ...dto, createdById: userId },
    });
    await this.audit(userId, 'CREATE', 'LibraryCollection', collection.id, dto);
    return collection;
  }

  async findAllCollections() {
    return this.prisma.libraryCollection.findMany({
      where: { deletedAt: null },
      orderBy: { order: 'asc' },
      include: {
        _count: { select: { items: true } },
      },
    });
  }

  // ─── ITENS — CRUD ────────────────────────────────────

  async createItem(dto: CreateItemDto, userId: string) {
    const code = await this.generateCode();
    const item = await this.prisma.libraryItem.create({
      data: { ...dto, code, uploadedById: userId },
      include: {
        collection: { select: { name: true } },
        uploadedBy: { select: { fullName: true } },
      },
    });
    await this.audit(userId, 'CREATE', 'LibraryItem', item.id, { code, type: dto.type });
    return item;
  }

  async findAllItems(filters: FilterItemDto) {
    const { type, collectionId, category, search, isApproved, page = 1, limit = 20 } = filters;
    const where: any = {
      deletedAt: null,
      ...(type         && { type }),
      ...(collectionId && { collectionId }),
      ...(category     && { categories: { has: category } }),
      ...(isApproved !== undefined && { isApproved }),
      ...(search && {
        OR: [
          { title:    { contains: search, mode: 'insensitive' } },
          { author:   { contains: search, mode: 'insensitive' } },
          { code:     { contains: search, mode: 'insensitive' } },
          { keywords: { has: search } },
        ],
      }),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.libraryItem.findMany({
        where, skip: (page - 1) * limit, take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          collection: { select: { name: true } },
          uploadedBy: { select: { fullName: true } },
          _count: { select: { comments: true, ratings: true } },
        },
      }),
      this.prisma.libraryItem.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findItemById(id: string) {
    const item = await this.prisma.libraryItem.findUnique({
      where: { id },
      include: {
        collection: { select: { name: true } },
        uploadedBy: { select: { fullName: true } },
        reviewedBy: { select: { fullName: true } },
        comments: {
          where: { deletedAt: null, parentId: null },
          orderBy: { createdAt: 'desc' },
          include: { user: { select: { fullName: true } } },
        },
        ratings: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: { user: { select: { fullName: true } } },
        },
        _count: { select: { comments: true, ratings: true } },
      },
    });
    if (!item || item.deletedAt) throw new NotFoundException('Item não encontrado');
    return item;
  }

  async updateItem(id: string, dto: UpdateItemDto, userId: string) {
    await this.findItemById(id);
    const updated = await this.prisma.libraryItem.update({ where: { id }, data: dto });
    await this.audit(userId, 'UPDATE', 'LibraryItem', id, dto);
    return updated;
  }

  async softDeleteItem(id: string, userId: string) {
    await this.findItemById(id);
    await this.prisma.libraryItem.update({
      where: { id }, data: { deletedAt: new Date() },
    });
    await this.audit(userId, 'DELETE', 'LibraryItem', id, { deletedAt: new Date() });
    return { message: 'Item removido com sucesso' };
  }

  // ─── APROVAÇÃO ───────────────────────────────────────

  async approveItem(id: string, userId: string) {
    await this.findItemById(id);
    const updated = await this.prisma.libraryItem.update({
      where: { id },
      data: { isApproved: true, approvedAt: new Date(), reviewedById: userId },
    });
    await this.audit(userId, 'UPDATE', 'LibraryItem', id, { isApproved: true });
    return updated;
  }

  // ─── VISUALIZAÇÃO E DOWNLOAD (TRACKING) ──────────────

  async view(id: string, userId: string, ipAddress?: string, userAgent?: string) {
    const item = await this.findItemById(id);
    await this.prisma.$transaction([
      this.prisma.libraryItem.update({
        where: { id }, data: { views: { increment: 1 } },
      }),
      this.prisma.libraryAccess.create({
        data: { itemId: id, userId, action: 'VIEW', ipAddress, userAgent },
      }),
    ]);
    return item;
  }

  async download(id: string, userId: string, ipAddress?: string) {
    const item = await this.findItemById(id);
    await this.prisma.$transaction([
      this.prisma.libraryItem.update({
        where: { id }, data: { downloads: { increment: 1 } },
      }),
      this.prisma.libraryAccess.create({
        data: { itemId: id, userId, action: 'DOWNLOAD', ipAddress },
      }),
    ]);
    await this.audit(userId, 'DOWNLOAD', 'LibraryItem', id, { code: item.code });
    return { fileUrl: item.fileUrl, fileName: item.title };
  }

  // ─── AVALIAÇÕES ──────────────────────────────────────

  async rateItem(itemId: string, dto: CreateRatingDto, userId: string) {
    await this.findItemById(itemId);

    const rating = await this.prisma.libraryRating.upsert({
      where: { itemId_userId: { itemId, userId } },
      update: { score: dto.score, comment: dto.comment },
      create: { itemId, userId, score: dto.score, comment: dto.comment },
    });

    // Recalcula média de avaliações
    const ratings = await this.prisma.libraryRating.findMany({
      where: { itemId },
      select: { score: true },
    });
    const avg = ratings.reduce((s, r) => s + r.score, 0) / ratings.length;

    await this.prisma.libraryItem.update({
      where: { id: itemId },
      data: { rating: avg, ratingCount: ratings.length },
    });
    return rating;
  }

  // ─── COMENTÁRIOS ─────────────────────────────────────

  async addComment(itemId: string, dto: CreateCommentDto, userId: string) {
    await this.findItemById(itemId);
    const comment = await this.prisma.libraryComment.create({
      data: { ...dto, itemId, userId },
      include: { user: { select: { fullName: true } } },
    });
    return comment;
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.libraryComment.findUnique({ where: { id: commentId } });
    if (!comment) throw new NotFoundException('Comentário não encontrado');
    await this.prisma.libraryComment.update({
      where: { id: commentId }, data: { deletedAt: new Date() },
    });
    return { message: 'Comentário removido' };
  }

  // ─── DASHBOARD E ESTATÍSTICAS ────────────────────────

  async getDashboard() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalItems, newThisMonth, totalCollections,
      byType, pendingApproval,
      mostViewed, mostDownloaded, topRated,
      totalViews, totalDownloads,
    ] = await this.prisma.$transaction([
      this.prisma.libraryItem.count({ where: { deletedAt: null } }),
      this.prisma.libraryItem.count({ where: { createdAt: { gte: startOfMonth } } }),
      this.prisma.libraryCollection.count({ where: { deletedAt: null } }),
      this.prisma.libraryItem.groupBy({
        by: ['type'], where: { deletedAt: null }, _count: { id: true },
      }),
      this.prisma.libraryItem.count({ where: { isApproved: false, deletedAt: null } }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null },
        orderBy: { views: 'desc' }, take: 5,
        select: { id: true, code: true, title: true, views: true, type: true },
      }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null },
        orderBy: { downloads: 'desc' }, take: 5,
        select: { id: true, code: true, title: true, downloads: true, type: true },
      }),
      this.prisma.libraryItem.findMany({
        where: { deletedAt: null, ratingCount: { gt: 0 } },
        orderBy: { rating: 'desc' }, take: 5,
        select: { id: true, code: true, title: true, rating: true, ratingCount: true },
      }),
      this.prisma.libraryAccess.count({ where: { action: 'VIEW' } }),
      this.prisma.libraryAccess.count({ where: { action: 'DOWNLOAD' } }),
    ]);

    return {
      totals: {
        totalItems, newThisMonth, totalCollections,
        pendingApproval, totalViews, totalDownloads,
      },
      byType,
      rankings: { mostViewed, mostDownloaded, topRated },
    };
  }

  // ─── HELPER ──────────────────────────────────────────

  private async audit(userId: string, action: string, entity: string, entityId: string, meta: any) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity, entityId, metadata: JSON.stringify(meta) },
    });
  }
}
```

---

## PASSO 4 — Controller Completo

```typescript
// src/library/library.controller.ts
import {
  Controller, Get, Post, Put, Delete, Body,
  Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard }   from '../auth/guards/roles.guard';
import { Roles }        from '../auth/decorators/roles.decorator';
import { CurrentUser }  from '../auth/decorators/current-user.decorator';
import { LibraryService } from './library.service';
import {
  CreateCollectionDto, CreateItemDto, UpdateItemDto,
  FilterItemDto, CreateRatingDto, CreateCommentDto,
} from './dto';

@ApiTags('Biblioteca Digital')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly service: LibraryService) {}

  // ─── COLECÇÕES ───────────────────────────────────────

  @Post('collections')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Criar colecção' })
  createCollection(@Body() dto: CreateCollectionDto, @CurrentUser() user: any) {
    return this.service.createCollection(dto, user.id);
  }

  @Get('collections')
  @ApiOperation({ summary: 'Listar colecções' })
  findAllCollections() {
    return this.service.findAllCollections();
  }

  // ─── DASHBOARD ───────────────────────────────────────

  @Get('dashboard')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Dashboard da Biblioteca' })
  getDashboard() {
    return this.service.getDashboard();
  }

  // ─── ITENS ───────────────────────────────────────────

  @Post('items')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Adicionar item à biblioteca' })
  createItem(@Body() dto: CreateItemDto, @CurrentUser() user: any) {
    return this.service.createItem(dto, user.id);
  }

  @Get('items')
  @ApiOperation({ summary: 'Listar itens (paginado)' })
  findAllItems(@Query() filters: FilterItemDto) {
    return this.service.findAllItems(filters);
  }

  @Get('items/:id')
  @ApiOperation({ summary: 'Detalhe de item' })
  findItemById(@Param('id') id: string) {
    return this.service.findItemById(id);
  }

  @Put('items/:id')
  @Roles('ADMIN', 'RH', 'MANAGER')
  @ApiOperation({ summary: 'Actualizar item' })
  updateItem(@Param('id') id: string, @Body() dto: UpdateItemDto, @CurrentUser() user: any) {
    return this.service.updateItem(id, dto, user.id);
  }

  @Delete('items/:id')
  @Roles('ADMIN', 'RH')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remover item (soft delete)' })
  removeItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.softDeleteItem(id, user.id);
  }

  @Put('items/:id/approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar item' })
  approveItem(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.approveItem(id, user.id);
  }

  // ─── VISUALIZAÇÃO E DOWNLOAD ─────────────────────────

  @Post('items/:id/view')
  @ApiOperation({ summary: 'Registar visualização' })
  view(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.view(id, user.id);
  }

  @Post('items/:id/download')
  @ApiOperation({ summary: 'Registar download e obter URL' })
  download(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.download(id, user.id);
  }

  // ─── AVALIAÇÕES ──────────────────────────────────────

  @Post('items/:id/rate')
  @ApiOperation({ summary: 'Avaliar item (1-5)' })
  rateItem(@Param('id') id: string, @Body() dto: CreateRatingDto, @CurrentUser() user: any) {
    return this.service.rateItem(id, dto, user.id);
  }

  // ─── COMENTÁRIOS ─────────────────────────────────────

  @Post('items/:id/comments')
  @ApiOperation({ summary: 'Comentar item' })
  addComment(@Param('id') id: string, @Body() dto: CreateCommentDto, @CurrentUser() user: any) {
    return this.service.addComment(id, dto, user.id);
  }

  @Delete('comments/:commentId')
  @ApiOperation({ summary: 'Remover comentário' })
  @HttpCode(HttpStatus.OK)
  deleteComment(@Param('commentId') commentId: string, @CurrentUser() user: any) {
    return this.service.deleteComment(commentId, user.id);
  }
}
```

---

## PASSO 5 — Module

```typescript
// src/library/library.module.ts
import { Module }    from '@nestjs/common';
import { LibraryController } from './library.controller';
import { LibraryService }    from './library.service';
import { PrismaModule }      from '../prisma/prisma.module';

@Module({
  imports:     [PrismaModule],
  controllers: [LibraryController],
  providers:   [LibraryService],
  exports:     [LibraryService],
})
export class LibraryModule {}
```

```typescript
// src/app.module.ts — adicionar:
import { LibraryModule } from './library/library.module';
imports: [ ...existentes..., LibraryModule ],
```

---

## PASSO 6 — Spec File (8 testes)

```typescript
// src/library/library.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LibraryService }      from './library.service';
import { PrismaService }       from '../prisma/prisma.service';
import { NotFoundException }   from '@nestjs/common';

const mockItem = {
  id: 'item-1', code: 'LIB-00001', title: 'Manual de Segurança',
  type: 'PDF', fileUrl: 'https://storage/manual.pdf',
  views: 0, downloads: 0, rating: 0, ratingCount: 0,
  isApproved: false, deletedAt: null,
  collection: { name: 'Manuais' },
  uploadedBy: { fullName: 'Admin' },
  reviewedBy: null,
  comments: [], ratings: [], _count: { comments: 0, ratings: 0 },
};

const mockPrisma = {
  libraryCollection: {
    create: jest.fn(), findMany: jest.fn(), count: jest.fn(),
  },
  libraryItem: {
    create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(),
    findFirst: jest.fn(), update: jest.fn(), count: jest.fn(),
    groupBy: jest.fn(),
  },
  libraryAccess: {
    create: jest.fn(), count: jest.fn(),
  },
  libraryRating: {
    upsert: jest.fn(), findMany: jest.fn(),
  },
  libraryComment: {
    create: jest.fn(), findUnique: jest.fn(), update: jest.fn(),
  },
  auditLog:     { create: jest.fn() },
  $transaction: jest.fn(),
};

describe('LibraryService', () => {
  let service: LibraryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LibraryService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<LibraryService>(LibraryService);
    jest.clearAllMocks();
  });

  describe('createItem', () => {
    it('deve criar item com código LIB- auto-gerado', async () => {
      mockPrisma.libraryItem.findFirst.mockResolvedValue(null);
      mockPrisma.libraryItem.create.mockResolvedValue(mockItem);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.createItem(
        { title: 'Manual de Segurança', type: 'PDF' as any, fileUrl: 'https://storage/manual.pdf' },
        'user-1',
      );
      expect(result.code).toBe('LIB-00001');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ entity: 'LibraryItem', action: 'CREATE' }),
        }),
      );
    });
  });

  describe('findAllItems', () => {
    it('deve retornar lista paginada', async () => {
      mockPrisma.$transaction.mockResolvedValue([[mockItem], 1]);
      const result = await service.findAllItems({ page: 1, limit: 20 });
      expect(result).toMatchObject({ data: expect.any(Array), total: 1, totalPages: 1 });
    });

    it('deve filtrar por tipo', async () => {
      mockPrisma.$transaction.mockResolvedValue([[], 0]);
      const result = await service.findAllItems({ type: 'VIDEO' as any });
      expect(result.total).toBe(0);
    });
  });

  describe('findItemById', () => {
    it('deve retornar item com comentários e avaliações', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      const result = await service.findItemById('item-1');
      expect(result.id).toBe('item-1');
    });

    it('deve lançar NotFoundException se não existir', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(null);
      await expect(service.findItemById('nao-existe')).rejects.toThrow(NotFoundException);
    });
  });

  describe('approveItem', () => {
    it('deve aprovar item e definir reviewedById', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryItem.update.mockResolvedValue({ ...mockItem, isApproved: true });
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.approveItem('item-1', 'user-1');
      expect(result.isApproved).toBe(true);
    });
  });

  describe('download', () => {
    it('deve incrementar downloads e registar acesso', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.$transaction.mockResolvedValue([{}, {}]);
      mockPrisma.auditLog.create.mockResolvedValue({});

      const result = await service.download('item-1', 'user-1');
      expect(result.fileUrl).toBe('https://storage/manual.pdf');
      expect(mockPrisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('rateItem', () => {
    it('deve criar avaliação e recalcular média', async () => {
      mockPrisma.libraryItem.findUnique.mockResolvedValue(mockItem);
      mockPrisma.libraryRating.upsert.mockResolvedValue({ id: 'rat-1', score: 5 });
      mockPrisma.libraryRating.findMany.mockResolvedValue([{ score: 5 }, { score: 3 }]);
      mockPrisma.libraryItem.update.mockResolvedValue({});

      const result = await service.rateItem('item-1', { score: 5 }, 'user-1');
      expect(result.score).toBe(5);
      expect(mockPrisma.libraryItem.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ rating: 4, ratingCount: 2 }),
        }),
      );
    });
  });

  describe('getDashboard', () => {
    it('deve retornar totais e rankings', async () => {
      mockPrisma.$transaction.mockResolvedValue([
        10, 2, 3, [], 1, [], [], [], 50, 30,
      ]);
      const result = await service.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('rankings');
      expect(result.totals.totalViews).toBe(50);
    });
  });
});
```

---

## PASSO 7 — Bruno CLI (6 ficheiros)

```
# bruno/library/01-listar-itens.bru
meta { name: Listar Itens  type: http  seq: 1 }
get { url: {{baseUrl}}/library/items?page=1&limit=20  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Paginação", function() {
    expect(res.body).to.have.property("data");
    expect(res.body).to.have.property("totalPages");
  });
}

---

# bruno/library/02-criar-item.bru
meta { name: Criar Item  type: http  seq: 2 }
post { url: {{baseUrl}}/library/items  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  {
    "type": "PDF",
    "title": "Bruno Manual de Teste",
    "fileUrl": "https://storage.innova.ao/docs/bruno-teste.pdf",
    "author": "Equipa INNOVA",
    "categories": ["Formação", "Segurança"],
    "keywords": ["manual", "teste"],
    "language": "pt"
  }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Código LIB-", function() { expect(res.body.code).to.match(/^LIB-\d{5}$/); });
}
script:post-response {
  if (res.status === 201) { bru.setEnvVar("itemId", res.body.id); }
}

---

# bruno/library/03-detalhe.bru
meta { name: Detalhe Item  type: http  seq: 3 }
get { url: {{baseUrl}}/library/items/{{itemId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem comentários e avaliações", function() {
    expect(res.body).to.have.property("comments");
    expect(res.body).to.have.property("ratings");
  });
}

---

# bruno/library/04-avaliar.bru
meta { name: Avaliar Item  type: http  seq: 4 }
post { url: {{baseUrl}}/library/items/{{itemId}}/rate  body: json  auth: bearer }
auth:bearer { token: {{accessToken}} }
body:json {
  { "score": 5, "comment": "Excelente material" }
}
tests {
  test("Status 201", function() { expect(res.status).to.equal(201); });
  test("Score correcto", function() { expect(res.body.score).to.equal(5); });
}

---

# bruno/library/05-dashboard.bru
meta { name: Dashboard Biblioteca  type: http  seq: 5 }
get { url: {{baseUrl}}/library/dashboard  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Tem totais e rankings", function() {
    expect(res.body).to.have.property("totals");
    expect(res.body).to.have.property("rankings");
  });
}

---

# bruno/library/06-apagar.bru
meta { name: Apagar Item  type: http  seq: 6 }
delete { url: {{baseUrl}}/library/items/{{itemId}}  auth: bearer }
auth:bearer { token: {{accessToken}} }
tests {
  test("Status 200", function() { expect(res.status).to.equal(200); });
  test("Mensagem sucesso", function() { expect(res.body.message).to.contain("sucesso"); });
}
```

---

## PASSO 8 — Frontend Completo

```tsx
// frontend/app/library/page.tsx
'use client';
import { useState, useEffect, useCallback } from 'react';

const TYPE_ICONS: Record<string, string> = {
  PDF: '📄', EBOOK: '📚', VIDEO: '🎬', AUDIO: '🎵',
  PRESENTATION: '📊', SPREADSHEET: '📈', DOCUMENT: '📝',
  IMAGE: '🖼️', LINK: '🔗', SCORM: '🎓', OTHER: '📦',
};

export default function LibraryPage() {
  const [data, setData]             = useState<any[]>([]);
  const [total, setTotal]           = useState(0);
  const [page, setPage]             = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [typeFilter, setTypeFilter] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page: String(page), limit: '20', isApproved: 'true',
        ...(search     && { search }),
        ...(typeFilter && { type: typeFilter }),
      });
      const res = await fetch(`/api/library/items?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar a biblioteca');
      const json = await res.json();
      setData(json.data); setTotal(json.total); setTotalPages(json.totalPages);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [page, search, typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) return (
    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-48 bg-gray-100 rounded-lg animate-pulse" />
      ))}
    </div>
  );

  if (error) return (
    <div className="p-6">
      <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg flex justify-between">
        <span>{error}</span>
        <button onClick={fetchData} className="underline">Tentar novamente</button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Biblioteca Digital</h1>
          <p className="text-gray-500">{total} recursos disponíveis</p>
        </div>
        <a href="/library/novo"
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
          + Adicionar Recurso
        </a>
      </div>

      {/* Filtros */}
      <div className="flex gap-4 flex-wrap">
        <input type="text" placeholder="Pesquisar por título, autor, palavra-chave..."
          value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2 flex-1 min-w-[200px]" />
        <select value={typeFilter}
          onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="border rounded-lg px-4 py-2">
          <option value="">Todos os tipos</option>
          <option value="PDF">PDF</option>
          <option value="EBOOK">E-book</option>
          <option value="VIDEO">Vídeo</option>
          <option value="AUDIO">Áudio</option>
          <option value="PRESENTATION">Apresentação</option>
          <option value="DOCUMENT">Documento</option>
        </select>
      </div>

      {/* Grelha de cards */}
      {data.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          Nenhum recurso encontrado
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {data.map((item: any) => (
            <a key={item.id} href={`/library/${item.id}`}
              className="bg-white rounded-lg shadow hover:shadow-md transition p-4 flex flex-col">
              <div className="text-4xl mb-3">{TYPE_ICONS[item.type] || '📦'}</div>
              <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">{item.title}</h3>
              {item.author && (
                <p className="text-sm text-gray-500 mb-2">{item.author}</p>
              )}
              <div className="mt-auto flex justify-between items-center text-xs text-gray-400 pt-3">
                <span>👁 {item.views}</span>
                <span>⬇ {item.downloads}</span>
                {item.rating > 0 && <span>⭐ {item.rating.toFixed(1)}</span>}
              </div>
            </a>
          ))}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <div className="flex justify-between items-center">
          <span className="text-gray-500">Página {page} de {totalPages}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Anterior
            </button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages} className="px-4 py-2 border rounded-lg disabled:opacity-50">
              Próxima
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## PROMPT PARA O CLAUDE CODE

```
O Módulo 3 (CRM Financiadores) está completo e aprovado.
Implementa agora o Módulo 4 — Biblioteca Digital.
Lê o BIBLIOTECA-DIGITAL-GUIDE.md na raiz do projecto.

Segue EXACTAMENTE estes 22 passos:

1. Verifica se algum enum já existe
   (LibraryItemType, LibraryAction)
   Se existir, não duplica

2. Adiciona ao prisma/schema.prisma:
   LibraryCollection, LibraryItem, LibraryAccess,
   LibraryRating, LibraryComment + enums

3. npx prisma validate
4. npx prisma migrate dev --name "add_library"
5. npx prisma generate

6. Cria src/library/dto/ com os 6 DTOs:
   create-collection, create-item, update-item,
   filter-item, create-rating, create-comment, index.ts

7. Cria src/library/library.service.ts

8. Cria src/library/library.controller.ts

9. Cria src/library/library.module.ts

10. Adiciona LibraryModule ao src/app.module.ts

11. npm run build → DEVE PASSAR com 0 erros

12. Cria src/library/library.service.spec.ts
    (8 testes conforme o guia)

13. npm run test -- --testPathPattern=library --forceExit
    → DEVE PASSAR com 0 falhas

14. npm run test:cov 2>&1 | tail -5
    → Se < 55% adiciona mais testes

15. Cria bruno/library/ com os 6 ficheiros .bru

16. Com o backend a correr:
    npx bru run bruno/library/ --env local
    → TODOS devem passar

17. Cria frontend/app/library/page.tsx
    (grelha de cards com loading, paginação, filtros)

18. Cria frontend/app/library/[id]/page.tsx
    (detalhe com preview, ratings, comentários, botão download)

19. Cria frontend/app/library/novo/page.tsx
    (formulário de upload de recurso)

20. Adiciona ao sidebar: link para /library

21. git add -A
    git commit -m "feat: Biblioteca Digital completa - 8 specs, 6 bruno, frontend" --no-verify
    git push origin main

22. Mostra resumo:
    - Build: OK / FALHOU
    - Testes: X/8 passaram
    - Cobertura: X%
    - Bruno: X/6 passaram
    PARA e espera confirmação para Módulo 5

REGRAS ABSOLUTAS DO INNOVA:
- fullName (NUNCA name) — User model
- entity (NUNCA entityType) — AuditLog
- metadata → JSON.stringify()
- deletedAt em TODOS os novos modelos
- auditLog em CREATE, UPDATE, DELETE
- Paginação: { data, total, page, limit, totalPages }
- Backend porta 4000 | Frontend porta 3000

EXECUTA UMA OPERAÇÃO DE CADA VEZ.
A CADA 20 MINUTOS FAZ COMMIT PARCIAL.
SE FICAR LENTA (>25 min): commit e para.
```

---

*INNOVA — Biblioteca Digital Guide v1.0*
*Mesmo padrão dos Módulos 1, 2 e 3*
*SharePoint + DocuWare + Confluence + Springer Nature*
*DTOs + Service + Controller + Module + Spec + Bruno + Frontend*
