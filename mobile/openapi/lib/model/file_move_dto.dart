//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileMoveDto {
  /// Returns a new [FileMoveDto] instance.
  FileMoveDto({
    required this.sourcePath,
    required this.targetPath,
    required this.volumeId,
  });

  /// Virtual path of the entry to move
  String sourcePath;

  /// Virtual path the entry is moved to. Its parent must already exist and must be free.
  String targetPath;

  /// Volume holding both the source and the target
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileMoveDto &&
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
  String toString() => 'FileMoveDto[sourcePath=$sourcePath, targetPath=$targetPath, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'sourcePath'] = this.sourcePath;
      json[r'targetPath'] = this.targetPath;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileMoveDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileMoveDto? fromJson(dynamic value) {
    upgradeDto(value, "FileMoveDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileMoveDto(
        sourcePath: mapValueOfType<String>(json, r'sourcePath')!,
        targetPath: mapValueOfType<String>(json, r'targetPath')!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileMoveDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileMoveDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileMoveDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileMoveDto> mapFromJson(dynamic json) {
    final map = <String, FileMoveDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileMoveDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileMoveDto-objects as value to a dart map
  static Map<String, List<FileMoveDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileMoveDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileMoveDto.listFromJson(entry.value, growable: growable,);
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

