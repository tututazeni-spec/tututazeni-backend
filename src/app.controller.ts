import { Controller, Get, Post, Body } from '@nestjs/common'
import { AppService } from './app.service'

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Post('user')
  createUser(@Body() body: { name: string; email: string }) {
    return this.prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
      },
    })
  }

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}


