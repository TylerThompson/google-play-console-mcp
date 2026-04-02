import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GooglePlayConsoleAPI } from "./api/client.js";
import {
  getAppOverview,
  getCrashMetrics,
  getANRMetrics,
  getErrorCounts,
  getErrorIssues,
  getErrorReports,
  getPerformanceMetrics,
  searchApps
} from "./api/tools.js";
import { verifySetupPermissions } from "./api/permission-check.js";
import { buildAndroidPublisherHelp } from "./api/android-publisher-invoke.js";

// Configuration schema
const ConfigSchema = z.object({
  googlePlayCredentials: z.object({
    clientEmail: z.string(),
    privateKey: z.string(),
    projectId: z.string(),
  }),
  packageName: z.string(),
});

// Tool schemas
const GetAppOverviewSchema = z.object({
  packageName: z.string().optional(),
  timeRange: z.enum(["7d", "30d", "90d"]).default("30d"),
});

const GetCrashMetricsSchema = z.object({
  packageName: z.string().optional(),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
});

const GetANRMetricsSchema = z.object({
  packageName: z.string().optional(),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
});

const GetErrorCountsSchema = z.object({
  packageName: z.string().optional(),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
});

const GetErrorIssuesSchema = z.object({
  packageName: z.string().optional(),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
  pageSize: z.number().default(20),
  pageToken: z.string().optional(),
});

const GetErrorReportsSchema = z.object({
  packageName: z.string().optional(),
  issueId: z.string(),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
  pageSize: z.number().default(20),
  pageToken: z.string().optional(),
});

const GetPerformanceMetricsSchema = z.object({
  packageName: z.string().optional(),
  metricType: z.enum([
    "excessivewakeuprate",
    "slowrenderingrate",
    "slowstartrate",
    "stuckbackgroundwakelockrate",
    "lmkrate"
  ]),
  versionCode: z.string().optional(),
  apiLevel: z.string().optional(),
  deviceModel: z.string().optional(),
  country: z.string().optional(),
  timeRange: z.enum(["1d", "7d", "30d"]).default("7d"),
});

const SearchAppsSchema = z.object({
  query: z.string(),
  pageSize: z.number().default(10),
});

const VerifySetupSchema = z.object({
  packageName: z.string().optional(),
});

const AndroidPublisherInvokeSchema = z.object({
  packageName: z.string().optional(),
  operation: z
    .string()
    .min(1)
    .describe(
      "Dot path ending with method name, matching googleapis androidpublisher v3 (e.g. edits.tracks.list, inappproducts.get, reviews.reply)"
    ),
  requestParams: z.record(z.string(), z.unknown()).optional().default({}),
});

class GooglePlayConsoleServer {
  private server: Server;
  private api: GooglePlayConsoleAPI;
  private config: z.infer<typeof ConfigSchema>;

