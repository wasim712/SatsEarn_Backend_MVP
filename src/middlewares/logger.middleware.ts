import { Request, Response, NextFunction } from 'express';

export const routeLogger = (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();

  // We wait for the response to 'finish' so we can capture the actual status code and time taken
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Format the time to be readable
    const timestamp = new Date().toLocaleTimeString();
    
    // Add some basic terminal colors based on success or failure
    const status = res.statusCode;
    const color = status >= 500 ? '\x1b[31m' : status >= 400 ? '\x1b[33m' : '\x1b[32m';
    const reset = '\x1b[0m';

    console.log(`[${timestamp}] ${req.method} ${req.originalUrl} ${color}${status}${reset} - ${duration}ms`);
  });

  next();
};