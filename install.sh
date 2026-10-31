#!/usr/bin/env bash
set -euo pipefail

package_source="${AMIGO_PACKAGE_SOURCE:-talos-backend}"
python_version="${AMIGO_PYTHON_VERSION:-3.13}"

fail() {
  printf 'Amigo installer: %s\n' "$1" >&2
  exit 1
}

[[ "$python_version" =~ ^3\.(1[2-9]|[2-9][0-9])$ ]] || fail "AMIGO_PYTHON_VERSION must be Python 3.12 or newer"

case "$package_source" in
  https://*|git+https://*)
    case "$package_source" in
      *\?*|*\#*|*://*@*) fail "package source URLs may not contain credentials, query strings, or fragments" ;;
    esac
    ;;
  *)
    if [[ "$package_source" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
      :
    elif [[ -e "$package_source" ]]; then
      package_source="$(cd "$(dirname "$package_source")" && printf '%s/%s' "$PWD" "$(basename "$package_source")")"
    else
      fail "package source must be a package name, HTTPS URL, or existing local path"
    fi
    ;;
esac

if ! command -v uv >/dev/null 2>&1; then
  command -v curl >/dev/null 2>&1 || fail "curl is required to install uv"
  command -v sh >/dev/null 2>&1 || fail "sh is required to install uv"
  curl --proto '=https' --tlsv1.2 -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="${HOME}/.local/bin:${HOME}/.cargo/bin:${PATH}"
fi

command -v uv >/dev/null 2>&1 || fail "uv installation completed but uv is not on PATH"
uv tool install --python "$python_version" --upgrade -- "$package_source"

tool_bin="$(uv tool dir --bin)"
[[ -d "$tool_bin" ]] || fail "uv tool executable directory is missing"
if [[ "${AMIGO_UPDATE_PATH:-1}" == "1" ]]; then
  uv tool update-shell
fi

printf 'Amigo CLI installed. Open a new terminal if needed, then run: amigo onboard\n'
printf 'To install from a non-default source, set AMIGO_PACKAGE_SOURCE to its HTTPS URL or local path.\n'
