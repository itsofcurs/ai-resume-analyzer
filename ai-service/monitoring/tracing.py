from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.instrumentation.langchain import LangchainInstrumentor
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader, ConsoleMetricExporter

def setup_tracing(app):
    # Setup Tracing
    provider = TracerProvider()
    processor = BatchSpanProcessor(ConsoleSpanExporter())
    provider.add_span_processor(processor)
    trace.set_tracer_provider(provider)
    
    # Setup Metrics
    metric_reader = PeriodicExportingMetricReader(ConsoleMetricExporter())
    meter_provider = MeterProvider(metric_readers=[metric_reader])
    metrics.set_meter_provider(meter_provider)
    
    # Instrument FastAPI and LangChain
    FastAPIInstrumentor.instrument_app(app)
    LangchainInstrumentor().instrument()

    # Return configured tracer and meter
    tracer = trace.get_tracer(__name__)
    meter = metrics.get_meter(__name__)
    
    return tracer, meter

# Global metrics for custom tracking
meter = metrics.get_meter(__name__)
workflow_duration = meter.create_histogram(
    "workflow_duration_ms",
    description="Duration of LangGraph workflows",
    unit="ms"
)
llm_latency = meter.create_histogram(
    "llm_latency_ms",
    description="Duration of LLM API calls",
    unit="ms"
)

token_usage_total = meter.create_counter(
    "token_usage_total",
    description="Total AI tokens used"
)

prompt_tokens_total = meter.create_counter(
    "prompt_tokens_total",
    description="Total AI prompt tokens used"
)

completion_tokens_total = meter.create_counter(
    "completion_tokens_total",
    description="Total AI completion tokens used"
)

ai_cost_usd_total = meter.create_counter(
    "ai_cost_usd_total",
    description="Total AI cost in USD"
)

workflow_timeout_total = meter.create_counter(
    "workflow_timeout_total",
    description="Total workflow timeouts"
)
