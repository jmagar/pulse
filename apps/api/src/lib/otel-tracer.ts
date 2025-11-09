import {
  trace,
  context,
  SpanStatusCode,
  Span,
  SpanKind,
  Attributes,
  propagation,
} from "@opentelemetry/api";
// import { Logger } from 'winston';

const tracer = trace.getTracer("firecrawl-api", "1.0.0");

export { SpanKind };

// Trace context propagation utilities
export interface SerializedTraceContext {
  traceParent?: string;
  traceState?: string;
}

export function serializeTraceContext(): SerializedTraceContext {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  return {
    traceParent: carrier.traceparent,
    traceState: carrier.tracestate,
  };
}

function deserializeTraceContext(serialized: SerializedTraceContext): any {
  if (!serialized.traceParent) {
    return context.active();
  }

  const carrier: Record<string, string> = {
    traceparent: serialized.traceParent,
  };

  if (serialized.traceState) {
    carrier.tracestate = serialized.traceState;
  }

  return propagation.extract(context.active(), carrier);
}

// export function withTraceContext<T>(serializedContext: SerializedTraceContext, fn: () => T): T {
//   const ctx = deserializeTraceContext(serializedContext);
//   return context.with(ctx, fn);
// }

export async function withTraceContextAsync<T>(
  serializedContext: SerializedTraceContext,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = deserializeTraceContext(serializedContext);
  return context.with(ctx, fn);
}

interface SpanOptions {
  attributes?: Attributes;
  kind?: SpanKind;
}

function startSpan(name: string, options?: SpanOptions): Span {
  return tracer.startSpan(name, {
    attributes: options?.attributes,
    kind: options?.kind || SpanKind.INTERNAL,
  });
}

export async function withSpan<T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  options?: SpanOptions,
): Promise<T> {
  const span = startSpan(name, options);

  try {
    const result = await context.with(
      trace.setSpan(context.active(), span),
      () => fn(span),
    );
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error) {
      span.recordException(error);
    }

    throw error;
  } finally {
    span.end();
  }
}

// export function withSpanSync<T>(
//   name: string,
//   fn: (span: Span) => T,
//   options?: SpanOptions
// ): T {
//   const span = startSpan(name, options);

//   try {
//     const result = context.with(
//       trace.setSpan(context.active(), span),
//       () => fn(span)
//     );
//     span.setStatus({ code: SpanStatusCode.OK });
//     return result;
//   } catch (error) {
//     span.setStatus({
//       code: SpanStatusCode.ERROR,
//       message: error instanceof Error ? error.message : String(error),
//     });

//     if (error instanceof Error) {
//       span.recordException(error);
//     }

//     throw error;
//   } finally {
//     span.end();
//   }
// }

export function setSpanAttributes(span: Span, attributes: Attributes): void {
  Object.entries(attributes).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      span.setAttribute(key, value);
    }
  });
}

// export function setSpanError(span: Span, error: Error | unknown, logger?: Logger): void {
//   const errorMessage = error instanceof Error ? error.message : String(error);

//   span.setStatus({
//     code: SpanStatusCode.ERROR,
//     message: errorMessage,
//   });

//   if (error instanceof Error) {
//     span.recordException(error);
//     span.setAttributes({
//       'error.type': error.constructor.name,
//       'error.message': error.message,
//       'error.stack': error.stack,
//     });
//   }

//   if (logger) {
//     logger.error('Span error recorded', { error, spanName: span.spanContext().traceId });
//   }
// }

// export function getActiveSpan(): Span | undefined {
//   return trace.getActiveSpan();
// }

// export function createChildSpan(name: string, parentSpan?: Span, options?: SpanOptions): Span {
//   const ctx = parentSpan
//     ? trace.setSpan(context.active(), parentSpan)
//     : context.active();

//   return context.with(ctx, () => startSpan(name, options));
// }
