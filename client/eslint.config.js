import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    settings: {
      // lets the rules see through our wrappers
      // router links are left out, they use `to` rather than `href`
      'jsx-a11y': {
        components: { Button: 'button', Thumbnail: 'img', Row: 'li' },
      },
    },
    rules: {
      // clickable Row is not keyboard operable yet, warn until it is reworked
      'jsx-a11y/click-events-have-key-events': 'warn',
      'jsx-a11y/no-noninteractive-element-interactions': 'warn',
      eqeqeq: 'error',
      // wants Suspense/use() or a query library instead of useEffect+useState
      // too big a shift for this app right now, off by choice
      'react-hooks/set-state-in-effect': 'off',
    },
  },
])
