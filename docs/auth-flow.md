# Device Code Authentication Flow

This document describes the authentication flow implemented for retrieving a user-specific LiteLLM key.

## Overview

When the agent starts and finds `AUTH_URL` set in the environment, it automatically initiates a device-code authentication flow to retrieve a user-specific LiteLLM key.

## Implementation Details

The authentication flow follows these steps:

1. **Start Check**: When the agent starts, it checks if `AUTH_URL` is set.
   - If not set, authentication is skipped (for self-hosters).
   - If set, checks for an existing cached key in `~/.agent/keys.json`.

2. **Device Code Request**: If no valid key exists, initiates device code flow:
   - Makes a POST request to `AUTH_URL/device`.
   - Receives device code, user code, verification URL, and polling interval.

3. **User Authentication**:
   - Attempts to open the browser at verification URL with user code and callback URL.
   - Displays instructions in the console/terminal for manual authentication.
   - Sets up a one-shot HTTP server to receive the key directly (preferred method).

4. **Key Retrieval**: Two methods run in parallel (race condition):
   - **Method 1** (preferred): Listens for a POST request from the browser with the key.
   - **Method 2** (fallback): Polls `AUTH_URL/token` until success, then requests the key from `AUTH_URL/device/litellm_key`.

5. **Key Storage**: Stores the received key in `~/.agent/keys.json` along with expiration information.

6. **Key Usage**: Injects the key into LLM requests by:
   - Setting it as the environment variable `LLM_KEY`.
   - The OpenAI SDK is configured to read from `LLM_KEY` instead of `OPENAI_API_KEY`.

## Sequence Diagram

```
┌─────────┐          ┌────────┐          ┌────────────┐          ┌─────────┐
│  Agent  │          │ Server │          │  Browser   │          │  Auth   │
│         │          │        │          │            │          │ Server  │
└────┬────┘          └───┬────┘          └─────┬──────┘          └────┬────┘
     │ Start & Check    │                      │                      │
     │ AUTH_URL Set     │                      │                      │
     ├─────────────────►│                      │                      │
     │                  │                      │                      │
     │                  │ POST /device         │                      │
     │                  ├──────────────────────┼──────────────────────►
     │                  │                      │                      │
     │                  │ Device Code Response │                      │
     │                  ◄──────────────────────┼──────────────────────┤
     │                  │                      │                      │
     │                  │ Start Callback Server│                      │
     │                  ├────────────┐         │                      │
     │                  │            │         │                      │
     │                  │◄───────────┘         │                      │
     │                  │                      │                      │
     │                  │ Open Browser         │                      │
     │                  ├─────────────────────►│                      │
     │                  │                      │                      │
     │                  │                      │ Authenticate & Approve
     │                  │                      ├─────────────────────►│
     │                  │                      │                      │
     │                  │                      │ Key Response         │
     │                  │                      ◄─────────────────────┤
     │                  │                      │                      │
     │                  │                      │ POST to Callback     │
     │                  ◄─────────────────────┤                      │
     │                  │                      │                      │
     │                  │ Store Key            │                      │
     │                  ├────────────┐         │                      │
     │                  │            │         │                      │
     │                  │◄───────────┘         │                      │
     │                  │                      │                      │
     │ Return Success   │                      │                      │
     ◄─────────────────┤                      │                      │
     │                  │                      │                      │
```

## Fallback Polling

If the browser callback doesn't work, the agent falls back to polling:

1. Polls `AUTH_URL/token` with the device code until successful.
2. On success, retrieves the key from `AUTH_URL/device/litellm_key`.
3. Stores the key in `~/.agent/keys.json`.

## Notes for Self-Hosters

- No authentication is required if `AUTH_URL` is not set.
- No prompts or UI changes occur for self-hosters who don't set `AUTH_URL`.
- The authentication flow is completely automatic - it doesn't require user interaction beyond the initial browser authentication.

## Security Considerations

- Keys are stored locally in the user's home directory.
- The callback server only listens temporarily during the authentication process.
- The server uses HTTPS for all communication with the auth server.