import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

const otelSdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter(),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-undici": {
        enabled: false,
      },
      "@opentelemetry/instrumentation-express": {
        enabled: false,
      },
      "@opentelemetry/instrumentation-pg": {
        enabled: false,
      },
    }),
  ],
});

otelSdk.start();

export const shutdownOtel = async () => {
  await otelSdk.shutdown();
};
