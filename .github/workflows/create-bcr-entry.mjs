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
 * Create a bcr entry for a new version of this repository.
 *
 * Usage: create-bcr-entry [project_path] [bcr_path] [version]
 *
 *   project_path: path to the project's repository; should contain a
 *      root level MODULE.bazel file and a .bcr folder with templated
 *      bcr entry files.
 *   bcr_path: path to the bcr repository
 *   owner_slash_repo: the github owner/repository name of the project
 *   version: new version of the project
 *
 */
async function main(argv) {
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

  updateMetadataFile(
    resolve(projectPath, ".bcr", "metadata.template.json"),
    resolve(bcrEntryPath, "metadata.json"),
    version
  );

  mkdirSync(bcrVersionEntryPath);

  stampModuleFile(
    resolve(projectPath, "MODULE.bazel"),
    resolve(bcrVersionEntryPath, "MODULE.bazel"),
    version
  );

  await stampSourceFile(
    resolve(projectPath, ".bcr", "source.template.json"),
    resolve(bcrVersionEntryPath, "source.json"),
    ownerSlashRepo,
    version
  );

  // Copy over the presubmit file
  copyFileSync(
    resolve(projectPath, ".bcr", "presubmit.yml"),
    resolve(bcrVersionEntryPath, "presubmit.yml")
  );
}

function getModuleName(projectPath) {
  const modulePath = resolve(projectPath, "MODULE.bazel");
  const moduleContent = readFileSync(modulePath, { encoding: "utf-8" });

  const regex = /module\(.*?name\s*=\s*"(\w+)"/s;
  const match = moduleContent.match(regex);
  if (match) {
    return match[1];
  }
  throw new Error("Could not parse module name from module file");
}

function updateMetadataFile(sourcePath, destPath, version) {
  let publishedVersions = [];
  if (existsSync(destPath)) {
    const existingMetadata = JSON.parse(
      readFileSync(destPath, { encoding: "utf-8" })
    );
    publishedVersions = existingMetadata.versions;
  }

  const metadata = JSON.parse(readFileSync(sourcePath), { encoding: "utf-8" });
  metadata.versions = [...publishedVersions, version];
  metadata.versions.sort();

  writeFileSync(destPath, JSON.stringify(metadata, null, 4) + "\n");
}

function stampModuleFile(sourcePath, destPath, version) {
  const module = readFileSync(sourcePath, { encoding: "utf-8" });
  const stampedModule = module.replace(
    /(^.*?module\(.*?version\s*=\s*")[\w.]+(".*$)/s,
    `$1${version}$2`
  );

  writeFileSync(destPath, stampedModule, {
    encoding: "utf-8",
  });
}

async function stampSourceFile(sourcePath, destPath, ownerSlashRepo, version) {
  await download(
    `https://github.com/${ownerSlashRepo}/archive/v${version}.tar.gz`,
    "./artifact.tar.gz"
  );
  const hash = crypto.createHash("sha256");
  hash.update(readFileSync("./artifact.tar.gz"));
  const digest = hash.digest("base64");

  // Substitute version and integrity hash into source.json
  const source = readFileSync(sourcePath, { encoding: "utf-8" });
  const newSource = source
    .replace(/VERSION_PLACEHOLDER/g, version)
    .replace(
      "REPO_PLACEHOLDER",
      ownerSlashRepo.substring(ownerSlashRepo.indexOf("/") + 1)
    )
    .replace("OWNER_SLASH_REPO_PLACEHOLDER", ownerSlashRepo)
    .replace("SHA256_PLACEHOLDER", `sha256-${digest}`);

  writeFileSync(destPath, newSource, {
    encoding: "utf-8",
  });
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
