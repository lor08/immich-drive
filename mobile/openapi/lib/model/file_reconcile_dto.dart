//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileReconcileDto {
  /// Returns a new [FileReconcileDto] instance.
  FileReconcileDto({
    this.limit = const Optional.absent(),
    required this.volumeId,
  });

  /// Maximum directories to reconcile before saving a checkpoint and returning
  ///
  /// Minimum value: 0
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<int?> limit;

  /// Volume to reconcile
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileReconcileDto &&
    other.limit == limit &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (limit == null ? 0 : limit!.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileReconcileDto[limit=$limit, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.limit.isPresent) {
      final value = this.limit.value;
      json[r'limit'] = value;
    }
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileReconcileDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileReconcileDto? fromJson(dynamic value) {
    upgradeDto(value, "FileReconcileDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileReconcileDto(
        limit: json.containsKey(r'limit') ? Optional.present(json[r'limit'] == null ? null : int.parse('${json[r'limit']}')) : const Optional.absent(),
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileReconcileDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileReconcileDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileReconcileDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileReconcileDto> mapFromJson(dynamic json) {
    final map = <String, FileReconcileDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileReconcileDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileReconcileDto-objects as value to a dart map
  static Map<String, List<FileReconcileDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileReconcileDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileReconcileDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'volumeId',
  };
}

