import { trace, context, metrics, Span } from '@opentelemetry/api';
import winston from 'winston';

// Format to mask PII before logging
const maskPII = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = info.message.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
    info.message = info.message.replace(/\+?\d{10,14}/g, '[REDACTED_PHONE]');
  }
  if (info.candidateName) info.candidateName = '[REDACTED_NAME]';
  if (info.email) info.email = '[REDACTED_EMAIL]';
  if (info.phone) info.phone = '[REDACTED_PHONE]';
  if (info.resumeText && typeof info.resumeText === 'string') {
    info.resumeText = info.resumeText.substring(0, 100) + '...[TRUNCATED]';
  }
  return info;
});

// Initialize structured logger
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    maskPII(),
    winston.format.json()
  ),
  defaultMeta: { service: 'talentai-backend' },
  transports: [
    new winston.transports.Console()
  ],
});

// Helper to get current span and correlation ID
export const getTraceContext = () => {
  const currentSpan = trace.getSpan(context.active());
  return {
    traceId: currentSpan?.spanContext().traceId,
    spanId: currentSpan?.spanContext().spanId,
  };
};

export const logWithTrace = (level: string, message: string, meta: any = {}) => {
  const { traceId, spanId } = getTraceContext();
  logger.log(level, message, { ...meta, traceId, spanId });
};

// Application-wide tracer
export const tracer = trace.getTracer('talentai-backend');

// Basic metrics
const meter = metrics.getMeter('talentai-backend');
export const requestCounter = meter.createCounter('http_requests_total', {
  description: 'Total HTTP requests',
});

export const requestLatency = meter.createHistogram('http_request_duration_ms', {
  description: 'HTTP request latency in ms',
  unit: 'ms',
});

export const tokenUsageTotal = meter.createCounter('token_usage_total', {
  description: 'Total AI tokens used',
});

export const promptTokensTotal = meter.createCounter('prompt_tokens_total', {
  description: 'Total AI prompt tokens used',
});

export const completionTokensTotal = meter.createCounter('completion_tokens_total', {
  description: 'Total AI completion tokens used',
});

export const aiCostUsdTotal = meter.createCounter('ai_cost_usd_total', {
  description: 'Total AI cost in USD',
});

// Phase 5C: Queue Telemetry
export const queueDepth = meter.createObservableGauge('queue_depth', {
  description: 'Number of jobs currently waiting in the queue',
});

export const queueWaitTime = meter.createHistogram('queue_wait_time_ms', {
  description: 'Time spent by jobs waiting in the queue',
  unit: 'ms',
});

export const queueProcessingTime = meter.createHistogram('queue_processing_time_ms', {
  description: 'Time spent processing jobs',
  unit: 'ms',
});

export const queueFailureTotal = meter.createCounter('queue_failure_total', {
  description: 'Total number of failed queue jobs',
});
