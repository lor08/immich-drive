import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, catchError, throwError } from 'rxjs';
import { toHttpException } from 'src/extensions/files/files.exceptions';

/**
 * Maps file-domain errors onto HTTP exceptions.
 *
 * An interceptor rather than an exception filter, so the mapped exception still travels through
 * Immich's global filter and file-domain responses are shaped like every other error in the API.
 */
@Injectable()
export class FileDomainErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(catchError((error: unknown) => throwError(() => toHttpException(error))));
  }
}
