//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileTrashEmptyDto {
  /// Returns a new [FileTrashEmptyDto] instance.
  FileTrashEmptyDto({
    required this.volumeId,
  });

  /// Volume whose trash is emptied
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileTrashEmptyDto &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (volumeId.hashCode);

  @override
  String toString() => 'FileTrashEmptyDto[volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileTrashEmptyDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileTrashEmptyDto? fromJson(dynamic value) {
    upgradeDto(value, "FileTrashEmptyDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileTrashEmptyDto(
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileTrashEmptyDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileTrashEmptyDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileTrashEmptyDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileTrashEmptyDto> mapFromJson(dynamic json) {
    final map = <String, FileTrashEmptyDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileTrashEmptyDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileTrashEmptyDto-objects as value to a dart map
  static Map<String, List<FileTrashEmptyDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileTrashEmptyDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileTrashEmptyDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'volumeId',
  };
}

