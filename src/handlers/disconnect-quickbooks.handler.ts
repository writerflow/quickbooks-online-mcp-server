import { quickbooksClient } from "../clients/quickbooks-client.js";
import { ToolResponse } from "../types/tool-response.js";
import { formatError } from "../helpers/format-error.js";

export async function disconnectQuickbooks(): Promise<ToolResponse<{ message: string }>> {
  try {
    await quickbooksClient.disconnect();
    return {
      result: { message: "Successfully disconnected from QuickBooks Online." },
      isError: false,
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      isError: true,
      error: formatError(error),
    };
  }
}
