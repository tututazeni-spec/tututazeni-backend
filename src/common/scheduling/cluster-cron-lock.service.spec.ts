import { ClusterCronLockService } from './cluster-cron-lock.service';

const makeJob = (fn: jest.Mock) => ({ _callbacks: [fn] });

function build(redisSet: jest.Mock, job: ReturnType<typeof makeJob>, flag = 'true') {
  const registry = { getCronJobs: () => new Map([['job-a', job]]) };
  const config = { get: () => flag };
  const svc = new ClusterCronLockService(registry as never, config as never, { set: redisSet } as never);
  svc.onApplicationBootstrap();
  return job;
}

describe('ClusterCronLockService', () => {
  it('executa o callback só quando ganha o lock', async () => {
    const fn = jest.fn();
    const set = jest.fn().mockResolvedValueOnce('OK').mockResolvedValueOnce(null);
    const job = build(set, makeJob(fn));
    await job._callbacks[0].call(null);
    await job._callbacks[0].call(null);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith('cron-lock:job-a', expect.any(String), 'PX', 30_000, 'NX');
  });

  it('executa sem lock se o Redis falhar', async () => {
    const fn = jest.fn();
    const job = build(jest.fn().mockRejectedValue(new Error('down')), makeJob(fn));
    await job._callbacks[0].call(null);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('não embrulha duas vezes nem com a flag desligada', () => {
    const fn = jest.fn();
    const job = makeJob(fn);
    build(jest.fn(), job, 'false');
    expect(job._callbacks[0]).toBe(fn);
  });
});
