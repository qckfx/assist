# Multi-User Authentication Implementation

This document outlines the multi-user authentication implementation for qckfx.

## Overview

The authentication system has two modes:

1. **Single-User Mode**: When `AUTH_URL` is not set, the system uses the global `LLM_API_KEY` from the environment.
2. **Multi-User Mode**: When `AUTH_URL` is set, a device code authentication flow is required for each user to obtain a user-specific LiteLLM API key.

## Components

### Server-Side

1. **UserManager Interface**:
   - `IUserManager` interface defines methods for user management
   - `InMemoryUserManager` implementation for multi-user mode
   - `SingleUserManager` no-op implementation for single-user mode

2. **AuthService**:
   - Enhanced to work with the dependency injection system
   - Support for device code flow with background token polling
   - Handling of user token creation and validation

3. **Middleware**:
   - `userContext` middleware to check for user authentication via cookies
   - Automatic cookie setting when a pending token becomes available

4. **Auth Routes**:
   - `/auth/status` - Check authentication status
   - `/auth/login` - Start device code authentication flow
   - `/auth/logout` - Log out and clear cookie

### Client-Side

1. **Login Page**:
   - React component for the login UI
   - Device code flow visualization and polling
   - Proper error handling and feedback

2. **Auth Checker**:
   - React component to verify authentication status
   - Redirects to login page when not authenticated in multi-user mode
   - Bypasses login in single-user mode

3. **Layout Updates**:
   - Added logout button when in multi-user mode
   - Authentication status handling

## Authentication Flow

1. The server starts up and determines if it's in multi-user mode based on `AUTH_URL`.
2. If in multi-user mode, the UI checks authentication status and redirects to login if needed.
3. On the login page, the user initiates device code authentication.
4. After successful authentication on the external site, the server creates a user entry and a token.
5. The token is sent back to the client via a cookie and used for subsequent API requests.
6. Controllers can extract the LiteLLM API key from the authenticated request.

## Security Considerations

- Authentication uses HTTP-only cookies to prevent XSS attacks
- In production mode, cookies are marked as secure
- Token generation uses cryptographically secure random values

## Dependencies

- `cookie-parser` - For parsing cookies in Express
- `inversify` - For dependency injection

## Configuration

To enable multi-user mode, set the `AUTH_URL` environment variable to the authentication service URL.