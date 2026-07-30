//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileVolumeMemberAddDto {
  /// Returns a new [FileVolumeMemberAddDto] instance.
  FileVolumeMemberAddDto({
    this.access = const Optional.absent(),
    required this.userId,
    required this.volumeId,
  });

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<FileVolumeMemberAccess?> access;

  /// User to add
  String userId;

  /// Shared volume to add the member to
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileVolumeMemberAddDto &&
    other.access == access &&
    other.userId == userId &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (access == null ? 0 : access!.hashCode) +
    (userId.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileVolumeMemberAddDto[access=$access, userId=$userId, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.access.isPresent) {
      final value = this.access.value;
      json[r'access'] = value;
    }
      json[r'userId'] = this.userId;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileVolumeMemberAddDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileVolumeMemberAddDto? fromJson(dynamic value) {
    upgradeDto(value, "FileVolumeMemberAddDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileVolumeMemberAddDto(
        access: json.containsKey(r'access') ? Optional.present(FileVolumeMemberAccess.fromJson(json[r'access'])) : const Optional.absent(),
        userId: mapValueOfType<String>(json, r'userId')!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileVolumeMemberAddDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileVolumeMemberAddDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileVolumeMemberAddDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileVolumeMemberAddDto> mapFromJson(dynamic json) {
    final map = <String, FileVolumeMemberAddDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileVolumeMemberAddDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileVolumeMemberAddDto-objects as value to a dart map
  static Map<String, List<FileVolumeMemberAddDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileVolumeMemberAddDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileVolumeMemberAddDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'userId',
    'volumeId',
  };
}

