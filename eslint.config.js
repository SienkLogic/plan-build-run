const js = require('@eslint/js');

const commonGlobals = {
  require: 'readonly',
  module: 'readonly',
  exports: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  URL: 'readonly',
  TextEncoder: 'readonly',
  TextDecoder: 'readonly',
};

const relaxedUnusedVars = ['warn', {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
  destructuredArrayIgnorePattern: '^_'
}];

module.exports = [
  js.configs.recommended,
  {
    ignores: ['plugins/pbr/scripts/test/**']
  },
  {
    files: ['plugins/pbr/scripts/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: commonGlobals
    },
    rules: {
      'no-unused-vars': relaxedUnusedVars,
      'no-useless-assignment': 'off'
    }
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        ...commonGlobals,
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      }
    },
    rules: {
      'no-unused-vars': relaxedUnusedVars,
      'no-useless-assignment': 'off'
    }
  }
];
