import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dio_client.dart';

class ChatService {
  final Dio _dio = DioClient.createDio(
    baseUrl: 'http://64.23.132.230:4000/api',
    connectTimeout: const Duration(seconds: 20),
    receiveTimeout: const Duration(seconds: 200),
    maxRetries: 3, // Reintentar hasta 3 veces si falla la conexión
  );

  final _storage = const FlutterSecureStorage();

  Future<Map<String, dynamic>> sendMessage(
    String message, {
    List<Map<String, String>>? history,
  }) async {
    try {
      final token = await _storage.read(key: 'jwt_token');

      final response = await _dio.post(
        '/chatbot/consulta', // Endpoint actualizado para datalearn
        data: {'pregunta': message, 'history': history ?? []},
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        return {
          'success': true,
          'sql': response
              .data['sql_ejecutado'], // Actualizado según respuesta backend
          'explanation': response.data['explicacion'],
          'results': response.data['resultados'],
        };
      }
      return {
        'success': false,
        'message': 'Error en la respuesta del servidor',
      };
    } on DioException catch (e) {
      if (e.response != null) {
        return {
          'success': false,
          'message': e.response?.data['error'] ?? 'Error de servidor',
        };
      }
      // Mensajes más claros sobre problemas de conexión
      String errorMsg = 'Error de conexión';
      if (e.type == DioExceptionType.connectionTimeout) {
        errorMsg = 'No se pudo conectar. Verifica tu internet y reintenta.';
      } else if (e.type == DioExceptionType.receiveTimeout) {
        errorMsg =
            'La consulta tardó demasiado. Intenta con una pregunta más simple.';
      } else if (e.type == DioExceptionType.connectionError) {
        errorMsg = 'Sin conexión a internet. Conéctate y vuelve a intentar.';
      }
      return {'success': false, 'message': errorMsg};
    } catch (e) {
      return {'success': false, 'message': 'Error: $e'};
    }
  }

  Future<Map<String, dynamic>> getHistory() async {
    try {
      final token = await _storage.read(key: 'jwt_token');
      final response = await _dio.get(
        '/chatbot/history', // Endpoint actualizado
        options: Options(headers: {'Authorization': 'Bearer $token'}),
      );

      if (response.statusCode == 200) {
        return {'success': true, 'history': response.data['history']};
      }
      return {'success': false, 'message': 'Error obteniendo historial'};
    } catch (e) {
      return {'success': false, 'message': 'Error: $e'};
    }
  }
}
