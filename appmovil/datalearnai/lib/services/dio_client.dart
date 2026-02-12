import 'package:dio/dio.dart';
import 'dart:async';

class DioClient {
  static final StreamController<void> _sessionExpiredController =
      StreamController<void>.broadcast();
  static Stream<void> get sessionExpiredStream =>
      _sessionExpiredController.stream;

  static Dio createDio({
    required String baseUrl,
    Duration? connectTimeout,
    Duration? receiveTimeout,
    int maxRetries = 3,
  }) {
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: connectTimeout ?? const Duration(seconds: 15),
        receiveTimeout: receiveTimeout ?? const Duration(seconds: 15),
      ),
    );

    // Interceptor de reintentos con backoff exponencial
    dio.interceptors.add(
      RetryInterceptor(
        dio: dio,
        maxRetries: maxRetries,
        retryDelays: const [
          Duration(seconds: 2), // Primer reintento: 2s
          Duration(seconds: 4), // Segundo reintento: 4s
          Duration(seconds: 6), // Tercer reintento: 6s
        ],
      ),
    );

    // Interceptor para detectar sesiones expiradas (401)
    dio.interceptors.add(
      InterceptorsWrapper(
        onError: (DioException e, ErrorInterceptorHandler handler) {
          if (e.response?.statusCode == 401) {
            _sessionExpiredController.add(null);
          }
          return handler.next(e);
        },
      ),
    );

    return dio;
  }
}

/// Interceptor personalizado para reintentos automáticos
class RetryInterceptor extends Interceptor {
  final Dio dio;
  final int maxRetries;
  final List<Duration> retryDelays;

  RetryInterceptor({
    required this.dio,
    this.maxRetries = 3,
    required this.retryDelays,
  });

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    // Solo reintentar en errores de conexión, timeout o servidor
    if (!_shouldRetry(err)) {
      return handler.next(err);
    }

    final extra = err.requestOptions.extra;
    final retries = extra['retries'] ?? 0;

    if (retries >= maxRetries) {
      return handler.next(err);
    }

    // Calcular delay para este reintento
    final delayIndex = retries < retryDelays.length
        ? retries
        : retryDelays.length - 1;
    final delay = retryDelays[delayIndex];

    print(
      '🔄 Reintentando solicitud (${retries + 1}/$maxRetries) en ${delay.inSeconds}s...',
    );

    // Esperar antes de reintentar
    await Future.delayed(delay);

    // Actualizar contador de reintentos
    err.requestOptions.extra['retries'] = retries + 1;

    try {
      // Reintentar la solicitud
      final response = await dio.fetch(err.requestOptions);
      return handler.resolve(response);
    } on DioException catch (e) {
      return handler.next(e);
    }
  }

  bool _shouldRetry(DioException err) {
    // Reintentar en:
    // - Errores de conexión (no hay internet, DNS, etc.)
    // - Timeouts (conexión o recepción)
    // - Errores del servidor (500, 502, 503, 504)

    if (err.type == DioExceptionType.connectionTimeout ||
        err.type == DioExceptionType.sendTimeout ||
        err.type == DioExceptionType.receiveTimeout ||
        err.type == DioExceptionType.connectionError) {
      return true;
    }

    // Errores del servidor que pueden ser temporales
    final statusCode = err.response?.statusCode;
    if (statusCode != null && (statusCode >= 500 && statusCode < 600)) {
      return true;
    }

    return false;
  }
}
