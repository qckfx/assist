# Claude Code Guidelines for qckfx

## Branding and Naming Conventions

- **Product name spelling**: Always spell "qckfx" with all lowercase letters. Never capitalize as "QCKFX" or "Qckfx".

## Code Style

- Follow existing code conventions in the codebase
- Maintain consistent formatting across components
- Use CSS variables for theming when available

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