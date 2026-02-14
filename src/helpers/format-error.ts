/**
 * Extracts intuit_tid from various error shapes returned by the QBO API.
 */
function extractIntuitTid(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const err = error as any;
  // axios error shape: error.response.headers['intuit_tid']
  if (err.response?.headers?.['intuit_tid']) return err.response.headers['intuit_tid'];
  // node-quickbooks passes the body as the error on Fault responses
  if (err.intuit_tid) return err.intuit_tid;
  return undefined;
}

/**
 * Formats an error into a standardized error message.
 * Includes intuit_tid when available for Intuit support troubleshooting.
 */
export function formatError(error: unknown): string {
  const tid = extractIntuitTid(error);
  const tidSuffix = tid ? ` (intuit_tid: ${tid})` : '';

  if (error instanceof Error) {
    return `Error: ${error.message}${tidSuffix}`;
  } else if (typeof error === 'string') {
    return `Error: ${error}${tidSuffix}`;
  } else if (error && typeof error === 'object') {
    // Extract only safe fields — avoid serializing tokens/credentials
    const safe = (error as any).message ?? (error as any).code ?? (error as any).statusCode;
    if (safe) {
      return `Error: ${safe}${tidSuffix}`;
    }
    // Fault response from QBO API
    const fault = (error as any).Fault;
    if (fault) {
      const details = fault.Error?.map?.((e: any) => e.Message || e.Detail).join('; ') ?? 'Unknown QBO fault';
      return `Error: ${details}${tidSuffix}`;
    }
    return `Unknown error occurred${tidSuffix}`;
  } else {
    return `Unknown error occurred${tidSuffix}`;
  }
}
