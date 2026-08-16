// eslint-config-next v16 ships native flat configs, so they are spread in
// directly. The create-next-app boilerplate used to route them through
// FlatCompat from @eslint/eslintrc — the legacy-to-flat bridge — which tried to
// validate already-flat arrays as old eslintrc objects and crashed on the
// self-referencing plugin objects inside them ("Converting circular structure
// to JSON"). That left the whole repo unlinted.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      ".agents/**",
      // Untracked developer scripts, not part of the app.
      "scratch/**",
      // Service worker: browser globals, not app code.
      "public/sw.js",
      // Root-level *.js are one-off codemod scripts (fix_imports, fix_padding,
      // replace_loading, …), plain CommonJS rather than app source.
      "*.js",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off",
    },
  },
];

export default eslintConfig;
