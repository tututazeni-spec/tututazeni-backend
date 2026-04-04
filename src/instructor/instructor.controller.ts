import {
  Controller, Get, Post, Put, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { InstructorService } from './instructor.service';
import {
  CreateInstructorProfileDto, UpdateInstructorProfileDto,
  CreateMarketplaceCourseDto, InstructorReviewDto, InstructorFilterDto,
} from './instructor.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser, Roles } from '../common/decorators';
 
@ApiTags('Instructors')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('instructors')
export class InstructorController {
  constructor(private readonly svc: InstructorService) {}
 
  @Get()
  @ApiOperation({ summary: 'Listar instrutores' })
  findAll(@Query() filters: InstructorFilterDto) { return this.svc.findAll(filters); }
 
  @Get('marketplace')
  @ApiOperation({ summary: 'Cursos do marketplace' })
  marketplace(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) { return this.svc.getMarketplaceCourses(page, limit); }
 
  @Get('my-profile')
  @ApiOperation({ summary: 'Meu perfil de instrutor' })
  myProfile(@CurrentUser() user: any) { return this.svc.findByUser(user.id); }
 
  @Get('my-payouts')
  @ApiOperation({ summary: 'Meu histórico de pagamentos' })
  myPayouts(@CurrentUser() user: any) { return this.svc.getPayoutHistory(user.id); }
 
  @Get(':id')
  @ApiOperation({ summary: 'Detalhe do instrutor' })
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }
 
  @Post('profile')
  @ApiOperation({ summary: 'Criar perfil de instrutor' })
  createProfile(@CurrentUser() user: any, @Body() dto: CreateInstructorProfileDto) {
    return this.svc.createProfile(user.id, dto);
  }
 
  @Post('marketplace/courses')
  @ApiOperation({ summary: 'Criar curso no marketplace' })
  createCourse(@CurrentUser() user: any, @Body() dto: CreateMarketplaceCourseDto) {
    return this.svc.createMarketplaceCourse(user.id, dto);
  }
 
  @Post('reviews')
  @ApiOperation({ summary: 'Avaliar instrutor' })
  review(@CurrentUser() user: any, @Body() dto: InstructorReviewDto) {
    return this.svc.addReview(user.id, dto);
  }
 
  @Post(':id/payout')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Registar pagamento ao instrutor' })
  payout(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { amount: number },
  ) { return this.svc.createPayout(id, body.amount); }
 
  @Put('my-profile')
  @ApiOperation({ summary: 'Atualizar meu perfil de instrutor' })
  updateProfile(@CurrentUser() user: any, @Body() dto: UpdateInstructorProfileDto) {
    return this.svc.updateProfile(user.id, dto);
  }
 
  @Patch(':id/approve')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Aprovar instrutor' })
  approve(@Param('id', ParseIntPipe) id: number) { return this.svc.approve(id); }
 
  @Patch(':id/revoke')
  @Roles('ADMIN', 'RH')
  @ApiOperation({ summary: 'Revogar aprovação de instrutor' })
  revoke(@Param('id', ParseIntPipe) id: number) { return this.svc.revoke(id); }
}
 
