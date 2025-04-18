module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended'
  ],
  rules: {
    // Apply consistent rules across the codebase
    '@typescript-eslint/no-unused-vars': ['error', { 
      // Allow unused parameters prefixed with underscore
      'argsIgnorePattern': '^_',
      // Only allow unused variables prefixed with underscore
      'varsIgnorePattern': '^_' 
    }],
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/ban-ts-comment': ['error', {
      // Require explanations for ts-expect-error
      'ts-expect-error': 'allow-with-description',
      // Disallow ts-ignore as it's less specific
      'ts-ignore': false 
    }],
    // Prevent direct use of contextWindow.push() outside of tests
    'no-restricted-syntax': [
      'error',
      {
        'selector': 'MemberExpression[property.name="push"][object.property.name="contextWindow"], MemberExpression[property.name="push"][object.object.property.name="contextWindow"]',
        'message': 'Direct use of contextWindow.push() is forbidden. Use typed methods like pushUser(), pushAssistant(), pushToolUse(), or pushToolResult() instead.'
      }
    ]
  },
  env: {
    node: true,
    es6: true
  },
  overrides: [
    {
      // Test files can have slightly more flexible rules
      files: ['**/__tests__/**', '**/*.test.{ts,tsx}'],
      rules: {
        // Warn about any but don't break the build for tests
        '@typescript-eslint/no-explicit-any': 'warn',
        // Allow expect.any(X) pattern in tests
        '@typescript-eslint/no-unsafe-argument': 'off',
        // Allow direct use of contextWindow.push() in tests
        'no-restricted-syntax': 'off'
      }
    }
  ]
};