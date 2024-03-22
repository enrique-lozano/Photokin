/** @type {import('eslint').Linter.Config} */

module.exports = {
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    '@electron-toolkit/eslint-config-ts/recommended'
  ],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 0
  }
};
