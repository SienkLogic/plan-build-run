export interface LlmMetricsSummary {
  total_calls: number;
  fallback_count: number;
  fallback_rate_pct: number;
  avg_latency_ms: number;
  tokens_saved: number;
  cost_saved_usd: number;
}

export interface LlmOperationMetrics {
  operation: string;
  calls: number;
  fallbacks: number;
  tokens_saved: number;
}

export interface LlmMetrics {
  summary: LlmMetricsSummary;
  byOperation: LlmOperationMetrics[];
  baseline: {
    hook_invocations: number;
    estimated_frontier_tokens_without_local: number;
  };
}

export declare function getLlmMetrics(projectDir: string): Promise<LlmMetrics | null>;
