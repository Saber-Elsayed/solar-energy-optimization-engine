/** Client for POST /agent/recommend. No OpenAI keys — backend only. */
import { AGENT_RECOMMEND_URL } from '@/lib/api-config';

export type AgentPlanDevice = {
  name?: string;
  power?: number;
  duration?: number;
};

export type AgentCannotRunItem = {
  device?: AgentPlanDevice;
  blocked_reason?: string;
  reason?: string;
};

export type AgentPlan = {
  can_run?: AgentPlanDevice[];
  cannot_run?: AgentCannotRunItem[];
  total_power_w?: number;
  total_energy_wh?: number;
  remaining_energy_wh?: number;
  solver_status?: string;
};

export type AgentRecommendResponse = {
  explanation?: string;
  tools_used?: string[];
  rag_sources?: string[];
  plan?: AgentPlan;
};

export const FRIENDLY_AGENT_ERROR =
  "Sorry, I couldn't reach the Sola Energy Assistant. Please try again.";

export function mapToolLabel(tool: string): string {
  if (tool === 'context') {
    return 'Checked energy context';
  }
  if (tool === 'or_tools') {
    return 'Ran energy optimization';
  }
  if (tool === 'rag') {
    return 'Retrieved Sola Home knowledge';
  }
  return 'Completed analysis';
}

export async function postAgentRecommend(message: string, city: string): Promise<AgentRecommendResponse> {
  const response = await fetch(AGENT_RECOMMEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      city: city.trim() || 'Tel Aviv',
    }),
  });

  if (!response.ok) {
    throw new Error(FRIENDLY_AGENT_ERROR);
  }

  const payload = (await response.json()) as AgentRecommendResponse | null;
  if (!payload || typeof payload !== 'object') {
    throw new Error(FRIENDLY_AGENT_ERROR);
  }
  return payload;
}
