export interface HealthStatus {
  newsApiHealthy: boolean;
  aiAgentHealthy: boolean;
  overall: boolean;
}
export const checkResilience = async (): Promise<HealthStatus> => {
  const status = { newsApiHealthy: true, aiAgentHealthy: true };
  return { ...status, overall: status.newsApiHealthy && status.aiAgentHealthy };
};