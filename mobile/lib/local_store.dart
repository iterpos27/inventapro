import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';

class LocalStore {
  static const _tokenKey = 'session_token';
  static const _userKey = 'session_user';
  static const _draftPrefix = 'draft_conteo_';
  static const _searchPrefix = 'search_';

  Future<void> saveSession(CountSession session) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_tokenKey, session.token);
    await prefs.setString(_userKey, jsonEncode(session.user.toJson()));
  }

  Future<CountSession?> readSession() async {
    final prefs = await SharedPreferences.getInstance();
    final token = prefs.getString(_tokenKey);
    final user = prefs.getString(_userKey);
    if (token == null || user == null) return null;
    return CountSession(
      token: token,
      user: SessionUser.fromJson(Map<String, dynamic>.from(jsonDecode(user))),
    );
  }

  Future<void> clearSession() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_tokenKey);
    await prefs.remove(_userKey);
  }

  Future<void> saveDraft(int conteoId, int version, List<CountItem> items) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_draftPrefix$conteoId',
      jsonEncode({
        'version': version,
        'items': items.map((item) => item.toJson()).toList(),
        'updated_at': DateTime.now().toIso8601String(),
      }),
    );
  }

  Future<({int version, List<CountItem> items})?> readDraft(int conteoId) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_draftPrefix$conteoId');
    if (raw == null) return null;
    final data = Map<String, dynamic>.from(jsonDecode(raw));
    final list = data['items'] is List ? data['items'] as List : const [];
    return (
      version: int.tryParse('${data['version'] ?? 0}') ?? 0,
      items: list.map((item) => CountItem.fromJson(Map<String, dynamic>.from(item))).toList(),
    );
  }

  Future<void> clearDraft(int conteoId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_draftPrefix$conteoId');
  }

  Future<void> saveSearch(String term, List<Product> products) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(
      '$_searchPrefix$term',
      jsonEncode(products.map((item) => {
            'id': item.id,
            'codigo': item.codigo,
            'descripcion': item.descripcion,
          }).toList()),
    );
  }

  Future<List<Product>?> readSearch(String term) async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString('$_searchPrefix$term');
    if (raw == null) return null;
    final list = jsonDecode(raw);
    if (list is! List) return null;
    return list.map((item) => Product.fromJson(Map<String, dynamic>.from(item))).toList();
  }
}
