import 'dart:convert';
import 'dart:async';

import 'package:http/http.dart' as http;

import 'config.dart';
import 'models.dart';

class ApiException implements Exception {
  const ApiException(this.message, [this.statusCode = 0]);

  final String message;
  final int statusCode;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient({http.Client? httpClient, String? apiBaseUrl})
    : _http = httpClient ?? http.Client(),
      apiBaseUrl = apiBaseUrl ?? AppConfig.defaultApiBaseUrl;

  final http.Client _http;
  String apiBaseUrl;
  String? token;

  void setApiBaseUrl(String value) {
    apiBaseUrl = value.trim();
  }

  Uri _uri(String path, [Map<String, String>? query]) {
    final base = apiBaseUrl.replaceAll(RegExp(r'/+$'), '');
    return Uri.parse('$base$path').replace(queryParameters: query);
  }

  Map<String, String> _headers() {
    return {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      if (token != null && token!.isNotEmpty) 'Authorization': 'Bearer $token',
    };
  }

  Future<http.Response> _send(Future<http.Response> request) async {
    try {
      return await request.timeout(const Duration(seconds: 12));
    } on TimeoutException {
      throw const ApiException(
        'No se pudo conectar con el servidor. Revise la IP del backend y la red.',
      );
    } on http.ClientException catch (error) {
      throw ApiException(
        'No se pudo conectar con el servidor. ${error.message}',
      );
    }
  }

  Future<Map<String, dynamic>> _decode(http.Response response) async {
    final dynamic decoded;
    try {
      decoded = jsonDecode(response.body.isEmpty ? '{}' : response.body);
    } on FormatException {
      throw ApiException(
        'Respuesta invalida del servidor (${response.statusCode}). Verifique la URL de la API.',
        response.statusCode,
      );
    }
    if (response.statusCode >= 400) {
      final message = decoded is Map<String, dynamic>
          ? '${decoded['message'] ?? decoded['error'] ?? 'Error del servidor'}'
          : 'Error del servidor';
      throw ApiException(message, response.statusCode);
    }
    if (decoded is! Map<String, dynamic>) {
      throw const ApiException('Respuesta invalida del servidor');
    }
    return decoded;
  }

  Future<CountSession> login(String usuario, String password) async {
    final response = await _send(
      _http.post(
        _uri('/login'),
        headers: _headers(),
        body: jsonEncode({
          'usuario': usuario,
          'password': password,
          'device': 'Flutter ${DateTime.now().toIso8601String()}',
        }),
      ),
    );
    final data = await _decode(response);
    token = '${data['token'] ?? ''}';
    return CountSession(
      token: token!,
      user: SessionUser.fromJson(data['user'] ?? {}),
    );
  }

  Future<void> logout() async {
    try {
      await _send(_http.post(_uri('/logout'), headers: _headers()));
    } finally {
      token = null;
    }
  }

  Future<List<Toma>> tomas() async {
    final response = await _send(
      _http.get(_uri('/tomas'), headers: _headers()),
    );
    final data = await _decode(response);
    final list = data['tomas'] is List ? data['tomas'] as List : const [];
    return list
        .map((item) => Toma.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<int> iniciarConteo(int tomaId) async {
    final response = await _send(
      _http.post(
        _uri('/iniciar_conteo'),
        headers: _headers(),
        body: jsonEncode({'toma_id': tomaId}),
      ),
    );
    final data = await _decode(response);
    return int.tryParse('${data['conteo_id']}') ?? 0;
  }

  Future<({ConteoInfo conteo, List<CountItem> items})> detalleConteo(
    int conteoId, [
    Toma? toma,
  ]) async {
    final response = await _send(
      _http.get(
        _uri('/detalle_conteo', {'conteo_id': '$conteoId'}),
        headers: _headers(),
      ),
    );
    final data = await _decode(response);
    final rawItems = data['items'] is List ? data['items'] as List : const [];
    final conteo = ConteoInfo(
      id: conteoId,
      version: int.tryParse('${data['conteo_version'] ?? 0}') ?? 0,
      numeroToma: toma?.numeroToma ?? '',
      agencia: toma?.agencia ?? '',
      fechaHabilitacion: toma?.fechaHabilitacion ?? '',
      fechaCierre: toma?.fechaCierre ?? '',
      horaInicio: toma?.horaInicio ?? '',
      horaFin: toma?.horaFin ?? '',
      estado: 'borrador',
    );
    return (
      conteo: conteo,
      items: rawItems
          .map((item) => CountItem.fromJson(Map<String, dynamic>.from(item)))
          .toList(),
    );
  }

  Future<List<Product>> searchProducts(String q) async {
    final response = await _send(
      _http.get(_uri('/productos', {'q': q}), headers: _headers()),
    );
    final data = await _decode(response);
    final list = data['productos'] is List
        ? data['productos'] as List
        : const [];
    return list
        .map((item) => Product.fromJson(Map<String, dynamic>.from(item)))
        .toList();
  }

  Future<int> guardarBorrador(
    int conteoId,
    int version,
    List<CountItem> items,
  ) async {
    final response = await _send(
      _http.post(
        _uri('/guardar_borrador'),
        headers: _headers(),
        body: jsonEncode({
          'conteo_id': conteoId,
          'conteo_version': version,
          'items': items.map((item) => item.toJson()).toList(),
        }),
      ),
    );
    final data = await _decode(response);
    return int.tryParse('${data['conteo_version'] ?? version}') ?? version;
  }

  Future<int> finalizarConteo(
    int conteoId,
    int version,
    List<CountItem> items,
  ) async {
    final response = await _send(
      _http.post(
        _uri('/finalizar_conteo'),
        headers: _headers(),
        body: jsonEncode({
          'conteo_id': conteoId,
          'conteo_version': version,
          'items': items.map((item) => item.toJson()).toList(),
        }),
      ),
    );
    final data = await _decode(response);
    return int.tryParse('${data['conteo_version'] ?? version}') ?? version;
  }
}
