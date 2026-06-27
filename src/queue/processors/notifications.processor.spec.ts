import { NotificationsProcessor } from './notifications.processor';

describe('NotificationsProcessor', () => {
  it('chama notifications.send com os dados do job', async () => {
    const notifications = { send: jest.fn().mockResolvedValue({ id: 1 }) } as any;
    const processor = new NotificationsProcessor(notifications);
    const dto = { userId: 1, type: 'X', title: 't', message: 'm' };
    await processor.handleSend({ data: dto } as any);
    expect(notifications.send).toHaveBeenCalledWith(dto);
  });
});
