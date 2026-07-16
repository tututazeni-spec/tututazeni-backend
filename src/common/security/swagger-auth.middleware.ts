import { Request, Response, NextFunction } from 'express';

export function createSwaggerAuthMiddleware(token: string | undefined) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const bearer = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || !bearer || bearer !== token) {
      res.status(401).json({ message: 'Unauthorized' });
      return;
    }
    next();
  };
}
