//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileVolumeResponseDto {
  /// Returns a new [FileVolumeResponseDto] instance.
  FileVolumeResponseDto({
    required this.access,
    required this.id,
    required this.kind,
    required this.name,
  });

  FileVolumeAccess access;

  /// Stable volume identifier used to address content
  String id;

  FileVolumeKind kind;

  /// Display name
  String name;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileVolumeResponseDto &&
    other.access == access &&
    other.id == id &&
    other.kind == kind &&
    other.name == name;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (access.hashCode) +
    (id.hashCode) +
    (kind.hashCode) +
    (name.hashCode);

  @override
  String toString() => 'FileVolumeResponseDto[access=$access, id=$id, kind=$kind, name=$name]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'access'] = this.access;
      json[r'id'] = this.id;
      json[r'kind'] = this.kind;
      json[r'name'] = this.name;
    return json;
  }

  /// Returns a new [FileVolumeResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileVolumeResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileVolumeResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileVolumeResponseDto(
        access: FileVolumeAccess.fromJson(json[r'access'])!,
        id: mapValueOfType<String>(json, r'id')!,
        kind: FileVolumeKind.fromJson(json[r'kind'])!,
        name: mapValueOfType<String>(json, r'name')!,
      );
    }
    return null;
  }

  static List<FileVolumeResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileVolumeResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileVolumeResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileVolumeResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileVolumeResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileVolumeResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileVolumeResponseDto-objects as value to a dart map
  static Map<String, List<FileVolumeResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileVolumeResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileVolumeResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'access',
    'id',
    'kind',
    'name',
  };
}

