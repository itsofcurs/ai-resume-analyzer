import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { tracer, logWithTrace, requestCounter, requestLatency } from '../lib/telemetry';

import { randomUUID } from 'crypto';
import { AsyncLocalStorage } from 'async_hooks';

export const requestContext = new AsyncLocalStorage<Map<string, any>>();


export const requestContextMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();
  req.headers['x-correlation-id'] = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  const startTime = Date.now();
  
  const store = new Map<string, any>();
  store.set('correlationId', correlationId);

  requestContext.run(store, () => {
    // Start a new span for the request
    tracer.startActiveSpan(`${req.method} ${req.path}`, (span) => {
    span.setAttribute('http.method', req.method);
    span.setAttribute('http.url', req.originalUrl);
    span.setAttribute('correlation_id', correlationId);

    logWithTrace('info', `Incoming request ${req.method} ${req.originalUrl}`, { correlationId });

    // Track response finish
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      span.setAttribute('http.status_code', res.statusCode);
      
      requestCounter.add(1, { method: req.method, route: req.route?.path || req.path, status: res.statusCode.toString() });
      requestLatency.record(duration, { method: req.method, route: req.route?.path || req.path });
      
      logWithTrace('info', `Request completed`, {
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: duration,
        correlationId
      });
      
      if (res.statusCode >= 400) {
        span.recordException(new Error(`HTTP ${res.statusCode}`));
      }
      span.end();
    });

      next();
    });
  });
};
