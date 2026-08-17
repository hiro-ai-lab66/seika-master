import type { AIReflectionGenerated, AIReflectionInput } from '../utils/aiReflection';

export type AIReflectionResponse = {
  configured: true;
  generated: AIReflectionGenerated;
  generatedAt: string;
  model: string;
};

export class AIReflectionUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIReflectionUnavailableError';
  }
}

export const generatePeriodReflectionAI = async (input: AIReflectionInput): Promise<AIReflectionResponse> => {
  const response = await fetch('/api/period-reflection-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ input })
  });
  const payload = await response.json().catch(() => null) as (AIReflectionResponse | { error?: string; configured?: false }) | null;
  if (!response.ok) {
    const message = payload && 'error' in payload && payload.error ? payload.error : 'AI振り返りの生成に失敗しました';
    if (response.status === 503 && payload && 'configured' in payload && payload.configured === false) throw new AIReflectionUnavailableError(message);
    throw new Error(message);
  }
  if (!payload || !('generated' in payload) || !payload.generated || !payload.generatedAt || !payload.model) throw new Error('AI応答の形式が不正です');
  return payload as AIReflectionResponse;
};
