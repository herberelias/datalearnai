import 'dart:async';
import 'package:dio/dio.dart';

class MeiliService {
  static const String _baseUrl = 'http://64.23.132.230:7700';
  static const String _masterKey = 'clave123';
  static const int _limit = 10;
  static const Duration _timeout = Duration(seconds: 3);

  late final Dio _dio;

  MeiliService() {
    _dio = Dio(
      BaseOptions(
        baseUrl: _baseUrl,
        connectTimeout: _timeout,
        receiveTimeout: _timeout,
        headers: {
          'Authorization': 'Bearer $_masterKey',
          'Content-Type': 'application/json',
        },
      ),
    );
  }

  /// Busca en el índice "productos" y retorna lista de nombres
  Future<List<String>> buscarProductos(String texto) async {
    try {
      final response = await _dio.post(
        '/indexes/productos/search',
        data: {'q': texto, 'limit': _limit},
      );
      final hits = response.data['hits'] as List<dynamic>? ?? [];
      return hits
          .map((hit) => hit['nombre']?.toString() ?? '')
          .where((nombre) => nombre.isNotEmpty)
          .toList();
    } catch (_) {
      // Si Meilisearch no responde, retornar lista vacía
      return [];
    }
  }

  /// Busca en el índice "clientes" y retorna lista de nombres
  Future<List<String>> buscarClientes(String texto) async {
    try {
      final response = await _dio.post(
        '/indexes/clientes/search',
        data: {'q': texto, 'limit': _limit},
      );
      final hits = response.data['hits'] as List<dynamic>? ?? [];
      return hits
          .map((hit) => hit['nombre']?.toString() ?? '')
          .where((nombre) => nombre.isNotEmpty)
          .toList();
    } catch (_) {
      // Si Meilisearch no responde, retornar lista vacía
      return [];
    }
  }

  /// Busca en ambos índices en paralelo y retorna lista combinada y deduplicada
  Future<List<String>> buscarSugerencias(String texto) async {
    try {
      final results = await Future.wait([
        buscarProductos(texto),
        buscarClientes(texto),
      ]);

      final combined = <String>{};
      for (final list in results) {
        combined.addAll(list);
      }
      return combined.toList();
    } catch (_) {
      return [];
    }
  }
}
