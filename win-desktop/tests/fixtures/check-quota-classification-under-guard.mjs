import { isQuotaExceededError } from '@deepseek-ai/dsh-llm'

console.log(JSON.stringify({
  weeklyUsageLimit: isQuotaExceededError(
    "You've reached your weekly usage limit for your plan. Your limit resets at 2026-09-06T01:10:28.086Z.",
  ),
  transientRateLimit: isQuotaExceededError('HTTP 429: rate limit reached'),
  resetNoticeAlone: isQuotaExceededError('quota resets in one minute'),
}))
