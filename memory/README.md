# Node memory monitor notes

Generated CSV files in this folder are ignored by Git.

Interpretation tips:

- The relevant Next.js dev worker usually appears as `next/dist/server/lib/start-server.js`.
- More than one `start-server.js` process usually means more than one dev server is running or an old dev server was not stopped cleanly.
- `--max-old-space-size` limits V8 old-space heap, not total private memory, so private memory can exceed that number.
- A healthy dev session often rises during first compilation and route compilation, then roughly plateaus.
- A suspicious session keeps growing after repeated navigations/rebuilds without stabilizing.
