# Claude Code Guidelines for qckfx

## Branding and Naming Conventions

- **Product name spelling**: Always spell "qckfx" with all lowercase letters. Never capitalize as "QCKFX" or "Qckfx".

## Code Style and Best Practices

- **Follow Existing Patterns**: Maintain consistency with existing code conventions and patterns
- **Prioritize Efficiency**: Write efficient, optimized code that minimizes unnecessary operations
- **Use Appropriate Abstractions**: Create clean abstractions that are neither too specific nor too general
- **Optimize for Maintainability**: Write code that's easy to understand, debug, and extend
- **Consider Performance Impact**: Be mindful of performance implications, especially in frequently executed code
- **Document Complex Logic**: Add comments for non-obvious logic or important implementation details
- **Be Pragmatic**: Choose the simplest solution that meets requirements without over-engineering
- **Maintain Consistent Formatting**: Follow project styling across components
- **Use CSS Variables**: Leverage CSS variables for theming when available
- **Document Failed Approaches**: When you try something that doesn't work, add a comment explaining what was tried and why it failed to prevent others from making the same mistakes
- **Delete Rather Than Comment Out**: When code is no longer needed, delete it entirely rather than commenting it out or skipping tests
- **Write Comments for Future Readers**: Comments should be useful to future developers, not just notes about the current development process (e.g., don't leave comments about deleted code)

## Testing Guidelines

- Run `npm run test:ui` to test UI components
- Run `npm run test:ui -- path/to/test.tsx` to run specific UI tests
- Ensure all components are properly wrapped with necessary context providers in tests

### Testing Best Practices

For detailed testing guidelines, see [docs/testing-best-practices.md](docs/testing-best-practices.md)

#### Key Testing Principles

1. **Use Centralized Mock Controllers**: Create a central object with getters/setters to manage mock state reactively across tests.

2. **Avoid Dynamic Requires**: Use static imports after defining all mocks to avoid path resolution issues.

3. **Reset State Between Tests**: Ensure each test starts with a clean state by resetting all mocks in `beforeEach`.

4. **Use Unique IDs**: When testing components that manage sessions or have memory of previous state, use unique IDs in each test.

5. **Test Behaviors Not Implementation**: Focus tests on component behavior rather than implementation details.

6. **Mocking Singletons**: Create mutable state outside the mock, then use getters to reference this state in the mock.

7. **One Render Per Test**: Generally avoid multiple renders in a single test - split into separate tests for clarity.

8. **Handle Reactive Updates**: For components/hooks that are sensitive to prop/state changes, use proper re-rendering patterns.

## Build and Development

- Use `npm run dev` to start the development server

## Commands Reference

### Testing

- **UI Tests** (uses Vitest):
  - `npm run test:ui` - Run all UI tests
  - `npm run test:ui -- path/to/test.tsx` - Run specific UI tests
  - `npm run test:ui:watch` - Run UI tests in watch mode

- **Server Tests** (uses Jest):
  - `npm run test:server` - Run all server tests
  - `npm run test:server -- path/to/test.ts` - Run specific server tests
  - `npm run test:server:watch` - Run server tests in watch mode

### TypeChecking

- `npm run typecheck` - Run TypeScript type checking for all code
- `npm run typecheck:ui` - Run TypeScript type checking for UI code only
- `npm run typecheck:server` - Run TypeScript type checking for server code only

### Linting

- `npm run lint` - Run ESLint on all code
- `npm run lint:fix` - Run ESLint and automatically fix issues
- `npm run lint:ui` - Run ESLint on UI code only
- `npm run lint:server` - Run ESLint on server code only

### Building

- `npm run build` - Build both UI and server code
- `npm run build:ui` - Build UI code only
- `npm run build:server` - Build server code only

Always run appropriate typechecking and linting before committing changes.

## Testing Best Practices Reminders

- **Use Minimal Mocking**: Only mock what's absolutely necessary. Excessive mocking can hide real issues and create brittle tests.
  
- **Be Honest About Underlying Issues**: When a test fails, first investigate if the underlying code has issues. Don't just modify tests or add mocks to make them pass.
  
- **Write Efficient Tests**: Keep tests focused and efficient. Avoid testing implementation details that might change.
  
- **Test Real Behavior**: Tests should verify what the code actually does, not just what you expect it to do.

- **Prefer Integration Tests When Possible**: Pure unit tests with heavy mocking can miss integration issues.

- **Fix Flaky Tests Properly**: If a test is flaky, fix the root cause rather than making the test more permissive.