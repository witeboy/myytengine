import { toast } from "@/components/ui/use-toast";

/**
 * Parses a backend error and shows a user-friendly toast.
 * Returns the parsed message string.
 */
export function showErrorToast(err, context = "Operation") {
  const status = err?.response?.status || err?.status;
  // Extract the actual error message from various response shapes
  const responseData = err?.response?.data;
  const serverMsg =
    (typeof responseData === 'string' ? responseData : null) ||
    responseData?.error ||
    responseData?.message ||
    responseData?.detail ||
    err?.message ||
    "";

  let title = `${context} Failed`;
  let description = "";
  let variant = "destructive";

  // ── Specific error patterns ──
  if (/credit balance is too low|billing|purchase credits/i.test(serverMsg)) {
    title = "API Credits Exhausted";
    description =
      "Your Anthropic API key has run out of credits. Please top up at console.anthropic.com → Plans & Billing.";
  } else if (/rate limit|too many requests|429/i.test(serverMsg) || status === 429) {
    title = "Rate Limited";
    description =
      "The AI provider is receiving too many requests. Please wait a minute and try again.";
  } else if (/api key|unauthorized|authentication|invalid.*key/i.test(serverMsg) || status === 401) {
    title = "Invalid API Key";
    description =
      "The API key appears to be invalid or expired. Check your secrets in the dashboard.";
  } else if (/timeout|timed out|deadline exceeded/i.test(serverMsg) || status === 504) {
    title = "Request Timed Out";
    description =
      "The operation took too long. It may still be running — try refreshing in a moment.";
  } else if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|dns/i.test(serverMsg)) {
    title = "Network Error";
    description =
      "Could not reach the AI service. Check your internet connection or try again shortly.";
  } else if (/overloaded|capacity|503/i.test(serverMsg) || status === 503) {
    title = "Service Overloaded";
    description =
      "The AI service is temporarily at capacity. Please wait a few minutes and retry.";
  } else if (status === 404) {
    title = "Not Found";
    description = "The requested resource was not found. It may have been deleted.";
  } else if (status === 500) {
    title = "Server Error";
    description = serverMsg
      ? `Backend error: ${serverMsg.substring(0, 200)}`
      : "An unexpected server error occurred. Please try again.";
  } else if (serverMsg) {
    description = serverMsg.substring(0, 250);
  } else {
    description = "An unexpected error occurred. Please try again.";
  }

  toast({ title, description, variant });

  return `${title}: ${description}`;
}