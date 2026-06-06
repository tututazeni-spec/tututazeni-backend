import { AllExceptionsFilter } from './all-exceptions.filter';
import { HttpException, HttpStatus, ArgumentsHost } from '@nestjs/common';

function createMockHost(statusFn: jest.Mock, jsonFn: jest.Mock): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getResponse: () => ({
        status: statusFn,
      }),
      getRequest: () => ({
        method: 'GET',
        url: '/test',
      }),
    }),
  } as unknown as ArgumentsHost;
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  it('deve ser definido', () => {
    expect(filter).toBeDefined();
  });

  it('deve lidar com HttpException e retornar status correcto', () => {
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    const host = createMockHost(statusFn, jsonFn);

    filter.catch(new HttpException('Não encontrado', HttpStatus.NOT_FOUND), host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        path: '/test',
      }),
    );
  });

  it('deve lidar com erros não-HTTP e retornar 500', () => {
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    const host = createMockHost(statusFn, jsonFn);

    filter.catch(new Error('Erro inesperado'), host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(jsonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      }),
    );
  });

  it('deve lidar com excepção não-Error', () => {
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    const host = createMockHost(statusFn, jsonFn);

    filter.catch('string exception', host);

    expect(statusFn).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('deve incluir timestamp na resposta', () => {
    const jsonFn = jest.fn();
    const statusFn = jest.fn().mockReturnValue({ json: jsonFn });
    const host = createMockHost(statusFn, jsonFn);

    filter.catch(new HttpException('Erro', 400), host);

    const callArgs = jsonFn.mock.calls[0][0];
    expect(callArgs.timestamp).toBeDefined();
  });
});
