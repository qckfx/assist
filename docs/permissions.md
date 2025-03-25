# Permission Request System

## Overview

Permission requests in qckfx do not timeout and will wait indefinitely for user action. This ensures that:

1. Important operations are never automatically canceled
2. Users have full control over all permission decisions
3. The system will wait patiently for user input, even during long breaks

## How Permissions Work

When qckfx needs to perform a potentially dangerous operation (like executing shell commands or modifying files), it will request permission from the user. The operation will then wait until the user explicitly approves or denies the request.

### Key Features

- **No Timeouts**: Permission requests never expire and will wait indefinitely
- **Persistent Across Sessions**: If you close and reopen qckfx, pending permissions will still be there
- **Full User Control**: All sensitive operations require explicit user approval
- **Manual Denial Required**: You must actively deny permissions you don't want to grant

## Best Practices

Since permission requests do not timeout, keep these considerations in mind:

1. Always check for pending permission requests when returning to a session
2. Be aware that long-running sessions with unresolved permission requests will continue to consume server resources
3. Manually cancel or deny permissions for operations you no longer want to execute
4. Review permission requests carefully before approving them, especially for shell operations