//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileTrashRestoreDto {
  /// Returns a new [FileTrashRestoreDto] instance.
  FileTrashRestoreDto({
    this.targetPath = const Optional.absent(),
    required this.trashId,
    required this.volumeId,
  });

  /// Where to restore the entry. Defaults to the path it came from; required when that is unknown, and the way to resolve a conflict at it.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<String?> targetPath;

  /// Identifier of the trash record to restore
  String trashId;

  /// Volume holding the record
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileTrashRestoreDto &&
    other.targetPath == targetPath &&
    other.trashId == trashId &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (targetPath == null ? 0 : targetPath!.hashCode) +
    (trashId.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileTrashRestoreDto[targetPath=$targetPath, trashId=$trashId, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.targetPath.isPresent) {
      final value = this.targetPath.value;
      json[r'targetPath'] = value;
    }
      json[r'trashId'] = this.trashId;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileTrashRestoreDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileTrashRestoreDto? fromJson(dynamic value) {
    upgradeDto(value, "FileTrashRestoreDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileTrashRestoreDto(
        targetPath: json.containsKey(r'targetPath') ? Optional.present(mapValueOfType<String>(json, r'targetPath')) : const Optional.absent(),
        trashId: mapValueOfType<String>(json, r'trashId')!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileTrashRestoreDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileTrashRestoreDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileTrashRestoreDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileTrashRestoreDto> mapFromJson(dynamic json) {
    final map = <String, FileTrashRestoreDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileTrashRestoreDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileTrashRestoreDto-objects as value to a dart map
  static Map<String, List<FileTrashRestoreDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileTrashRestoreDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileTrashRestoreDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'trashId',
    'volumeId',
  };
}

