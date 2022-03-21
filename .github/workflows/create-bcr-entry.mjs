import {
  readFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  writeFileSync,
} from "fs";
import { resolve } from "path";

/**
 * Create a bcr entry for a new version of this repository. Assumes the
 * project and bcr repositories are checked out locally. After running,
 * the local bcr changes should be committed and PR'ed.
 *
 * Usage: create-bcr-entry [project_path] [bcr_path] [version]
 *
 *   project_path: path to the project's repository; should contain a
 *      .bcr folder with MODULE.bazel and templated bcr entry files.
 *   bcr_path: path to the bcr repository
 *   version: new version of the project
 *
 */
function main(argv) {
  console.log(argv);
  if (argv.length !== 3) {
    console.error(
      "usage: create-bcr-entry [project_path] [bcr_path] [version]"
    );
    process.exit(1);
  }

  const projectPath = argv[0];
  const modulePath = resolve(projectPath, ".bcr", "MODULE.bazel");
  const sourcePath = resolve(projectPath, ".bcr", "source.json");
  const bcrPath = argv[1];
  const version = normalizeVersion(argv[2]);
  const moduleContent = readFileSync(modulePath, { encoding: "utf-8" });
  const moduleName = getModuleName(moduleContent);
  const bcrEntryPath = resolve(bcrPath, "modules", moduleName);
  const bcrVersionEntryPath = resolve(bcrEntryPath, version);

  mkdirSync(bcrVersionEntryPath);

  // Create a metadata.json file if one doesn't exist
  const metadataPath = resolve(bcrEntryPath, "metadata.json");
  if (!existsSync(metadataPath)) {
    copyFileSync(
      resolve(projectPath, ".bcr", "metadata.json"),
      resolve(bcrEntryPath, "metadata.json")
    );
  }

  // Add new version to metadata.json
  const metadata = import(metadataPath);
  metadata.versions.push(version);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 4));

  // Substitute version into MODULE.bazel
  moduleContent = moduleContent.replace("VERSION_PLACEHOLDER", version);
  writeFileSync(resolve(bcrVersionEntryPath, "MODULE.bazel"), moduleContent, {
    encoding: "utf-8",
  });

  // TODO: Set compat basaed on major version difference

  // Substitute version and integrity hash into source.json
  const sourceContent = readFileSync(sourcePath, { encoding: "utf-8" });
  sourceContent = sourceContent
    .replace("VERSION_PLACEHOLDER", version)
    .replace("SHA256_PLACEHOLDER", "");
}

function getModuleName(moduleContent) {
  const regex = /module\(.*?name\s*=\s*"(\w+)"/s;
  const match = moduleContent.match(regex);
  if (match) {
    return match[1];
  }
  throw new Error("Could not parse module name from module file");
}

function normalizeVersion(version) {
  if (version.startsWith("v")) {
    return version.substring(1);
  }
}

const argv = process.argv.slice(2);
main(argv);
