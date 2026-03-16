import { checkResilience } from '../src/lib/resilience';
describe('Resilience Module', () => {
  it('should return a valid health status object', async () => {
    const status = await checkResilience();
    expect(status).toHaveProperty('overall');
  });
});