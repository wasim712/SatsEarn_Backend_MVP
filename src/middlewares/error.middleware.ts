import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[ERROR] ${req.method} ${req.url}:`, err.message);

  // 1. Handle Prisma Known Errors (Database specific)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint failed (e.g., duplicate email)
        // Don't echo err.meta.target: it names internal columns and constraints.
        return res.status(409).json({
          error: 'Conflict',
          message: 'A record with these details already exists.',
        });
      case 'P2025': // Record not found
        return res.status(404).json({
          error: 'Not Found',
          message: 'The requested record does not exist.',
        });
      case 'P2003': // Foreign key constraint failed
        return res.status(400).json({
          error: 'Bad Request',
          message: 'This operation violates database relationships (Foreign Key error).',
        });
      default:
        return res.status(500).json({ error: 'Database Error', message: 'An unexpected error occurred.' });
    }
  }

  // 2. Handle Zod/Validation Errors (if they leak past the local validate middleware)
  if (err.name === 'ZodError') {
    return res.status(400).json({ error: 'Validation Error', details: err.errors });
  }

  // 3. Fallback for everything else. Deliberate 4xx errors keep their message; 5xx details
  // (library errors, stack-ish messages) stay in the server log.
  const statusCode = err.statusCode || 500;
  if (statusCode >= 500) {
    return res.status(statusCode).json({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
  }

  res.status(statusCode).json({
    error: err.name || 'Bad Request',
    message: err.message || 'The request could not be processed.',
  });
};