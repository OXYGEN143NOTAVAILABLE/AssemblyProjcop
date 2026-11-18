import firebaseRulesPlugin from '@firebase/eslint-plugin-security-rules';

export default [
  {
    ignores: [
      'dist/**/*',
      'frontend/**/*',
      'server/**/*',
      'node_modules/**/*',
      'server.mjs',
      '*.mjs',
      '*.js',
    ],
  },
  firebaseRulesPlugin.configs['flat/recommended'],
];
