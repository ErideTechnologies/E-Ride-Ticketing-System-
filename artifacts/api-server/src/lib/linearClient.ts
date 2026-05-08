import { logger } from "./logger";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";

export type CreateLinearIssueParams = {
  teamId: string;
  title: string;
  description: string;
  /** Linear priority: 0 No priority, 1 Urgent, 2 High, 3 Medium, 4 Low. */
  priority?: number;
  /** Existing label IDs in Linear (we don't auto-create labels). */
  labels?: string[];
};

export type CreateLinearIssueResult = {
  success: boolean;
  disabled: boolean;
  linearIssueId?: string | null;
  linearIssueKey?: string | null;
  linearIssueUrl?: string | null;
  linearTeamKey?: string | null;
  errorMessage?: string | null;
};

const CREATE_ISSUE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
        team { id key }
      }
    }
  }
`;

export function isLinearEnabled(): boolean {
  return Boolean(process.env.LINEAR_API_KEY);
}

/**
 * Resolve a Linear team ID for the given product code, falling back to the
 * default team if no product-specific override exists. Returns null when no
 * team can be resolved (caller should report a configuration error).
 */
export function resolveLinearTeamId(productCode: string): string | null {
  const key = `LINEAR_TEAM_ID_${productCode.toUpperCase()}`;
  const productSpecific = process.env[key];
  if (productSpecific) return productSpecific;
  const fallback = process.env.LINEAR_DEFAULT_TEAM_ID;
  return fallback ?? null;
}

export async function createLinearIssue(
  params: CreateLinearIssueParams,
): Promise<CreateLinearIssueResult> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      disabled: true,
      errorMessage: "Linear API is not configured (LINEAR_API_KEY missing).",
    };
  }
  if (!params.teamId) {
    return {
      success: false,
      disabled: false,
      errorMessage: "Linear team ID is required.",
    };
  }

  const input: Record<string, unknown> = {
    teamId: params.teamId,
    title: params.title,
    description: params.description,
  };
  if (typeof params.priority === "number") input.priority = params.priority;
  if (params.labels && params.labels.length > 0) input.labelIds = params.labels;

  try {
    const response = await fetch(LINEAR_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Linear personal API keys are sent as-is, no "Bearer" prefix.
        authorization: apiKey,
      },
      body: JSON.stringify({
        query: CREATE_ISSUE_MUTATION,
        variables: { input },
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.warn(
        { status: response.status, body: text.slice(0, 500) },
        "Linear API returned non-2xx",
      );
      return {
        success: false,
        disabled: false,
        errorMessage: `Linear API error (${response.status}).`,
      };
    }

    const json = (await response.json()) as {
      data?: {
        issueCreate?: {
          success: boolean;
          issue?: {
            id: string;
            identifier: string;
            url: string;
            team?: { id: string; key: string };
          };
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (json.errors && json.errors.length > 0) {
      const message = json.errors.map((e) => e.message).join("; ");
      logger.warn({ message }, "Linear API GraphQL error");
      return {
        success: false,
        disabled: false,
        errorMessage: `Linear API error: ${message}`,
      };
    }

    const issue = json.data?.issueCreate?.issue;
    if (!json.data?.issueCreate?.success || !issue) {
      return {
        success: false,
        disabled: false,
        errorMessage: "Linear API did not return a created issue.",
      };
    }

    return {
      success: true,
      disabled: false,
      linearIssueId: issue.id,
      linearIssueKey: issue.identifier,
      linearIssueUrl: issue.url,
      linearTeamKey: issue.team?.key ?? null,
    };
  } catch (err) {
    logger.warn({ err }, "Linear API call threw");
    return {
      success: false,
      disabled: false,
      errorMessage:
        err instanceof Error
          ? `Linear API call failed: ${err.message}`
          : "Linear API call failed.",
    };
  }
}
