import type { PickierConfig } from 'pickier'

const config: PickierConfig = {
  lint: {
    extensions: ['ts', 'js', 'json', 'yaml', 'md'],
  },

  format: {
    extensions: ['ts', 'js', 'json', 'yaml', 'md'],
    indent: 2,
    quotes: 'single',
    semi: false,
    trailingComma: true,
  },

  rules: {
    'no-unused-vars': 'warn',
    'no-console': 'off',
  },

  pluginRules: {
    'markdown/heading-increment': 'error',
    'markdown/no-empty-links': 'error',
  },

  ignore: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/.git/**',
  ],
}

export default config
