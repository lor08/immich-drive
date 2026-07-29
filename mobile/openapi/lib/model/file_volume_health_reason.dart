//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

/// Why a volume is not usable as a basis for conclusions
enum FileVolumeHealthReason {
  notIndexed._(r'not-indexed'),
  rootUnreadable._(r'root-unreadable'),
  identityChanged._(r'identity-changed'),
  markerMissing._(r'marker-missing'),
  markerMismatch._(r'marker-mismatch'),
  rootEmptyWhileIndexed._(r'root-empty-while-indexed'),
  ;

  /// Instantiate a new enum with the provided value.
  const FileVolumeHealthReason._(this._value);

  /// The underlying value of this enum member.
  final String _value;

  @override
  String toString() => _value;

  /// Encodes this enum as a value suitable for JSON.
  String toJson() => _value;

  /// Returns the instance of [FileVolumeHealthReason] that was successfully decoded
  /// from the passed [value] on success, null otherwise.
  static FileVolumeHealthReason? fromJson(dynamic value) => FileVolumeHealthReasonTypeTransformer().decode(value);

  /// Returns a [List] containing instances of [FileVolumeHealthReason]
  /// that were successfully decoded from the passed [JSON][json].
  static List<FileVolumeHealthReason> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <FileVolumeHealthReason>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = FileVolumeHealthReason.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [FileVolumeHealthReason] to String,
/// and [decode] dynamic data back to [FileVolumeHealthReason].
class FileVolumeHealthReasonTypeTransformer {
  factory FileVolumeHealthReasonTypeTransformer() => _instance ??= const FileVolumeHealthReasonTypeTransformer._();

  const FileVolumeHealthReasonTypeTransformer._();

  /// Encodes this enum as a value suitable for JSON.
  String encode(FileVolumeHealthReason data) => data._value;

  /// Returns the instance of [FileVolumeHealthReason] that was successfully decoded
  /// from the passed [data] value on success, null otherwise.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  FileVolumeHealthReason? decode(dynamic data, {bool allowNull = true}) {
    if (data is FileVolumeHealthReason) {
      return data;
    }
    if (data != null) {
      switch (data) {
        case r'not-indexed': return FileVolumeHealthReason.notIndexed;
        case r'root-unreadable': return FileVolumeHealthReason.rootUnreadable;
        case r'identity-changed': return FileVolumeHealthReason.identityChanged;
        case r'marker-missing': return FileVolumeHealthReason.markerMissing;
        case r'marker-mismatch': return FileVolumeHealthReason.markerMismatch;
        case r'root-empty-while-indexed': return FileVolumeHealthReason.rootEmptyWhileIndexed;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// The singleton instance of this transformer.
  static FileVolumeHealthReasonTypeTransformer? _instance;
}

