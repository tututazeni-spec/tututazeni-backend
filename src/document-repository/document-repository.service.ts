import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateDocumentDto, UpdateDocumentDto, DocumentFilterDto,
} from './document-repository.dto';
 
@Injectable()
export class DocumentRepositoryService {
  constructor(private prisma: PrismaService) {}
 
  async findAll(filters: DocumentFilterDto, userId: number, userDeptId?: number) {
    const { page = 1, limit = 20, search, category, access, departmentId } = filters;
    const skip = (page - 1) * limit;
    const where: any = {
      active: true,
      OR: [
        { access: 'PUBLIC' },
        { access: 'DEPARTMENT', departmentId: userDeptId },
        { access: 'RESTRICTED', createdById: userId },
      ],
    };
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }
    if (category) where.category = category;
    if (departmentId) where.departmentId = departmentId;
    const [data, total] = await Promise.all([
      this.prisma.companyDocument.findMany({
        where, skip, take: limit,
        include: {
          createdBy: { select: { id: true, fullName: true } },
          department: { select: { id: true, name: true } },
          _count: { select: { downloads: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.companyDocument.count({ where }),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
 
  async findOne(id: number) {
    const d = await this.prisma.companyDocument.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        department: true,
        _count: { select: { downloads: true } },
      },
    });
    if (!d) throw new NotFoundException('Documento não encontrado');
    return d;
  }
 
  async create(createdById: number, dto: CreateDocumentDto) {
    return this.prisma.companyDocument.create({
      data: {
        ...dto,
        category: dto.category as any,
        access: dto.access as any,
        createdById,
      },
      include: { createdBy: { select: { id: true, fullName: true } } },
    });
  }
 
  async update(id: number, dto: UpdateDocumentDto) {
    await this.findOne(id);
    return this.prisma.companyDocument.update({ where: { id }, data: dto as any });
  }
 
  async download(id: number, userId: number) {
    const doc = await this.findOne(id);
    await this.prisma.documentDownload.create({ data: { documentId: id, userId } });
    await this.prisma.companyDocument.update({
      where: { id },
      data: { downloadCount: { increment: 1 } },
    });
    return { fileUrl: doc.fileUrl, title: doc.title, fileType: doc.fileType };
  }
 
  async archive(id: number) {
    await this.findOne(id);
    return this.prisma.companyDocument.update({
      where: { id }, data: { active: false },
    });
  }
 
  async getStats() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [total, byCategory, recentDownloads] = await Promise.all([
      this.prisma.companyDocument.count({ where: { active: true } }),
      this.prisma.companyDocument.groupBy({
        by: ['category'],
        where: { active: true },
        _count: true,
      }),
      this.prisma.documentDownload.count({
        where: { downloadedAt: { gte: thirtyDaysAgo } },
      }),
    ]);
    return { total, byCategory, recentDownloads };
  }
}
 
