//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileVolumeHealthResponseDto {
  /// Returns a new [FileVolumeHealthResponseDto] instance.
  FileVolumeHealthResponseDto({
    required this.indexedEntries,
    required this.reason,
    required this.resumeFrom,
    required this.scannedAt,
    required this.state,
    required this.volumeId,
  });

  /// Entries the index currently holds for this volume
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int indexedEntries;

  /// Reason the volume is unhealthy or unverified
  FileVolumeHealthReason? reason;

  /// Virtual path an interrupted pass will resume from
  String? resumeFrom;

  /// When a pass last completed
  DateTime? scannedAt;

  FileVolumeState state;

  /// Volume the report is about
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileVolumeHealthResponseDto &&
    other.indexedEntries == indexedEntries &&
    other.reason == reason &&
    other.resumeFrom == resumeFrom &&
    other.scannedAt == scannedAt &&
    other.state == state &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (indexedEntries.hashCode) +
    (reason == null ? 0 : reason!.hashCode) +
    (resumeFrom == null ? 0 : resumeFrom!.hashCode) +
    (scannedAt == null ? 0 : scannedAt!.hashCode) +
    (state.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileVolumeHealthResponseDto[indexedEntries=$indexedEntries, reason=$reason, resumeFrom=$resumeFrom, scannedAt=$scannedAt, state=$state, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'indexedEntries'] = this.indexedEntries;
    if (this.reason != null) {
      json[r'reason'] = this.reason;
    } else {
      json[r'reason'] = null;
    }
    if (this.resumeFrom != null) {
      json[r'resumeFrom'] = this.resumeFrom;
    } else {
      json[r'resumeFrom'] = null;
    }
    if (this.scannedAt != null) {
      json[r'scannedAt'] = _isEpochMarker(r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/')
        ? this.scannedAt!.millisecondsSinceEpoch
        : this.scannedAt!.toUtc().toIso8601String();
    } else {
      json[r'scannedAt'] = null;
    }
      json[r'state'] = this.state;
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileVolumeHealthResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileVolumeHealthResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileVolumeHealthResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileVolumeHealthResponseDto(
        indexedEntries: mapValueOfType<int>(json, r'indexedEntries')!,
        reason: FileVolumeHealthReason.fromJson(json[r'reason']),
        resumeFrom: mapValueOfType<String>(json, r'resumeFrom'),
        scannedAt: mapDateTime(json, r'scannedAt', r'/^(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))T(?:(?:[01]\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d(?:\\.\\d+)?)?(?:Z|([+-](?:[01]\\d|2[0-3]):[0-5]\\d)))$/'),
        state: FileVolumeState.fromJson(json[r'state'])!,
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileVolumeHealthResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileVolumeHealthResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileVolumeHealthResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileVolumeHealthResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileVolumeHealthResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileVolumeHealthResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileVolumeHealthResponseDto-objects as value to a dart map
  static Map<String, List<FileVolumeHealthResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileVolumeHealthResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileVolumeHealthResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'indexedEntries',
    'reason',
    'resumeFrom',
    'scannedAt',
    'state',
    'volumeId',
  };
}

