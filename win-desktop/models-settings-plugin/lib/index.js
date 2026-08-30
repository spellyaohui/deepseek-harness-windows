import { ModelCapabilityProbeService } from "./capability-probe-service.js";
/** Host loader entry for the browser implementation exported from `./client`. */
/** Wait for the credential seam before registering the Host Remote service. */
export const inject = ['credentials'];
/** Register the provider-neutral model capability probe service. */
export function apply(ctx) {
    new ModelCapabilityProbeService(ctx);
}
