//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileTrashReportDto {
  /// Returns a new [FileTrashReportDto] instance.
  FileTrashReportDto({
    required this.damaged,
    required this.expired,
    required this.foreign,
    required this.orphanedManifests,
    required this.records,
  });

  /// Records whose manifest could not be read
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int damaged;

  /// Records removed because they exceeded the configured retention
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int expired;

  /// Entries in the trash that are not records and are left alone
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int foreign;

  /// Manifests whose content is missing
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int orphanedManifests;

  /// Records the trash holds
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int records;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileTrashReportDto &&
    other.damaged == damaged &&
    other.expired == expired &&
    other.foreign == foreign &&
    other.orphanedManifests == orphanedManifests &&
    other.records == records;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (damaged.hashCode) +
    (expired.hashCode) +
    (foreign.hashCode) +
    (orphanedManifests.hashCode) +
    (records.hashCode);

  @override
  String toString() => 'FileTrashReportDto[damaged=$damaged, expired=$expired, foreign=$foreign, orphanedManifests=$orphanedManifests, records=$records]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'damaged'] = this.damaged;
      json[r'expired'] = this.expired;
      json[r'foreign'] = this.foreign;
      json[r'orphanedManifests'] = this.orphanedManifests;
      json[r'records'] = this.records;
    return json;
  }

  /// Returns a new [FileTrashReportDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileTrashReportDto? fromJson(dynamic value) {
    upgradeDto(value, "FileTrashReportDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileTrashReportDto(
        damaged: mapValueOfType<int>(json, r'damaged')!,
        expired: mapValueOfType<int>(json, r'expired')!,
        foreign: mapValueOfType<int>(json, r'foreign')!,
        orphanedManifests: mapValueOfType<int>(json, r'orphanedManifests')!,
        records: mapValueOfType<int>(json, r'records')!,
      );
    }
    return null;
  }

  static List<FileTrashReportDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileTrashReportDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileTrashReportDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileTrashReportDto> mapFromJson(dynamic json) {
    final map = <String, FileTrashReportDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileTrashReportDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileTrashReportDto-objects as value to a dart map
  static Map<String, List<FileTrashReportDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileTrashReportDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileTrashReportDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'damaged',
    'expired',
    'foreign',
    'orphanedManifests',
    'records',
  };
}

