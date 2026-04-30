import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    cli: "src/cli.ts",
    daemon: "src/daemon.ts",
    index: "src/index.ts",
  },
  format: ["esm"],
  target: "node22",
  platform: "node",
  splitting: false,
  clean: true,
  sourcemap: true,
  dts: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
