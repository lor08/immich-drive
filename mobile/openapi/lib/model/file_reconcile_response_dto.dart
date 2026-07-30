//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class FileReconcileResponseDto {
  /// Returns a new [FileReconcileResponseDto] instance.
  FileReconcileResponseDto({
    required this.added,
    required this.completed,
    required this.conflicted,
    required this.directories,
    this.hashed = const Optional.absent(),
    required this.missing,
    required this.reason,
    required this.recovered,
    required this.resumedFrom,
    required this.state,
    required this.stoppedAt,
    required this.trash,
    this.verified = const Optional.absent(),
    required this.volumeId,
  });

  /// Entries this pass discovered on disk and added to the index
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int added;

  /// Whether the pass reached the end of the tree
  bool completed;

  /// Entries this pass newly found disagreeing with the index; the rows are left untouched
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int conflicted;

  /// Directories reconciled by this pass
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int directories;

  /// Entries given a checksum they did not have, within the configured budget
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<int?> hashed;

  /// Index rows this pass newly marked missing because their file is gone; nothing is removed
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int missing;

  /// Reason the pass refused to draw conclusions
  FileVolumeHealthReason? reason;

  /// Rows this pass returned to present because the filesystem agreed again
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  int recovered;

  /// Checkpoint this pass resumed from
  String? resumedFrom;

  FileVolumeState state;

  /// Checkpoint saved for the next pass
  String? stoppedAt;

  /// Trash findings, present only when the pass completed
  FileTrashReportDto? trash;

  /// Entries whose content was read to settle a modification-time disagreement
  ///
  /// Minimum value: -9007199254740991
  /// Maximum value: 9007199254740991
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  Optional<int?> verified;

  /// Volume the pass ran on
  String volumeId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is FileReconcileResponseDto &&
    other.added == added &&
    other.completed == completed &&
    other.conflicted == conflicted &&
    other.directories == directories &&
    other.hashed == hashed &&
    other.missing == missing &&
    other.reason == reason &&
    other.recovered == recovered &&
    other.resumedFrom == resumedFrom &&
    other.state == state &&
    other.stoppedAt == stoppedAt &&
    other.trash == trash &&
    other.verified == verified &&
    other.volumeId == volumeId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (added.hashCode) +
    (completed.hashCode) +
    (conflicted.hashCode) +
    (directories.hashCode) +
    (hashed == null ? 0 : hashed!.hashCode) +
    (missing.hashCode) +
    (reason == null ? 0 : reason!.hashCode) +
    (recovered.hashCode) +
    (resumedFrom == null ? 0 : resumedFrom!.hashCode) +
    (state.hashCode) +
    (stoppedAt == null ? 0 : stoppedAt!.hashCode) +
    (trash == null ? 0 : trash!.hashCode) +
    (verified == null ? 0 : verified!.hashCode) +
    (volumeId.hashCode);

  @override
  String toString() => 'FileReconcileResponseDto[added=$added, completed=$completed, conflicted=$conflicted, directories=$directories, hashed=$hashed, missing=$missing, reason=$reason, recovered=$recovered, resumedFrom=$resumedFrom, state=$state, stoppedAt=$stoppedAt, trash=$trash, verified=$verified, volumeId=$volumeId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'added'] = this.added;
      json[r'completed'] = this.completed;
      json[r'conflicted'] = this.conflicted;
      json[r'directories'] = this.directories;
    if (this.hashed.isPresent) {
      final value = this.hashed.value;
      json[r'hashed'] = value;
    }
      json[r'missing'] = this.missing;
    if (this.reason != null) {
      json[r'reason'] = this.reason;
    } else {
      json[r'reason'] = null;
    }
      json[r'recovered'] = this.recovered;
    if (this.resumedFrom != null) {
      json[r'resumedFrom'] = this.resumedFrom;
    } else {
      json[r'resumedFrom'] = null;
    }
      json[r'state'] = this.state;
    if (this.stoppedAt != null) {
      json[r'stoppedAt'] = this.stoppedAt;
    } else {
      json[r'stoppedAt'] = null;
    }
    if (this.trash != null) {
      json[r'trash'] = this.trash;
    } else {
      json[r'trash'] = null;
    }
    if (this.verified.isPresent) {
      final value = this.verified.value;
      json[r'verified'] = value;
    }
      json[r'volumeId'] = this.volumeId;
    return json;
  }

  /// Returns a new [FileReconcileResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static FileReconcileResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "FileReconcileResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return FileReconcileResponseDto(
        added: mapValueOfType<int>(json, r'added')!,
        completed: mapValueOfType<bool>(json, r'completed')!,
        conflicted: mapValueOfType<int>(json, r'conflicted')!,
        directories: mapValueOfType<int>(json, r'directories')!,
        hashed: json.containsKey(r'hashed') ? Optional.present(json[r'hashed'] == null ? null : int.parse('${json[r'hashed']}')) : const Optional.absent(),
        missing: mapValueOfType<int>(json, r'missing')!,
        reason: FileVolumeHealthReason.fromJson(json[r'reason']),
        recovered: mapValueOfType<int>(json, r'recovered')!,
        resumedFrom: mapValueOfType<String>(json, r'resumedFrom'),
        state: FileVolumeState.fromJson(json[r'state'])!,
        stoppedAt: mapValueOfType<String>(json, r'stoppedAt'),
        trash: FileTrashReportDto.fromJson(json[r'trash']),
        verified: json.containsKey(r'verified') ? Optional.present(json[r'verified'] == null ? null : int.parse('${json[r'verified']}')) : const Optional.absent(),
        volumeId: mapValueOfType<String>(json, r'volumeId')!,
      );
    }
    return null;
  }

  static List<FileReconcileResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileReconcileResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileReconcileResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, FileReconcileResponseDto> mapFromJson(dynamic json) {
    final map = <String, FileReconcileResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = FileReconcileResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of FileReconcileResponseDto-objects as value to a dart map
  static Map<String, List<FileReconcileResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<FileReconcileResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = FileReconcileResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'added',
    'completed',
    'conflicted',
    'directories',
    'missing',
    'reason',
    'recovered',
    'resumedFrom',
    'state',
    'stoppedAt',
    'trash',
    'volumeId',
  };
}

