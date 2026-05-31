import request from 'supertest';

export const INT_CREDENTIALS = {
  employee: { email: 'int.employee@innova-test.com', password: 'Test@1234' },
  manager: { email: 'int.manager@innova-test.com', password: 'Test@1234' },
  rh: { email: 'int.rh@innova-test.com', password: 'Test@1234' },
  admin: { email: 'int.admin@innova-test.com', password: 'Test@1234' },
};

export async function getToken(
  httpServer: any,
  role: keyof typeof INT_CREDENTIALS,
): Promise<string> {
  const res = await request(httpServer)
    .post('/auth/login')
    .send(INT_CREDENTIALS[role])
    .expect(201);

  return res.body.accessToken;
}
