#!/usr/bin/env bash
OPENAPI_GENERATOR_VERSION=v7.24.0

set -euo pipefail

# usage: ./bin/generate-dart-sdk.sh [--refresh-templates]
#
# The mustache templates under ./templates/mobile are committed in their final, patched form, so
# generation needs no network access to fetch them. They used to be downloaded and patched on every
# run, which made a required check depend on raw.githubusercontent.com being reachable — it once was
# not, and the check failed with no fault in the code.
#
# Pass --refresh-templates when bumping OPENAPI_GENERATOR_VERSION: it re-downloads the upstream
# templates and re-applies the patches, so the committed copies match the new generator. The
# .patch files are kept for exactly that purpose. Review the resulting diff before committing.

if [[ "${1:-}" == "--refresh-templates" ]]; then
  cd ./templates/mobile/serialization/native
  wget -O native_class.mustache https://raw.githubusercontent.com/OpenAPITools/openapi-generator/$OPENAPI_GENERATOR_VERSION/modules/openapi-generator/src/main/resources/dart2/serialization/native/native_class.mustache
  patch --no-backup-if-mismatch -u native_class.mustache <native_class.mustache.patch

  cd ../../
  wget -O api.mustache https://raw.githubusercontent.com/OpenAPITools/openapi-generator/$OPENAPI_GENERATOR_VERSION/modules/openapi-generator/src/main/resources/dart2/api.mustache
  patch --no-backup-if-mismatch -u api.mustache <api.mustache.patch

  cd ../../
  echo "Templates refreshed for $OPENAPI_GENERATOR_VERSION. Review the diff, then run without the flag."
  exit 0
fi

rm -rf ../mobile/openapi

pnpm dlx --allow-build="" @openapitools/openapi-generator-cli generate -g dart -i ./immich-openapi-specs.json -o ../mobile/openapi -t ./templates/mobile --additional-properties=useOptional=true

# Post generate patches
patch --no-backup-if-mismatch -u ../mobile/openapi/lib/api_client.dart <./patch/api_client.dart.patch
patch --no-backup-if-mismatch -u ../mobile/openapi/lib/api.dart <./patch/api.dart.patch
patch --no-backup-if-mismatch -u ../mobile/openapi/pubspec.yaml <./patch/pubspec_immich_mobile.yaml.patch
patch --no-backup-if-mismatch -u ../mobile/openapi/lib/model/asset_edit_action_item_dto.dart <./patch/asset_edit_action_item_dto.dart.patch
# Don't include analysis_options.yaml for the generated openapi files
# so that language servers can properly exclude the mobile/openapi directory
rm ../mobile/openapi/analysis_options.yaml
