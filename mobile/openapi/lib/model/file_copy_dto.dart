//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileCopyDto {
  /// Returns a new [FileCopyDto] instance.
  FileCopyDto({
    required this.sourcePath,
    required this.targetPath,
    required this.volumeId,
  });

  /// Virtual path of the file to copy. Directories are not supported.
  String sourcePath;

  /// Virtual path the copy is written to. Its parent must already exist and must be free.
  String targetPath;

  /// Volume holding both the source and the target
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileCopyDto &&
    other.sourcePath == sourcePath &&
    other.targetPath == targetPath &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (sourcePath.hashCode) +
    (targetPath.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileCopyDto[sourcePath=$sourcePath, targetPath=$targetPath, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sourcePath'] = this.sourcePath;
      json[r'targetPath'] = this.targetPath;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileCopyDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileCopyDto? fromJson(dynamic value) {
    upgradeDto(value, "FileCopyDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileCopyDto(
        sourcePath: mapValueOfType<String>(json, r'sourcePath')!,
        targetPath: mapValueOfType<String>(json, r'targetPath')!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileCopyDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileCopyDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileCopyDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileCopyDto> mapFromJson(dynamic json) {
    final map = <String, FileCopyDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileCopyDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileCopyDto-objects as value to a dart map
  static Map<String, List<FileCopyDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileCopyDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileCopyDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'sourcePath',
    'targetPath',
    'volumeId',
  };
}

