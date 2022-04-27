"Module extensions for use with bzlmod"

load(
    "@aspect_bazel_lib//lib:repositories.bzl",
    "DEFAULT_JQ_VERSION",
    "DEFAULT_YQ_VERSION",
    "register_jq_toolchains",
    "register_yq_toolchains",
)

def _toolchain_extension(_):
    register_yq_toolchains(version = DEFAULT_YQ_VERSION, register = False)
    register_jq_toolchains(version = DEFAULT_JQ_VERSION, register = False)

lib = module_extension(
    implementation = _toolchain_extension,
)
