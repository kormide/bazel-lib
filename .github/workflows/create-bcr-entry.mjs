import {
  readFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  writeFileSync,
  appendFileSync,
} from "fs";
import { resolve } from "path";
import https from "https";
import crypto from "crypto";

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
 *   owner_slash_repo: the owner/repoisitory name of the project
 *   version: new version of the project
 *
 */
async function main(argv) {
  console.log(argv);
  if (argv.length !== 4) {
    console.error(
      "usage: create-bcr-entry [project_path] [bcr_path] [owner_slash_repo] [version]"
    );
    process.exit(1);
  }

  const projectPath = argv[0];
  const bcrPath = argv[1];
  const ownerSlashRepo = argv[2];
  const version = normalizeVersion(argv[3]);

  const moduleName = getModuleName(projectPath);
  const bcrEntryPath = resolve(bcrPath, "modules", moduleName);
  const bcrVersionEntryPath = resolve(bcrEntryPath, version);

  writeMetadataFile(bcrEntryPath, projectPath, version);
  mkdirSync(bcrVersionEntryPath);
  writeModuleFile(projectPath, bcrVersionEntryPath, ownerSlashRepo, version);
  await writeSourceFile(
    projectPath,
    bcrVersionEntryPath,
    ownerSlashRepo,
    version
  );
  writePresubmitFile(projectPath, bcrVersionEntryPath);
}

function getModuleName(projectPath) {
  const modulePath = resolve(projectPath, ".bcr", "MODULE.template.bazel");
  const moduleContent = readFileSync(modulePath, { encoding: "utf-8" });

  const regex = /module\(.*?name\s*=\s*"(\w+)"/s;
  const match = moduleContent.match(regex);
  if (match) {
    return match[1];
  }
  throw new Error("Could not parse module name from module file");
}

function writeMetadataFile(bcrEntryPath, projectPath, version) {
  // Copy our template metadata.json file if one doesn't exist (first publish)
  const bcrMetadataPath = resolve(bcrEntryPath, "metadata.json");
  if (!existsSync(bcrMetadataPath)) {
    copyFileSync(
      resolve(projectPath, ".bcr", "metadata.template.json"),
      resolve(bcrEntryPath, "metadata.json")
    );
  }

  // Add the new version to the list of versions
  const metadata = JSON.parse(
    readFileSync(bcrMetadataPath, { encoding: "utf-8" })
  );
  metadata.versions.push(version);
  metadata.versions.sort();

  writeFileSync(bcrMetadataPath, JSON.stringify(metadata, null, 4) + "\n");
}

function writeModuleFile(
  projectPath,
  bcrVersionEntryPath,
  ownerSlashRepo,
  version
) {
  const modulePath = resolve(projectPath, ".bcr", "MODULE.template.bazel");
  const moduleContent = readFileSync(modulePath, { encoding: "utf-8" });

  // Substitute variables into MODULE.bazel
  const newModuleContent = moduleContent
    .replace("REPO_PLACEHOLDER", ownerSlashRepo)
    .replace("VERSION_PLACEHOLDER", version);

  // TODO: Autodetermine compatibility level based on semver major version
  // change from existing versions.

  writeFileSync(
    resolve(bcrVersionEntryPath, "MODULE.bazel"),
    newModuleContent,
    {
      encoding: "utf-8",
    }
  );
}

async function writeSourceFile(
  projectPath,
  bcrVersionEntryPath,
  ownerSlashRepo,
  version
) {
  const sourcePath = resolve(projectPath, ".bcr", "source.template.json");

  // Download release tar
  await download(
    `https://github.com/${ownerSlashRepo}/archive/v${version}.tar.gz`,
    "./artifact.tar.gz"
  );
  const hash = crypto.createHash("sha256");
  hash.update(readFileSync("./artifact.tar.gz"));
  const digest = hash.digest("base64");

  // Substitute version and integrity hash into source.json
  const sourceContent = readFileSync(sourcePath, { encoding: "utf-8" });
  const newSourceContent = sourceContent
    .replace(/VERSION_PLACEHOLDER/g, version)
    .replace(
      "REPO_PLACEHOLDER",
      ownerSlashRepo.substring(ownerSlashRepo.indexOf("/") + 1)
    )
    .replace("OWNER_SLASH_REPO_PLACEHOLDER", ownerSlashRepo)
    .replace("SHA256_PLACEHOLDER", `sha256-${digest}`);
  writeFileSync(resolve(bcrVersionEntryPath, "source.json"), newSourceContent, {
    encoding: "utf-8",
  });
}

function writePresubmitFile(projectPath, bcrVersionEntryPath) {
  const presubmitPath = resolve(projectPath, ".bcr", "presubmit.yml");
  copyFileSync(presubmitPath, resolve(bcrVersionEntryPath, "presubmit.yml"));
}

function normalizeVersion(version) {
  if (version.startsWith("v")) {
    return version.substring(1);
  }
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        response.on("data", (chunk) => {
          appendFileSync(dest, chunk);
        });
        response.on("end", () => {
          resolve();
        });
      })
      .on("error", (err) => {
        reject(new Error(err.message));
      });
  });
}

(async () => {
  const argv = process.argv.slice(2);
  try {
    await main(argv);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
