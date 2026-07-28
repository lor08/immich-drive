//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileFolderCreateDto {
  /// Returns a new [FileFolderCreateDto] instance.
  FileFolderCreateDto({
    required this.path,
    required this.volumeId,
  });

  /// Virtual path of the folder to create. The parent must already exist.
  String path;

  /// Volume to create the folder in
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileFolderCreateDto &&
    other.path == path &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (path.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileFolderCreateDto[path=$path, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'path'] = this.path;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileFolderCreateDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileFolderCreateDto? fromJson(dynamic value) {
    upgradeDto(value, "FileFolderCreateDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileFolderCreateDto(
        path: mapValueOfType<String>(json, r'path')!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileFolderCreateDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileFolderCreateDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileFolderCreateDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileFolderCreateDto> mapFromJson(dynamic json) {
    final map = <String, FileFolderCreateDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileFolderCreateDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileFolderCreateDto-objects as value to a dart map
  static Map<String, List<FileFolderCreateDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileFolderCreateDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileFolderCreateDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'path',
    'volumeId',
  };
}

