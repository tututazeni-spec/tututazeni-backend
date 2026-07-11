import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { RefreshTokenStrategy } from './refresh-token.strategy';
import { MailModule } from '../mail/mail.module';
import { PasswordResetService } from './password-reset.service';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' as const },
      }),
      inject: [ConfigService],
    }),
    MailModule,
  ],
  providers: [AuthService, JwtStrategy, RefreshTokenStrategy, PasswordResetService],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
