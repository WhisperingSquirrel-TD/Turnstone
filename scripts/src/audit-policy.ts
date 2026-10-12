function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export function assessAudit(value: unknown, status: number | null) {
  const audit = record(value);
  const metadata = record(audit?.metadata);
  const vulnerabilities = record(metadata?.vulnerabilities);
  const high = vulnerabilities?.high;
  const critical = vulnerabilities?.critical;
  const valid =
    typeof high === 'number' &&
    Number.isInteger(high) &&
    high >= 0 &&
    typeof critical === 'number' &&
    Number.isInteger(critical) &&
    critical >= 0 &&
    audit?.error === undefined &&
    status !== null &&
    [0, 1].includes(status);
  return {
    passed: valid && high === 0 && critical === 0,
    summary: valid
      ? `Audit: ${high} high, ${critical} critical. No exceptions.`
      : 'Dependency audit unavailable or malformed: gate failed closed',
  };
}
