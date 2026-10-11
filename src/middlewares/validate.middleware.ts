import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

type ValidatedRequest = {
  body?: unknown;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

export const validate =
  (schema: ZodTypeAny) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const validatedData = (await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      })) as ValidatedRequest;

      if (validatedData.body !== undefined) {
        req.body = validatedData.body;
      }

      if (validatedData.params) {
        Object.assign(req.params, validatedData.params);
      }

      if (validatedData.query) {
        Object.assign(req.query, validatedData.query);
      }

      next();
    } catch (error: any) {
      const zodIssues = error?.issues || error?.errors;

      if (zodIssues) {
        return res.status(400).json({
          error: 'Validation Failed',
          details: zodIssues.map((issue: any) => ({
            path: Array.isArray(issue.path) ? issue.path.join('.') : issue.path,
            message: issue.message,
          })),
        });
      }

      console.error('Validation middleware failed:', error);
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred.',
      });
    }
  };
