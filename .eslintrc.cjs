module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime'
  ],
  ignorePatterns: ['dist', 'out', 'node_modules', '*.cjs'],
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  plugins: ['@typescript-eslint', 'react'],
  settings: { react: { version: '18' } },
  overrides: [
    {
      files: ['electron/**/*.ts', '*.config.ts'],
      env: { node: true }
    }
  ]
}
