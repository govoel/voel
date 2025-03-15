module.exports = {
  extends: ['expo', 'prettier', 'plugin:@tanstack/query/recommended'],
  plugins: ['prettier', 'eslint-plugin-react-compiler'],
  rules: {
    'prettier/prettier': 'error',
    'react-compiler/react-compiler': 'error',
  },
  root: true,
};
