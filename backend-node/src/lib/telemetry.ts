import { trace, context, metrics, Span } from '@opentelemetry/api';
import winston from 'winston';

// Format to mask PII before logging
const maskPII = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = (info.message as string).replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[REDACTED_EMAIL]');
    info.message = (info.message as string).replace(/\+?\d{10,14}/g, '[REDACTED_PHONE]');
    // Redact JWT tokens
    info.message = (info.message as string).replace(/ey[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_JWT]');
    // Redact Bearer tokens
    info.message = (info.message as string).replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, 'Bearer [REDACTED_TOKEN]');
  }
  if (info.candidateName) info.candidateName = '[REDACTED_NAME]';
  if (info.email) info.email = '[REDACTED_EMAIL]';
  if (info.phone) info.phone = '[REDACTED_PHONE]';
  
  // Redact secrets and passwords
  if (info.password) info.password = '[REDACTED_PASSWORD]';
  if (info.token) info.token = '[REDACTED_TOKEN]';
  if (info.refreshToken) info.refreshToken = '[REDACTED_TOKEN]';
  if (info.accessToken) info.accessToken = '[REDACTED_TOKEN]';
  if (info.mfaSecret) info.mfaSecret = '[REDACTED_SECRET]';
  if (info.code) info.code = '[REDACTED_CODE]';
  
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

// Phase 6: Email Telemetry
export const emailSuccessTotal = meter.createCounter('email_sent_total', {
  description: 'Total successful email deliveries',
});

export const emailFailureTotal = meter.createCounter('email_failed_total', {
  description: 'Total failed email deliveries',
});

export const emailRetryTotal = meter.createCounter('email_retry_total', {
  description: 'Total email delivery retries',
});

export const emailProcessingTime = meter.createHistogram('email_processing_time_ms', {
  description: 'Time spent processing email jobs',
  unit: 'ms',
});

// Phase 7: Auth Metrics
export const authLoginTotal = meter.createCounter('auth_login_total', { description: 'Total successful logins' });
export const authFailedTotal = meter.createCounter('auth_failed_total', { description: 'Total failed logins' });
export const authLockedTotal = meter.createCounter('auth_locked_total', { description: 'Total locked accounts due to brute force' });
export const oauthLoginTotal = meter.createCounter('oauth_login_total', { description: 'Total OAuth logins' });
export const otpGeneratedTotal = meter.createCounter('otp_generated_total', { description: 'Total OTPs generated' });
export const otpVerifiedTotal = meter.createCounter('otp_verified_total', { description: 'Total OTPs verified' });
export const otpFailedTotal = meter.createCounter('otp_failed_total', { description: 'Total OTP verification failures' });

// GDPR Export Metrics
export const gdprExportsDeletedTotal = meter.createCounter('gdpr_exports_deleted_total', { description: 'Total GDPR exports deleted' });
export const gdprExportFailuresTotal = meter.createCounter('gdpr_export_failures_total', { description: 'Total GDPR export failures' });
