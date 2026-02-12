import 'package:dio/dio.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'dio_client.dart';

class AuthService {
  final Dio _dio = DioClient.createDio(
    baseUrl: 'http://64.23.132.230:4000/api',
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 15),
    maxRetries: 3,
  );

  final _storage = const FlutterSecureStorage();

  Future<Map<String, dynamic>> login(String email, String password) async {
    try {
      final response = await _dio.post(
        '/auth/login',
        data: {'email': email, 'password': password},
      );

      if (response.statusCode == 200) {
        final token = response.data['token'];
        // Guardar TOKEN por seguridad, pero NO credenciales usuario/pass automáticamente
        await _storage.write(key: 'jwt_token', value: token);

        return {'success': true, 'user': response.data['usuario']};
      }
      return {'success': false, 'message': 'Credenciales inválidas'};
    } on DioException catch (e) {
      if (e.response != null) {
        return {
          'success': false,
          'message': e.response?.data['message'] ?? 'Error de servidor',
        };
      }
      // Mensaje más informativo para problemas de conexión
      String errorMsg = 'Error de conexión';
      if (e.type == DioExceptionType.connectionTimeout) {
        errorMsg = 'No se pudo conectar al servidor. Verifica tu internet.';
      } else if (e.type == DioExceptionType.receiveTimeout) {
        errorMsg = 'El servidor tardó demasiado en responder.';
      } else if (e.type == DioExceptionType.connectionError) {
        errorMsg = 'Sin conexión a internet. Intenta nuevamente.';
      }
      return {'success': false, 'message': errorMsg};
    } catch (e) {
      return {'success': false, 'message': 'Error inesperado: $e'};
    }
  }

  Future<void> enableBiometricLogin(String email, String password) async {
    await _storage.write(key: 'email', value: email);
    await _storage.write(key: 'password', value: password);
  }

  Future<void> disableBiometricLogin() async {
    await _storage.delete(key: 'email');
    await _storage.delete(key: 'password');
  }

  Future<void> logout() async {
    await _storage.delete(key: 'jwt_token');
    // No borramos email/pass para permitir re-login biométrico fácil
  }

  Future<Map<String, dynamic>> loginWithStoredCredentials() async {
    final email = await _storage.read(key: 'email');
    final password = await _storage.read(key: 'password');

    if (email != null && password != null) {
      return login(email, password);
    }
    return {'success': false, 'message': 'No hay credenciales guardadas'};
  }

  Future<bool> hasStoredCredentials() async {
    final email = await _storage.read(key: 'email');
    final password = await _storage.read(key: 'password');
    return email != null && password != null;
  }

  Future<String?> getToken() async {
    return await _storage.read(key: 'jwt_token');
  }

  Future<Map<String, dynamic>> validateToken() async {
    try {
      final response = await _dio.get('/auth/profile');

      if (response.statusCode == 200) {
        return {'success': true, 'user': response.data['usuario']};
      }
      return {'success': false, 'message': 'Token inválido'};
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        return {'success': false, 'message': 'Sesión expirada'};
      }
      return {'success': false, 'message': 'Error al validar token'};
    } catch (e) {
      return {'success': false, 'message': 'Error inesperado: $e'};
    }
  }
}
