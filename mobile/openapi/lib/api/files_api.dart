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

  /// Copy a file
  ///
  /// Copies one file inside a volume. The content is staged and renamed into place, so a partial copy is never visible at the target. Copying a folder is not supported: a tree can be arbitrarily large and needs a background job rather than a request.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileCopyDto] fileCopyDto (required):
  Future<Response> copyFileEntryWithHttpInfo(FileCopyDto fileCopyDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/copy';

    // ignore: prefer_final_locals
    Object? postBody = fileCopyDto;

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

  /// Copy a file
  ///
  /// Copies one file inside a volume. The content is staged and renamed into place, so a partial copy is never visible at the target. Copying a folder is not supported: a tree can be arbitrarily large and needs a background job rather than a request.
  ///
  /// Parameters:
  ///
  /// * [FileCopyDto] fileCopyDto (required):
  Future<FileEntryResponseDto?> copyFileEntry(FileCopyDto fileCopyDto, { Future<void>? abortTrigger, }) async {
    final response = await copyFileEntryWithHttpInfo(fileCopyDto, abortTrigger: abortTrigger,);
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

  /// Empty the trash
  ///
  /// Permanently removes every record in a volume and reports how many went and how many could not. A record that cannot be removed is counted rather than raised, so one bad record cannot make the trash un-emptiable.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileTrashEmptyDto] fileTrashEmptyDto (required):
  Future<Response> emptyFileTrashWithHttpInfo(FileTrashEmptyDto fileTrashEmptyDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/trash/empty';

    // ignore: prefer_final_locals
    Object? postBody = fileTrashEmptyDto;

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

  /// Empty the trash
  ///
  /// Permanently removes every record in a volume and reports how many went and how many could not. A record that cannot be removed is counted rather than raised, so one bad record cannot make the trash un-emptiable.
  ///
  /// Parameters:
  ///
  /// * [FileTrashEmptyDto] fileTrashEmptyDto (required):
  Future<FileTrashPurgeResponseDto?> emptyFileTrash(FileTrashEmptyDto fileTrashEmptyDto, { Future<void>? abortTrigger, }) async {
    final response = await emptyFileTrashWithHttpInfo(fileTrashEmptyDto, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'FileTrashPurgeResponseDto',) as FileTrashPurgeResponseDto;
    
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

  /// List the trash
  ///
  /// Lists deleted entries in a volume, newest first. A record whose manifest is unreadable is still listed, with an unknown original path, so it can be restored to an explicit path or removed.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] volumeId (required):
  ///   Volume whose trash is listed
  Future<Response> getFileTrashWithHttpInfo(String volumeId, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/trash';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

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

  /// List the trash
  ///
  /// Lists deleted entries in a volume, newest first. A record whose manifest is unreadable is still listed, with an unknown original path, so it can be restored to an explicit path or removed.
  ///
  /// Parameters:
  ///
  /// * [String] volumeId (required):
  ///   Volume whose trash is listed
  Future<List<FileTrashRecordResponseDto>?> getFileTrash(String volumeId, { Future<void>? abortTrigger, }) async {
    final response = await getFileTrashWithHttpInfo(volumeId, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<FileTrashRecordResponseDto>') as List)
        .cast<FileTrashRecordResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Report volume health
  ///
  /// Reports what the server can currently prove about each of the caller's volumes: whether its filesystem identity and marker still match what the index recorded, how much the index holds, and where an interrupted reconciliation pass would resume. Reads only — it never creates or repairs anything it inspects.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> getFileVolumeHealthWithHttpInfo({ Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/volumes/health';

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

  /// Report volume health
  ///
  /// Reports what the server can currently prove about each of the caller's volumes: whether its filesystem identity and marker still match what the index recorded, how much the index holds, and where an interrupted reconciliation pass would resume. Reads only — it never creates or repairs anything it inspects.
  Future<List<FileVolumeHealthResponseDto>?> getFileVolumeHealth({ Future<void>? abortTrigger, }) async {
    final response = await getFileVolumeHealthWithHttpInfo(abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<FileVolumeHealthResponseDto>') as List)
        .cast<FileVolumeHealthResponseDto>()
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

  /// Move or rename an entry
  ///
  /// Moves a file or folder inside one volume, which also covers renaming. The target parent must already exist and the target itself must be free: an occupied target is a conflict rather than a replacement. Both paths belong to the same volume, so this never moves content between volumes.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileMoveDto] fileMoveDto (required):
  Future<Response> moveFileEntryWithHttpInfo(FileMoveDto fileMoveDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/move';

    // ignore: prefer_final_locals
    Object? postBody = fileMoveDto;

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

  /// Move or rename an entry
  ///
  /// Moves a file or folder inside one volume, which also covers renaming. The target parent must already exist and the target itself must be free: an occupied target is a conflict rather than a replacement. Both paths belong to the same volume, so this never moves content between volumes.
  ///
  /// Parameters:
  ///
  /// * [FileMoveDto] fileMoveDto (required):
  Future<void> moveFileEntry(FileMoveDto fileMoveDto, { Future<void>? abortTrigger, }) async {
    final response = await moveFileEntryWithHttpInfo(fileMoveDto, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Remove one trash record for good
  ///
  /// Permanently removes one record and its content. This is the only operation that destroys data.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] trashId (required):
  ///   Identifier of the trash record to remove for good
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the record
  Future<Response> purgeFileEntryWithHttpInfo(String trashId, String volumeId, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/trash';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

      queryParams.addAll(_queryParams('', 'trashId', trashId));
      queryParams.addAll(_queryParams('', 'volumeId', volumeId));

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'DELETE',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Remove one trash record for good
  ///
  /// Permanently removes one record and its content. This is the only operation that destroys data.
  ///
  /// Parameters:
  ///
  /// * [String] trashId (required):
  ///   Identifier of the trash record to remove for good
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the record
  Future<void> purgeFileEntry(String trashId, String volumeId, { Future<void>? abortTrigger, }) async {
    final response = await purgeFileEntryWithHttpInfo(trashId, volumeId, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
  }

  /// Reconcile a volume against the filesystem
  ///
  /// Runs or resumes a reconciliation pass. Entries found on disk are added to the index, rows whose file is gone are marked missing, and rows that disagree with the file are marked conflicted — nothing in the tree is modified and no row is deleted. An unhealthy volume is reported and reconciled no further, because an empty tree cannot be told apart from a vanished mount. Bounded by `limit` directories per pass, resuming from the saved checkpoint.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileReconcileDto] fileReconcileDto (required):
  Future<Response> reconcileFileVolumeWithHttpInfo(FileReconcileDto fileReconcileDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/reconcile';

    // ignore: prefer_final_locals
    Object? postBody = fileReconcileDto;

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

  /// Reconcile a volume against the filesystem
  ///
  /// Runs or resumes a reconciliation pass. Entries found on disk are added to the index, rows whose file is gone are marked missing, and rows that disagree with the file are marked conflicted — nothing in the tree is modified and no row is deleted. An unhealthy volume is reported and reconciled no further, because an empty tree cannot be told apart from a vanished mount. Bounded by `limit` directories per pass, resuming from the saved checkpoint.
  ///
  /// Parameters:
  ///
  /// * [FileReconcileDto] fileReconcileDto (required):
  Future<FileReconcileResponseDto?> reconcileFileVolume(FileReconcileDto fileReconcileDto, { Future<void>? abortTrigger, }) async {
    final response = await reconcileFileVolumeWithHttpInfo(fileReconcileDto, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'FileReconcileResponseDto',) as FileReconcileResponseDto;
    
    }
    return null;
  }

  /// Restore an entry from the trash
  ///
  /// Puts a deleted entry back, at the path it came from or at one the caller names. An occupied target is a conflict rather than a replacement, and naming a target is how that conflict is resolved.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [FileTrashRestoreDto] fileTrashRestoreDto (required):
  Future<Response> restoreFileEntryWithHttpInfo(FileTrashRestoreDto fileTrashRestoreDto, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/trash/restore';

    // ignore: prefer_final_locals
    Object? postBody = fileTrashRestoreDto;

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

  /// Restore an entry from the trash
  ///
  /// Puts a deleted entry back, at the path it came from or at one the caller names. An occupied target is a conflict rather than a replacement, and naming a target is how that conflict is resolved.
  ///
  /// Parameters:
  ///
  /// * [FileTrashRestoreDto] fileTrashRestoreDto (required):
  Future<FileEntryResponseDto?> restoreFileEntry(FileTrashRestoreDto fileTrashRestoreDto, { Future<void>? abortTrigger, }) async {
    final response = await restoreFileEntryWithHttpInfo(fileTrashRestoreDto, abortTrigger: abortTrigger,);
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

  /// Move an entry to the trash
  ///
  /// Moves a file or folder into the volume's trash and returns the resulting record. A folder goes in whole. Nothing is removed from disk here: the entry is renamed into a sibling directory of the browsable tree, so it stays recoverable and the operation stays a rename rather than a copy.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the entry to delete
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the entry
  Future<Response> trashFileEntryWithHttpInfo(String path, String volumeId, { Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/entries';

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
      'DELETE',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Move an entry to the trash
  ///
  /// Moves a file or folder into the volume's trash and returns the resulting record. A folder goes in whole. Nothing is removed from disk here: the entry is renamed into a sibling directory of the browsable tree, so it stays recoverable and the operation stays a rename rather than a copy.
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the entry to delete
  ///
  /// * [String] volumeId (required):
  ///   Volume holding the entry
  Future<FileTrashRecordResponseDto?> trashFileEntry(String path, String volumeId, { Future<void>? abortTrigger, }) async {
    final response = await trashFileEntryWithHttpInfo(path, volumeId, abortTrigger: abortTrigger,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'FileTrashRecordResponseDto',) as FileTrashRecordResponseDto;
    
    }
    return null;
  }

  /// Upload a file
  ///
  /// Writes the request body to a path inside a volume. The content is staged and renamed into place, so a partial file is never visible at the target. The parent must already exist, and an existing file is only replaced when overwrite is set.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the file. The parent must already exist.
  ///
  /// * [String] volumeId (required):
  ///   Volume to write into
  ///
  /// * [MultipartFile] body (required):
  ///
  /// * [String] overwrite:
  ///   Replace an existing file instead of failing
  Future<Response> uploadFileWithHttpInfo(String path, String volumeId, MultipartFile body, { String? overwrite, Future<void>? abortTrigger, }) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/files/content';

    // ignore: prefer_final_locals
    Object? postBody = body;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    if (overwrite != null) {
      queryParams.addAll(_queryParams('', 'overwrite', overwrite));
    }
      queryParams.addAll(_queryParams('', 'path', path));
      queryParams.addAll(_queryParams('', 'volumeId', volumeId));

    const contentTypes = <String>['application/octet-stream'];


    return apiClient.invokeAPI(
      apiPath,
      'PUT',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
      abortTrigger: abortTrigger,
    );
  }

  /// Upload a file
  ///
  /// Writes the request body to a path inside a volume. The content is staged and renamed into place, so a partial file is never visible at the target. The parent must already exist, and an existing file is only replaced when overwrite is set.
  ///
  /// Parameters:
  ///
  /// * [String] path (required):
  ///   Virtual path of the file. The parent must already exist.
  ///
  /// * [String] volumeId (required):
  ///   Volume to write into
  ///
  /// * [MultipartFile] body (required):
  ///
  /// * [String] overwrite:
  ///   Replace an existing file instead of failing
  Future<FileEntryResponseDto?> uploadFile(String path, String volumeId, MultipartFile body, { String? overwrite, Future<void>? abortTrigger, }) async {
    final response = await uploadFileWithHttpInfo(path, volumeId, body, overwrite: overwrite, abortTrigger: abortTrigger,);
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
}
