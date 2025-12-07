import arcjet, { shield, detectBot, slidingWindow } from "@arcjet/node";

import { ENV } from "./env.js";

// Only initialize arcjet if key is provided
let aj = null;

if (ENV.ARCJET_KEY) {
  aj = arcjet({
    key: ENV.ARCJET_KEY,
    rules: [
      // Shield protects your app from common attacks e.g. SQL injection
      shield({ mode: ENV.NODE_ENV === "production" ? "LIVE" : "DRY_RUN" }),
      // Create a bot detection rule
      detectBot({
        mode: ENV.NODE_ENV === "production" ? "LIVE" : "DRY_RUN", // Blocks requests. Use "DRY_RUN" to log only
        // Block all bots except the following
        allow: [
          "CATEGORY:SEARCH_ENGINE", // Google, Bing, etc
          // Uncomment to allow these other common bot categories
          // See the full list at https://arcjet.com/bot-list
          //"CATEGORY:MONITOR", // Uptime monitoring services
          //"CATEGORY:PREVIEW", // Link previews e.g. Slack, Discord
        ],
      }),
      // Create a token bucket rate limit. Other algorithms are supported.
      slidingWindow({
        mode: ENV.NODE_ENV === "production" ? "LIVE" : "DRY_RUN", // Blocks requests. Use "DRY_RUN" to log only
        max: 100,
        interval: 60,
      }),
    ],
  });
} else {
  console.log("Arcjet key not found. Arcjet protection is disabled.");
}

export default aj;
