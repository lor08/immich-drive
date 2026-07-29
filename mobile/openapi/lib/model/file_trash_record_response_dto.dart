//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileTrashRecordResponseDto {
  /// Returns a new [FileTrashRecordResponseDto] instance.
  FileTrashRecordResponseDto({
    required this.deletedAt,
    required this.id,
    required this.name,
    required this.originalPath,
    required this.size,
    required this.type,
  });

  /// When the entry was deleted, or null when unknown
  DateTime? deletedAt;

  /// Identifier of the trash record
  String id;

  /// Base name the entry had when it was deleted
  String name;

  /// Virtual path the entry came from, or null when the record manifest is unreadable
  String? originalPath;

  /// Size in bytes as reported by the storage backend
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int size;

  FileEntryType type;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileTrashRecordResponseDto &&
    other.deletedAt == deletedAt &&
    other.id == id &&
    other.name == name &&
    other.originalPath == originalPath &&
    other.size == size &&
    other.type == type;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (deletedAt == null ? 0 : deletedAt!.hashCode) +
    (id.hashCode) +
    (name.hashCode) +
    (originalPath == null ? 0 : originalPath!.hashCode) +
    (size.hashCode) +
    (type.hashCode);

  @override
  String toString() => 'FileTrashRecordResponseDto[deletedAt=$deletedAt, id=$id, name=$name, originalPath=$originalPath, size=$size, type=$type]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.deletedAt != null) {
      json[r'deletedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')
        ? this.deletedAt!.millisecondsSinceEpoch
        : this.deletedAt!.toUtc().toIso8601String();
    } else {
      json[r'deletedAt'] = null;
    }
      json[r'id'] = this.id;
      json[r'name'] = this.name;
    if (this.originalPath != null) {
      json[r'originalPath'] = this.originalPath;
    } else {
      json[r'originalPath'] = null;
    }
      json[r'size'] = this.size;
      json[r'type'] = this.type;
    return json;
  }

  /// Returns a new [FileTrashRecordResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileTrashRecordResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileTrashRecordResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileTrashRecordResponseDto(
        deletedAt: mapDateTime(json, r'deletedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/'),
        id: mapValueOfType<String>(json, r'id')!,
        name: mapValueOfType<String>(json, r'name')!,
        originalPath: mapValueOfType<String>(json, r'originalPath'),
        size: mapValueOfType<int>(json, r'size')!,
        type: FileEntryType.fromJson(json[r'type'])!,
      );
    }
    return null;
  }

  static List<FileTrashRecordResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileTrashRecordResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileTrashRecordResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileTrashRecordResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileTrashRecordResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileTrashRecordResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileTrashRecordResponseDto-objects as value to a dart map
  static Map<String, List<FileTrashRecordResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileTrashRecordResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileTrashRecordResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'deletedAt',
    'id',
    'name',
    'originalPath',
    'size',
    'type',
  };
}

