<<<<<<< HEAD
export interface HealthStatus {
  newsApiHealthy: boolean;
  aiAgentHealthy: boolean;
  overall: boolean;
}
export const checkResilience = async (): Promise<HealthStatus> => {
  const status = { newsApiHealthy: true, aiAgentHealthy: true };
  return { ...status, overall: status.newsApiHealthy && status.aiAgentHealthy };
};
=======
export const checkResilience = () => {
  return true;
};
>>>>>>> 097c105623b61ee771be9fab160cbbefb0fc1705
