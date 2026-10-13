import nextConfig from "eslint-config-next";
import reactPlugin from "eslint-plugin-react";
import noUnsanitizedPlugin from "eslint-plugin-no-unsanitized";

const config = [
  ...nextConfig,
  {
    plugins: {
      react: reactPlugin,
      "no-unsanitized": noUnsanitizedPlugin,
    },
    rules: {
      "react/no-danger": "error",
      "no-unsanitized/method": "error",
      "no-unsanitized/property": "error",
    },
  },
];

export default config;
