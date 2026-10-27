import { Module } from '@nestjs/common';
import { MobileService } from './mobile.service';
import { MobileController } from './mobile.controller';

// PrismaService vem do PrismaModule (@Global). Declará-lo aqui em `providers` criaria uma 2ª
// instância completa — outro pool de ligações ao Postgres, outro warm-up e outros listeners.
@Module({
  providers: [MobileService],
  controllers: [MobileController],
})
export class MobileModule {}
