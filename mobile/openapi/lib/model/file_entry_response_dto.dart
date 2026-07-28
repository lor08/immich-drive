//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileEntryResponseDto {
  /// Returns a new [FileEntryResponseDto] instance.
  FileEntryResponseDto({
    required this.modifiedAt,
    required this.name,
    required this.path,
    required this.size,
    required this.type,
  });

  /// Last modification time
  DateTime modifiedAt;

  /// Base name of the entry
  String name;

  /// Virtual path of the entry within its volume
  String path;

  /// Size in bytes as reported by the storage backend
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int size;

  FileEntryType type;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileEntryResponseDto &&
    other.modifiedAt == modifiedAt &&
    other.name == name &&
    other.path == path &&
    other.size == size &&
    other.type == type;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (modifiedAt.hashCode) +
    (name.hashCode) +
    (path.hashCode) +
    (size.hashCode) +
    (type.hashCode);

  @override
  String toString() => 'FileEntryResponseDto[modifiedAt=$modifiedAt, name=$name, path=$path, size=$size, type=$type]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'modifiedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')
        ? this.modifiedAt.millisecondsSinceEpoch
        : this.modifiedAt.toUtc().toIso8601String();
      json[r'name'] = this.name;
      json[r'path'] = this.path;
      json[r'size'] = this.size;
      json[r'type'] = this.type;
    return json;
  }

  /// Returns a new [FileEntryResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileEntryResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileEntryResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileEntryResponseDto(
        modifiedAt: mapDateTime(json, r'modifiedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')!,
        name: mapValueOfType<String>(json, r'name')!,
        path: mapValueOfType<String>(json, r'path')!,
        size: mapValueOfType<int>(json, r'size')!,
        type: FileEntryType.fromJson(json[r'type'])!,
      );
    }
    return null;
  }

  static List<FileEntryResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileEntryResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileEntryResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileEntryResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileEntryResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileEntryResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileEntryResponseDto-objects as value to a dart map
  static Map<String, List<FileEntryResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileEntryResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileEntryResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'modifiedAt',
    'name',
    'path',
    'size',
    'type',
  };
}

