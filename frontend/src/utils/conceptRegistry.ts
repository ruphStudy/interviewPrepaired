/**
 * Canonical technical-concept registry used by useSpeechInterview's
 * while-speaking concept detection (2C) — a pure, local, offline scan of
 * partial/interim transcript text, no network call, no AI.
 *
 * This is intentionally a DUPLICATE of
 * backend/src/constants/conceptRegistry.ts, which AnswerSignalService uses
 * server-side. The frontend and backend are separate TypeScript projects
 * with no shared package, so the registry and its matching logic are
 * necessarily duplicated across the boundary.
 *
 * KEEP THE CANONICAL KEY SET (and aliases) IN SYNC WITH
 * backend/src/constants/conceptRegistry.ts.
 */

interface ConceptEntry {
  label: string;
  aliases: string[];
}

export const CONCEPT_REGISTRY: Record<string, ConceptEntry> = {
  redis: { label: 'Redis', aliases: ['redis'] },
  kafka: { label: 'Kafka', aliases: ['kafka'] },
  mongodb: { label: 'MongoDB', aliases: ['mongo', 'mongodb'] },
  postgresql: { label: 'PostgreSQL', aliases: ['postgres', 'postgresql', 'psql'] },
  mysql: { label: 'MySQL', aliases: ['mysql'] },
  react: { label: 'React', aliases: ['react', 'reactjs', 'react.js'] },
  nodejs: { label: 'Node.js', aliases: ['node', 'nodejs', 'node.js'] },
  nestjs: { label: 'NestJS', aliases: ['nest', 'nestjs', 'nest.js'] },
  docker: { label: 'Docker', aliases: ['docker'] },
  kubernetes: { label: 'Kubernetes', aliases: ['k8s', 'kubernetes'] },
  caching: { label: 'Caching', aliases: ['cache', 'caching', 'cached'] },
  queues: { label: 'Queues', aliases: ['queue', 'queues', 'queueing', 'message queue'] },
  microservices: { label: 'Microservices', aliases: ['microservice', 'microservices'] },
  asyncProcessing: {
    label: 'Async processing',
    aliases: ['async processing', 'asynchronous processing', 'background job', 'background jobs', 'background processing'],
  },
  indexing: { label: 'Indexing', aliases: ['index', 'indexing', 'indexes'] },
  transactions: { label: 'Transactions', aliases: ['transaction', 'transactions', 'acid'] },
  authentication: { label: 'Authentication', aliases: ['auth', 'authentication', 'authn'] },
  authorization: { label: 'Authorization', aliases: ['authz', 'authorization', 'rbac'] },
  scaling: { label: 'Scaling', aliases: ['scale', 'scaling', 'scalability', 'horizontal scaling', 'vertical scaling'] },
  observability: { label: 'Observability', aliases: ['observability', 'monitoring', 'tracing'] },
  cicd: { label: 'CI/CD', aliases: ['ci/cd', 'cicd', 'continuous integration', 'continuous deployment', 'continuous delivery'] },
  graphql: { label: 'GraphQL', aliases: ['graphql'] },
  rest: { label: 'REST', aliases: ['restful', 'rest api'] },
  websocket: { label: 'WebSocket', aliases: ['websocket', 'websockets'] },
  grpc: { label: 'gRPC', aliases: ['grpc'] },
  typescript: { label: 'TypeScript', aliases: ['typescript'] },
  javascript: { label: 'JavaScript', aliases: ['javascript'] },
  python: { label: 'Python', aliases: ['python'] },
  java: { label: 'Java', aliases: ['java'] },
  aws: { label: 'AWS', aliases: ['aws', 'amazon web services'] },
  azure: { label: 'Azure', aliases: ['azure'] },
  gcp: { label: 'GCP', aliases: ['gcp', 'google cloud'] },
  loadBalancing: { label: 'Load balancing', aliases: ['load balancer', 'load balancing', 'loadbalancer'] },
  sharding: { label: 'Sharding', aliases: ['shard', 'sharding', 'shards'] },
  replication: { label: 'Replication', aliases: ['replica', 'replication', 'replicas'] },
  eventDriven: { label: 'Event-driven', aliases: ['event driven', 'event-driven', 'event sourcing'] },
  rabbitmq: { label: 'RabbitMQ', aliases: ['rabbitmq', 'rabbit mq'] },
  elasticsearch: { label: 'Elasticsearch', aliases: ['elasticsearch', 'elastic search'] },
  cdn: { label: 'CDN', aliases: ['cdn', 'content delivery network'] },
  rateLimiting: { label: 'Rate limiting', aliases: ['rate limit', 'rate limiting', 'throttling'] },
  circuitBreaker: { label: 'Circuit breaker', aliases: ['circuit breaker', 'circuit breakers'] },
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ALIAS_PATTERNS: Array<{ key: string; pattern: RegExp }> = Object.entries(CONCEPT_REGISTRY).flatMap(
  ([key, entry]) => entry.aliases.map((alias) => ({ key, pattern: new RegExp(`\\b${escapeRegExp(alias)}\\b`, 'i') }))
);

/**
 * Case-insensitive, word-boundary-aware scan for canonical concept keys
 * mentioned in `text`. Pure/synchronous, no network/AI call. Deduplicated,
 * order not significant. Empty/whitespace-only input returns [].
 */
export function detectConcepts(text: string): string[] {
  if (!text || !text.trim()) return [];
  const found = new Set<string>();
  for (const { key, pattern } of ALIAS_PATTERNS) {
    if (found.has(key)) continue;
    if (pattern.test(text)) found.add(key);
  }
  return Array.from(found);
}
