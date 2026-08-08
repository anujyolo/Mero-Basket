# Backend

The server-only AI endpoints are implemented in this folder.

- `adapt-route.ts` validates lesson requests, calls the OpenAI Responses API when a server key is available, and provides the reliable demo fallback.
- `status-route.ts` reports whether live or demo AI is active without exposing credentials.

The route connectors under `app/api/` expose these endpoints to the frontend.
