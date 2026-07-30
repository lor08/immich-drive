//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileVolumeMemberResponseDto {
  /// Returns a new [FileVolumeMemberResponseDto] instance.
  FileVolumeMemberResponseDto({
    required this.access,
    required this.email,
    required this.name,
    required this.userId,
  });

  FileVolumeMemberAccess access;

  /// Email of the member
  String email;

  /// Display name of the member
  String name;

  /// User the membership belongs to
  String userId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileVolumeMemberResponseDto &&
    other.access == access &&
    other.email == email &&
    other.name == name &&
    other.userId == userId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (access.hashCode) +
    (email.hashCode) +
    (name.hashCode) +
    (userId.hashCode);

  @override
  String toString() => 'FileVolumeMemberResponseDto[access=$access, email=$email, name=$name, userId=$userId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'access'] = this.access;
      json[r'email'] = this.email;
      json[r'name'] = this.name;
      json[r'userId'] = this.userId;
    return json;
  }

  /// Returns a new [FileVolumeMemberResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileVolumeMemberResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileVolumeMemberResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileVolumeMemberResponseDto(
        access: FileVolumeMemberAccess.fromJson(json[r'access'])!,
        email: mapValueOfType<String>(json, r'email')!,
        name: mapValueOfType<String>(json, r'name')!,
        userId: mapValueOfType<String>(json, r'userId')!,
      );
    }
    return null;
  }

  static List<FileVolumeMemberResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileVolumeMemberResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileVolumeMemberResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileVolumeMemberResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileVolumeMemberResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileVolumeMemberResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileVolumeMemberResponseDto-objects as value to a dart map
  static Map<String, List<FileVolumeMemberResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileVolumeMemberResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileVolumeMemberResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'access',
    'email',
    'name',
    'userId',
  };
}

