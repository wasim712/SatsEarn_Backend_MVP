import { z } from 'zod';

export const getFraudReportSchema = z.object({
  params: z.object({
    id: z.string().min(1, "User ID is required"),
  })
});