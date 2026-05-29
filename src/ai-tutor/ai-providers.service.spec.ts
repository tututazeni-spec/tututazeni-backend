import { Test, TestingModule } from '@nestjs/testing';
import { AiProvidersService } from './ai-providers.service';

describe('AiProvidersService', () => {
  let service: AiProvidersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiProvidersService],
    }).compile();
    service = module.get<AiProvidersService>(AiProvidersService);
  });

  describe('getProviderInfo', () => {
    it('deve retornar informação do provider activo', () => {
      const result = service.getProviderInfo();
      expect(result).toBeDefined();
      expect(result).toHaveProperty('provider');
    });
  });
});
