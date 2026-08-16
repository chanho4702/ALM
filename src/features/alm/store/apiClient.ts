// AuthGate와 ALM REST 어댑터가 같은 메모리 access token과 refresh 요청을 공유한다.
import { createAuthClient } from "../../../auth/client";

export const sharedAuthClient = createAuthClient({
  baseUrl: (import.meta.env.VITE_API_BASE as string) ?? "",
});

export const sharedApiFetch = sharedAuthClient.apiFetch;
