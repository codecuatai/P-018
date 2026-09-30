/** @type {import('jest').Config} */
const config = {
  clearMocks: true,
  moduleFileExtensions: ["ts", "tsx", "js"],
  setupFilesAfterEnv: ["<rootDir>/src/test/setup.ts"],
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/src/**/*.test.ts", "<rootDir>/src/**/*.test.tsx"],
  moduleNameMapper: {
    "^.+\\.css$": "<rootDir>/src/test/style-mock.cjs",
    "^@/(.*)$": "<rootDir>/src/$1",
    // pnpm stores peer dependency variants in separate paths. Pin all React
    // entry points to the app's installed copy so Jest and React DOM share the
    // same hook dispatcher instead of loading duplicate React modules.
    "^react$": "<rootDir>/node_modules/react",
    "^react/jsx-runtime$": "<rootDir>/node_modules/react/jsx-runtime",
    "^react/jsx-dev-runtime$": "<rootDir>/node_modules/react/jsx-dev-runtime",
    "^react-dom$": "<rootDir>/node_modules/react-dom",
  },
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
};

export default config;
