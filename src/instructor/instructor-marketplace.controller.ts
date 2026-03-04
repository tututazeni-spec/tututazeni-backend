import { Controller, Post, Body, Get, Param } from '@nestjs/common';
import { InstructorMarketplaceService } from './instructor-marketplace.service';

@Controller('instructors')
export class InstructorMarketplaceController {
  constructor(private readonly service: InstructorMarketplaceService) {}

  @Post('profile')
  createProfile(@Body() body: any) {
    return this.service.createProfile(
      body.userId,
      body.expertiseArea,
      body.bio,
    );
  }

  @Post('approve/:id')
  approve(@Param('id') id: string) {
    return this.service.approveInstructor(Number(id));
  }

  @Post('review')
  review(@Body() body: any) {
    return this.service.reviewInstructor(
      body.instructorId,
      body.userId,
      body.rating,
      body.comment,
    );
  }

  @Get()
  list() {
    return this.service.listApprovedInstructors();
  }
}