# Contributing

1. `npm install`
2. `npm test` (builds, then runs unit tests with a mocked fetch; no network)
3. `npm run lint && npm run typecheck`

Try it locally against a client: `TRACKIFIED_API_KEY=tk_test_… npx @modelcontextprotocol/inspector node dist/index.js`.
Never commit API keys. Open a pull request against `main`; keep changes small and add a test.
