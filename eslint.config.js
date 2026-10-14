import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

// Spec §3.7: color literals are only allowed in src/styles/tokens.css.
// esquery drops backslashes inside selector regexes, so these patterns avoid escapes.
const COLOR_MESSAGE = "Color literal found. Use a design token (CSS custom property or the Theme bridge).";
const HEX = "/(^|[^&0-9A-Za-z_])#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})([^0-9A-Za-z_]|$)/";
const COLOR_FN = "/(^|[^A-Za-z])(rgba?|hsla?)[(]/";

export default tseslint.config(
  { ignores: ["dist/", "node_modules/", "coverage/"] },
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "no-restricted-syntax": [
        "error",
        { selector: `Literal[value=${HEX}]`, message: COLOR_MESSAGE },
        { selector: `Literal[value=${COLOR_FN}]`, message: COLOR_MESSAGE },
        { selector: `TemplateElement[value.raw=${HEX}]`, message: COLOR_MESSAGE },
        { selector: `TemplateElement[value.raw=${COLOR_FN}]`, message: COLOR_MESSAGE },
      ],
    },
  },
);
