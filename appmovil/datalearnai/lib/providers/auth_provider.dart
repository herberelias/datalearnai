import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/dio_client.dart';

enum AuthStatus { checking, authenticated, notAuthenticated }

class AuthProvider extends ChangeNotifier {
  final AuthService _authService = AuthService();

  AuthStatus _status = AuthStatus.checking;
  Map<String, dynamic>? _user;
  String? _errorMessage;

  AuthStatus get status => _status;
  Map<String, dynamic>? get user => _user;
  String? get errorMessage => _errorMessage;

  AuthProvider() {
    checkAuthStatus();
    DioClient.sessionExpiredStream.listen((_) {
      logout();
    });
  }

  Future<void> checkAuthStatus() async {
    final token = await _authService.getToken();
    if (token != null) {
      // Validar token y obtener datos del usuario
      final result = await _authService.validateToken();
      if (result['success']) {
        _user = result['user'];
        _status = AuthStatus.authenticated;
      } else {
        // Token inválido o expirado, hacer logout
        await _authService.logout();
        _status = AuthStatus.notAuthenticated;
      }
    } else {
      _status = AuthStatus.notAuthenticated;
    }
    notifyListeners();
  }

  String? _tempEmail;
  String? _tempPassword;

  Future<bool> login(String email, String password) async {
    _status = AuthStatus.checking;
    _errorMessage = null;
    notifyListeners();

    final result = await _authService.login(email, password);

    if (result['success']) {
      _user = result['user'];
      _status = AuthStatus.authenticated;

      // Guardar temporalmente para ofrecer biometría después
      _tempEmail = email;
      _tempPassword = password;

      notifyListeners();
      return true;
    } else {
      _status = AuthStatus.notAuthenticated;
      _errorMessage = result['message'];
      notifyListeners();
      return false;
    }
  }

  Future<void> enableBiometrics() async {
    if (_tempEmail != null && _tempPassword != null) {
      await _authService.enableBiometricLogin(_tempEmail!, _tempPassword!);
      notifyListeners();
    }
  }

  Future<void> disableBiometrics() async {
    await _authService.disableBiometricLogin();
    notifyListeners();
  }

  Future<bool> loginWithStoredCredentials() async {
    _status = AuthStatus.checking;
    _errorMessage = null;
    notifyListeners();

    final result = await _authService.loginWithStoredCredentials();

    if (result['success']) {
      _user = result['user'];
      _status = AuthStatus.authenticated;
      notifyListeners();
      return true;
    } else {
      _status = AuthStatus.notAuthenticated;
      _errorMessage = result['message'];
      notifyListeners();
      return false;
    }
  }

  Future<bool> hasStoredCredentials() async {
    return await _authService.hasStoredCredentials();
  }

  Future<void> logout() async {
    await _authService.logout();
    _user = null;
    _status = AuthStatus.notAuthenticated;
    notifyListeners();
  }
}
