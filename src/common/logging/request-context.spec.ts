import {
  getRequestContext,
  runWithRequestContext,
  setRequestAction,
  setRequestUserId,
} from './request-context';

describe('request-context', () => {
  it('acumula reqId, userId e action no mesmo contexto', () => {
    runWithRequestContext({ reqId: 'r1' }, () => {
      setRequestAction('CoursesController.findAll');
      setRequestUserId(5);
      expect(getRequestContext()).toEqual({
        reqId: 'r1',
        action: 'CoursesController.findAll',
        userId: 5,
      });
    });
  });

  it('fora de um pedido é inofensivo', () => {
    setRequestAction('X.y');
    expect(getRequestContext()).toEqual({});
  });
});
