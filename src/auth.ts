#!/usr/bin/env node
import { quickbooksClient } from "./clients/quickbooks-client.js";

console.log("Starting QuickBooks OAuth flow...");
console.log("A browser window should open. If not, check the URL logged below.");

quickbooksClient.authenticate()
  .then(() => {
    console.log("Successfully authenticated with QuickBooks!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Authentication failed:", error);
    process.exit(1);
  });
