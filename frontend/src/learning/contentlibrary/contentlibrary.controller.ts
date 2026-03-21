import { Controller, Get, Post, Body } from '@nestjs/common';
import { ContentLibraryService } from './contentlibrary.service';

@Controller('content-library')
export class ContentLibraryController {
  constructor(private service: ContentLibraryService) {}

  @Post()
  create(@Body() body: any) {
    return this.service.create(body);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
