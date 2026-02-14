import { disconnectQuickbooks } from "../handlers/disconnect-quickbooks.handler.js";
import { ToolDefinition } from "../types/tool-definition.js";
import { z } from "zod";

const toolName = "disconnect_quickbooks";
const toolDescription = "Disconnect from QuickBooks Online. Revokes the current access token and clears local token state. A new OAuth flow will be required on next API call.";
const toolSchema = z.object({});

const toolHandler = async (_args: any) => {
  const response = await disconnectQuickbooks();

  if (response.isError) {
    return { content: [{ type: "text" as const, text: `Error disconnecting: ${response.error}` }] };
  }

  return {
    content: [
      { type: "text" as const, text: JSON.stringify(response.result) },
    ],
  };
};

export const DisconnectTool: ToolDefinition<typeof toolSchema> = {
  name: toolName,
  description: toolDescription,
  schema: toolSchema,
  handler: toolHandler,
};