  constructor(config: z.infer<typeof ConfigSchema>) {
    this.config = config;
    this.api = new GooglePlayConsoleAPI(config.googlePlayCredentials);

    this.server = new Server(
      {
        name: "google-play-console",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "get_app_overview",
          description:
            "Overview: vitals-based user reach (distinctUsers), crash/ANR rates with affected users, and ratings from reviews.list. Install/acquisition counts are not available from Google APIs (downloads fields are null; see notes).",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              timeRange: {
                type: "string",
                enum: ["7d", "30d", "90d"],
                description: "Time range for metrics",
                default: "30d"
              }
            }
          }
        },
        {
          name: "get_crash_metrics",
          description: "Get crash rate metrics for your app with detailed breakdowns",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              }
            }
          }
        },
        {
          name: "get_anr_metrics",
          description: "Get ANR (Application Not Responding) rate metrics for your app",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              }
            }
          }
        },
        {
          name: "get_error_counts",
          description: "Get error count metrics for your app",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              }
            }
          }
        },
        {
          name: "get_error_issues",
          description: "Search and list error issues for your app",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              },
              pageSize: {
                type: "number",
                description: "Number of results to return",
                default: 20
              },
              pageToken: {
                type: "string",
                description: "Pagination token for next page"
              }
            }
          }
        },
        {
          name: "get_error_reports",
          description: "Get detailed error reports for a specific error issue",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              issueId: {
                type: "string",
                description: "ID of the error issue to get reports for"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              },
              pageSize: {
                type: "number",
                description: "Number of results to return",
                default: 20
              },
              pageToken: {
                type: "string",
                description: "Pagination token for next page"
              }
            },
            required: ["issueId"]
          }
        },
        {
          name: "get_performance_metrics",
          description: "Get performance metrics (excessive wakeups, slow rendering, slow starts, etc.)",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              },
              metricType: {
                type: "string",
                enum: ["excessivewakeuprate", "slowrenderingrate", "slowstartrate", "stuckbackgroundwakelockrate", "lmkrate"],
                description: "Type of performance metric to retrieve"
              },
              versionCode: {
                type: "string",
                description: "Filter by specific app version code"
              },
              apiLevel: {
                type: "string",
                description: "Filter by Android API level"
              },
              deviceModel: {
                type: "string",
                description: "Filter by device model"
              },
              country: {
                type: "string",
                description: "Filter by country code"
              },
              timeRange: {
                type: "string",
                enum: ["1d", "7d", "30d"],
                description: "Time range for metrics",
                default: "7d"
              }
            },
            required: ["metricType"]
          }
        },
        {
          name: "verify_setup",
          description: "Verify service-account setup, app access, and required API permissions",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "Package name of the app (optional, uses configured package name if not provided)"
              }
            }
          }
        },
        {
          name: "search_apps",
          description: "Search for apps in your Google Play Console account",
          inputSchema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "Search query to find apps"
              },
              pageSize: {
                type: "number",
                description: "Number of results to return",
                default: 10
              }
            },
            required: ["query"]
          }
        },
        {
          name: "android_publisher_help",
          description:
            "Documentation for android_publisher_invoke: API roots, examples, and link to official REST reference for Google Play Android Developer API v3",
          inputSchema: {
            type: "object",
            properties: {}
          }
        },
        {
          name: "android_publisher_invoke",
          description:
            "Invoke any Google Play Android Developer API (androidpublisher v3) method exposed on the googleapis client. Use dot notation (e.g. edits.insert, edits.tracks.list, monetization.subscriptions.list, inappproducts.get, orders.refund). Pass query/body fields in requestParams per https://developers.google.com/android-publisher/api-ref/rest/v3 — Binary media uploads are not supported.",
          inputSchema: {
            type: "object",
            properties: {
              packageName: {
                type: "string",
                description: "App package name (optional if configured as default); merged into requestParams when omitted there"
              },
              operation: {
                type: "string",
                description: "Client path + method, e.g. edits.bundles.list, purchases.subscriptionsv2.get"
              },
              requestParams: {
                type: "object",
                description: "Parameters passed to the API method (packageName, editId, track, requestBody, token, etc.)",
                additionalProperties: true
              }
            },
            required: ["operation"]
          }
        }
      ]
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_app_overview": {
            const params = GetAppOverviewSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getAppOverview(this.api, packageName, params.timeRange);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_crash_metrics": {
            const params = GetCrashMetricsSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getCrashMetrics(this.api, packageName, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_anr_metrics": {
            const params = GetANRMetricsSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getANRMetrics(this.api, packageName, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_error_counts": {
            const params = GetErrorCountsSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getErrorCounts(this.api, packageName, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_error_issues": {
            const params = GetErrorIssuesSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getErrorIssues(this.api, packageName, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_error_reports": {
            const params = GetErrorReportsSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getErrorReports(this.api, packageName, params.issueId, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "get_performance_metrics": {
            const params = GetPerformanceMetricsSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await getPerformanceMetrics(this.api, packageName, params.metricType, params);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "search_apps": {
            const params = SearchAppsSchema.parse(args);
            const result = await searchApps(this.api, params.query, params.pageSize);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "verify_setup": {
            const params = VerifySetupSchema.parse(args);
            const packageName = params.packageName || this.config.packageName;
            const result = await verifySetupPermissions(this.api, packageName);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          case "android_publisher_help": {
            const text = buildAndroidPublisherHelp();
            return {
              content: [{ type: "text", text }],
            };
          }

          case "android_publisher_invoke": {
            const params = AndroidPublisherInvokeSchema.parse(args ?? {});
            const defaultPkg = this.config.packageName;
            const req: Record<string, unknown> = {
              ...params.requestParams,
            };
            if (req.packageName == null && params.packageName) {
              req.packageName = params.packageName;
            }
            if (req.packageName == null && defaultPkg) {
              req.packageName = defaultPkg;
            }
            const result = await this.api.invokeAndroidPublisher(params.operation, req);
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(result, null, 2),
                },
              ],
            };
          }

          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new McpError(
            ErrorCode.InvalidParams,
            `Invalid parameters: ${error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
          );
        }

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Google Play Console MCP server running on stdio");
  }
}

// Main execution
async function main() {
  try {
    // Get configuration from environment variables
    const config = ConfigSchema.parse({
      googlePlayCredentials: {
        clientEmail: process.env.GOOGLE_PLAY_CLIENT_EMAIL || (() => {
          throw new Error("GOOGLE_PLAY_CLIENT_EMAIL environment variable is required");
        })(),
        privateKey: process.env.GOOGLE_PLAY_PRIVATE_KEY || (() => {
          throw new Error("GOOGLE_PLAY_PRIVATE_KEY environment variable is required");
        })(),
        projectId: process.env.GOOGLE_PLAY_PROJECT_ID || (() => {
          throw new Error("GOOGLE_PLAY_PROJECT_ID environment variable is required");
        })(),
      },
      packageName: process.env.GOOGLE_PLAY_PACKAGE_NAME || (() => {
        throw new Error("GOOGLE_PLAY_PACKAGE_NAME environment variable is required");
      })(),
    });

    const server = new GooglePlayConsoleServer(config);
    await server.run();
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

// Run the server
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
