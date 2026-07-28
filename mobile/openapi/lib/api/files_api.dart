//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class FilesApi {
  FilesApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Create a folder
  ///
  /// Creates one folder inside a volume. The parent must already exist: creation is not recursive, so a mistyped path fails rather than materialising a hierarchy.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileFolderCreateDto] fileFolderCreateDto (required):
  Future<Response> createFileFolderWithHttpInfo(FileFolderCreateDto fileFolderCreateDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/folders';

    // ignore: prefer_final_locals
    Object? postBody = fileFolderCreateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Create a folder
  ///
  /// Creates one folder inside a volume. The parent must already exist: creation is not recursive, so a mistyped path fails rather than materialising a hierarchy.
  ///
  /// Parameters:
  ///
  /// * [FileFolderCreateDto] fileFolderCreateDto (required):
  Future<FileEntryResponseDto?> createFileFolder(FileFolderCreateDto fileFolderCreateDto, { Future<void>? abortTrigger, }) async {
    final response = await createFileFolderWithHttpInfo(fileFolderCreateDto, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'FileEntryResponseDto',) as FileEntryResponseDto;
    
    }
    return null;
  }

  /// Download a file
  ///
  /// Streams a file from a volume. Whole files only; range requests are not supported yet.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the file, relative to the volume root
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the file
  Future<Response> downloadFileWithHttpInfo(String path, String volumeId, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/download';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

      queryParams.addAll(_queryParams('', 'path', path));
      queryParams.addAll(_queryParams('', 'volumeId', volumeId));

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Download a file
  ///
  /// Streams a file from a volume. Whole files only; range requests are not supported yet.
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the file, relative to the volume root
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the file
  Future<MultipartFile?> downloadFile(String path, String volumeId, { Future<void>? abortTrigger, }) async {
    final response = await downloadFileWithHttpInfo(path, volumeId, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'MultipartFile',) as MultipartFile;
    
    }
    return null;
  }

  /// List entries in a folder
  ///
  /// Lists the direct children of a folder inside a volume. Paths are relative to the volume root, and ordering is deterministic by name.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] volumeId (required):
  ///   Volume to list, as returned by the volume endpoint
  ///
  /// * [String] path:
  ///   Virtual path of the directory to list, relative to the volume root
  Future<Response> getFileEntriesWithHttpInfo(String volumeId, { String? path, Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/entries';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (path != null) {
      queryParams.addAll(_queryParams('', 'path', path));
    }
      queryParams.addAll(_queryParams('', 'volumeId', volumeId));

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// List entries in a folder
  ///
  /// Lists the direct children of a folder inside a volume. Paths are relative to the volume root, and ordering is deterministic by name.
  ///
  /// Parameters:
  ///
  /// * [String] volumeId (required):
  ///   Volume to list, as returned by the volume endpoint
  ///
  /// * [String] path:
  ///   Virtual path of the directory to list, relative to the volume root
  Future<List<FileEntryResponseDto>?> getFileEntries(String volumeId, { String? path, Future<void>? abortTrigger, }) async {
    final response = await getFileEntriesWithHttpInfo(volumeId, path: path, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<FileEntryResponseDto>') as List)
        .cast<FileEntryResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// List file volumes
  ///
  /// Lists the volumes the current user can address. Content is addressed by volume identifier and a path relative to that volume.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> getFileVolumesWithHttpInfo({ Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/volumes';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// List file volumes
  ///
  /// Lists the volumes the current user can address. Content is addressed by volume identifier and a path relative to that volume.
  Future<List<FileVolumeResponseDto>?> getFileVolumes({ Future<void>? abortTrigger, }) async {
    final response = await getFileVolumesWithHttpInfo(abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<FileVolumeResponseDto>') as List)
        .cast<FileVolumeResponseDto>()
        .toList(growable: false);

    }
    return null;
  }
}
