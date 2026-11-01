import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { compile } from "json-schema-to-typescript";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../..");
const backendDirectory = path.join(repositoryRoot, "talos-backend");
const schemaPath = path.join(backendDirectory, "protocol.schema.json");
const typesPath = path.join(repositoryRoot, "talos-ui", "src", "types", "protocol.d.ts");
const checkOnly = process.argv.includes("--check");
const python = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const pythonPath = [backendDirectory, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter);
const exportedSchema = spawnSync(
  python,
  [
    "-c",
    "import json; from talos_backend.protocol import protocol_json_schema; print(json.dumps(protocol_json_schema(), sort_keys=True))",
  ],
  {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, PYTHONPATH: pythonPath },
  },
);

if (exportedSchema.error) {
  throw exportedSchema.error;
}
if (exportedSchema.status !== 0) {
  throw new Error(`Could not export Gateway protocol schema:\n${exportedSchema.stderr}`);
}

const schema = JSON.parse(exportedSchema.stdout);
const protocolFrameSchema = {
  title: "GatewayProtocolFrame",
  oneOf: Object.keys(schema.definitions).map((name) => ({
    $ref: `#/definitions/${name}`,
  })),
  definitions: schema.definitions,
};
const types = await compile(protocolFrameSchema, "GatewayProtocolFrame", {
  bannerComment: "",
});

const generatedFiles = new Map([
  [schemaPath, `${JSON.stringify(schema, null, 2)}\n`],
  [typesPath, `${types.trimEnd()}\n`],
]);
if (checkOnly) {
  const staleFiles = [];
  for (const [filePath, expected] of generatedFiles) {
    let actual;
    try {
      actual = await readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        throw error;
      }
    }
    if (actual !== expected) {
      staleFiles.push(path.relative(repositoryRoot, filePath));
    }
  }
  if (staleFiles.length) {
    throw new Error(
      `Generated protocol files are stale: ${staleFiles.join(", ")}. Run npm run protocol:types.`,
    );
  }
} else {
  await mkdir(path.dirname(typesPath), { recursive: true });
  for (const [filePath, content] of generatedFiles) {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, "utf8");
  }
}
