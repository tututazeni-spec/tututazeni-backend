import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { CertificatesService } from './certificates.service';

@Controller('hr/certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('course/:enrollmentId')
  issueCourse(@Param('enrollmentId') id: string) {
    return this.certificatesService.issueForCourse(Number(id));
  }

  @Post('leadership/:programId')
  issueLeadership(@Param('programId') id: string) {
    return this.certificatesService.issueForLeadership(Number(id));
  }

  @Post('development/:planId')
  issueDevelopment(@Param('planId') id: string) {
    return this.certificatesService.issueForDevelopment(Number(id));
  }

  @Get()
  findAll() {
    return this.certificatesService.findAll();
  }

  @Get('validate/:code')
  validate(@Param('code') code: string) {
    return this.certificatesService.validate(code);
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string) {
    return this.certificatesService.revoke(Number(id));
  }
}
