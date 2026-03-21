import { Controller, Post, Body, Get } from '@nestjs/common';
import { AvatarTrainingService } from './avatartraining.service';

@Controller('avatar-training')
export class AvatarTrainingController {
  constructor(private service: AvatarTrainingService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.createScript(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
