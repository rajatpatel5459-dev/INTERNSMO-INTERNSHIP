const { randomUUID } = require('crypto');

const SAFE_CORRELATION_ID = /^[A-Za-z0-9._:-]{1,128}$/;

function requestCategory(method, pathname) {
  if (pathname.startsWith('/api/aidj/')) return 'aidj_operation';
  if (
    pathname.startsWith('/api/queue/')
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  ) return 'queue_mutation';
  if (
    pathname.startsWith('/api/soundclash/')
    && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)
  ) return 'soundclash_operation';
  return 'http_request';
}

function createStructuredRequestLogger({
  log = (entry) => console.log(JSON.stringify(entry)),
  now = Date.now,
  createId = randomUUID,
} = {}) {
  return function structuredRequestLogger(req, res, next) {
    const requestId = createId();
    const suppliedCorrelationId = req.get?.('x-correlation-id')
      || req.headers?.['x-correlation-id'];
    const correlationId = typeof suppliedCorrelationId === 'string'
      && SAFE_CORRELATION_ID.test(suppliedCorrelationId)
      ? suppliedCorrelationId
      : requestId;
    const startedAt = now();
    const pathname = (req.originalUrl || req.url || '/').split('?')[0];

    req.requestId = requestId;
    req.correlationId = correlationId;
    res.setHeader('X-Request-ID', requestId);
    res.setHeader('X-Correlation-ID', correlationId);

    res.on('finish', () => {
      const sessionCorrelationId = req.lounge?.correlationId || req.correlationId;
      const category = requestCategory(req.method, pathname);
      const queueMutation = category === 'queue_mutation'
        || (category === 'soundclash_operation' && /\/resolve(?:\/|$)/.test(pathname))
        || (category === 'aidj_operation' && /\/segue\/apply(?:\/|$)/.test(pathname));
      log({
        event: category === 'queue_mutation'
          ? 'queue.mutation.completed'
          : category === 'aidj_operation'
            ? 'aidj.operation.completed'
            : category === 'soundclash_operation'
              ? 'soundclash.operation.completed'
              : 'http.request.completed',
        category,
        queueMutation,
        requestId,
        correlationId: sessionCorrelationId,
        loungeId: req.lounge?._id?.toString?.() || req.params?.loungeId || null,
        userId: req.user?.id || req.user?._id?.toString?.() || null,
        method: req.method,
        path: pathname,
        statusCode: res.statusCode,
        durationMs: Math.max(0, now() - startedAt),
      });
    });

    next();
  };
}

module.exports = { createStructuredRequestLogger, requestCategory };
