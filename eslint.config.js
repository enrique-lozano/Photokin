import eslint from '@eslint/js';
import react from 'eslint-plugin-react';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Project convention: private members are prefixed with `_`.
const privateMemberNaming = [
  {
    selector: 'method',
    modifiers: ['private'],
    format: ['camelCase'],
    leadingUnderscore: 'require',
  },
];

// Project convention: module-private (non-exported) top-level functions are
// prefixed with `_`. Only `function` declarations can be reliably targeted:
// the `global` modifier matches top-level declarations, while `exported`
// (listed first, so it wins on ties) exempts the public API. Arrow functions
// assigned to a `const` are matched by the `variable` selector, which can't be
// distinguished from data constants, so those are left as a manual convention.
const moduleFunctionNaming = [
  {
    selector: 'function',
    modifiers: ['exported'],
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'allow',
  },
  {
    selector: 'function',
    modifiers: ['global'],
    format: ['camelCase', 'PascalCase'],
    leadingUnderscore: 'require',
  },
];

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'src-tauri/target'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{tsx,jsx}'],
    plugins: {
      react,
    },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      'react/prop-types': 'off',
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    // Private methods are placed last and prefixed with `_` (applies to ts + tsx).
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/member-ordering': [
        'warn',
        {
          default: {
            memberTypes: [
              ['public-static-method', 'protected-static-method', 'public-method', 'protected-method'],
              ['private-static-method', 'private-method', '#private-static-method', '#private-method'],
            ],
          },
        },
      ],
      '@typescript-eslint/naming-convention': ['error', ...privateMemberNaming],
    },
  },
  {
    // Additionally enforce module-private function prefixing in plain `.ts` files.
    // (This block overrides naming-convention for `.ts`, so it re-includes the
    // private-member selectors above.)
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/naming-convention': ['error', ...privateMemberNaming, ...moduleFunctionNaming],
    },
  },
);
